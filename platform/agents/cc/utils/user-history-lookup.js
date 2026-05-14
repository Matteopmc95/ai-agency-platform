'use strict';

// ── LRU Cache ─────────────────────────────────────────────────────────────────

const CACHE_MAX = 200;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const _cache = new Map();  // hash → { data, expiresAt }
let _hits = 0, _misses = 0;

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) { _misses++; return undefined; }
  if (Date.now() > entry.expiresAt) { _cache.delete(key); _misses++; return undefined; }
  _cache.delete(key); _cache.set(key, entry); // re-insert → LRU order
  _hits++;
  return entry.data;
}

function cacheSet(key, data) {
  if (_cache.has(key)) _cache.delete(key);
  else if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value); // evict oldest
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

function getCacheStats() {
  return { hits: _hits, misses: _misses, size: _cache.size };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPLETED_STATES = new Set(['completed', 'approved', 'running']);

// ── Main ──────────────────────────────────────────────────────────────────────

async function calculateUserHistory({ reference_id, supabase, currentBooking }) {
  let booking;

  if (currentBooking) {
    booking = currentBooking;
  } else {
    // 1. Fetch booking corrente
    const { data: bookings, error: e1 } = await supabase
      .from('bo_bookings')
      .select('transaction_id, user_email_sha256, segmento, transaction_date, transaction_state')
      .eq('transaction_id', reference_id)
      .limit(1);

    if (e1)  { console.error('[user-history] lookup error:', e1.message); return null; }
    if (!bookings?.length) {
      console.log('[user-history] booking non trovato per reference_id:', reference_id);
      return null;
    }
    booking = bookings[0];
  }

  // 2. Utente anonimo
  if (!booking.user_email_sha256) {
    console.log('[user-history] user_email_sha256 null per:', reference_id);
    return null;
  }

  const hash        = booking.user_email_sha256;
  const bookingDate = booking.transaction_date;

  // 3. Cache lookup
  let allHistory = cacheGet(hash);

  if (allHistory === undefined) {
    console.log('[user-history] cache miss —', hash.substring(0, 16) + '...');
    const { data: history, error: e2 } = await supabase
      .from('bo_bookings')
      .select('segmento, transaction_date, transaction_state')
      .eq('user_email_sha256', hash)
      .order('transaction_date', { ascending: true });

    if (e2) { console.error('[user-history] history query error:', e2.message); return null; }
    allHistory = history || [];
    cacheSet(hash, allHistory);
  } else {
    console.log('[user-history] cache hit  —', hash.substring(0, 16) + '...');
  }

  // 4. Deriva completedHistory
  const completedHistory = allHistory.filter(b => COMPLETED_STATES.has(b.transaction_state));

  // 5. Precedenti = prima della transaction_date del booking corrente
  const previousAll       = allHistory.filter(b => b.transaction_date < bookingDate);
  const previousCompleted = completedHistory.filter(b => b.transaction_date < bookingDate);

  // 6. Helper
  const unique = arr => [...new Set(arr)];

  // 7. Calcola i 10 campi
  const segPrecedenti          = unique(previousAll.map(b => b.segmento).filter(Boolean));
  const segPrecedentiCompleted = unique(previousCompleted.map(b => b.segmento).filter(Boolean));
  const bookingSeg             = booking.segmento || null;

  const result = {
    segmenti_precedenti:                 segPrecedenti,
    segmenti_precedenti_completed:       segPrecedentiCompleted,
    segmento_origine:                    allHistory[0]?.segmento || bookingSeg,
    n_prenotazioni_precedenti:           previousAll.length,
    n_prenotazioni_precedenti_completed: previousCompleted.length,
    cross_with_cancelled:                segPrecedenti.length > 0
                                           && !segPrecedenti.includes(bookingSeg),
    cross_completed_only:                segPrecedentiCompleted.length > 0
                                           && !segPrecedentiCompleted.includes(bookingSeg),
    cross_ever_with_cancelled:           unique(allHistory.map(b => b.segmento).filter(Boolean)).length >= 2,
    cross_ever_completed_only:           unique(completedHistory.map(b => b.segmento).filter(Boolean)).length >= 2,
    giorni_da_prima_prenotazione:        allHistory.length > 0
                                           ? Math.floor(
                                               (new Date(bookingDate) - new Date(allHistory[0].transaction_date))
                                               / 86_400_000
                                             )
                                           : 0,
  };

  console.log('[user-history]', reference_id,
    '| prev_all:', result.n_prenotazioni_precedenti,
    '| prev_completed:', result.n_prenotazioni_precedenti_completed,
    '| cross_ever_completed:', result.cross_ever_completed_only);

  return result;
}

module.exports = { calculateUserHistory, getCacheStats };
