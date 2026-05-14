/**
 * recover-trustpilot-refid.js
 * Recupera i reference_id mancanti interrogando la Trustpilot private API.
 *
 * Richiede: TRUSTPILOT_API_KEY, TRUSTPILOT_API_SECRET, TRUSTPILOT_USERNAME,
 *           TRUSTPILOT_PASSWORD (disponibili su Railway)
 *
 * Run from platform/ directory:
 *   node scripts/recover-trustpilot-refid.js          ← tutti i 275
 *   node scripts/recover-trustpilot-refid.js --test   ← solo Valerio Felici
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sendTelegramAlert } = require('./lib/telegram-alert');

const IS_TEST       = process.argv.includes('--test');
const TEST_TP_ID    = '69fc51637bf118b06d276a7c'; // Valerio Felici
const RATE_LIMIT_MS = 500;   // 2 req/sec
const PROGRESS_FILE = path.resolve(__dirname, '.recover-trustpilot-progress.json');

const missing = ['TRUSTPILOT_API_KEY', 'TRUSTPILOT_API_SECRET', 'TRUSTPILOT_USERNAME', 'TRUSTPILOT_PASSWORD', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']
  .filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── OAuth Trustpilot ──────────────────────────────────────────────────────────

let _tokenCache = null;

async function getToken() {
  if (_tokenCache && _tokenCache.exp > Date.now() + 60_000) return _tokenCache.token;
  const basic = Buffer.from(`${process.env.TRUSTPILOT_API_KEY}:${process.env.TRUSTPILOT_API_SECRET}`).toString('base64');
  const params = new URLSearchParams({ grant_type: 'password', username: process.env.TRUSTPILOT_USERNAME, password: process.env.TRUSTPILOT_PASSWORD });
  const { data } = await axios.post(
    'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken',
    params.toString(),
    { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );
  _tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  console.log('[tp-oauth] Token ottenuto');
  return _tokenCache.token;
}

async function fetchPrivateReview(trustpilotId) {
  const token = await getToken();
  const { data } = await axios.get(
    `https://api.trustpilot.com/v1/private/reviews/${trustpilotId}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
  );
  return data;
}

// ── Resume ────────────────────────────────────────────────────────────────────

function loadProgress() {
  try { if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch (_) {}
  return { lastId: 0 };
}

function saveProgress(lastId) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastId, ts: new Date().toISOString() }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n── Recover Trustpilot reference_id ─────────────────`);
  console.log(`  Modalità: ${IS_TEST ? 'TEST (singola review)' : 'COMPLETO'}`);
  console.log(`────────────────────────────────────────────────────\n`);

  // 1. Carica recensioni senza reference_id
  let query = supabase.from('reviews')
    .select('id, trustpilot_id')
    .eq('source', 'trustpilot')
    .is('reference_id', null)
    .order('id', { ascending: true });

  if (IS_TEST) {
    query = query.eq('trustpilot_id', TEST_TP_ID);
  } else {
    const { lastId } = loadProgress();
    if (lastId > 0) { console.log(`[resume] Riprendo da id > ${lastId}`); query = query.gt('id', lastId); }
    query = query.range(0, 9999);
  }

  const { data: reviews, error } = await query;
  if (error) { console.error('[fetch] Errore:', error.message); process.exit(1); }
  console.log(`[fetch] ${reviews.length} recensioni da processare\n`);

  const stats = { total: reviews.length, recuperati: 0, non_disponibili: 0, errori: 0 };

  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    try {
      const payload = await fetchPrivateReview(r.trustpilot_id);

      if (IS_TEST) {
        console.log(`\n[TEST] Payload Trustpilot per ${r.trustpilot_id}:`);
        console.log('  referenceId:', payload.referenceId);
        console.log('  referenceNumber:', payload.referenceNumber);
        console.log('  stars:', payload.stars);
        console.log('  consumer:', payload.consumer?.displayName);
        console.log('  invitation:', JSON.stringify(payload.invitation));
      }

      const refId = payload.referenceId || payload.referenceNumber || null;

      if (refId) {
        const { error: uErr } = await supabase.from('reviews')
          .update({ reference_id: String(refId) })
          .eq('id', r.id);

        if (uErr) {
          console.error(`  [error] UPDATE id=${r.id}: ${uErr.message}`);
          stats.errori++;
        } else {
          console.log(`  [OK] id=${r.id} trustpilot_id=${r.trustpilot_id} → reference_id=${refId}`);
          stats.recuperati++;
        }
      } else {
        console.log(`  [skip] id=${r.id} ${r.trustpilot_id} — referenceId non presente nel payload`);
        stats.non_disponibili++;
      }

      if (!IS_TEST) saveProgress(r.id);
    } catch (err) {
      const status = err.response?.status;
      console.error(`  [errore] id=${r.id} ${r.trustpilot_id}: HTTP ${status} ${err.message}`);
      stats.errori++;
    }

    if (i < reviews.length - 1) await sleep(RATE_LIMIT_MS);
  }

  // Pulizia progress file
  if (!IS_TEST && fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);

  console.log(`\n── Riepilogo ────────────────────────────────────────`);
  console.log(`  Totale processate:      ${stats.total}`);
  console.log(`  Recuperati (UPDATE OK): ${stats.recuperati}`);
  console.log(`  Non disponibili su TP:  ${stats.non_disponibili}`);
  console.log(`  Errori HTTP/network:    ${stats.errori}`);
  console.log(`────────────────────────────────────────────────────\n`);

  if (!IS_TEST) {
    await sendTelegramAlert(
      `<b>Recover Trustpilot reference_id</b>\n` +
      `Totale: ${stats.total}\n` +
      `Recuperati: ${stats.recuperati}\n` +
      `Non disponibili: ${stats.non_disponibili}\n` +
      `Errori: ${stats.errori}`
    );
  }
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
