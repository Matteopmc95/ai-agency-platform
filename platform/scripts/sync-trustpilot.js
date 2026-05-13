/**
 * sync-trustpilot.js — script idempotente unico per sincronizzare
 * le recensioni Trustpilot nel range 2026-05-04 → 2026-05-08.
 *
 * Esegue in ordine:
 *   PARTE 1  Cleanup  — rimuove reviews Trustpilot fuori range
 *   PARTE 2  Import   — inserisce le nuove dal range (senza AI)
 *   PARTE 3  AI       — genera risposta per quelle appena inserite
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/sync-trustpilot.js   ← anteprima sicura
 *   node scripts/sync-trustpilot.js                ← esecuzione reale
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios    = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { processaRecensione } = require('../agents/cc/agent-reviews');

// ── Config ────────────────────────────────────────────────────────────────────

const RANGE_START    = '2026-05-04';
const RANGE_END      = '2026-05-08';
const MIN_STARS      = 4;
const TP_PER_PAGE    = 100;
const DB_PAGE        = 1000;   // Supabase: righe per pagina nel cleanup
const DELETE_BATCH   = 500;    // max IDs per singola DELETE Supabase
const AI_DELAY_MS    = 1500;
const RETRY_DELAY_MS = 30_000;
const COUNTDOWN_S    = 5;
const DRY_RUN        = process.env.DRY_RUN === 'true';

const RANGE_START_MS = new Date(`${RANGE_START}T00:00:00Z`).getTime();
const RANGE_END_MS   = new Date(`${RANGE_END}T23:59:59Z`).getTime();

// ── Env check ────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'TRUSTPILOT_API_KEY',
  'TRUSTPILOT_BUSINESS_UNIT_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[config] Variabili mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

const BUSINESS_UNIT_ID = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const TP_API_KEY       = process.env.TRUSTPILOT_API_KEY;
const supabase         = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Utils ─────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function countdown(s) {
  for (let i = s; i > 0; i--) {
    process.stdout.write(`\r[safety] Inizio tra ${i}s... (Ctrl+C per annullare)  `);
    await sleep(1000);
  }
  process.stdout.write('\r                                                        \n');
}

function inRange(dateStr) {
  if (!dateStr) return false;
  const ms = new Date(dateStr).getTime();
  return ms >= RANGE_START_MS && ms <= RANGE_END_MS;
}

// ── PARTE 1: CLEANUP ─────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n── PARTE 1: Cleanup ────────────────────────────────');

  let scansionate = 0;
  let daEliminare = []; // { id, trustpilot_id, data }
  let from = 0;

  // Legge tutte le Trustpilot+pending con paginazione esplicita
  while (true) {
    const { data: rows, error } = await supabase
      .from('reviews')
      .select('id, trustpilot_id, data, stelle')
      .eq('source', 'trustpilot')
      .eq('stato', 'pending')
      .order('id', { ascending: true })
      .range(from, from + DB_PAGE - 1);

    if (error) throw new Error(`Cleanup fetch: ${error.message}`);
    if (!rows?.length) break;

    for (const r of rows) {
      scansionate++;
      if (!inRange(r.data)) daEliminare.push(r);
    }

    if (rows.length < DB_PAGE) break;
    from += DB_PAGE;
    process.stdout.write(`\r[cleanup] Scansionate ${scansionate} reviews...`);
  }
  process.stdout.write(`\r[cleanup] Scansionate ${scansionate} reviews totali      \n`);
  console.log(`[cleanup] Da cancellare: ${daEliminare.length} (fuori range)`);
  console.log(`[cleanup] Da tenere:     ${scansionate - daEliminare.length} (dentro range)`);

  if (daEliminare.length === 0) {
    console.log('[cleanup] Niente da cancellare.');
    return { scansionate, cancellate: 0 };
  }

  if (DRY_RUN) {
    const preview = daEliminare.slice(0, 5);
    preview.forEach(r => console.log(`  [dry] cancellerei id=${r.id} data=${r.data} stelle=${r.stelle}`));
    if (daEliminare.length > 5) console.log(`  [dry] ... e altre ${daEliminare.length - 5}`);
    return { scansionate, cancellate: 0 };
  }

  // Cancellazione effettiva in batch
  let cancellate = 0;
  const ids = daEliminare.map(r => r.id);

  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    const chunk = ids.slice(i, i + DELETE_BATCH);

    // Prima review_analysis (FK)
    await supabase.from('review_analysis').delete().in('review_id', chunk);

    // Poi reviews
    const { error } = await supabase.from('reviews').delete().in('id', chunk);
    if (error) {
      console.error(`[cleanup] Errore batch ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      cancellate += chunk.length;
      process.stdout.write(`\r[cleanup] Cancellate ${cancellate}/${ids.length}...`);
    }
  }
  process.stdout.write(`\r[cleanup] Cancellate ${cancellate}/${ids.length} reviews.      \n`);

  return { scansionate, cancellate };
}

// ── PARTE 2: IMPORT DA TRUSTPILOT ────────────────────────────────────────────

async function fetchTrustpilotPage(page) {
  const { data } = await axios.get(
    `https://api.trustpilot.com/v1/business-units/${BUSINESS_UNIT_ID}/reviews`,
    {
      params: { apikey: TP_API_KEY, perPage: TP_PER_PAGE, page, orderBy: 'createdat.desc' },
      timeout: 15_000,
    }
  );
  return data;
}

async function importReviews() {
  console.log('\n── PARTE 2: Import da Trustpilot ───────────────────');

  // Raccoglie le recensioni nel range dalla API con early exit
  const tpReviews = [];
  let giaRisposte = 0;
  let page = 1;
  let earlyExit = false;

  while (!earlyExit) {
    let data;
    try {
      data = await fetchTrustpilotPage(page);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) { console.error('[tp] 401 — API key o Business Unit ID errati'); process.exit(1); }
      if (status === 429) { console.warn('[tp] 429 rate limit, attendo 30s...'); await sleep(30_000); continue; }
      throw err;
    }

    const rows = data.reviews || [];
    if (!rows.length) break;

    // ── LOG DIAGNOSTICO PER PAGINA ──────────────────────────────────────────
    const dates = rows.map(r => r.createdAt).filter(Boolean).sort();
    const oldest = dates[0] ?? 'n/a';
    const newest = dates[dates.length - 1] ?? 'n/a';
    let pg_stars = 0, pg_inRange = 0, pg_noReply = 0;
    let pg_skipStars = 0, pg_skipRange = 0, pg_skipReply = 0;
    for (const r of rows) {
      const ms = new Date(r.createdAt).getTime();
      const starOk    = (r.stars || 0) >= MIN_STARS;
      const rangeOk   = ms >= RANGE_START_MS && ms <= RANGE_END_MS;
      const noReplyOk = !r.companyReply;
      if (starOk)    pg_stars++;    else pg_skipStars++;
      if (rangeOk)   pg_inRange++;  else pg_skipRange++;
      if (noReplyOk) pg_noReply++;  else pg_skipReply++;
    }
    console.log(`[tp] Pagina ${page}: ${rows.length} risultati | oldest=${oldest} | newest=${newest}`);
    console.log(`     Passano stelle>=4: ${pg_stars} (scartate: ${pg_skipStars})`);
    console.log(`     Passano range:     ${pg_inRange} (scartate: ${pg_skipRange})`);
    console.log(`     Passano noReply:   ${pg_noReply} (scartate: ${pg_skipReply})`);
    // ── FINE LOG DIAGNOSTICO ────────────────────────────────────────────────

    for (const r of rows) {
      const createdMs = new Date(r.createdAt).getTime();

      if (createdMs < RANGE_START_MS) {
        console.log(`[tp] Early exit su pagina ${page}: ${r.createdAt} (${r.id}) è prima di ${RANGE_START}`);
        earlyExit = true;
        break;
      }
      if (createdMs > RANGE_END_MS)   { continue; }
      if ((r.stars || 0) < MIN_STARS) { continue; }
      if (r.companyReply)             { giaRisposte++; continue; }

      tpReviews.push(r);
    }

    if (rows.length < TP_PER_PAGE) break;
    page++;
  }
  console.log(`[tp] Totale candidate: ${tpReviews.length} (senza reply). Già risposte su TP: ${giaRisposte}`);

  // Inserisce quelle non già presenti
  let duplicati = 0;
  const nuoveInsertite = []; // { review_id, tpReview }

  for (const r of tpReviews) {
    // Controlla duplicato
    const { data: esistente } = await supabase
      .from('reviews')
      .select('id')
      .eq('trustpilot_id', r.id)
      .maybeSingle();

    if (esistente) { duplicati++; continue; }

    if (DRY_RUN) {
      console.log(`  [dry] inserirei ${r.id} (${r.stars}★, ${r.createdAt}, ${r.consumer?.displayName || 'Anonimo'})`);
      nuoveInsertite.push({ review_id: null, tpReview: r });
      continue;
    }

    try {
      const { data: ins, error } = await supabase
        .from('reviews')
        .insert({
          trustpilot_id: r.id,
          testo:         r.text || '',
          autore:        r.consumer?.displayName || r.consumer?.name || 'Anonimo',
          data:          r.createdAt,
          stelle:        r.stars,
          stato:         'pending',
          source:        'trustpilot',
          reference_id:  r.referenceId || null,
          booking_date:  null,
        })
        .select('id')
        .single();

      if (error) { console.error(`  [error] insert ${r.id}: ${error.message}`); continue; }
      console.log(`  [insert] ${r.id} → DB id=${ins.id} (${r.stars}★, ${r.consumer?.displayName || 'Anonimo'})`);
      nuoveInsertite.push({ review_id: ins.id, tpReview: r });
    } catch (err) {
      console.error(`  [error] insert ${r.id}: ${err.message}`);
    }
  }

  return {
    trovate:     tpReviews.length + giaRisposte,
    giaRisposte,
    duplicati,
    inserite:    nuoveInsertite.length,
    nuove:       nuoveInsertite,
  };
}

// ── PARTE 3: ANALISI AI ──────────────────────────────────────────────────────

async function runAI(nuove) {
  console.log(`\n── PARTE 3: Analisi AI su ${nuove.length} nuove recensioni ─`);

  let ai_ok = 0;
  let ai_errori = 0;

  for (let i = 0; i < nuove.length; i++) {
    const { review_id, tpReview } = nuove[i];
    const trustpilot_id = tpReview.id;

    if (DRY_RUN) {
      console.log(`  [dry] chiamerei AI per ${trustpilot_id}`);
      continue;
    }

    const metadata = {
      referenceId: tpReview.referenceId || null,
      consumer_id: tpReview.consumer?.id || null,
      data:        tpReview.createdAt,
    };

    let analisi = null;
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      try {
        analisi = await processaRecensione(
          trustpilot_id,
          tpReview.text || '',
          tpReview.consumer?.displayName || tpReview.consumer?.name || 'Anonimo',
          metadata
        );
        break;
      } catch (err) {
        const is429 = err.message?.includes('429') || err.status === 429;
        if (is429 && tentativo < 3) {
          console.warn(`  [ai] 429 — attendo ${RETRY_DELAY_MS / 1000}s (tentativo ${tentativo}/3)...`);
          await sleep(RETRY_DELAY_MS);
        } else {
          console.error(`  [ai] errore ${trustpilot_id}: ${err.message}`);
          ai_errori++;
          analisi = null;
          break;
        }
      }
    }

    if (analisi) {
      try {
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
        if (raErr) throw new Error(raErr.message);

        await supabase.from('reviews').update({
          analisi_at: new Date().toISOString(),
          ...(analisi.booking_date ? { booking_date: analisi.booking_date } : {}),
        }).eq('id', review_id);

        console.log(`  [ai] ✓ ${i + 1}/${nuove.length} review_id=${review_id} tipo=${analisi.tipo_risposta}`);
        ai_ok++;
      } catch (err) {
        console.error(`  [ai] salva review_id=${review_id}: ${err.message}`);
        ai_errori++;
      }
    }

    if (i < nuove.length - 1) await sleep(AI_DELAY_MS);
  }

  return { ai_ok, ai_errori };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`
══ Sync Trustpilot ══════════════════════════════════
  Range:    ${RANGE_START} → ${RANGE_END}
  Stelle:   >= ${MIN_STARS}
  Dry run:  ${DRY_RUN ? 'SÌ — nessuna scrittura' : 'NO — scrittura reale'}
════════════════════════════════════════════════════`);

  if (!DRY_RUN) {
    console.log('');
    await countdown(COUNTDOWN_S);
  }

  const cleanupStats = await cleanup();
  const importStats  = await importReviews();
  const aiStats      = await runAI(importStats.nuove);

  console.log(`
══ Sync Trustpilot completato ═══════════════════════
  Cleanup:
    Reviews scansionate:         ${cleanupStats.scansionate}
    Cancellate (fuori range):    ${cleanupStats.cancellate}${DRY_RUN ? ' (dry)' : ''}

  Import:
    Trovate su Trustpilot:       ${importStats.trovate}
    Già con reply (skip):        ${importStats.giaRisposte}
    Duplicati DB (skip):         ${importStats.duplicati}
    Nuove inserite:              ${importStats.inserite}${DRY_RUN ? ' (dry)' : ''}

  AI:
    Analisi completate:          ${aiStats.ai_ok}${DRY_RUN ? ' (dry)' : ''}
    Errori AI:                   ${aiStats.ai_errori}
════════════════════════════════════════════════════
`);
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
