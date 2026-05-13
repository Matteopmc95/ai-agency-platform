/**
 * generate-missing-ai.js
 * Genera la risposta AI per tutte le reviews senza review_analysis.risposta_generata.
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/generate-missing-ai.js   ← simula, non chiama Anthropic
 *   node scripts/generate-missing-ai.js                ← esecuzione reale
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { processaRecensione } = require('../agents/cc/agent-reviews');

// ── Config ────────────────────────────────────────────────────────────────────

const AI_DELAY_MS    = 1500;
const RETRY_DELAY_MS = 30_000;
const MAX_RETRIES    = 3;
const LOG_EVERY      = 20;
const DB_PAGE        = 1000;
const DRY_RUN        = process.env.DRY_RUN === 'true';

// ── Env check ────────────────────────────────────────────────────────────────

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY']
  .filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[config] Variabili mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch tutte le reviews senza risposta_generata ────────────────────────────

async function fetchDaProcessare() {
  // Legge tutti gli review_id che hanno già risposta_generata valorizzata
  const raIds = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('review_analysis')
      .select('review_id')
      .not('risposta_generata', 'is', null)
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(`review_analysis fetch: ${error.message}`);
    if (!data?.length) break;
    data.forEach(r => raIds.add(r.review_id));
    if (data.length < DB_PAGE) break;
    from += DB_PAGE;
  }

  // Legge tutte le reviews e filtra quelle senza risposta AI
  const reviews = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, trustpilot_id, testo, autore, data, reference_id, source')
      .order('id', { ascending: true })
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(`reviews fetch: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      if (!raIds.has(r.id)) reviews.push(r);
    }
    if (data.length < DB_PAGE) break;
    from += DB_PAGE;
  }

  return reviews;
}

// ── Salva analisi in DB ───────────────────────────────────────────────────────

async function salva(review_id, analisi) {
  const { error: raErr } = await supabase.from('review_analysis').upsert(
    {
      review_id,
      topic:              analisi.topic,
      segmento:           analisi.segmento,
      prima_prenotazione: Boolean(analisi.prima_prenotazione),
      cross:              Boolean(analisi.cross),
      localita:           analisi.localita,
      booking_date:       analisi.booking_date || null,
      risposta_generata:  analisi.risposta_generata,
      flag_referral:      Boolean(analisi.flag_referral),
      flag_cross:         Boolean(analisi.flag_cross),
      tipo_risposta:      analisi.tipo_risposta || null,
      created_at:         new Date().toISOString(),
    },
    { onConflict: 'review_id' }
  );
  if (raErr) throw new Error(`upsert review_analysis: ${raErr.message}`);

  await supabase.from('reviews').update({
    analisi_at: new Date().toISOString(),
    ...(analisi.booking_date ? { booking_date: analisi.booking_date } : {}),
  }).eq('id', review_id);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n══ Generate missing AI ══════════════════════════════`);
  console.log(`  Dry run: ${DRY_RUN ? 'SÌ — nessuna chiamata Anthropic' : 'NO — esecuzione reale'}`);
  console.log('════════════════════════════════════════════════════\n');

  console.log('[fetch] Lettura reviews senza risposta AI...');
  const daProcessare = await fetchDaProcessare();
  console.log(`[fetch] Trovate da processare: ${daProcessare.length}\n`);

  if (!daProcessare.length) {
    console.log('[AI] Niente da fare — tutte le reviews hanno già la risposta AI.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Simulerei ${daProcessare.length} chiamate AI.`);
    console.log(`[dry-run] Tempo stimato reale: ~${Math.ceil(daProcessare.length * AI_DELAY_MS / 60000)} minuti.\n`);
    console.log(`\n── Riepilogo (dry-run) ──────────────────────────────`);
    console.log(`  Trovate da processare: ${daProcessare.length}`);
    console.log(`  AI completate:         0 (dry-run)`);
    console.log(`  Errori:                0 (dry-run)`);
    console.log('════════════════════════════════════════════════════\n');
    return;
  }

  let completate = 0;
  let errori = 0;

  for (let i = 0; i < daProcessare.length; i++) {
    const r = daProcessare[i];

    let analisi = null;
    for (let tentativo = 1; tentativo <= MAX_RETRIES; tentativo++) {
      try {
        analisi = await processaRecensione(
          r.trustpilot_id,
          r.testo,
          r.autore,
          { referenceId: r.reference_id || null, data: r.data || null }
        );
        break;
      } catch (err) {
        const is429 = err.message?.includes('429') || err.status === 429 ||
                      err.message?.includes('rate') || err.message?.includes('overload');
        if (is429 && tentativo < MAX_RETRIES) {
          console.warn(`  [retry] review_id=${r.id} — 429/overload, attendo ${RETRY_DELAY_MS / 1000}s (tentativo ${tentativo}/${MAX_RETRIES})`);
          await sleep(RETRY_DELAY_MS);
        } else {
          console.error(`  [errore] review_id=${r.id} (${r.source}): ${err.message}`);
          errori++;
          analisi = null;
          break;
        }
      }
    }

    if (analisi) {
      try {
        await salva(r.id, analisi);
        completate++;
      } catch (err) {
        console.error(`  [errore salva] review_id=${r.id}: ${err.message}`);
        errori++;
      }
    }

    // Log progresso ogni LOG_EVERY
    if ((i + 1) % LOG_EVERY === 0 || i === daProcessare.length - 1) {
      console.log(`[AI] ${completate + errori}/${daProcessare.length} elaborate — completate: ${completate}, errori: ${errori}`);
    }

    if (i < daProcessare.length - 1) await sleep(AI_DELAY_MS);
  }

  console.log(`
── Riepilogo finale ──────────────────────────────────
  Trovate da processare: ${daProcessare.length}
  AI completate:         ${completate}
  Errori:                ${errori}
════════════════════════════════════════════════════\n`);
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
