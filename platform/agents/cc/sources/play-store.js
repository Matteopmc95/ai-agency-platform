console.log('[play-store] credentials loaded:', !!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);

if (!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
  console.error('[play-store] GOOGLE_SERVICE_ACCOUNT_BASE64 non trovata');
  module.exports = { avviaPollingPlayStore: () => {}, rispondiPlayStore: async () => {} };
} else {
  const { google } = require('googleapis');

  const PACKAGE_NAME = 'it.parkingmycar.parkingmyapp';
  const POLL_INTERVAL_MS = 30 * 60 * 1000;

  function createAuth() {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  async function fetchReviews() {
    const auth = createAuth();
    const androidpublisher = google.androidpublisher({ version: 'v3', auth });
    const response = await androidpublisher.reviews.list({
      packageName: PACKAGE_NAME,
      maxResults: 100,
    });
    return response.data.reviews || [];
  }

  async function pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn) {
    try {
      const reviews = await fetchReviews();
      let nuove = 0;

      for (const review of reviews) {
        const userComment = review.comments?.[0]?.userComment;
        if (!userComment) continue;
        if (userComment.starRating < 4) continue;

        const reviewId = review.reviewId;
        const stelle = userComment.starRating;
        const testo = userComment.text;
        const autore = review.authorDetails?.name || 'Anonimo';
        const seconds = parseInt(userComment.lastModified?.seconds || 0);
        const data = new Date(seconds * 1000).toISOString();

        const { data: esistente } = await supabase
          .from('reviews')
          .select('id')
          .eq('trustpilot_id', reviewId)
          .maybeSingle();

        if (esistente) continue;

        const { data: inserted, error } = await supabase
          .from('reviews')
          .insert({ trustpilot_id: reviewId, testo, autore, data, stelle, stato: 'pending', source: 'playstore' })
          .select('id')
          .single();

        if (error) {
          await logFn('play-store-poller', 'insert_errore', { reviewId, errore: error.message });
          continue;
        }

        nuove++;

        if (processaRecensioneFn && salvaAnalisiFn) {
          const review_id = inserted.id;
          setImmediate(async () => {
            try {
              const analisi = await processaRecensioneFn(reviewId, testo, autore, { data });
              await salvaAnalisiFn(review_id, analisi);
              await logFn('play-store-poller', 'analisi_completata', { review_id, tipo_risposta: analisi.tipo_risposta });
            } catch (err) {
              await logFn('play-store-poller', 'analisi_errore', { review_id, errore: err.message });
            }
          });
        }
      }

      await logFn('play-store-poller', 'poll_completato', { nuove, totale_fetched: reviews.length });
    } catch (err) {
      await logFn('play-store-poller', 'poll_errore', { errore: err.message });
    }
  }

  async function rispondiPlayStore(reviewId, testo_risposta) {
    const auth = createAuth();
    const androidpublisher = google.androidpublisher({ version: 'v3', auth });
    await androidpublisher.reviews.reply({
      packageName: PACKAGE_NAME,
      reviewId,
      requestBody: { replyText: testo_risposta },
    });
  }

  function avviaPollingPlayStore(supabase, logFn, processaRecensioneFn, salvaAnalisiFn) {
    pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn);
    return setInterval(() => pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn), POLL_INTERVAL_MS);
  }

  module.exports = { avviaPollingPlayStore, rispondiPlayStore };
}
