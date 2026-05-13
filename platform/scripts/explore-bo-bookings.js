require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const PAGE = 1000;
const hr = () => console.log('─'.repeat(55));

/** Conta righe con filtro (server-side, veloce) */
async function count(filters = {}) {
  let q = sb.from('bo_bookings').select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) q = q.is(k, null);
    else q = q.eq(k, v);
  }
  const { count: n } = await q;
  return n || 0;
}

/** Legge una singola colonna con paginazione completa → mappa {valore: count} */
async function countByField(field) {
  const agg = {};
  let from = 0, read = 0;
  while (true) {
    const { data, error } = await sb.from('bo_bookings').select(field).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    data.forEach(r => {
      const k = r[field] ?? '(NULL)';
      agg[k] = (agg[k] || 0) + 1;
    });
    read += data.length;
    process.stdout.write(`\r  ...${read.toLocaleString('it-IT')} righe lette`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  return agg;
}

async function main() {
  // ── Q1 — Segmenti (server-side count per valore atteso) ──────
  hr(); console.log('Q1 — Distribuzione segmenti');
  // Usa count server-side per ciascun valore atteso
  const segValori = ['airport','port','station','city','outdoor','covered','indoor','camper'];
  for (const s of segValori) {
    const n = await count({ segmento: s });
    if (n > 0) console.log(`  ${s.padEnd(20)} ${n.toLocaleString('it-IT')}`);
  }
  // NULL e altri
  const nNull = await count({ segmento: null });
  if (nNull > 0) console.log(`  ${'(NULL)'.padEnd(20)} ${nNull.toLocaleString('it-IT')}`);

  // ── Q2 — Top 15 location (paginazione completa) ──────────────
  hr(); console.log('Q2 — Top 15 location');
  const loc = await countByField('location_name');
  Object.entries(loc).sort((a,b) => b[1]-a[1]).slice(0,15).forEach(([k,v]) =>
    console.log(`  ${(k||'(NULL)').slice(0,42).padEnd(44)} ${v.toLocaleString('it-IT')}`));

  // ── Q3 — Per anno (count esatto + prezzo medio via campione 1000) ─
  hr(); console.log('Q3 — Distribuzione per anno');
  for (let y = 2020; y <= 2026; y++) {
    const s = `${y}-01-01T00:00:00Z`, e = `${y}-12-31T23:59:59Z`;
    const { count: n } = await sb.from('bo_bookings').select('*',{count:'exact',head:true}).gte('transaction_date',s).lte('transaction_date',e);
    const { data: sample } = await sb.from('bo_bookings').select('final_price').gte('transaction_date',s).lte('transaction_date',e).limit(1000);
    const prices = (sample||[]).map(r => parseFloat(r.final_price)||0).filter(Boolean);
    const avg = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2) : 'n/a';
    console.log(`  ${y}   ${String(n||0).padStart(8)}   prezzo medio (campione): €${avg}`);
  }

  // ── Q4 — Integrità dati (NULL per campo) ─────────────────────
  hr(); console.log('Q4 — Integrità dati (NULL per campo)');
  const fields = ['transaction_id','user_email_sha256','segmento','location_name','transaction_date','user_first_booking_date'];
  for (const f of fields) {
    const n = await count({ [f]: null });
    console.log(`  ${f.padEnd(35)} NULL: ${n.toLocaleString('it-IT')}`);
  }

  // ── Q5 — Utenti unici (paginazione completa su email sha256) ──
  hr(); console.log('Q5 — Utenti unici vs prenotazioni');
  const hashes = await countByField('user_email_sha256');
  const unici = Object.keys(hashes).filter(k => k !== '(NULL)').length;
  const tot = await count();
  const media = unici > 0 ? (tot/unici).toFixed(2) : 'n/a';
  console.log(`  Utenti unici (email sha256):   ${unici.toLocaleString('it-IT')}`);
  console.log(`  Prenotazioni totali:            ${tot.toLocaleString('it-IT')}`);
  console.log(`  Media prenotazioni/utente:      ${media}`);

  hr(); console.log('Fine esplorazione.');
}

main().catch(e => { console.error('[fatal]', e.message); process.exit(1); });
