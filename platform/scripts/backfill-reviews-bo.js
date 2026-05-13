/**
 * backfill-reviews-bo.js
 * Arricchisce retroattivamente tutte le recensioni con dati BO
 * e imposta enrichment_status corretto.
 *
 * NON eseguire senza aver validato STEP 2 in produzione.
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/backfill-reviews-bo.js   ← simula, no scrittura
 *   node scripts/backfill-reviews-bo.js                ← esecuzione reale
 *
 * Resume: legge/salva ultimo review_id in scripts/.backfill-bo-progress.json
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { boLookupBatch, cacheStats } = require('../agents/cc/utils/bo-lookup');
const { sendTelegramAlert } = require('./lib/telegram-alert');

const DRY_RUN    = process.env.DRY_RUN === 'true';
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE) || 100;
const PROGRESS_FILE = path.resolve(__dirname, '.backfill-bo-progress.json');

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── Resume ────────────────────────────────────────────────────────────────────

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastId: 0 };
}

function saveProgress(lastId) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastId, ts: new Date().toISOString() }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n── Backfill BO enrichment ──────────────────────────`);
  console.log(`  Dry run:    ${DRY_RUN ? 'SÌ' : 'NO'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`───────────────────────────────────────────────────\n`);

  const { lastId: resumeFrom } = loadProgress();
  if (resumeFrom > 0) console.log(`[resume] Riprendo da review_id > ${resumeFrom}`);

  const t0 = Date.now();
  const stats = { matched: 0, pending_sync: 0, organic: 0, errors: 0, total: 0 };

  let cursor = resumeFrom;
  let page   = 0;

  while (true) {
    // Legge batch di recensioni ordinate per id (cursor-based pagination)
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id, source, reference_id, testo')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) { console.error('[fetch] Errore:', error.message); break; }
    if (!reviews?.length) break;

    page++;
    stats.total += reviews.length;

    // ── Classifica recensioni ────────────────────────────────────────────────

    const organic   = reviews.filter(r => r.source !== 'trustpilot' || !r.reference_id?.trim());
    const candidate = reviews.filter(r => r.source === 'trustpilot'  &&  r.reference_id?.trim());

    // ── Batch lookup BO per le candidate ────────────────────────────────────

    const refIds  = candidate.map(r => String(r.reference_id).trim());
    const boMap   = candidate.length ? await boLookupBatch(refIds) : new Map();

    // ── Costruisce update payload ────────────────────────────────────────────

    const toUpdate = [];

    for (const r of organic) {
      toUpdate.push({ id: r.id, enrichment_status: 'organic_or_non_trustpilot' });
      stats.organic++;
    }

    for (const r of candidate) {
      const refId  = String(r.reference_id).trim();
      const boData = boMap.get(refId);

      if (boData) {
        toUpdate.push({
          id:                  r.id,
          enrichment_status:   'matched',
          segmento:            boData.segmento            || null,
          localita:            boData.location_name       || null,
          booking_date:        boData.transaction_date    || null,
          prima_prenotazione:  boData.prima_prenotazione  ? true : false,
          cross:               boData.cross               ? true : false,
        });
        stats.matched++;
      } else {
        toUpdate.push({ id: r.id, enrichment_status: 'pending_sync' });
        stats.pending_sync++;
      }
    }

    // ── Applica update su reviews ────────────────────────────────────────────

    if (!DRY_RUN) {
      for (const payload of toUpdate) {
        const { id, ...fields } = payload;
        const { error: uErr } = await supabase.from('reviews').update(fields).eq('id', id);
        if (uErr) { console.error(`[update] Errore review_id=${id}: ${uErr.message}`); stats.errors++; }
      }
    }

    cursor = reviews[reviews.length - 1].id;
    if (!DRY_RUN) saveProgress(cursor);

    const pct = ((stats.matched + stats.pending_sync + stats.organic) / stats.total * 100).toFixed(0);
    process.stdout.write(
      `\r[page ${page}] id>${cursor - reviews.length}→${cursor} | matched:${stats.matched} pending:${stats.pending_sync} organic:${stats.organic} err:${stats.errors}`
    );
  }

  process.stdout.write('\n');

  // Pulizia file progress se completato
  if (!DRY_RUN && fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);

  const durMin  = Math.round((Date.now() - t0) / 60_000);
  const matchPct  = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) : '0';
  const pendPct   = stats.total > 0 ? ((stats.pending_sync / stats.total) * 100).toFixed(1) : '0';
  const orgPct    = stats.total > 0 ? ((stats.organic / stats.total) * 100).toFixed(1) : '0';

  console.log(`\n── Riepilogo ───────────────────────────────────────`);
  console.log(`  Totale recensioni:       ${stats.total}`);
  console.log(`  matched:                 ${stats.matched} (${matchPct}%)`);
  console.log(`  pending_sync:            ${stats.pending_sync} (${pendPct}%)`);
  console.log(`  organic_or_non_tp:       ${stats.organic} (${orgPct}%)`);
  console.log(`  errori:                  ${stats.errors}`);
  console.log(`  durata:                  ${durMin} min`);
  console.log(`  cache: ${JSON.stringify(cacheStats())}`);
  console.log(`───────────────────────────────────────────────────\n`);

  if (!DRY_RUN) {
    await sendTelegramAlert(
      `✅ <b>Backfill BO completato</b>\n` +
      `📊 Match: ${stats.matched} (${matchPct}%)\n` +
      `⏳ In attesa sync: ${stats.pending_sync} (${pendPct}%)\n` +
      `📝 Organiche/non-TP: ${stats.organic} (${orgPct}%)\n` +
      `⏱ Durata: ${durMin} min`
    );
  }
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
