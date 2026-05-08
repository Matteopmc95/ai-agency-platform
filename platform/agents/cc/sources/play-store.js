console.log('[play-store] credentials loaded:', !!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);

if (!process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
  console.error('[play-store] GOOGLE_SERVICE_ACCOUNT_BASE64 non trovata');
  module.exports = {
    avviaPollingPlayStore: () => {},
    rispondiPlayStore: async () => {},
    fetchReviewsSince: async () => [],
  };
} else {
  const { google } = require('googleapis');

  const PACKAGE_NAME       = 'it.parkingmycar.parkingmyapp';
  const POLL_INTERVAL_MS   = 30 * 60 * 1000;
  const POLLER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni per il poller

  function createAuth() {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  // Fetch paginato: restituisce tutte le review con lastModified >= cutoffMs.
  // Early exit non appena una review è più vecchia del cutoff.
  async function fetchReviewsSince(cutoffMs) {
    const auth = createAuth();
    const ap   = google.androidpublisher({ version: 'v3', auth });
    const all  = [];
    let pageToken = undefined;

    while (true) {
      const params = { packageName: PACKAGE_NAME, maxResults: 100 };
      if (pageToken) params.token = pageToken;

      const response = await ap.reviews.list(params);
      const rows     = response.data.reviews || [];
      let earlyExit  = false;

      for (const r of rows) {
        const seconds  = parseInt(r.comments?.[0]?.userComment?.lastModified?.seconds || 0);
        if (seconds * 1000 < cutoffMs) { earlyExit = true; break; }
        all.push(r);
      }

      const nextToken = response.data.tokenPagination?.nextPageToken;
      if (earlyExit || !nextToken || !rows.length) break;
      pageToken = nextToken;
    }

    return all;
  }

  // Processa una singola review: insert + AI condizionata (solo stelle >= 4)
  async function processaReviewPS(review, supabase, logFn, processaRecensioneFn, salvaAnalisiFn) {
    const userComment = review.comments?.[0]?.userComment;
    if (!userComment) return 'skip';

    const reviewId = review.reviewId;
    const stelle   = userComment.starRating;
    const testo    = userComment.text || '';
    const autore   = review.authorDetails?.name || 'Anonimo';
    const seconds  = parseInt(userComment.lastModified?.seconds || 0);
    const data     = new Date(seconds * 1000).toISOString();

    const { data: esistente } = await supabase
      .from('reviews')
      .select('id')
      .eq('trustpilot_id', reviewId)
      .maybeSingle();

    if (esistente) return 'duplicate';

    const { data: inserted, error } = await supabase
      .from('reviews')
      .insert({ trustpilot_id: reviewId, testo, autore, data, stelle, stato: 'pending', source: 'playstore' })
      .select('id')
      .single();

    if (error) {
      await logFn('play-store-poller', 'insert_errore', { reviewId, errore: error.message });
      return 'error';
    }

    // AI solo per recensioni >= 4 stelle
    if (stelle >= 4 && processaRecensioneFn && salvaAnalisiFn) {
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

    return 'inserted';
  }

  async function pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn) {
    try {
      const cutoffMs = Date.now() - POLLER_LOOKBACK_MS;
      const reviews  = await fetchReviewsSince(cutoffMs);
      let nuove = 0;

      for (const review of reviews) {
        const result = await processaReviewPS(review, supabase, logFn, processaRecensioneFn, salvaAnalisiFn);
        if (result === 'inserted') nuove++;
      }

      await logFn('play-store-poller', 'poll_completato', { nuove, totale_fetched: reviews.length });
    } catch (err) {
      await logFn('play-store-poller', 'poll_errore', { errore: err.message });
    }
  }

  async function rispondiPlayStore(reviewId, testo_risposta) {
    const auth = createAuth();
    const ap   = google.androidpublisher({ version: 'v3', auth });
    await ap.reviews.reply({
      packageName: PACKAGE_NAME,
      reviewId,
      requestBody: { replyText: testo_risposta },
    });
  }

  function avviaPollingPlayStore(supabase, logFn, processaRecensioneFn, salvaAnalisiFn) {
    pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn);
    return setInterval(
      () => pollPlayStoreReviews(supabase, logFn, processaRecensioneFn, salvaAnalisiFn),
      POLL_INTERVAL_MS
    );
  }

  module.exports = { avviaPollingPlayStore, rispondiPlayStore, fetchReviewsSince };
}
