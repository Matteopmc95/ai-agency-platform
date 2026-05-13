const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Lookup BO data by user email.
 * @param {string} email - email in chiaro
 * @returns {{ found, is_first_booking, last_segmento, last_location,
 *             total_bookings, segmenti_usati, is_cross }}
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

  const latest      = bookings[0];
  const segmenti    = [...new Set(bookings.map(b => b.segmento).filter(Boolean))];
  const firstDate   = latest.user_first_booking_date;
  const latestStart = latest.booking_start || latest.transaction_date;

  // is_first_booking: true se la data prima prenotazione coincide con la più recente
  const isFirst = !!(
    firstDate && latestStart &&
    new Date(firstDate).toISOString().slice(0, 10) === new Date(latestStart).toISOString().slice(0, 10)
  );

  return {
    found:           true,
    is_first_booking: isFirst,
    last_segmento:   latest.segmento || null,
    last_location:   latest.location_name || null,
    total_bookings:  bookings.length,
    segmenti_usati:  segmenti,
    is_cross:        segmenti.length > 1,
  };
}

module.exports = { getBoDataByEmail };
