/**
 * Import bulk Trustpilot reviews into Supabase.
 * Run from platform/ directory:
 *   node scripts/import-trustpilot-bulk.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { processaRecensione } = require('../agents/cc/agent-reviews');

// ── Config ────────────────────────────────────────────────────────────────────

const START_DATE   = '2026-05-04T00:00:00Z';
const END_DATE     = '2026-05-08T23:59:59Z';
const MIN_STARS    = 4;
const PER_PAGE     = 100;
const AI_DELAY_MS  = 1500;    // delay tra chiamate Anthropic
const RETRY_DELAY_MS = 30000; // attesa su 429 Anthropic

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
  console.error(`[config] Variabili d'ambiente mancanti: ${missing.join(', ')}`);
  console.error('[config] Aggiungi TRUSTPILOT_BUSINESS_UNIT_ID a platform/.env');
  process.exit(1);
}

const BUSINESS_UNIT_ID = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const API_KEY          = process.env.TRUSTPILOT_API_KEY;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Trustpilot API ────────────────────────────────────────────────────────────

// NOTA: l'endpoint pubblico /v1/business-units/{id}/reviews NON supporta
// startDateTime/endDateTime come filtri server-side — vengono ignorati.
// Il filtraggio per data viene fatto interamente client-side, con early exit
// non appena troviamo recensioni più vecchie di START_DATE.
// orderBy: 'createdat.desc' garantisce che le più recenti arrivino prima,
// permettendo di fermare la paginazione non appena superiamo la finestra.
async function fetchPage(page) {
  const url = `https://api.trustpilot.com/v1/business-units/${BUSINESS_UNIT_ID}/reviews`;
  const params = {
    apikey: API_KEY,
    perPage: PER_PAGE,
    page,
    orderBy: 'createdat.desc', // più recenti prima → early exit efficiente
  };

  const response = await axios.get(url, { params, timeout: 15000 });
  return response.data;
}

async function fetchAllReviews() {
  const all = [];
  let page = 1;
  let giaRisposte = 0;
  let earlyExit = false;

  const startMs = new Date(START_DATE).getTime();
  const endMs   = new Date(END_DATE).getTime();

  while (!earlyExit) {
    console.log(`[trustpilot] fetch pagina ${page}...`);
    let data;
    try {
      data = await fetchPage(page);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        console.error('[trustpilot] 401 Unauthorized — verifica TRUSTPILOT_API_KEY e TRUSTPILOT_BUSINESS_UNIT_ID');
        process.exit(1);
      }
      if (status === 429) {
        console.error('[trustpilot] 429 Rate limit — attendo 30s...');
        await sleep(30000);
        continue;
      }
      throw err;
    }

    const pageReviews = data.reviews || [];
    if (pageReviews.length === 0) break;

    for (const r of pageReviews) {
      const createdMs = new Date(r.createdAt).getTime();

      // Ordine desc: se siamo già prima della finestra, tutto il resto è ancora più vecchio
      if (createdMs < startMs) {
        console.log(`[trustpilot] early exit: recensione ${r.id} del ${r.createdAt} prima di ${START_DATE}`);
        earlyExit = true;
        break;
      }

      // Filtro client-side: fuori range superiore (non dovrebbe accadere con desc, ma per sicurezza)
      if (createdMs > endMs) {
        console.log(`  [range-skip] ${r.id} — ${r.createdAt} dopo ${END_DATE}`);
        continue;
      }

      // Filtro client-side stelle
      if ((r.stars || 0) < MIN_STARS) continue;

      // Filtro client-side: companyReply già presente
      if (r.companyReply) {
        giaRisposte++;
        console.log(`  [tp-skip] ${r.id} — ha già reply su Trustpilot`);
        continue;
      }

      all.push(r);
    }

    if (pageReviews.length < PER_PAGE) break;
    page++;
  }

  return { reviews: all, giaRisposte };
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function esisteInDB(trustpilot_id) {
  const { data } = await supabase
    .from('reviews')
    .select('id')
    .eq('trustpilot_id', trustpilot_id)
    .maybeSingle();
  return data;
}

async function inserisciReview(r) {
  const trustpilot_id = r.id;
  const stelle        = r.stars;
  const testo         = r.text || '';
  const autore        = r.consumer?.displayName || r.consumer?.name || 'Anonimo';
  const data          = r.createdAt || new Date().toISOString();
  const reference_id  = r.referenceId || null;

  const { data: inserted, error } = await supabase
    .from('reviews')
    .insert({
      trustpilot_id,
      testo,
      autore,
      data,
      stelle,
      stato: 'pending',
      source: 'trustpilot',
      reference_id,
      booking_date: null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Insert fallita per ${trustpilot_id}: ${error.message}`);
  return inserted.id;
}

async function salvaAnalisiScript(review_id, analisi) {
  const { error: raError } = await supabase.from('review_analysis').upsert(
    {
      review_id,
      topic:               analisi.topic,
      segmento:            analisi.segmento,
      prima_prenotazione:  Boolean(analisi.prima_prenotazione),
      cross:               Boolean(analisi.cross),
      localita:            analisi.localita,
      booking_date:        analisi.booking_date || null,
      risposta_generata:   analisi.risposta_generata,
      flag_referral:       Boolean(analisi.flag_referral),
      flag_cross:          Boolean(analisi.flag_cross),
      tipo_risposta:       analisi.tipo_risposta || null,
      created_at:          new Date().toISOString(),
    },
    { onConflict: 'review_id' }
  );
  if (raError) throw new Error(`review_analysis upsert: ${raError.message}`);

  const { error: rError } = await supabase
    .from('reviews')
    .update({
      analisi_at: new Date().toISOString(),
      ...(analisi.booking_date ? { booking_date: analisi.booking_date } : {}),
    })
    .eq('id', review_id);
  if (rError) throw new Error(`reviews update: ${rError.message}`);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n── Import Trustpilot bulk ──────────────────────────`);
  console.log(`  Range:    ${START_DATE} → ${END_DATE}`);
  console.log(`  Stelle:   >= ${MIN_STARS}`);
  console.log(`  Delay AI: ${AI_DELAY_MS}ms`);
  console.log(`────────────────────────────────────────────────────\n`);

  // 1. Fetch tutte le recensioni da Trustpilot
  let tpReviews, giaRisposteTp;
  try {
    ({ reviews: tpReviews, giaRisposte: giaRisposteTp } = await fetchAllReviews());
  } catch (err) {
    console.error('[fetch] Errore recupero recensioni Trustpilot:', err.message);
    process.exit(1);
  }
  console.log(`\n[import] ${tpReviews.length} recensioni >= ${MIN_STARS}★ senza reply, ${giaRisposteTp} già risposte (skip)\n`);

  const stats = { trovate: tpReviews.length, gia_risposte_tp: giaRisposteTp, inserite: 0, skipped_db: 0, ai_ok: 0, ai_errori: 0 };

  // 2. Inserisci le nuove nel DB
  const nuove = []; // { review_id, tpReview }
  for (const r of tpReviews) {
    const esistente = await esisteInDB(r.id);
    if (esistente) {
      console.log(`  [skip-db] ${r.id} — già importata nel DB`);
      stats.skipped_db++;
      continue;
    }

    try {
      const review_id = await inserisciReview(r);
      console.log(`  [insert] ${r.id} → DB id=${review_id} (${r.stars}★, ${r.consumer?.displayName || 'Anonimo'})`);
      stats.inserite++;
      nuove.push({ review_id, tpReview: r });
    } catch (err) {
      console.error(`  [error]  ${r.id} — insert fallita: ${err.message}`);
      stats.ai_errori++;
    }
  }

  console.log(`\n[ai] Avvio analisi AI su ${nuove.length} recensioni nuove...\n`);

  // 3. Analisi AI per ogni recensione nuova
  for (let i = 0; i < nuove.length; i++) {
    const { review_id, tpReview } = nuove[i];
    const trustpilot_id = tpReview.id;
    const autore  = tpReview.consumer?.displayName || tpReview.consumer?.name || 'Anonimo';
    const testo   = tpReview.text || '';
    const data    = tpReview.createdAt || new Date().toISOString();
    const metadata = {
      referenceId: tpReview.referenceId || null,
      consumer_id: tpReview.consumer?.id || null,
      data,
    };

    let tentativo = 0;
    let analisi = null;

    while (tentativo < 3) {
      try {
        analisi = await processaRecensione(trustpilot_id, testo, autore, metadata);
        break;
      } catch (err) {
        const is429 = err.message?.includes('429') || err.status === 429;
        tentativo++;
        if (is429 && tentativo < 3) {
          console.warn(`  [ai]  ${trustpilot_id} — 429 Anthropic, attendo ${RETRY_DELAY_MS / 1000}s (tentativo ${tentativo}/3)...`);
          await sleep(RETRY_DELAY_MS);
        } else {
          console.error(`  [ai]  ${trustpilot_id} — errore processaRecensione: ${err.message}`);
          stats.ai_errori++;
          analisi = null;
          break;
        }
      }
    }

    if (analisi) {
      try {
        await salvaAnalisiScript(review_id, analisi);
        console.log(`  [ai] ✓ ${i + 1}/${nuove.length} — review_id=${review_id}, tipo=${analisi.tipo_risposta}`);
        stats.ai_ok++;
      } catch (err) {
        console.error(`  [ai]  salva analisi review_id=${review_id}: ${err.message}`);
        stats.ai_errori++;
      }
    }

    if (i < nuove.length - 1) await sleep(AI_DELAY_MS);
  }

  // 4. Riepilogo finale
  const daElaborare = stats.trovate + stats.gia_risposte_tp; // totale >= MIN_STARS nel range
  console.log(`
────────────────────────────────────────────────────
  Trovate su Trustpilot (>=${MIN_STARS}★):   ${daElaborare}
  Già risposte su Trustpilot (skip):  ${stats.gia_risposte_tp}
  Da elaborare:                       ${stats.trovate}
  Nuove inserite nel DB:              ${stats.inserite}
  Già presenti nel DB (skip):         ${stats.skipped_db}
  Analisi AI completate:              ${stats.ai_ok}
  Errori (insert + AI):               ${stats.ai_errori}
────────────────────────────────────────────────────
`);
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
