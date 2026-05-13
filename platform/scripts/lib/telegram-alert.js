/**
 * telegram-alert.js
 * Invia alert Telegram. Graceful degrade se env mancanti.
 *
 * Test manuale:
 *   node scripts/lib/telegram-alert.js test
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const https = require('https');
const os    = require('os');

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID;

// ── Core send ────────────────────────────────────────────────────────────────

function _post(text, silent = false) {
  return new Promise((resolve) => {
    if (!TOKEN || !CHAT_ID) {
      console.warn('[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_ALERT_CHAT_ID mancanti — alert saltato');
      return resolve(false);
    }

    const body = JSON.stringify({
      chat_id:              CHAT_ID,
      text,
      parse_mode:           'HTML',
      disable_notification: Boolean(silent),
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${TOKEN}/sendMessage`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  10_000,
      },
      (res) => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error(`[telegram] HTTP ${res.statusCode}: ${data.slice(0, 120)}`);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      }
    );

    req.on('timeout', () => { req.destroy(); console.error('[telegram] Timeout'); resolve(false); });
    req.on('error',   (e) => { console.error('[telegram] Errore:', e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ── Anti-spam buffer (throttle errori multipli in <60s) ────────────────────

let _errorBuffer = [];
let _flushTimer  = null;
const THROTTLE_MS = 60_000;

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    if (!_errorBuffer.length) return;
    const msgs = _errorBuffer.splice(0);
    const combined = msgs.length === 1
      ? msgs[0]
      : `⚠️ <b>${msgs.length} alert raggruppati</b>\n\n` + msgs.join('\n\n---\n');
    await _post(combined);
  }, THROTTLE_MS);
}

// Flush esplicito a fine processo
process.on('exit', () => {
  if (_flushTimer) clearTimeout(_flushTimer);
  if (_errorBuffer.length) {
    // Sincrono non possibile su exit — logga almeno su console
    console.warn('[telegram] Alert in buffer non inviati:', _errorBuffer.length);
  }
});

// ── API pubblica ──────────────────────────────────────────────────────────────

/**
 * Invia un alert Telegram.
 * @param {string} message  Testo HTML
 * @param {{ silent?: boolean, throttle?: boolean }} options
 */
async function sendTelegramAlert(message, options = {}) {
  try {
    if (options.throttle) {
      _errorBuffer.push(message);
      _scheduleFlush();
      return;
    }
    await _post(message, options.silent);
  } catch (err) {
    // Non propaga mai
    console.error('[telegram] Errore imprevisto:', err.message);
  }
}

/**
 * Flush immediato del buffer (utile a fine script per non perdere alert).
 */
async function flushTelegramBuffer() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (!_errorBuffer.length) return;
  const msgs = _errorBuffer.splice(0);
  const combined = msgs.length === 1
    ? msgs[0]
    : `⚠️ <b>${msgs.length} alert raggruppati</b>\n\n` + msgs.join('\n\n---\n');
  await _post(combined);
}

module.exports = { sendTelegramAlert, flushTelegramBuffer };

// ── CLI test ──────────────────────────────────────────────────────────────────

if (require.main === module && process.argv[2] === 'test') {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  sendTelegramAlert(
    `🧪 <b>Test alert da CLI</b>\nHost: <code>${os.hostname()}</code>\nTimestamp: ${ts}`
  ).then(() => console.log('[telegram] Test inviato'));
}
