/**
 * recovery-ranges.js — script una tantum
 * Scarica i range BO mirati per recuperare i 58 pending_sync strutturali.
 * Eliminare dopo l'esecuzione.
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/recovery-ranges.js
 *   node scripts/recovery-ranges.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const Papa   = require('papaparse');
const axios  = require('axios');
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN    = process.env.DRY_RUN === 'true';
const UPSERT_BATCH = 100;
const CHUNK_MS   = 1000;

const missing = ['BO_API_BASE', 'BO_API_USERNAME', 'BO_API_PASSWORD', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']
  .filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const AUTH     = Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64');
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── Ranges mirati ─────────────────────────────────────────────────────────────
// 45 IDs stimati 2026-01, 8 IDs 2024, 5 IDs 2022-2023

const RANGES = [
  { label: '2025-full',  start: '2025-01-01', end: '2025-12-31' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const { data, errors } = Papa.parse(text.replace(/^﻿/, ''), {
    header: true, skipEmptyLines: true,
    transformHeader: h => h.trim(), transform: v => v.trim(),
  });
  errors.forEach(e => console.warn(`[parser] riga scartata row ${e.row}: ${e.message}`));
  return data;
}

function toTs(v) {
  if (!v?.trim()) return null;
  const d = new Date(v.trim().replace(' ', 'T') + (v.includes('T') ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

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

async function fetchRange(startDate, endDate) {
  const { data } = await axios.get(`${process.env.BO_API_BASE}/reporting/marketing/booking-details`, {
    headers: { Authorization: `Basic ${AUTH}`, Accept: 'text/csv' },
    params: { start_date: startDate, end_date: endDate },
    timeout: 120_000, responseType: 'text',
  });
  return parseCSV(data).map(csvRowToBooking).filter(Boolean);
}

async function upsertBatch(rows, label = '') {
  if (!rows.length) return;
  const { error } = await supabase.from('bo_bookings').upsert(rows, { onConflict: 'transaction_id' });
  if (error) throw new Error(`upsert: ${error.message}`);

  // Verifica scrittura effettiva e retry singolo sulle mancanti
  const ids = rows.map(r => r.transaction_id);
  const { count: written } = await supabase
    .from('bo_bookings').select('*', { count: 'exact', head: true }).in('transaction_id', ids);

  const missing = rows.length - (written || 0);
  if (missing > 0) {
    console.warn(`[RECOVERY]${label} inviate ${rows.length}, scritte ${written}, mancanti ${missing} — retry singolo`);
    const { data: found } = await supabase.from('bo_bookings').select('transaction_id').in('transaction_id', ids);
    const foundSet = new Set((found || []).map(r => r.transaction_id));
    for (const row of rows.filter(r => !foundSet.has(r.transaction_id))) {
      const { error: se } = await supabase.from('bo_bookings').upsert(row, { onConflict: 'transaction_id' });
      if (se) console.error(`[RECOVERY] retry fallito ${row.transaction_id}: ${se.message}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n── Recovery Ranges BO (DRY_RUN=${DRY_RUN}) ──────────────`);

  // Stato pre-recovery
  const { data: pre } = await supabase
    .from('reviews')
    .select('enrichment_status')
    .in('enrichment_status', ['matched', 'pending_sync', 'no_match']);

  const preCounts = {};
  (pre || []).forEach(r => { preCounts[r.enrichment_status] = (preCounts[r.enrichment_status] || 0) + 1; });
  console.log('\n[PRE]  matched:', preCounts.matched || 0,
    ' | pending_sync:', preCounts.pending_sync || 0,
    ' | no_match:', preCounts.no_match || 0);

  let grandTotal = 0;

  for (const { label, start, end } of RANGES) {
    console.log(`\n[${label}] Fetch ${start} → ${end}...`);
    const t0 = Date.now();
    let rows;
    try {
      rows = await fetchRange(start, end);
    } catch (err) {
      // Fallback: spezza in mesi
      console.warn(`[${label}] Range intero fallito (${err.message?.slice(0,60)}), provo mese per mese...`);
      rows = [];
      const s = new Date(start + 'T00:00:00Z');
      const e = new Date(end   + 'T00:00:00Z');
      let cur = new Date(s);
      while (cur <= e) {
        const y = cur.getUTCFullYear();
        const m = cur.getUTCMonth() + 1; // 1-12
        const mLabel = `${y}-${String(m).padStart(2,'0')}`;
        const mStart = `${mLabel}-01`;
        // ultimo giorno del mese UTC
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mEndDate = new Date(Date.UTC(y, m - 1, lastDay));
        const mEnd = (mEndDate <= e ? mEndDate : e).toISOString().slice(0, 10);
        try {
          await sleep(CHUNK_MS);
          const chunk = await fetchRange(mStart, mEnd);
          rows.push(...chunk);
          console.log(`  [${mLabel}] ${chunk.length} righe`);
        } catch (e2) {
          console.error(`  [${mLabel}] FALLITO: ${e2.message?.slice(0,60)}`);
        }
        // avanza al primo del mese successivo (tutto UTC)
        cur = new Date(Date.UTC(y, m, 1));
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${label}] ${rows.length} righe in ${elapsed}s`);

    if (!DRY_RUN && rows.length > 0) {
      let bn = 0;
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        bn++;
        await upsertBatch(rows.slice(i, i + UPSERT_BATCH), ` [${label} b${bn}]`);
      }
      console.log(`[${label}] upserted ${rows.length} righe in ${bn} batch`);
    }

    grandTotal += rows.length;
    await sleep(CHUNK_MS);
  }

  console.log(`\n[TOTALE] ${grandTotal} righe processate`);
  console.log('\nOra lancia: node scripts/rebackfill-pending-bo.js');
  console.log('───────────────────────────────────────────────────\n');
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
