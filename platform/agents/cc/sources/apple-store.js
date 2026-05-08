console.log('[apple-store] credentials loaded:',
  !!process.env.APPLE_ISSUER_ID && !!process.env.APPLE_KEY_ID && !!process.env.APPLE_PRIVATE_KEY_BASE64);

if (!process.env.APPLE_ISSUER_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY_BASE64) {
  console.error('[apple-store] credenziali mancanti');
  module.exports = { avviaPollingApple: () => {} };
} else {
  const jwt = require('jsonwebtoken');
  const axios = require('axios');

  const APP_NAME = 'ParkingMyCar';
  const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || null;
  const APP_ID = process.env.APPLE_APP_ID || null;
  const POLL_INTERVAL_MS = 30 * 60 * 1000;
  const API_BASE = 'https://api.appstoreconnect.apple.com';

  const ISSUER_ID = process.env.APPLE_ISSUER_ID;
  const KEY_ID = process.env.APPLE_KEY_ID;
  const PRIVATE_KEY = Buffer.from(process.env.APPLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');

  let cachedAppId = APP_ID;

  function generateToken() {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iss: ISSUER_ID, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' },
      PRIVATE_KEY,
      { algorithm: 'ES256', header: { kid: KEY_ID, typ: 'JWT' } }
    );
  }

  async function findAppId() {
    if (cachedAppId) return cachedAppId;
    const token = generateToken();
    const params = {};
    if (BUNDLE_ID) params['filter[bundleId]'] = BUNDLE_ID;
    const response = await axios.get(`${API_BASE}/v1/apps`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    const apps = response.data?.data || [];
    const app = BUNDLE_ID
      ? apps[0]
      : apps.find(a => (a.attributes?.name || '').toLowerCase().includes(APP_NAME.toLowerCase())) || apps[0];
    if (!app) throw new Error(`App non trovata (${BUNDLE_ID || APP_NAME})`);
    cachedAppId = app.id;
    return cachedAppId;
  }

  async function fetchReviews() {
    const appId = await findAppId();
    const token = generateToken();
    const response = await axios.get(`${API_BASE}/v1/apps/${appId}/customerReviews`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 200, sort: '-createdDate' },
    });
    return response.data?.data || [];
  }

  async function pollAppleReviews(supabase, logFn, processaRecensioneFn) {
    try {
      const reviews = await fetchReviews();
      let nuove = 0;

      for (const review of reviews) {
        const attrs = review.attributes || {};
        const stelle = attrs.rating;
        if (!stelle || stelle < 4) continue;

        const reviewId = review.id;
        const testo = [attrs.title, attrs.body].filter(Boolean).join('\n\n');
        if (!testo) continue;

        const autore = attrs.reviewerNickname || 'Anonimo';
        const data = attrs.createdDate || new Date().toISOString();

        const { data: esistente } = await supabase
          .from('reviews')
          .select('id')
          .eq('trustpilot_id', reviewId)
          .maybeSingle();

        if (esistente) continue;

        const { data: inserted, error } = await supabase
          .from('reviews')
          .insert({ trustpilot_id: reviewId, testo, autore, data, stelle, stato: 'pending', source: 'apple' })
          .select('id')
          .single();

        if (error) {
          await logFn('apple-store-poller', 'insert_errore', { reviewId, errore: error.message });
          continue;
        }

        nuove++;

        if (processaRecensioneFn) {
          const review_id = inserted.id;
          setImmediate(async () => {
            try {
              const analisi = await processaRecensioneFn(reviewId, testo, autore, { data });
              if (analisi.booking_date) {
                await supabase.from('reviews').update({ booking_date: analisi.booking_date }).eq('id', review_id);
              }
              await supabase.from('review_analysis').insert({
                review_id,
                topic: analisi.topic,
                segmento: analisi.segmento,
                prima_prenotazione: Boolean(analisi.prima_prenotazione),
                cross: Boolean(analisi.cross),
                localita: analisi.localita,
                risposta_generata: analisi.risposta_generata,
                flag_referral: Boolean(analisi.flag_referral),
                flag_cross: Boolean(analisi.flag_cross),
              });
              await logFn('apple-store-poller', 'analisi_completata', { review_id, tipo_risposta: analisi.tipo_risposta });
            } catch (err) {
              await logFn('apple-store-poller', 'analisi_errore', { review_id, errore: err.message });
            }
          });
        }
      }

      await logFn('apple-store-poller', 'poll_completato', { nuove, totale_fetched: reviews.length });
    } catch (err) {
      await logFn('apple-store-poller', 'poll_errore', { errore: err.message });
    }
  }

  function avviaPollingApple(supabase, logFn, processaRecensioneFn) {
    pollAppleReviews(supabase, logFn, processaRecensioneFn);
    return setInterval(() => pollAppleReviews(supabase, logFn, processaRecensioneFn), POLL_INTERVAL_MS);
  }

  module.exports = { avviaPollingApple };
}
