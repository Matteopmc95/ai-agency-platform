/**
 * bootstrap-bo-history.js
 * Scarica CSV BO storico (da 2020-01-01 a oggi) e popola bo_bookings su Supabase.
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/bootstrap-bo-history.js   ← simula, non scrive
 *   node scripts/bootstrap-bo-history.js                ← esecuzione reale
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const Papa   = require('papaparse');
const { createClient } = require('@supabase/supabase-js');
const { sendTelegramAlert, flushTelegramBuffer } = require('./lib/telegram-alert');

const DRY_RUN      = process.env.DRY_RUN === 'true';
const BO_BASE      = process.env.BO_API_BASE;
const BO_USER      = process.env.BO_API_USERNAME;
const BO_PASS      = process.env.BO_API_PASSWORD;
const CHUNK_MS     = 1000;        // ms di pausa tra chiamate API
const TIMEOUT_MS   = 90_000;     // timeout default: 90s
const UPSERT_BATCH = 100;

const missing = ['BO_API_BASE', 'BO_API_USERNAME', 'BO_API_PASSWORD', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']
  .filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const { data, errors } = Papa.parse(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    transform: v => v.trim(),
  });
  errors.forEach(e =>
    console.warn(`[parser] riga scartata (row ${e.row}, ${e.code}): ${e.message}`)
  );
  return data;
}

// ── CSV → bo_bookings row ─────────────────────────────────────────────────────

function toTs(val) {
  if (!val || val.trim() === '') return null;
  const d = new Date(val.trim().replace(' ', 'T') + (val.includes('T') ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function toNum(val) { const n = parseFloat(val); return isNaN(n) ? null : n; }

function csvRowToBooking(r) {
  const tid = (r.transaction_id || '').trim();
  if (!tid) return null;
  return {
    transaction_id:                  tid,
    user_email_sha256:               (r.user_email_sha256 || '').trim().toLowerCase() || null,
    segmento:                        (r.type || r.parking_type || '').trim() || null,
    transaction_date:                toTs(r.transaction_date),
    booking_start:                   toTs(r.booking_start),
    booking_end:                     toTs(r.booking_end),
    location_name:                   (r.location_name || '').trim() || null,
    parking_name:                    (r.parking_name || '').trim() || null,
    final_price:                     toNum(r.final_price),
    paid_price:                      toNum(r.paid_price),
    user_first_booking_date:         toTs(r.user_first_booking_date),
    user_first_booking_parking_type: (r.user_first_booking_parking_type || '').trim() || null,
    transaction_state:               (r.transaction_state || '').trim() || null,
    synced_at:                       new Date().toISOString(),
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const AUTH = Buffer.from(`${BO_USER}:${BO_PASS}`).toString('base64');

/** Scarica un range di date e restituisce array di booking. Nessun retry interno. */
async function fetchRange(startDate, endDate, timeoutMs = TIMEOUT_MS) {
  const { data } = await axios.get(`${BO_BASE}/reporting/marketing/booking-details`, {
    headers: { Authorization: `Basic ${AUTH}`, Accept: 'text/csv' },
    params:  { start_date: startDate, end_date: endDate },
    timeout: timeoutMs,
    responseType: 'text',
  });
  return parseCSV(data).map(csvRowToBooking).filter(Boolean);
}

/** Suddivide un range ISO in N sotto-range di lunghezza approssimativamente uguale. */
function splitRange(startDate, endDate, parts) {
  const msDay = 86_400_000;
  const s   = new Date(startDate + 'T00:00:00Z');
  const e   = new Date(endDate   + 'T00:00:00Z');
  const tot = Math.round((e - s) / msDay) + 1;
  if (tot <= 1) return [[startDate, endDate]]; // range di 1 giorno: non spezza
  const chunkDays = Math.ceil(tot / parts);
  const ranges = [];
  let cur = new Date(s);
  while (cur <= e) {
    const end = new Date(Math.min(cur.getTime() + (chunkDays - 1) * msDay, e.getTime()));
    ranges.push([cur.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
    cur = new Date(end.getTime() + msDay);
  }
  return ranges;
}

const failedRanges = [];

/**
 * Scarica un range con fallback automatico:
 *   1. Tenta il range intero
 *   2. Su errore → 4 chunk settimanali
 *   3. Su errore chunk → 2 sotto-chunk
 *   4. Su errore sotto-chunk → logga in failedRanges e continua
 *
 * Riusabile sia dal bootstrap mensile che dal cron giornaliero.
 */
async function fetchWithFallback(startDate, endDate, label) {
  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

  // ── Tentativo 1: range intero ──────────────────────────────────────────────
  try {
    const rows = await fetchRange(startDate, endDate);
    console.log(`[${label}] strategy=full     rows=${rows.length}  time=${elapsed()}`);
    return rows;
  } catch (_) { /* fall through */ }

  // ── Tentativo 2: 4 chunk settimanali ──────────────────────────────────────
  const weekChunks = splitRange(startDate, endDate, 4);
  const allRows    = [];
  const counts     = [];
  let usedSubchunk = false;

  for (const [ws, we] of weekChunks) {
    await sleep(CHUNK_MS);
    try {
      const rows = await fetchRange(ws, we);
      allRows.push(...rows);
      counts.push(rows.length);
    } catch (_) {
      // ── Tentativo 3: 2 sotto-chunk ──────────────────────────────────────
      const subChunks = splitRange(ws, we, 2);
      usedSubchunk = true;
      for (const [ss, se] of subChunks) {
        await sleep(CHUNK_MS);
        try {
          const rows = await fetchRange(ss, se);
          allRows.push(...rows);
          counts.push(rows.length);
        } catch (err) {
          const msg = err.message?.slice(0, 80) || 'unknown';
          console.error(`[${label}] FALLITO range ${ss}→${se}: ${msg}`);
          failedRanges.push({ label, start: ss, end: se, error: msg });
        }
      }
    }
  }

  const strategy = usedSubchunk ? 'subchunk' : 'weekly  ';
  console.log(`[${label}] strategy=${strategy} rows=${allRows.length}  time=${elapsed()} (split: ${counts.join('+')})`);
  return allRows;
}

// ── Upsert batch con verifica e retry singolo ─────────────────────────────────

async function upsertBatch(rows, batchLabel = '') {
  if (!rows.length) return 0;

  const { error } = await supabase.from('bo_bookings').upsert(rows, { onConflict: 'transaction_id' });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);

  // Verifica quante righe sono effettivamente scritte
  const ids = rows.map(r => r.transaction_id);
  const { count: written } = await supabase
    .from('bo_bookings')
    .select('*', { count: 'exact', head: true })
    .in('transaction_id', ids);

  const missing = rows.length - (written || 0);
  if (missing > 0) {
    console.warn(`[BOOTSTRAP]${batchLabel} inviate ${rows.length}, scritte ${written ?? '?'}, mancanti ${missing} — retry singolo`);
    // Fetch le scritte per trovare le mancanti
    const { data: found } = await supabase
      .from('bo_bookings')
      .select('transaction_id')
      .in('transaction_id', ids);
    const foundSet = new Set((found || []).map(r => r.transaction_id));
    const toRetry  = rows.filter(r => !foundSet.has(r.transaction_id));

    let retried = 0;
    for (const row of toRetry) {
      const { error: se } = await supabase.from('bo_bookings').upsert(row, { onConflict: 'transaction_id' });
      if (se) {
        console.error(`[BOOTSTRAP] Retry fallito per ${row.transaction_id}: ${se.message}`);
      } else {
        retried++;
      }
    }
    console.log(`[BOOTSTRAP]${batchLabel} Recovery singolo: ${retried}/${toRetry.length} OK`);
    return retried;
  }

  return 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n── Bootstrap BO History ──────────────────────────`);
  console.log(`  Dry run: ${DRY_RUN ? 'SÌ' : 'NO'}`);
  console.log(`───────────────────────────────────────────────────\n`);

  const now    = new Date();
  const endY   = now.getFullYear();
  const endM   = now.getMonth() + 1;
  const runTs  = now.toISOString().slice(0, 16).replace('T', ' ');

  // Calcola mesi totali per l'alert di avvio
  const totalMonths = (endY - 2020) * 12 + endM;
  if (!DRY_RUN) {
    await sendTelegramAlert(
      `🚀 <b>Bootstrap BO avviato</b>\n📅 ${runTs}\nMesi totali: ${totalMonths}`
    );
  }

  const t0 = Date.now();
  let totalInserted = 0;

  for (let y = 2020; y <= endY; y++) {
    const mEnd = (y === endY) ? endM : 12;
    for (let m = 1; m <= mEnd; m++) {
      const label    = `${y}-${String(m).padStart(2,'0')}`;
      const start    = `${label}-01`;
      const lastDay  = new Date(y, m, 0).getDate();
      const end      = `${label}-${String(lastDay).padStart(2,'0')}`;

      const bookings = await fetchWithFallback(start, end, label);

      if (!DRY_RUN) {
        let batchNum = 0;
        for (let i = 0; i < bookings.length; i += UPSERT_BATCH) {
          batchNum++;
          await upsertBatch(bookings.slice(i, i + UPSERT_BATCH), ` [${label} batch ${batchNum}]`);
        }
        totalInserted += bookings.length;
      }

      await sleep(CHUNK_MS);
    }
  }

  // Salva range falliti
  if (failedRanges.length) {
    const outPath = path.resolve(__dirname, 'failed-ranges.json');
    fs.writeFileSync(outPath, JSON.stringify(failedRanges, null, 2));
    console.log(`\n⚠ ${failedRanges.length} range falliti salvati in scripts/failed-ranges.json`);
  }

  const durMin = Math.round((Date.now() - t0) / 60_000);

  if (!DRY_RUN) {
    await flushTelegramBuffer(); // svuota eventuali alert throttled
    if (failedRanges.length === 0) {
      await sendTelegramAlert(
        `✅ <b>Bootstrap completato</b>\nRighe: ${totalInserted.toLocaleString('it-IT')}\nDurata: ${durMin} min`
      );
    } else {
      await sendTelegramAlert(
        `⚠️ <b>Bootstrap con errori</b>\nRighe inserite: ${totalInserted.toLocaleString('it-IT')}\nRange falliti: ${failedRanges.length}\nFile: scripts/failed-ranges.json`
      );
    }
  }

  console.log(`\n── Completato ──────────────────────────────────────`);
  if (!DRY_RUN) console.log(`  Inserite: ${totalInserted} | Range falliti: ${failedRanges.length}`);
  console.log(`───────────────────────────────────────────────────\n`);
}

if (require.main === module) {
  run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
}

module.exports = { fetchWithFallback, fetchRange, splitRange };
