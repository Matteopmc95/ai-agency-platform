const crypto   = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── LRU cache ─────────────────────────────────────────────────────────────────
// Usa Map (insertion-ordered) per evizione O(1) dell'entry più vecchia.

const CACHE_TTL_MS  = Number(process.env.BO_LOOKUP_CACHE_TTL_MS)  || 300_000; // 5 min
const CACHE_MAX     = Number(process.env.BO_LOOKUP_CACHE_MAX)      || 500;

const _cache = new Map();   // key: transaction_id → { data, expiresAt }
let _hits = 0, _misses = 0;

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) { _misses++; return undefined; }
  if (Date.now() > entry.expiresAt) { _cache.delete(key); _misses++; return undefined; }
  // LRU: sposta in fondo (più recente)
  _cache.delete(key);
  _cache.set(key, entry);
  _hits++;
  return entry.data;
}

function _cacheSet(key, data) {
  if (_cache.size >= CACHE_MAX) {
    // Evict oldest (first key in Map)
    _cache.delete(_cache.keys().next().value);
  }
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function _normalize(row) {
  if (!row) return null;
  const seg       = row.segmento || null;
  const firstType = row.user_first_booking_parking_type || null;
  const txDate    = _toDate(row.transaction_date);
  const firstDate = _toDate(row.user_first_booking_date);
  return {
    transaction_id:        row.transaction_id,
    segmento:              seg,
    location_name:         row.location_name       || null,
    transaction_date:      row.transaction_date     || null,
    cross:                 !!(firstType && seg && firstType !== seg),
    prima_prenotazione:    !!(txDate && firstDate && txDate === firstDate),
    user_email_sha256:     row.user_email_sha256    || null,
    final_price:           row.final_price          ?? null,
    paid_price:            row.paid_price           ?? null,
  };
}

const BO_SELECT = 'transaction_id, segmento, location_name, transaction_date, ' +
                  'user_first_booking_date, user_first_booking_parking_type, ' +
                  'user_email_sha256, final_price, paid_price';

// ── API pubblica ──────────────────────────────────────────────────────────────

/**
 * Lookup BO per transaction_id singolo.
 * @param {string} transactionId
 * @returns {object|null}  oggetto normalizzato o null se non trovato
 */
async function boLookup(transactionId) {
  if (!transactionId) return null;
  const key = String(transactionId).trim();
  if (!key) return null;

  const cached = _cacheGet(key);
  if (cached !== undefined) return cached; // null è un risultato valido (miss BO)

  try {
    const { data, error } = await supabase
      .from('bo_bookings')
      .select(BO_SELECT)
      .eq('transaction_id', key)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`[bo-lookup] Errore Supabase per transaction_id=${key}: ${error.message}`);
      return null;
    }

    const result = data ? _normalize(data) : null;
    _cacheSet(key, result);
    return result;
  } catch (err) {
    console.warn(`[bo-lookup] Eccezione per transaction_id=${key}: ${err.message}`);
    return null;
  }
}

/**
 * Lookup BO per lista di transaction_id (batch).
 * Sfrutta la cache per ID già caricati; interroga Supabase solo per i miss.
 * @param {string[]} transactionIds
 * @returns {Map<string, object|null>}
 */
async function boLookupBatch(transactionIds) {
  const result = new Map();
  if (!transactionIds?.length) return result;

  const toFetch = [];
  for (const raw of transactionIds) {
    const key = String(raw || '').trim();
    if (!key) continue;
    const cached = _cacheGet(key);
    if (cached !== undefined) {
      result.set(key, cached);
    } else {
      toFetch.push(key);
    }
  }

  // Fetch in chunk da 100 per evitare URL troppo lunghi
  const CHUNK = 100;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .from('bo_bookings')
        .select(BO_SELECT)
        .in('transaction_id', chunk);

      if (error) {
        console.warn(`[bo-lookup-batch] Errore Supabase chunk ${i}: ${error.message}`);
        chunk.forEach(key => { result.set(key, null); _cacheSet(key, null); });
        continue;
      }

      const found = new Map((data || []).map(row => [row.transaction_id, _normalize(row)]));
      for (const key of chunk) {
        const val = found.get(key) || null;
        result.set(key, val);
        _cacheSet(key, val);
      }
    } catch (err) {
      console.warn(`[bo-lookup-batch] Eccezione chunk ${i}: ${err.message}`);
      chunk.forEach(key => result.set(key, null));
    }
  }

  return result;
}

/**
 * Statistiche cache per observability/audit.
 * @returns {{ hits, misses, hit_rate, size }}
 */
function cacheStats() {
  const total = _hits + _misses;
  return {
    hits:     _hits,
    misses:   _misses,
    hit_rate: total > 0 ? `${(((_hits / total) * 100)).toFixed(1)}%` : 'n/a',
    size:     _cache.size,
    max:      CACHE_MAX,
    ttl_ms:   CACHE_TTL_MS,
  };
}

// ── Funzione precedente (invariata) ──────────────────────────────────────────

/**
 * Lookup BO data by user email (ricerca per hash email, non per transaction_id).
 * @param {string} email - email in chiaro
 */
async function getBoDataByEmail(email) {
  if (!email || typeof email !== 'string') return { found: false };

  const hash = crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase(), 'utf8')
    .digest('hex');

  const { data: bookings, error } = await supabase
    .from('bo_bookings')
    .select('transaction_id, transaction_date, booking_start, segmento, location_name, user_first_booking_date, user_first_booking_parking_type')
    .eq('user_email_sha256', hash)
    .order('transaction_date', { ascending: false })
    .limit(100);

  if (error || !bookings?.length) return { found: false };

  const latest   = bookings[0];
  const segmenti = [...new Set(bookings.map(b => b.segmento).filter(Boolean))];
  const firstDate   = latest.user_first_booking_date;
  const latestStart = latest.booking_start || latest.transaction_date;

  const isFirst = !!(
    firstDate && latestStart &&
    new Date(firstDate).toISOString().slice(0, 10) === new Date(latestStart).toISOString().slice(0, 10)
  );

  return {
    found:            true,
    is_first_booking: isFirst,
    last_segmento:    latest.segmento    || null,
    last_location:    latest.location_name || null,
    total_bookings:   bookings.length,
    segmenti_usati:   segmenti,
    is_cross:         segmenti.length > 1,
  };
}

module.exports = { boLookup, boLookupBatch, cacheStats, getBoDataByEmail };
