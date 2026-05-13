/**
 * check-trustpilot-count.js — solo lettura, nessuna scrittura.
 * Conta le recensioni Trustpilot nel range 2026-05-04 → 2026-05-08
 * senza early exit, per avere i numeri esatti da confrontare con il portale.
 *
 * Run from platform/ directory:
 *   node scripts/check-trustpilot-count.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');

// ── Config ────────────────────────────────────────────────────────────────────

const RANGE_START = '2026-05-04';
const RANGE_END   = '2026-05-08';
const MIN_STARS   = 4;
const PER_PAGE    = 100;

const RANGE_START_MS = new Date(`${RANGE_START}T00:00:00Z`).getTime();
const RANGE_END_MS   = new Date(`${RANGE_END}T23:59:59Z`).getTime();

// ── Env check ────────────────────────────────────────────────────────────────

const missing = ['TRUSTPILOT_API_KEY', 'TRUSTPILOT_BUSINESS_UNIT_ID'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[config] Variabili mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

const BUSINESS_UNIT_ID = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const TP_API_KEY       = process.env.TRUSTPILOT_API_KEY;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch completo senza early exit ──────────────────────────────────────────

async function fetchAll() {
  const counts = {
    tot_in_range:          0,  // a) qualsiasi stelle, qualsiasi reply
    stars_ok_in_range:     0,  // b) 4-5 stelle nel range
    stars_ok_no_reply:     0,  // c) 4-5 stelle, no companyReply
    stars_ok_with_reply:   0,  // d) 4-5 stelle, con companyReply
  };

  let page = 1;
  let pagesWithRangeHits = 0; // quante pagine contengono recensioni nel range
  let firstRangeHitPage  = null;
  let lastRangeHitPage   = null;

  console.log(`\n[check] Range: ${RANGE_START} → ${RANGE_END} | stelle >= ${MIN_STARS}`);
  console.log('[check] Fetch completo senza early exit — può richiedere più pagine...\n');

  while (true) {
    let data;
    try {
      const resp = await axios.get(
        `https://api.trustpilot.com/v1/business-units/${BUSINESS_UNIT_ID}/reviews`,
        {
          params: { apikey: TP_API_KEY, perPage: PER_PAGE, page, orderBy: 'createdat.desc' },
          timeout: 15_000,
        }
      );
      data = resp.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) { console.error('[check] 401 — credenziali errate'); process.exit(1); }
      if (status === 429) { console.warn('[check] 429 — attendo 30s...'); await sleep(30_000); continue; }
      throw err;
    }

    const rows = data.reviews || [];
    if (!rows.length) break;

    // Data oldest/newest per debug
    const dates = rows.map(r => r.createdAt).filter(Boolean).sort();
    const oldest = dates[0] ?? 'n/a';
    const newest = dates[dates.length - 1] ?? 'n/a';

    let pageHits = 0;
    for (const r of rows) {
      const ms      = new Date(r.createdAt).getTime();
      const inRange = ms >= RANGE_START_MS && ms <= RANGE_END_MS;
      const starOk  = (r.stars || 0) >= MIN_STARS;
      const hasReply = Boolean(r.companyReply);

      if (inRange) {
        counts.tot_in_range++;
        pageHits++;
        if (starOk) {
          counts.stars_ok_in_range++;
          if (hasReply) counts.stars_ok_with_reply++;
          else          counts.stars_ok_no_reply++;
        }
      }
    }

    if (pageHits > 0) {
      pagesWithRangeHits++;
      if (!firstRangeHitPage) firstRangeHitPage = page;
      lastRangeHitPage = page;
    }

    process.stdout.write(
      `\r[check] Pagina ${page} | oldest=${oldest.slice(0, 10)} | ${pageHits} hits in range | totale finora: ${counts.tot_in_range}   `
    );

    // Stop quando siamo chiaramente oltre il range (tutti i risultati della pagina sono più vecchi)
    const allOlderThanRange = rows.every(r => new Date(r.createdAt).getTime() < RANGE_START_MS);
    if (allOlderThanRange) {
      process.stdout.write('\n[check] Tutte le righe di questa pagina sono prima del range → stop.\n');
      break;
    }

    if (rows.length < PER_PAGE) break;
    page++;
  }

  process.stdout.write('\n');
  return { counts, pagesWithRangeHits, firstRangeHitPage, lastRangeHitPage };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const { counts, pagesWithRangeHits, firstRangeHitPage, lastRangeHitPage } = await fetchAll();

  console.log(`
══ Conteggio recensioni Trustpilot ══════════════════
  Range: ${RANGE_START} → ${RANGE_END}

  a) Totale nel range (qualsiasi stelle, qualsiasi reply):  ${counts.tot_in_range}
  b) 4-5 stelle nel range:                                  ${counts.stars_ok_in_range}
  c) 4-5 stelle nel range, SENZA companyReply:              ${counts.stars_ok_no_reply}
  d) 4-5 stelle nel range, CON companyReply:                ${counts.stars_ok_with_reply}

  Pagine API con hits nel range: ${pagesWithRangeHits} (pag. ${firstRangeHitPage} → ${lastRangeHitPage})
════════════════════════════════════════════════════
`);
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
