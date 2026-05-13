/**
 * db-snapshot.js — read-only, nessuna scrittura.
 * Censimento completo della tabella reviews + review_analysis.
 *
 * Run from platform/ directory:
 *   node scripts/db-snapshot.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
if (missing.length) { console.error(`[config] Variabili mancanti: ${missing.join(', ')}`); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── helpers ───────────────────────────────────────────────────────────────────

function bar(n, max, width = 20) {
  const filled = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pad(str, len) {
  return String(str).padEnd(len);
}

// Fetch con paginazione per non incappare nel limite 1000 di Supabase
async function fetchAll(query) {
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══ DB Snapshot — tabella reviews ════════════════════\n');

  // ── 1. Totale righe ───────────────────────────────────────────────────────
  const { count: totale, error: e1 } = await supabase
    .from('reviews').select('*', { count: 'exact', head: true });
  if (e1) throw e1;
  console.log(`── 1. Totale righe in reviews: ${totale}\n`);

  // ── 2. Per source ─────────────────────────────────────────────────────────
  const allRows = await fetchAll((from, to) =>
    supabase.from('reviews').select('source, stato, data').range(from, to)
  );

  const bySource = {};
  for (const r of allRows) {
    const s = r.source || '(null)';
    bySource[s] = (bySource[s] || 0) + 1;
  }
  console.log('── 2. Conteggio per source:');
  const maxSrc = Math.max(...Object.values(bySource));
  for (const [src, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${pad(src, 15)} ${pad(n, 5)}  ${bar(n, maxSrc)}`);
  }

  // ── 3. Per stato ──────────────────────────────────────────────────────────
  const byStato = {};
  for (const r of allRows) {
    const s = r.stato || '(null)';
    byStato[s] = (byStato[s] || 0) + 1;
  }
  console.log('\n── 3. Conteggio per stato:');
  const maxSt = Math.max(...Object.values(byStato));
  for (const [stato, n] of Object.entries(byStato).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${pad(stato, 15)} ${pad(n, 5)}  ${bar(n, maxSt)}`);
  }

  // ── 4. Trustpilot nel dettaglio ───────────────────────────────────────────
  const tpRows = allRows.filter(r => r.source === 'trustpilot');
  const tpPending   = tpRows.filter(r => r.stato === 'pending').length;
  const tpPublished = tpRows.filter(r => r.stato === 'published').length;
  const tpOther     = tpRows.length - tpPending - tpPublished;

  console.log(`\n── 4. Trustpilot:`);
  console.log(`   Totale:    ${tpRows.length}`);
  console.log(`   pending:   ${tpPending}`);
  console.log(`   published: ${tpPublished}`);
  if (tpOther > 0) console.log(`   altri:     ${tpOther}`);

  // Più vecchia / più recente
  const tpWithDate = tpRows.filter(r => r.data).sort((a, b) => a.data.localeCompare(b.data));
  if (tpWithDate.length) {
    console.log(`   Più vecchia: ${tpWithDate[0].data?.slice(0, 10)}`);
    console.log(`   Più recente: ${tpWithDate[tpWithDate.length - 1].data?.slice(0, 10)}`);
  }

  // Distribuzione per giorno — ultimi 30 giorni
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffMs = cutoff.getTime();

  const dayCount = {};
  for (const r of tpRows) {
    if (!r.data) continue;
    const day = r.data.slice(0, 10);
    if (new Date(day).getTime() < cutoffMs) continue;
    dayCount[day] = (dayCount[day] || 0) + 1;
  }
  const sortedDays = Object.keys(dayCount).sort();
  if (sortedDays.length) {
    const maxDay = Math.max(...Object.values(dayCount));
    console.log(`\n   Distribuzione giornaliera (ultimi 30 giorni):`);
    for (const day of sortedDays) {
      const n = dayCount[day];
      console.log(`   ${day}  ${pad(n, 4)}  ${bar(n, maxDay, 30)}`);
    }
  } else {
    console.log('   (nessuna recensione Trustpilot negli ultimi 30 giorni)');
  }

  // ── 5 & 6. Coverage review_analysis ──────────────────────────────────────
  // Legge tutti gli review_id in review_analysis con risposta_generata valorizzata
  const raRows = await fetchAll((from, to) =>
    supabase
      .from('review_analysis')
      .select('review_id, risposta_generata')
      .not('risposta_generata', 'is', null)
      .range(from, to)
  );

  const raIds = new Set(raRows.map(r => r.review_id));

  // Recupera tutti gli id di reviews
  const allIds = await fetchAll((from, to) =>
    supabase.from('reviews').select('id').range(from, to)
  );
  const reviewIds = new Set(allIds.map(r => r.id));

  const conAI    = [...reviewIds].filter(id => raIds.has(id)).length;
  const senzaAI  = reviewIds.size - conAI;

  console.log(`\n── 5. Con risposta AI (review_analysis.risposta_generata valorizzata):`);
  console.log(`   ${conAI} / ${reviewIds.size}  ${bar(conAI, reviewIds.size, 30)}`);

  console.log(`\n── 6. Senza review_analysis (o risposta_generata null):`);
  console.log(`   ${senzaAI} / ${reviewIds.size}  ${bar(senzaAI, reviewIds.size, 30)}`);

  console.log('\n════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
