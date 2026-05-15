require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const Papa  = require('papaparse');
const { processaRecensione } = require('./agent-reviews');
const { avviaPollingPlayStore, rispondiPlayStore, fetchReviewsSince } = require('./sources/play-store');
const { avviaPollingApple } = require('./sources/apple-store');
const { boLookupBatch } = require('./utils/bo-lookup');

const app = express();
app.use(cors({
  origin: ['https://ai-agency-platform-git-main-matteo-pmcs-projects.vercel.app', 'http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());

// --- SUPABASE CLIENT ---

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// --- HELPERS ---

async function log(agent, azione, dettaglio = null) {
  await supabase.from('agent_logs').insert({ agent, azione, dettaglio });
}

function getPeriodStart(period) {
  const now = new Date();

  if (period === 'current_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  }

  if (period === '3months') {
    return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString();
  }

  return null;
}

function normalizeTopicList(topic) {
  if (Array.isArray(topic)) return topic;
  if (typeof topic === 'string' && topic.trim()) return [topic.trim()];
  return [];
}

function applySourceFilter(query, source) {
  if (!source) return query;
  if (source === 'trustpilot') return query.or('source.eq.trustpilot,source.is.null');
  return query.eq('source', source);
}


// --- AUTH MIDDLEWARE ---

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ errore: 'Token di autenticazione mancante' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ errore: 'Token non valido o scaduto' });
  }

  req.user = user;
  next();
}

// Cache OAuth token in memoria: { token, expiresAt }
let _tpTokenCache = null;

async function getTrustpilotAccessToken() {
  const now = Date.now();
  if (_tpTokenCache && now < _tpTokenCache.expiresAt) {
    return _tpTokenCache.token;
  }

  const apiKey = process.env.TRUSTPILOT_API_KEY;
  const apiSecret = process.env.TRUSTPILOT_API_SECRET;
  const username = process.env.TRUSTPILOT_USERNAME;
  const password = process.env.TRUSTPILOT_PASSWORD;

  if (!apiKey || !apiSecret || !username || !password) {
    throw new Error('Credenziali Trustpilot OAuth mancanti (TRUSTPILOT_API_KEY, TRUSTPILOT_API_SECRET, TRUSTPILOT_USERNAME, TRUSTPILOT_PASSWORD)');
  }

  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const params = new URLSearchParams({ grant_type: 'password', username, password });

  console.log('[tp-oauth] richiedendo access token...');
  const response = await axios.post(
    'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken',
    params.toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('Trustpilot OAuth: access_token assente nella risposta');

  // Scade dopo expires_in secondi; cache 95% del TTL per sicurezza
  _tpTokenCache = {
    token: access_token,
    expiresAt: now + Math.floor((expires_in ?? 360000) * 0.95) * 1000,
  };
  console.log(`[tp-oauth] token ottenuto, scade in ${expires_in}s`);
  return access_token;
}

async function pubblicaRispostaTrustpilot(trustpilot_id, testo_risposta) {
  const token = await getTrustpilotAccessToken();
  const url = `https://api.trustpilot.com/v1/private/reviews/${trustpilot_id}/reply`;

  console.log('[trustpilot] using token:', token?.substring(0, 20) + '...');
  console.log('[trustpilot] reviewId:', trustpilot_id);
  console.log('[trustpilot] url:', url);

  try {
    await axios.post(
      url,
      { message: testo_risposta },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('[trustpilot] risposta pubblicata con successo, reviewId:', trustpilot_id);
  } catch (err) {
    console.error('[trustpilot] errore status:', err.response?.status);
    console.error('[trustpilot] errore body:', JSON.stringify(err.response?.data));
    console.error('[trustpilot] errore url:', err.config?.url);
    if (err.response?.status === 401) {
      _tpTokenCache = null;
      console.error('[trustpilot] 401 — cache token invalidata');
    }
    throw err;
  }
}

async function salvaAnalisi(review_id, analisi) {
  console.log('[salvaAnalisi] data:', JSON.stringify(analisi));

  const raPayload = {
    review_id,
    topic: analisi.topic,
    segmento: analisi.segmento,
    prima_prenotazione: Boolean(analisi.prima_prenotazione),
    cross: Boolean(analisi.cross),
    localita: analisi.localita,
    booking_date: analisi.booking_date || null,
    risposta_generata: analisi.risposta_generata,
    flag_referral: Boolean(analisi.flag_referral),
    flag_cross: Boolean(analisi.flag_cross),
    tipo_risposta: analisi.tipo_risposta || null,
    created_at: new Date().toISOString(),
    ...(analisi._historyData || {}),
  };

  const { error: raError } = await supabase
    .from('review_analysis')
    .upsert(raPayload, { onConflict: 'review_id' });

  if (raError) {
    console.error('[salvaAnalisi] errore review_analysis:', raError.message, raError.details);
    await log('agent-api', 'salva_analisi_errore', { review_id, tabella: 'review_analysis', errore: raError.message });
    throw new Error(`salvaAnalisi review_analysis: ${raError.message}`);
  }

  const reviewPayload = {
    analisi_at: new Date().toISOString(),
    ...(analisi.booking_date       ? { booking_date:       analisi.booking_date }       : {}),
    ...(analisi.enrichment_status  ? { enrichment_status:  analisi.enrichment_status }  : {}),
  };

  const { error: rError } = await supabase
    .from('reviews')
    .update(reviewPayload)
    .eq('id', review_id);

  if (rError) {
    console.error('[salvaAnalisi] errore reviews:', rError.message, rError.details);
    await log('agent-api', 'salva_analisi_errore', { review_id, tabella: 'reviews', errore: rError.message });
    throw new Error(`salvaAnalisi reviews: ${rError.message}`);
  }

  await log('agent-api', 'analisi_salvata', { review_id, tipo_risposta: analisi.tipo_risposta });
}

// --- GMB HELPERS ---

const GMB_STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const GMB_CUTOFF_MS = new Date('2026-05-04T00:00:00Z').getTime();
const GMB_POLL_INTERVAL_MS = 30 * 60 * 1000;

let _gmbTokenCache = null;

async function getGMBToken() {
  if (_gmbTokenCache && _gmbTokenCache.exp > Date.now() + 60_000) return _gmbTokenCache.token;
  const { google } = require('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.GMB_CLIENT_ID,
    process.env.GMB_CLIENT_SECRET,
    process.env.GMB_REDIRECT_URI
  );
  oauth2.setCredentials({ refresh_token: process.env.GMB_REFRESH_TOKEN });
  const { token, res: tokenRes } = await oauth2.getAccessToken();
  _gmbTokenCache = { token, exp: Date.now() + ((tokenRes?.data?.expires_in ?? 3600) - 60) * 1000 };
  return token;
}

async function gmbGet(url, params = {}, retries = 3) {
  const token = await getGMBToken();
  for (let t = 1; t <= retries; t++) {
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        timeout: 15_000,
      });
      return data;
    } catch (err) {
      if (err.response?.status === 429 && t < retries) {
        const wait = t * 30_000;
        console.warn(`[GMB] 429 su ${url.split('/').pop()} — attendo ${wait / 1000}s (tentativo ${t}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

async function fetchGMBLocations() {
  const accData = await gmbGet('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  const accounts = accData.accounts || [];
  const locs = [];
  for (const acc of accounts) {
    let pageToken;
    do {
      const params = { readMask: 'name,title,storefrontAddress', pageSize: 100 };
      if (pageToken) params.pageToken = pageToken;
      const locData = await gmbGet(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations`,
        params
      );
      for (const loc of (locData.locations || [])) {
        locs.push({
          accountName: acc.name,
          locationName: loc.name,
          fullPath: `${acc.name}/${loc.name}`,
          displayName: loc.title,
          address: loc.storefrontAddress?.addressLines?.join(', ') || null,
        });
      }
      pageToken = locData.nextPageToken;
    } while (pageToken);
  }
  return locs;
}

async function fetchGMBReviewsSince(fullPath, sinceMs) {
  const all = [];
  let pageToken;
  do {
    const params = { pageSize: 50 };
    if (pageToken) params.pageToken = pageToken;
    const data = await gmbGet(`https://mybusiness.googleapis.com/v4/${fullPath}/reviews`, params);
    const reviews = data.reviews || [];
    let earlyExit = false;
    for (const r of reviews) {
      const updateMs = new Date(r.updateTime || r.createTime).getTime();
      const createMs = new Date(r.createTime).getTime();
      if (updateMs < sinceMs) { earlyExit = true; break; }
      if (createMs >= sinceMs) all.push(r);
    }
    pageToken = data.nextPageToken;
    if (earlyExit || !reviews.length) break;
  } while (pageToken);
  return all;
}

function gmbReviewToRow(r, locationDisplayName) {
  return {
    trustpilot_id: r.name,
    testo: r.comment || '',
    autore: r.reviewer?.isAnonymous ? 'Anonimo' : (r.reviewer?.displayName || 'Anonimo'),
    data: r.createTime,
    stelle: GMB_STAR_MAP[r.starRating] || null,
    stato: 'pending',
    source: 'gmb',
    reference_id: locationDisplayName || null,
  };
}

async function pubblicaRispostaGMB(reviewName, testo) {
  const token = await getGMBToken();
  await axios.put(
    `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    { comment: testo },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15_000 }
  );
}

async function pollGMBReviews() {
  try {
    const locs = await fetchGMBLocations();
    let nuove = 0;
    for (const loc of locs) {
      const { data: lastR } = await supabase
        .from('reviews')
        .select('data')
        .eq('source', 'gmb')
        .like('trustpilot_id', `${loc.fullPath}/reviews/%`)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      const sinceMs = lastR ? new Date(lastR.data).getTime() + 1 : GMB_CUTOFF_MS;
      const reviews = await fetchGMBReviewsSince(loc.fullPath, sinceMs);
      for (const r of reviews) {
        const stelle = GMB_STAR_MAP[r.starRating] || 0;
        const row = gmbReviewToRow(r, loc.displayName);
        const { data: ins, error } = await supabase.from('reviews').insert(row).select('id').single();
        if (error) { await log('agent-api', 'gmb_poll_insert_errore', { errore: error.message }); continue; }
        nuove++;
        if (stelle >= 4) {
          const review_id = ins.id;
          setImmediate(async () => {
            try {
              const analisi = await processaRecensione(r.name, row.testo, row.autore, { data: row.data });
              await salvaAnalisi(review_id, analisi);
              await log('agent-api', 'gmb_analisi_completata', { review_id });
            } catch (err) {
              await log('agent-api', 'gmb_analisi_errore', { review_id, errore: err.message });
            }
          });
        }
      }
    }
    await log('agent-api', 'gmb_poll_completato', { nuove, location_count: locs.length });
  } catch (err) {
    await log('agent-api', 'gmb_poll_errore', { errore: err.message });
    console.error('[GMB poller] errore:', err.message);
  }
}

// --- WEBHOOK TRUSTPILOT ---
// POST /webhook/trustpilot
// Riceve nuove recensioni da Trustpilot (webhook configurato nel portale TP)
// Filtra solo 4-5 stelle, salva e avvia analisi AI
app.post('/webhook/trustpilot', async (req, res) => {
  const payload = req.body;

  // Formato reale Trustpilot: { events: [{ eventName, eventData: { id, stars, text, createdAt, consumer } }] }
  // Formato di test legacy:   { reviews: [{ id, stars, text, ... }] }
  // Fallback:                 payload diretto come singolo oggetto
  let recensioni;
  if (Array.isArray(payload.events)) {
    recensioni = payload.events
      .filter(e => e.eventName === 'service-review-created' && e.eventData)
      .map(e => e.eventData);
  } else if (Array.isArray(payload.reviews)) {
    recensioni = payload.reviews;
  } else {
    recensioni = [payload];
  }

  const risultati = [];

  for (const r of recensioni) {
    const trustpilot_id = r.id || r.reviewId;
    const stelle = r.stars || r.rating?.trustScore;
    const testo = r.text || r.content;
    const autore = r.consumer?.name || r.consumer?.displayName || r.author || 'Anonimo';
    const data = r.createdAt || r.publishedAt || new Date().toISOString();
    const metadata = {
      referenceId: r.referenceId || null,
      consumer_id: r.consumer?.id || null,
      data,
    };

    if (!trustpilot_id || !testo) {
      await log('agent-api', 'webhook_skip', { motivo: 'dati_mancanti', payload: r });
      risultati.push({ trustpilot_id, status: 'skipped', motivo: 'dati_mancanti' });
      continue;
    }

    if (stelle < 4) {
      await log('agent-api', 'webhook_skip', { motivo: 'stelle_insufficienti', trustpilot_id, stelle });
      risultati.push({ trustpilot_id, status: 'skipped', motivo: 'stelle_insufficienti' });
      continue;
    }

    // Controlla duplicati
    const { data: esistente } = await supabase
      .from('reviews')
      .select('id')
      .eq('trustpilot_id', trustpilot_id)
      .maybeSingle();

    if (esistente) {
      risultati.push({ trustpilot_id, status: 'skipped', motivo: 'duplicato' });
      continue;
    }

    // Salva recensione
    const { data: inserted, error: insertErr } = await supabase
      .from('reviews')
      .insert({
        trustpilot_id,
        testo,
        autore,
        data,
        stelle,
        stato: 'pending',
        source: 'trustpilot',
        reference_id: metadata.referenceId ?? null,
        booking_date: null,
      })
      .select('id')
      .single();

    if (insertErr) {
      await log('agent-api', 'insert_errore', { trustpilot_id, errore: insertErr.message });
      risultati.push({ trustpilot_id, status: 'error', motivo: insertErr.message });
      continue;
    }

    const review_id = inserted.id;
    await log('agent-api', 'review_salvata', { review_id, trustpilot_id, stelle });

    // Analisi asincrona (non blocca la risposta al webhook)
    setImmediate(async () => {
      try {
        const analisi = await processaRecensione(trustpilot_id, testo, autore, metadata);
        await salvaAnalisi(review_id, analisi);
        await log('agent-api', 'analisi_completata', {
          review_id,
          tipo_risposta: analisi.tipo_risposta,
          flag_referral: analisi.flag_referral,
          flag_cross: analisi.flag_cross,
        });
      } catch (err) {
        await log('agent-api', 'analisi_errore', { review_id, errore: err.message });
      }
    });

    risultati.push({ trustpilot_id, review_id, status: 'accepted' });
  }

  res.json({ ok: true, risultati });
});

// --- APPROVA E PUBBLICA REPLY ---
// POST /reviews/:id/approve
// Approva la risposta generata e la pubblica su Trustpilot
app.post('/reviews/:id/approve', async (req, res) => {
  const review_id = parseInt(req.params.id, 10);

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', review_id)
    .maybeSingle();

  if (!review) return res.status(404).json({ errore: 'Recensione non trovata' });
  if (review.stato === 'published') return res.status(409).json({ errore: 'Già pubblicata' });

  const risposta_custom = req.body?.risposta_custom?.trim() || null;

  const { data: analisiRecord } = await supabase
    .from('review_analysis')
    .select('risposta_generata')
    .eq('review_id', review_id)
    .maybeSingle();

  const risposta_generata = analisiRecord?.risposta_generata?.trim() || null;
  const testo_risposta = risposta_custom || risposta_generata;

  if (!testo_risposta) {
    return res.status(422).json({ errore: 'Nessuna risposta disponibile: fornisci una risposta_custom o attendi la generazione AI' });
  }

  const risposta_modificata = !!(risposta_custom && risposta_generata && risposta_custom !== risposta_generata);

  try {
    if (review.source === 'gmb') {
      await pubblicaRispostaGMB(review.trustpilot_id, testo_risposta);
    } else if (review.source === 'playstore') {
      await rispondiPlayStore(review.trustpilot_id, testo_risposta);
    } else {
      await pubblicaRispostaTrustpilot(review.trustpilot_id, testo_risposta);
    }

    await supabase.from('reviews').update({
      stato: 'published',
      risposta_pubblicata: testo_risposta,
      risposta_modificata,
      pubblicata_at: new Date().toISOString(),
    }).eq('id', review_id);

    await log('agent-api', 'reply_pubblicata', { review_id, source: review.source, risposta_modificata });

    res.json({ ok: true, review_id, trustpilot_id: review.trustpilot_id, risposta_pubblicata: testo_risposta });
  } catch (err) {
    await log('agent-api', 'publish_errore', { review_id, errore: err.message });
    res.status(502).json({ errore: `Errore pubblicazione ${review.source}`, dettaglio: err.message });
  }
});

// --- LISTA RECENSIONI ---
// GET /reviews
// Query params: stato (pending|approved|published|skipped), stelle_min, stelle_max, limit, offset, source, sort (asc|desc)
app.get('/reviews', async (req, res) => {
  const {
    stato,
    stelle_min = 1,
    stelle_max = 5,
    limit = 50,
    offset = 0,
    source,
    sort = 'desc',
  } = req.query;

  const lim = parseInt(limit);
  const off = parseInt(offset);
  const ascending = sort === 'asc';

  // TODO: con >10K recensioni, refactor con aggregate queries lato DB (no fetch righe completo).
  // Supabase PostgREST ha cap 1000 righe/query: per limit > 1000 paginiamo internamente.
  const PAGE = 1000;
  const t0 = Date.now();

  function buildDataQuery(pageStart, pageEnd) {
    let q = supabase
      .from('reviews')
      .select('*, review_analysis(*)')
      .gte('stelle', parseInt(stelle_min))
      .lte('stelle', parseInt(stelle_max))
      .order('data', { ascending })
      .range(pageStart, pageEnd);
    if (stato) q = q.eq('stato', stato);
    return applySourceFilter(q, source);
  }

  let countQuery = supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('stelle', parseInt(stelle_min))
    .lte('stelle', parseInt(stelle_max));
  if (stato) countQuery = countQuery.eq('stato', stato);
  countQuery = applySourceFilter(countQuery, source);

  // Prima pagina e count in parallelo
  const [{ data: page0, error: err0 }, { count: totale }] = await Promise.all([
    buildDataQuery(off, off + Math.min(PAGE, lim) - 1),
    countQuery,
  ]);
  if (err0) return res.status(500).json({ errore: err0.message });

  let recensioni = page0 || [];

  // Pagine successive se richiesto più di 1000 e ce ne sono altre
  if (lim > PAGE && recensioni.length === PAGE) {
    for (let page = 1; recensioni.length < lim; page++) {
      const pageStart = off + page * PAGE;
      const pageEnd   = pageStart + Math.min(PAGE, lim - recensioni.length) - 1;
      const { data: pageData, error: pe } = await buildDataQuery(pageStart, pageEnd);
      if (pe) { console.error('[GET /reviews] pagina errore:', pe.message); break; }
      if (!pageData?.length) break;
      recensioni = recensioni.concat(pageData);
      if (pageData.length < PAGE) break;
    }
  }

  console.log(`[GET /reviews] ${recensioni.length} righe (totale DB: ${totale}) in ${Date.now() - t0}ms`);

  res.json({
    totale: totale || 0,
    limit: lim,
    offset: off,
    recensioni: (recensioni || []).map((r) => {
      const analysisData = r.review_analysis;
      const a = Array.isArray(analysisData)
        ? analysisData.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0] || {}
        : (analysisData && typeof analysisData === 'object' ? analysisData : {});
      return {
        id: r.id,
        trustpilot_id: r.trustpilot_id,
        reference_id: r.reference_id || null,
        booking_date: r.booking_date || null,
        testo: r.testo,
        autore: r.autore,
        data: r.data,
        stelle: r.stelle,
        stato: r.stato,
        source: r.source || 'trustpilot',
        enrichment_status: r.enrichment_status || null,
        risposta_pubblicata: r.risposta_pubblicata || null,
        risposta_modificata: Boolean(r.risposta_modificata),
        pubblicata_at: r.pubblicata_at || null,
        analisi_at: r.analisi_at || null,
        topic: a.topic || [],
        segmento: a.segmento || null,
        prima_prenotazione: Boolean(a.prima_prenotazione),
        cross: Boolean(a['cross']),
        localita: a.localita || null,
        risposta_generata: a.risposta_generata || null,
        flag_referral: Boolean(a.flag_referral),
        flag_cross: Boolean(a.flag_cross),
        tipo_risposta: a.tipo_risposta || null,
        segmenti_precedenti: a.segmenti_precedenti || [],
        segmenti_precedenti_completed: a.segmenti_precedenti_completed || [],
        segmento_origine: a.segmento_origine || null,
        n_prenotazioni_precedenti: a.n_prenotazioni_precedenti ?? null,
        n_prenotazioni_precedenti_completed: a.n_prenotazioni_precedenti_completed ?? null,
        cross_with_cancelled: Boolean(a.cross_with_cancelled),
        cross_completed_only: Boolean(a.cross_completed_only),
        cross_ever_with_cancelled: Boolean(a.cross_ever_with_cancelled),
        cross_ever_completed_only: Boolean(a.cross_ever_completed_only),
        giorni_da_prima_prenotazione: a.giorni_da_prima_prenotazione ?? null,
      };
    }),
  });
});

// --- SINGOLA RECENSIONE ---
// GET /reviews/:id
app.get('/reviews/:id', async (req, res) => {
  const review_id = parseInt(req.params.id, 10);

  const { data: r, error } = await supabase
    .from('reviews')
    .select('*, review_analysis(*)')
    .eq('id', review_id)
    .maybeSingle();

  if (error) return res.status(500).json({ errore: error.message });
  if (!r) return res.status(404).json({ errore: 'Non trovata' });

  const analysisData = r.review_analysis;
  const a = Array.isArray(analysisData)
    ? analysisData.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0] || {}
    : (analysisData && typeof analysisData === 'object' ? analysisData : {});
  res.json({
    id: r.id,
    trustpilot_id: r.trustpilot_id,
    reference_id: r.reference_id || null,
    booking_date: r.booking_date || null,
    testo: r.testo,
    autore: r.autore,
    data: r.data,
    stelle: r.stelle,
    stato: r.stato,
    source: r.source || 'trustpilot',
    enrichment_status: r.enrichment_status || null,
    risposta_pubblicata: r.risposta_pubblicata || null,
    risposta_modificata: Boolean(r.risposta_modificata),
    pubblicata_at: r.pubblicata_at || null,
    analisi_at: r.analisi_at || null,
    topic: a.topic || [],
    segmento: a.segmento || null,
    prima_prenotazione: Boolean(a.prima_prenotazione),
    cross: Boolean(a['cross']),
    localita: a.localita || null,
    risposta_generata: a.risposta_generata || null,
    flag_referral: Boolean(a.flag_referral),
    flag_cross: Boolean(a.flag_cross),
    tipo_risposta: a.tipo_risposta || null,
  });
});

// --- ADMIN: GMB OAUTH ---

// GET /admin/gmb/connect — genera la URL di consenso Google
app.get('/admin/gmb/connect', authMiddleware, (_req, res) => {
  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMB_CLIENT_ID,
    process.env.GMB_CLIENT_SECRET,
    process.env.GMB_REDIRECT_URI
  );
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',           // forza restituzione refresh_token
    scope: ['https://www.googleapis.com/auth/business.manage'],
  });
  res.json({ authUrl });
});

// GET /admin/gmb/oauth-callback — riceve il code da Google, scambia con tokens, logga refresh_token
app.get('/admin/gmb/oauth-callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).send(`<h2>Errore OAuth: ${error}</h2>`);
  }
  if (!code) {
    return res.status(400).send('<h2>Nessun code ricevuto da Google</h2>');
  }
  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMB_CLIENT_ID,
      process.env.GMB_CLIENT_SECRET,
      process.env.GMB_REDIRECT_URI
    );
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    console.log('==================================================');
    console.log('[GMB OAuth] Token ottenuto con successo!');
    console.log('[GMB OAuth] GMB_REFRESH_TOKEN =', refreshToken);
    console.log('==================================================');

    await log('agent-api', 'gmb_oauth_success', { hasRefreshToken: Boolean(refreshToken) });

    res.send(`
      <h2>✅ Autenticazione GMB completata</h2>
      <p>Il refresh token è stato salvato nei log Railway.</p>
      <p>Copia questo valore e aggiungilo come variabile d'ambiente <strong>GMB_REFRESH_TOKEN</strong> su Railway:</p>
      <pre style="background:#f0f0f0;padding:16px;word-break:break-all">${refreshToken || '(nessun refresh token — riprova il login)'}</pre>
      <p><small>Puoi chiudere questa finestra.</small></p>
    `);
  } catch (err) {
    console.error('[GMB OAuth] Errore scambio token:', err.message);
    res.status(500).send(`<h2>Errore scambio token</h2><pre>${err.message}</pre>`);
  }
});

// --- ADMIN: CHECK GOOGLE CREDENTIALS ---
app.get('/admin/check-google-credentials', authMiddleware, async (_req, res) => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  const result = {
    envPresent: Boolean(raw),
    envLength: raw?.length ?? 0,
    decodedOk: false,
    clientEmail: null,
    projectId: null,
    apiTestStatus: null,
    apiTestMessage: null,
  };

  if (!raw) return res.json(result);

  let creds;
  try {
    creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    result.decodedOk = true;
    result.clientEmail = creds.client_email ?? null;
    result.projectId   = creds.project_id ?? null;
  } catch (err) {
    result.apiTestStatus  = 'decode_error';
    result.apiTestMessage = err.message;
    return res.json(result);
  }

  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const ap = google.androidpublisher({ version: 'v3', auth });
    await ap.reviews.list({ packageName: 'it.parkingmycar.parkingmyapp', maxResults: 1 });
    result.apiTestStatus  = 'ok';
    result.apiTestMessage = 'Credenziali valide, app accessibile';
  } catch (err) {
    const status = err.response?.status ?? err.code ?? 'unknown';
    result.apiTestStatus  = String(status);
    result.apiTestMessage = status === 401 || status === 403
      ? 'Credenziali presenti ma autorizzazione mancante (service account non aggiunto al Play Console?)'
      : err.message;
  }

  res.json(result);
});

// --- DEBUG ---
// GET /debug/review/:id  — espone dati raw per diagnosticare mismatch review_analysis
app.get('/debug/review/:id', async (req, res) => {
  const review_id = parseInt(req.params.id, 10);

  const [{ data: rawReview, error: e1 }, { data: rawAnalisi, error: e2 }] = await Promise.all([
    supabase.from('reviews').select('*').eq('id', review_id).maybeSingle(),
    supabase.from('review_analysis').select('*').eq('review_id', review_id).order('created_at', { ascending: false }),
  ]);

  const a = rawAnalisi?.[0] || {};
  const combined = {
    id: rawReview?.id,
    stato: rawReview?.stato,
    risposta_generata: a.risposta_generata || null,
    tipo_risposta: a.tipo_risposta || null,
    analisi_at: rawReview?.analisi_at || null,
    review_analysis_count: rawAnalisi?.length ?? 0,
  };

  res.json({
    reviews_raw: rawReview,
    review_analysis_all_rows: rawAnalisi,
    combined_response_preview: combined,
    errors: { reviews: e1?.message || null, review_analysis: e2?.message || null },
  });
});

// --- REPLY PLAY STORE ---
// POST /reviews/:id/reply-play
// Pubblica risposta su Google Play Store
app.post('/reviews/:id/reply-play', async (req, res) => {
  const review_id = parseInt(req.params.id, 10);

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', review_id)
    .maybeSingle();

  if (!review) return res.status(404).json({ errore: 'Recensione non trovata' });
  if (review.source !== 'playstore') return res.status(400).json({ errore: 'Recensione non proveniente da Play Store' });
  if (review.stato === 'published') return res.status(409).json({ errore: 'Già pubblicata' });

  const risposta_custom = req.body?.risposta_custom?.trim() || null;

  const { data: analisiRecordPlay } = await supabase
    .from('review_analysis')
    .select('risposta_generata')
    .eq('review_id', review_id)
    .maybeSingle();

  const risposta_generata_play = analisiRecordPlay?.risposta_generata?.trim() || null;
  const testo_risposta = risposta_custom || risposta_generata_play;

  if (!testo_risposta) {
    return res.status(422).json({ errore: 'Nessuna risposta disponibile: fornisci risposta_custom o attendi la generazione AI' });
  }

  const risposta_modificata_play = !!(risposta_custom && risposta_generata_play && risposta_custom !== risposta_generata_play);

  try {
    await rispondiPlayStore(review.trustpilot_id, testo_risposta);

    await supabase.from('reviews').update({
      stato: 'published',
      risposta_pubblicata: testo_risposta,
      risposta_modificata: risposta_modificata_play,
      pubblicata_at: new Date().toISOString(),
    }).eq('id', review_id);

    await log('agent-api', 'reply_playstore_pubblicata', { review_id, play_review_id: review.trustpilot_id, risposta_modificata: risposta_modificata_play });

    res.json({ ok: true, review_id, play_review_id: review.trustpilot_id, risposta_pubblicata: testo_risposta });
  } catch (err) {
    await log('agent-api', 'reply_playstore_errore', { review_id, errore: err.message });
    res.status(502).json({ errore: 'Errore pubblicazione Play Store', dettaglio: err.message });
  }
});

// --- RIGENERA RISPOSTA ---
// POST /reviews/:id/regenerate
// Rilancia l'analisi AI su una recensione esistente
app.post('/reviews/:id/regenerate', async (req, res) => {
  const review_id = parseInt(req.params.id, 10);

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', review_id)
    .maybeSingle();

  if (!review) return res.status(404).json({ errore: 'Recensione non trovata' });

  // Risposta immediata — l'AI gira in background (può richiedere minuti)
  res.json({ ok: true, status: 'started', review_id });

  setImmediate(async () => {
    try {
      const analisi = await processaRecensione(
        review.trustpilot_id,
        review.testo,
        review.autore,
        { referenceId: review.reference_id ?? null, data: review.data ?? null }
      );
      console.log('[regenerate] saving analysis', review_id);
      await salvaAnalisi(review_id, analisi);
      await log('agent-api', 'risposta_rigenerata', { review_id });
    } catch (err) {
      await log('agent-api', 'regenerate_errore', { review_id, errore: err.message });
    }
  });
});

// --- RIGENERA PENDING IN BULK ---
// POST /reviews/regenerate-pending
// Avvia in background l'analisi AI per tutte le recensioni pending senza risposta generata.
app.post('/reviews/regenerate-pending', async (_req, res) => {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('id, trustpilot_id, testo, autore, data, reference_id, review_analysis(risposta_generata)')
    .eq('stato', 'pending')
    .not('source', 'in', '(apple,apple_store)')   // Apple: no reply via API, skip AI
    .range(0, 9999);

  if (error) {
    return res.status(500).json({ errore: 'Errore lettura DB', dettaglio: error.message });
  }

  const pending = (reviews || []).filter(r => {
    const a = Array.isArray(r.review_analysis) ? r.review_analysis[0] : r.review_analysis;
    return !a || !a.risposta_generata;
  });

  const totale = pending.length;
  res.status(202).json({ ok: true, totale });

  setImmediate(async () => {
    let processate = 0;
    let errori = 0;

    for (const review of (pending ?? [])) {
      try {
        const analisi = await processaRecensione(
          review.trustpilot_id,
          review.testo,
          review.autore,
          { referenceId: review.reference_id ?? null, data: review.data ?? null }
        );

        await salvaAnalisi(review.id, analisi);
        processate++;
        if (processate % 10 === 0) {
          await log('agent-api', 'regenerate_pending_progress', { processate, totale, errori });
          console.log(`[regenerate-pending] ${processate}/${totale} processate, errori=${errori}`);
        }
      } catch (err) {
        errori++;
        await log('agent-api', 'regenerate_pending_errore', { review_id: review.id, errore: err.message });
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    await log('agent-api', 'regenerate_pending_completato', { processate, totale, errori });
    console.log(`[regenerate-pending] completato: ${processate}/${totale}, errori=${errori}`);
  });
});

// --- ADMIN: GENERA RISPOSTE AI MANCANTI ---

const jobState = {
  status: 'idle',      // idle | running | done | error
  jobId: null,
  startedAt: null,
  total: 0,
  processed: 0,
  errors: 0,
};

async function fetchReviewsSenzaAI() {
  const PAGE = 1000;
  const raIds = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('review_analysis')
      .select('review_id')
      .not('risposta_generata', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    data.forEach(r => raIds.add(r.review_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const reviews = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, trustpilot_id, testo, autore, data, reference_id, source')
      .not('source', 'in', '(apple,apple_store)')   // Apple: no reply via API, skip AI
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    data.forEach(r => { if (!raIds.has(r.id)) reviews.push(r); });
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return reviews;
}

// POST /admin/generate-missing-ai — avvia il job in background
app.post('/admin/generate-missing-ai', async (_req, res) => {
  if (jobState.status === 'running') {
    return res.status(409).json({
      errore: 'Job già in esecuzione',
      processed: jobState.processed,
      total: jobState.total,
    });
  }

  let reviews;
  try {
    reviews = await fetchReviewsSenzaAI();
  } catch (err) {
    return res.status(500).json({ errore: err.message });
  }

  const jobId = Date.now().toString(36);
  Object.assign(jobState, {
    status: 'running',
    jobId,
    startedAt: new Date().toISOString(),
    total: reviews.length,
    processed: 0,
    errors: 0,
  });

  res.json({ jobId, status: 'started', totalToProcess: reviews.length });

  setImmediate(async () => {
    for (let i = 0; i < reviews.length; i++) {
      const r = reviews[i];
      let analisi = null;

      for (let tentativo = 1; tentativo <= 3; tentativo++) {
        try {
          analisi = await processaRecensione(
            r.trustpilot_id,
            r.testo,
            r.autore,
            { referenceId: r.reference_id || null, data: r.data || null }
          );
          break;
        } catch (err) {
          const is429 = err.message?.includes('429') || err.message?.includes('rate') || err.message?.includes('overload');
          if (is429 && tentativo < 3) {
            console.warn(`[AI BATCH] 429 review_id=${r.id} — attendo 30s (tentativo ${tentativo}/3)`);
            await new Promise(res => setTimeout(res, 30000));
          } else {
            console.error(`[AI BATCH] errore review_id=${r.id}: ${err.message}`);
            jobState.errors++;
            analisi = null;
            break;
          }
        }
      }

      if (analisi) {
        try {
          await salvaAnalisi(r.id, analisi);
          jobState.processed++;
        } catch (err) {
          console.error(`[AI BATCH] salva review_id=${r.id}: ${err.message}`);
          jobState.errors++;
        }
      }

      await new Promise(res => setTimeout(res, 1500));
    }

    jobState.status = 'done';
    console.log(`[AI BATCH] Completato: ${jobState.processed}/${jobState.total} ok, ${jobState.errors} errori`);
    await log('agent-api', 'ai_batch_completato', { processed: jobState.processed, total: jobState.total, errors: jobState.errors });
  });
});

// GET /admin/generate-missing-ai/status — stato del job in corso
app.get('/admin/generate-missing-ai/status', (_req, res) => {
  res.json({
    jobId:     jobState.jobId,
    status:    jobState.status,
    startedAt: jobState.startedAt,
    processed: jobState.processed,
    total:     jobState.total,
    errors:    jobState.errors,
  });
});

// --- ADMIN: IMPORT PLAY STORE BULK ---

const PS_BULK_CUTOFF = new Date('2026-05-04T00:00:00Z').getTime();
const AI_DELAY_PS    = 1500;

const psJobState = {
  status: 'idle',
  jobId: null,
  startedAt: null,
  total: 0,
  inserted: 0,
  skipped: 0,
  aiOk: 0,
  lowStars: 0,  // inserite 1-3★ senza AI
  errors: 0,
};

// POST /admin/import-playstore-bulk
app.post('/admin/import-playstore-bulk', authMiddleware, async (_req, res) => {
  if (psJobState.status === 'running') {
    return res.status(409).json({
      errore: 'Job già in esecuzione',
      inserted: psJobState.inserted,
      total: psJobState.total,
    });
  }

  const jobId = Date.now().toString(36);
  Object.assign(psJobState, {
    status: 'running', jobId,
    startedAt: new Date().toISOString(),
    total: 0, inserted: 0, skipped: 0, aiOk: 0, lowStars: 0, errors: 0,
  });

  res.json({ jobId, status: 'started', cutoff: '2026-05-04', note: 'Chiama /admin/import-playstore-bulk/status per monitorare' });

  setImmediate(async () => {
    let reviews = [];
    try {
      reviews = await fetchReviewsSince(PS_BULK_CUTOFF);
      psJobState.total = reviews.length;
      console.log(`[PS BULK] Trovate ${reviews.length} reviews dal 2026-05-04`);
    } catch (err) {
      console.error('[PS BULK] Errore fetch Play Store:', err.message);
      psJobState.status = 'error';
      return;
    }

    for (let i = 0; i < reviews.length; i++) {
      const review     = reviews[i];
      const userComment = review.comments?.[0]?.userComment;
      if (!userComment) { psJobState.skipped++; continue; }

      const reviewId = review.reviewId;
      const stelle   = userComment.starRating;
      const testo    = userComment.text || '';
      const autore   = review.authorDetails?.name || 'Anonimo';
      const seconds  = parseInt(userComment.lastModified?.seconds || 0);
      const data     = new Date(seconds * 1000).toISOString();

      // Deduplicazione
      const { data: esistente } = await supabase
        .from('reviews').select('id').eq('trustpilot_id', reviewId).maybeSingle();
      if (esistente) { psJobState.skipped++; continue; }

      const { data: inserted, error: insertErr } = await supabase
        .from('reviews')
        .insert({ trustpilot_id: reviewId, testo, autore, data, stelle, stato: 'pending', source: 'playstore' })
        .select('id').single();

      if (insertErr) {
        console.error(`[PS BULK] insert ${reviewId}: ${insertErr.message}`);
        psJobState.errors++;
        continue;
      }
      psJobState.inserted++;

      // AI solo per stelle >= 4; 1-3★ vengono salvate senza risposta
      if (stelle >= 4) {
        let analisi = null;
        for (let t = 1; t <= 3; t++) {
          try {
            analisi = await processaRecensione(reviewId, testo, autore, { data });
            break;
          } catch (err) {
            const is429 = err.message?.includes('429') || err.message?.includes('rate') || err.message?.includes('overload');
            if (is429 && t < 3) {
              console.warn(`[PS BULK] 429 review ${reviewId} — attendo 30s (tentativo ${t}/3)`);
              await new Promise(r => setTimeout(r, 30000));
            } else {
              console.error(`[PS BULK] AI review ${reviewId}: ${err.message}`);
              psJobState.errors++;
              break;
            }
          }
        }
        if (analisi) {
          try {
            await salvaAnalisi(inserted.id, analisi);
            psJobState.aiOk++;
          } catch (err) {
            console.error(`[PS BULK] salva review_id=${inserted.id}: ${err.message}`);
            psJobState.errors++;
          }
          await new Promise(r => setTimeout(r, AI_DELAY_PS));
        }
      } else {
        psJobState.lowStars++;
        console.log(`[PS BULK] ${stelle}★ salvata senza AI: ${reviewId}`);
      }
    }

    psJobState.status = 'done';
    console.log(`[PS BULK] Completato: ${psJobState.inserted} inserite (${psJobState.aiOk} con AI, ${psJobState.lowStars} low-star), ${psJobState.skipped} skip, ${psJobState.errors} errori`);
    await log('agent-api', 'ps_bulk_completato', { inserted: psJobState.inserted, aiOk: psJobState.aiOk, lowStars: psJobState.lowStars, errors: psJobState.errors });
  });
});

// GET /admin/import-playstore-bulk/status
app.get('/admin/import-playstore-bulk/status', authMiddleware, (_req, res) => {
  res.json({
    jobId:     psJobState.jobId,
    status:    psJobState.status,
    startedAt: psJobState.startedAt,
    total:     psJobState.total,
    inserted:  psJobState.inserted,
    skipped:   psJobState.skipped,
    aiOk:      psJobState.aiOk,
    lowStars:  psJobState.lowStars,
    errors:    psJobState.errors,
  });
});

// --- ADMIN: GMB ---

// GET /admin/gmb/locations
app.get('/admin/gmb/locations', authMiddleware, async (_req, res) => {
  try {
    const locs = await fetchGMBLocations();
    // Prova a salvare in gmb_locations (non bloccante se la tabella non esiste)
    const { error: upsertErr } = await supabase.from('gmb_locations').upsert(
      locs.map(l => ({ account_id: l.accountName, location_id: l.locationName, full_path: l.fullPath, location_name: l.displayName, address: l.address })),
      { onConflict: 'location_id' }
    );
    if (upsertErr) console.warn('[GMB] gmb_locations upsert:', upsertErr.message);
    res.json({ total: locs.length, locations: locs });
  } catch (err) {
    res.status(500).json({ errore: err.message });
  }
});

// POST /admin/gmb/import-bulk + GET /admin/gmb/import-bulk/status

const gmbJobState = {
  status: 'idle', jobId: null, startedAt: null,
  locations: 0, total: 0, inserted: 0, skipped: 0,
  aiOk: 0, lowStars: 0, errors: 0,
};

app.post('/admin/gmb/import-bulk', authMiddleware, async (_req, res) => {
  if (gmbJobState.status === 'running') {
    return res.status(409).json({ errore: 'Job già in esecuzione', ...gmbJobState });
  }
  const jobId = Date.now().toString(36);
  Object.assign(gmbJobState, {
    status: 'running', jobId, startedAt: new Date().toISOString(),
    locations: 0, total: 0, inserted: 0, skipped: 0, aiOk: 0, lowStars: 0, errors: 0,
  });
  res.json({ jobId, status: 'started' });

  setImmediate(async () => {
    try {
      const locs = await fetchGMBLocations();
      gmbJobState.locations = locs.length;
      console.log(`[GMB BULK] ${locs.length} location trovate`);

      for (const loc of locs) {
        let reviews;
        try {
          reviews = await fetchGMBReviewsSince(loc.fullPath, GMB_CUTOFF_MS);
          gmbJobState.total += reviews.length;
        } catch (err) {
          console.error(`[GMB BULK] fetch ${loc.displayName}: ${err.message}`);
          gmbJobState.errors++;
          continue;
        }

        for (const r of reviews) {
          const stelle = GMB_STAR_MAP[r.starRating] || 0;
          const row = gmbReviewToRow(r, loc.displayName);

          const { data: esistente } = await supabase
            .from('reviews').select('id').eq('trustpilot_id', r.name).maybeSingle();
          if (esistente) { gmbJobState.skipped++; continue; }

          const { data: ins, error: insErr } = await supabase
            .from('reviews').insert(row).select('id').single();
          if (insErr) {
            console.error(`[GMB BULK] insert ${r.name}: ${insErr.message}`);
            gmbJobState.errors++;
            continue;
          }
          gmbJobState.inserted++;

          if (stelle >= 4) {
            let analisi = null;
            for (let t = 1; t <= 3; t++) {
              try {
                analisi = await processaRecensione(r.name, row.testo, row.autore, { data: row.data });
                break;
              } catch (err) {
                const is429 = err.message?.includes('429') || err.message?.includes('overload');
                if (is429 && t < 3) { await new Promise(resolve => setTimeout(resolve, 30_000)); }
                else { gmbJobState.errors++; break; }
              }
            }
            if (analisi) {
              try { await salvaAnalisi(ins.id, analisi); gmbJobState.aiOk++; }
              catch (err) { gmbJobState.errors++; }
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          } else {
            gmbJobState.lowStars++;
          }
        }
      }

      gmbJobState.status = 'done';
      console.log(`[GMB BULK] Completato: ${gmbJobState.inserted} inserite, ${gmbJobState.aiOk} AI, ${gmbJobState.lowStars} low-star, ${gmbJobState.skipped} skip, ${gmbJobState.errors} errori`);
      await log('agent-api', 'gmb_bulk_completato', { inserted: gmbJobState.inserted, aiOk: gmbJobState.aiOk, errors: gmbJobState.errors });
    } catch (err) {
      gmbJobState.status = 'error';
      console.error('[GMB BULK] errore fatale:', err.message);
    }
  });
});

app.get('/admin/gmb/import-bulk/status', authMiddleware, (_req, res) => {
  res.json(gmbJobState);
});

// --- ADMIN: RECOVER TRUSTPILOT REFERENCE_IDs ---
// POST /admin/recover-trustpilot-refids

let _recoverRunning = false;

app.post('/admin/recover-trustpilot-refids', async (_req, res) => {
  if (_recoverRunning) {
    return res.status(409).json({ ok: false, status: 'already_running' });
  }

  res.status(202).json({ ok: true, status: 'started' });

  _recoverRunning = true;
  const t0 = Date.now();
  const stats = { total: 0, recuperati: 0, non_disponibili: 0, errori: 0 };

  setImmediate(async () => {
    try {
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('id, trustpilot_id')
        .eq('source', 'trustpilot')
        .or('reference_id.is.null,reference_id.eq.')  // NULL + stringa vuota
        .range(0, 9999);

      if (error) throw new Error(error.message);
      stats.total = reviews.length;
      console.log(`[recover-refid] ${reviews.length} recensioni da processare`);

      // Token fuori dal loop — caching interno lo rinnova se scaduto
      let token = await getTrustpilotAccessToken();

      for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        try {
          const { data: payload } = await axios.get(
            `https://api.trustpilot.com/v1/private/reviews/${r.trustpilot_id}`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
          );
          const refId = payload.referenceId || payload.referenceNumber || null;
          if (refId) {
            const { error: uErr } = await supabase.from('reviews')
              .update({ reference_id: String(refId) }).eq('id', r.id);
            uErr ? stats.errori++ : stats.recuperati++;
          } else {
            stats.non_disponibili++;
          }
        } catch (err) {
          // Retry su 401: invalida cache e rinnova token, riprova una volta
          if (err.response?.status === 401) {
            try {
              _tpTokenCache = null;
              token = await getTrustpilotAccessToken();
              const { data: payload } = await axios.get(
                `https://api.trustpilot.com/v1/private/reviews/${r.trustpilot_id}`,
                { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
              );
              const refId = payload.referenceId || payload.referenceNumber || null;
              if (refId) {
                const { error: uErr } = await supabase.from('reviews')
                  .update({ reference_id: String(refId) }).eq('id', r.id);
                uErr ? stats.errori++ : stats.recuperati++;
              } else { stats.non_disponibili++; }
              if (i < reviews.length - 1) await new Promise(r => setTimeout(r, 500));
              continue;
            } catch (_) {}
          }
          console.error(`[recover-refid] ${r.trustpilot_id}: ${err.message}`);
          stats.errori++;
        }
        if (i < reviews.length - 1) await new Promise(r => setTimeout(r, 500));
      }

      const durMin = Math.round((Date.now() - t0) / 60_000);
      await log('agent-api', 'recover_refid_completato', stats);
      console.log(`[recover-refid] completato:`, JSON.stringify(stats));

      try {
        const https = require('https');
        const tok = process.env.TELEGRAM_BOT_TOKEN;
        const cid = process.env.TELEGRAM_ALERT_CHAT_ID;
        if (tok && cid) {
          const text = `✅ <b>Recovery Trustpilot completato</b>\nTotale processati: ${stats.total}\nRecuperati: ${stats.recuperati}\nNon disponibili: ${stats.non_disponibili}\nErrori: ${stats.errori}\nDurata: ${durMin} min`;
          const body = JSON.stringify({ chat_id: cid, parse_mode: 'HTML', text });
          const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tok}/sendMessage`,
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, () => {});
          req.on('error', () => {}); req.write(body); req.end();
        }
      } catch (_) {}
    } catch (err) {
      console.error('[recover-refid] errore fatale:', err.message);
    } finally {
      _recoverRunning = false;
    }
  });
});

// --- LOGS ---
// GET /logs?agent=&limit=&offset=
app.get('/logs', async (req, res) => {
  const { agent, limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('agent_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (agent) query = query.eq('agent', agent);

  const { data: logs, error } = await query;
  if (error) return res.status(500).json({ errore: error.message });

  res.json({ logs: logs || [] });
});

// --- STATS ---
// GET /stats
app.get('/stats', async (req, res) => {
  const { period = 'month', source, from_date, to_date } = req.query;

  // from_date/to_date override period when both are present
  let dateStart = null, dateEnd = null;
  if (from_date || to_date) {
    if (!from_date || !to_date)
      return res.status(400).json({ errore: 'Specificare sia from_date che to_date' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date) || !/^\d{4}-\d{2}-\d{2}$/.test(to_date))
      return res.status(400).json({ errore: 'Formato data non valido (YYYY-MM-DD)' });
    if (from_date > to_date)
      return res.status(400).json({ errore: 'from_date deve essere ≤ to_date' });
    dateStart = from_date;
    dateEnd   = to_date + 'T23:59:59.999Z';
  } else {
    dateStart = getPeriodStart(period);
  }

  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  function buildCountQuery(filters = {}) {
    let q = supabase.from('reviews').select('*', { count: 'exact', head: true });
    if (dateStart) q = q.gte('data', dateStart);
    if (dateEnd)   q = q.lte('data', dateEnd);
    q = applySourceFilter(q, source);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    return q;
  }

  let chartQuery = supabase
    .from('reviews')
    .select(`
      review_analysis (
        topic, segmento, prima_prenotazione, cross, flag_referral, flag_cross
      )
    `)
    .range(0, 9999);
  if (dateStart) chartQuery = chartQuery.gte('data', dateStart);
  if (dateEnd)   chartQuery = chartQuery.lte('data', dateEnd);
  chartQuery = applySourceFilter(chartQuery, source);

  let todayCountQuery = supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('data', todayStr);
  todayCountQuery = applySourceFilter(todayCountQuery, source);

  const [
    { count: pendingCount, error: e1 },
    { count: approvedCount, error: e2 },
    { count: publishedCount, error: e3 },
    { count: skippedCount, error: e4 },
    { count: todayCount, error: e5 },
    { count: stelle1Count, error: e6 },
    { count: stelle2Count, error: e7 },
    { count: stelle3Count, error: e8 },
    { count: stelle4Count, error: e9 },
    { count: stelle5Count, error: e10 },
    { data: chartReviews, error: chartError },
  ] = await Promise.all([
    buildCountQuery({ stato: 'pending' }),
    buildCountQuery({ stato: 'approved' }),
    buildCountQuery({ stato: 'published' }),
    buildCountQuery({ stato: 'skipped' }),
    todayCountQuery,
    buildCountQuery({ stelle: 1 }),
    buildCountQuery({ stelle: 2 }),
    buildCountQuery({ stelle: 3 }),
    buildCountQuery({ stelle: 4 }),
    buildCountQuery({ stelle: 5 }),
    chartQuery,
  ]);

  const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10 || chartError;
  if (firstError) return res.status(500).json({ errore: firstError.message });

  const perSegment = { airport: 0, port: 0, station: 0, city: 0 };
  const topTopic = {};
  let flagReferral = 0;
  let flagCross = 0;
  let crossUsers = 0;
  let primaPrenotazione = 0;

  for (const review of chartReviews || []) {
    const ra = review.review_analysis;
    const analysis = Array.isArray(ra) ? (ra[0] || {}) : (ra || {});
    const topics = normalizeTopicList(analysis.topic).map((t) => t.trim().toLowerCase());
    const segmento = analysis.segmento;

    if (segmento && perSegment[segmento] !== undefined) perSegment[segmento] += 1;
    if (analysis.flag_referral) flagReferral += 1;
    if (analysis.flag_cross) flagCross += 1;
    if (analysis.cross) crossUsers += 1;
    if (analysis.prima_prenotazione) primaPrenotazione += 1;
    for (const topic of topics) {
      topTopic[topic] = (topTopic[topic] || 0) + 1;
    }
  }

  const totalReviews = (pendingCount || 0) + (approvedCount || 0) + (publishedCount || 0) + (skippedCount || 0);

  res.json({
    period,
    reviews_today: todayCount || 0,
    total_reviews: totalReviews,
    per_stato: [
      { stato: 'pending', n: pendingCount || 0 },
      { stato: 'approved', n: approvedCount || 0 },
      { stato: 'published', n: publishedCount || 0 },
      { stato: 'skipped', n: skippedCount || 0 },
    ],
    per_stelle: [
      { stelle: 1, n: stelle1Count || 0 },
      { stelle: 2, n: stelle2Count || 0 },
      { stelle: 3, n: stelle3Count || 0 },
      { stelle: 4, n: stelle4Count || 0 },
      { stelle: 5, n: stelle5Count || 0 },
    ],
    per_segment: Object.entries(perSegment).map(([segmento, count]) => ({ segmento, count })),
    flag_referral: flagReferral,
    flag_cross: flagCross,
    cross_users: crossUsers,
    prima_prenotazione: primaPrenotazione,
    top_topic: Object.entries(topTopic)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count })),
  });
});

// --- TOPICS BY SEGMENT ---
// GET /stats/topics-by-segment
app.get('/stats/topics-by-segment', async (req, res) => {
  const { period = 'month', source, from_date, to_date } = req.query;

  let dateStart = null, dateEnd = null;
  if (from_date || to_date) {
    if (!from_date || !to_date)
      return res.status(400).json({ errore: 'Specificare sia from_date che to_date' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date) || !/^\d{4}-\d{2}-\d{2}$/.test(to_date))
      return res.status(400).json({ errore: 'Formato data non valido (YYYY-MM-DD)' });
    if (from_date > to_date)
      return res.status(400).json({ errore: 'from_date deve essere ≤ to_date' });
    dateStart = from_date;
    dateEnd   = to_date + 'T23:59:59.999Z';
  } else {
    dateStart = getPeriodStart(period);
  }

  let query = supabase
    .from('reviews')
    .select(`
      id, data,
      review_analysis (
        topic, segmento
      )
    `);

  if (dateStart) query = query.gte('data', dateStart);
  if (dateEnd)   query = query.lte('data', dateEnd);
  query = applySourceFilter(query, source);

  const { data: reviews, error } = await query;

  if (error) {
    return res.status(500).json({ errore: error.message });
  }

  const grouped = {};

  for (const review of reviews || []) {
    const ra = review.review_analysis;
    const analysis = Array.isArray(ra) ? (ra[0] || {}) : (ra || {});
    const segmento = analysis.segmento;
    const topics = normalizeTopicList(analysis.topic).map((topic) => topic.trim().toLowerCase());

    if (!segmento) continue;

    if (!grouped[segmento]) {
      grouped[segmento] = { totale: 0, topics: {} };
    }

    grouped[segmento].totale += 1;

    for (const topic of topics) {
      grouped[segmento].topics[topic] = (grouped[segmento].topics[topic] || 0) + 1;
    }
  }

  const by_segment = Object.entries(grouped).map(([segmento, value]) => ({
    segmento,
    totale: value.totale,
    topics: Object.entries(value.topics)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count })),
  }));

  const rows = by_segment.flatMap((segment) =>
    segment.topics.map((topic) => ({
      segmento: segment.segmento,
      topic: topic.topic,
      count: topic.count,
    }))
  );

  res.json({
    period,
    rows,
    by_segment,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CC Agent API running on port ${PORT}`);
  avviaPollingPlayStore(supabase, log, processaRecensione, salvaAnalisi);
  avviaPollingApple(supabase, log);
  if (process.env.GMB_REFRESH_TOKEN) {
    // Ritarda il primo poll di 5 min per non collidere con il startup
    setTimeout(() => {
      pollGMBReviews();
      setInterval(pollGMBReviews, GMB_POLL_INTERVAL_MS);
    }, 5 * 60 * 1000);
    console.log('[GMB] Poller schedulato (primo poll tra 5 min, poi ogni 30 min)');
  }

  // BO Sync notturno — attivare con BO_SYNC_ENABLED=true su Railway
  if (process.env.BO_SYNC_ENABLED === 'true') {
    startBOSync();
    console.log('[BO SYNC] Cron notturno schedulato (03:00 Europe/Rome)');
  }

  // Re-backfill pending — attivare con REBACKFILL_ENABLED=true su Railway
  if (process.env.REBACKFILL_ENABLED === 'true') {
    startReBackfill();
    console.log('[RE-BACKFILL] Cron schedulato (04:00 Europe/Rome)');
  }
});

// ── BO SYNC NOTTURNO ─────────────────────────────────────────────────────────
// Attivare aggiungendo BO_SYNC_ENABLED=true su Railway.
// Gira ogni notte alle 03:00 Europe/Rome (check ogni 5 min).

let _boSyncLastDate      = null; // YYYY-MM-DD — evita doppia esecuzione nella stessa notte
let _reBackfillLastDate  = null; // idem per re-backfill delle 04:00

async function syncBOForDate(startDate, endDate = startDate) {
  const auth = Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64');
  let csvText;
  for (let t = 1; t <= 3; t++) {
    try {
      const { data } = await axios.get(`${process.env.BO_API_BASE}/reporting/marketing/booking-details`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'text/csv' },
        params: { start_date: startDate, end_date: endDate },
        timeout: 60000, responseType: 'text',
      });
      csvText = data;
      break;
    } catch (err) {
      if (t < 3) { await new Promise(r => setTimeout(r, 60000 * t)); continue; }
      throw err;
    }
  }

  const { data: parsed, errors } = Papa.parse(csvText.replace(/^﻿/, ''), {
    header: true, skipEmptyLines: true,
    transformHeader: h => h.trim(), transform: v => v.trim(),
  });
  errors.forEach(e => console.warn(`[BO SYNC] parser warn (row ${e.row}, ${e.code}): ${e.message}`));

  const toTs  = v => { if (!v?.trim()) return null; const d = new Date(v.trim().replace(' ','T')+'Z'); return isNaN(d.getTime()) ? null : d.toISOString(); };
  const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  const rows = parsed.map(r => {
    const tid = (r.transaction_id || '').trim();
    if (!tid) return null;
    return {
      transaction_id: tid,
      user_email_sha256: (r.user_email_sha256 || '').trim().toLowerCase() || null,
      segmento: (r.type || r.parking_type || '').trim() || null,
      transaction_date: toTs(r.transaction_date), booking_start: toTs(r.booking_start), booking_end: toTs(r.booking_end),
      location_name: (r.location_name || '').trim() || null, parking_name: (r.parking_name || '').trim() || null,
      final_price: toNum(r.final_price), paid_price: toNum(r.paid_price),
      user_first_booking_date: toTs(r.user_first_booking_date),
      user_first_booking_parking_type: (r.user_first_booking_parking_type || '').trim() || null,
      transaction_state: (r.transaction_state || '').trim() || null,
      synced_at: new Date().toISOString(),
    };
  }).filter(Boolean);

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('bo_bookings').upsert(rows.slice(i, i + BATCH), { onConflict: 'transaction_id' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

function startBOSync() {
  setInterval(async () => {
    const romeHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(new Date()));
    const romeMin  = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', minute: 'numeric' }).format(new Date()));
    const today    = new Date().toISOString().slice(0, 10);
    if (romeHour !== 3 || romeMin >= 5 || _boSyncLastDate === today) return;

    _boSyncLastDate = today;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    try {
      const n1 = await syncBOForDate(yesterday);
      const n2 = await syncBOForDate(today);
      const n  = n1 + n2;
      await log('agent-api', 'bo_sync_completato', { dates: `${yesterday}+${today}`, righe: n });
      console.log(`[BO SYNC] ${n} righe sincronizzate (${yesterday} + ${today})`);
      // Nessun alert Telegram su successo — solo log
    } catch (err) {
      await log('agent-api', 'bo_sync_errore', { dates: `${yesterday}+${today}`, errore: err.message });
      console.error(`[BO SYNC] Errore per ${yesterday}+${today}: ${err.message}`);
      // Alert Telegram su fallimento totale (graceful, non blocca)
      try {
        const https = require('https');
        const tok = process.env.TELEGRAM_BOT_TOKEN;
        const cid = process.env.TELEGRAM_ALERT_CHAT_ID;
        if (tok && cid) {
          const body = JSON.stringify({ chat_id: cid, parse_mode: 'HTML',
            text: `🔴 <b>CRON BO FALLITO</b>\nData: ${yesterday}\nErrore: <code>${err.message.slice(0, 200)}</code>` });
          const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tok}/sendMessage`,
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 },
            () => {});
          req.on('error', () => {});
          req.write(body); req.end();
        }
      } catch (_) { /* alert failure non blocca */ }
    }
  }, 5 * 60 * 1000); // check ogni 5 minuti
}

// ── RE-BACKFILL PENDING BO ────────────────────────────────────────────────────
// Ritenta il match BO per recensioni pending_sync.
// Attivare con REBACKFILL_ENABLED=true su Railway.
// Gira ogni notte alle 04:00 Europe/Rome (check ogni 5 min), dopo il BO SYNC.
//
// Recovery API (REBACKFILL_RECOVERY_ENABLED=true):
// Se una review non è in bo_bookings, chiama l'API BO con il range stimato
// dalla data della recensione (booking avviene 0-60 giorni prima).
// Raggruppa per mese → 1 chiamata API per mese con pending, max 2 req/sec.

function startReBackfill() {
  const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE) || 100;
  const RECOVERY   = process.env.REBACKFILL_RECOVERY_ENABLED === 'true';
  const BO_AUTH    = (process.env.BO_API_USERNAME && process.env.BO_API_PASSWORD)
    ? Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64')
    : null;

  setInterval(async () => {
    const now      = new Date();
    const romeHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(now));
    const romeMin  = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', minute: 'numeric' }).format(now));
    const today    = now.toISOString().slice(0, 10);

    if (romeHour !== 4 || romeMin >= 5 || _reBackfillLastDate === today) return;
    _reBackfillLastDate = today;

    // 1. Carica tutte le recensioni pending_sync con reference_id e data recensione
    const pending = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reference_id, data')
        .eq('enrichment_status', 'pending_sync')
        .not('reference_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + BATCH_SIZE - 1);

      if (error) { console.error('[RE-BACKFILL] fetch error:', error.message); break; }
      if (!data?.length) break;
      pending.push(...data);
      if (data.length < BATCH_SIZE) break;
      from += BATCH_SIZE;
    }

    console.log(`[RE-BACKFILL] ${pending.length} recensioni in pending_sync`);
    if (!pending.length) { await log('agent-api', 're_backfill_noop', { today }); return; }

    // 2. Batch lookup BO in bo_bookings
    let recovered = 0, stillPending = 0;
    const notFound = []; // raccoglie i review ancora pending dopo il lookup DB

    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk  = pending.slice(i, i + BATCH_SIZE);
        const refIds = chunk.map(r => String(r.reference_id).trim());
        const boMap  = await boLookupBatch(refIds);

        for (const r of chunk) {
          const boData = boMap.get(String(r.reference_id).trim());
          if (boData) {
            await supabase.from('reviews').update({
              enrichment_status: 'matched',
              booking_date:      boData.transaction_date || null,
            }).eq('id', r.id);
            await supabase.from('review_analysis').update({
              segmento:          boData.segmento           || null,
              localita:          boData.location_name      || null,
              prima_prenotazione: boData.prima_prenotazione ? true : false,
              cross:             boData.cross              ? true : false,
            }).eq('review_id', r.id);
            recovered++;
          } else {
            notFound.push(r);
          }
        }
      }

      // 3. Recovery API — solo se abilitato e ci sono ancora pending
      if (RECOVERY && notFound.length > 0 && BO_AUTH && process.env.BO_API_BASE) {
        console.log(`[RE-BACKFILL][RECOVERY] ${notFound.length} review non trovate in bo_bookings, tento recovery API`);

        // Raggruppa per mese di riferimento (data recensione - 30 giorni come stima booking)
        const byMonth = new Map(); // key: 'YYYY-MM' → array di review
        for (const r of notFound) {
          if (!r.data) continue;
          const anchor = new Date(new Date(r.data).getTime() - 30 * 86_400_000);
          const key    = anchor.toISOString().slice(0, 7); // YYYY-MM
          if (!byMonth.has(key)) byMonth.set(key, []);
          byMonth.get(key).push(r);
        }

        for (const [monthKey, group] of byMonth) {
          // Range: da 60 giorni prima del mese alla fine del mese
          const [y, m]   = monthKey.split('-').map(Number);
          const rangeEnd = new Date(Date.UTC(y, m, 0));                           // ultimo giorno del mese
          const rangeStart = new Date(rangeEnd.getTime() - 60 * 86_400_000);     // -60 giorni
          const startStr = rangeStart.toISOString().slice(0, 10);
          const endStr   = rangeEnd.toISOString().slice(0, 10);

          // Rate limit: 500ms prima di ogni chiamata API (2 req/sec)
          await new Promise(r => setTimeout(r, 500));

          let csvRows = [];
          try {
            const { data: csvText } = await axios.get(
              `${process.env.BO_API_BASE}/reporting/marketing/booking-details`,
              {
                headers: { Authorization: `Basic ${BO_AUTH}`, Accept: 'text/csv' },
                params:  { start_date: startStr, end_date: endStr },
                timeout: 90_000, responseType: 'text',
              }
            );
            // Parsing minimale inline (evita dipendenza Papa qui)
            const lines  = (csvText || '').replace(/^﻿/, '').split('\n');
            const header = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const tidIdx = header?.indexOf('transaction_id');
            if (tidIdx >= 0) {
              for (let li = 1; li < lines.length; li++) {
                const cols = lines[li].split(',');
                const tid  = (cols[tidIdx] || '').trim().replace(/^"|"$/g, '');
                if (tid) csvRows.push({ transaction_id: tid, _raw: cols, _header: header });
              }
            }
          } catch (apiErr) {
            console.warn(`[RE-BACKFILL][RECOVERY] API fallita per range ${startStr}→${endStr}: ${apiErr.message?.slice(0,80)}`);
            continue;
          }

          // Mappa transaction_id → raw row
          const apiMap = new Map();
          for (const row of csvRows) apiMap.set(row.transaction_id, row);

          // Cerca ogni reference_id del gruppo nel risultato API
          for (const r of group) {
            const refId  = String(r.reference_id).trim();
            const apiRow = apiMap.get(refId);
            if (!apiRow) { stillPending++; continue; }

            // Ricostruisce l'oggetto booking dal CSV grezzo
            const h = apiRow._header;
            const c = apiRow._raw;
            const toTs = v => { if (!v?.trim()) return null; const d = new Date(v.trim().replace(' ','T')+'Z'); return isNaN(d.getTime()) ? null : d.toISOString(); };
            const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
            const get   = k => (c[h.indexOf(k)] || '').trim().replace(/^"|"$/g,'') || null;

            const booking = {
              transaction_id:                  refId,
              user_email_sha256:               get('user_email_sha256')?.toLowerCase() || null,
              segmento:                        get('type') || get('parking_type') || null,
              transaction_date:                toTs(get('transaction_date')),
              booking_start:                   toTs(get('booking_start')),
              booking_end:                     toTs(get('booking_end')),
              location_name:                   get('location_name'),
              parking_name:                    get('parking_name'),
              final_price:                     toNum(get('final_price')),
              paid_price:                      toNum(get('paid_price')),
              user_first_booking_date:         toTs(get('user_first_booking_date')),
              user_first_booking_parking_type: get('user_first_booking_parking_type'),
              transaction_state:               get('transaction_state'),
              synced_at:                       new Date().toISOString(),
            };

            // Upsert in bo_bookings
            await supabase.from('bo_bookings').upsert(booking, { onConflict: 'transaction_id' });

            // Match la review
            const firstType = booking.user_first_booking_parking_type;
            const seg       = booking.segmento;
            const txDate    = booking.transaction_date?.slice(0, 10);
            const firstDate = booking.user_first_booking_date?.slice(0, 10);
            await supabase.from('reviews').update({
              enrichment_status: 'matched',
              booking_date:      booking.transaction_date || null,
            }).eq('id', r.id);
            await supabase.from('review_analysis').update({
              segmento:          seg || null,
              localita:          booking.location_name || null,
              prima_prenotazione: !!(txDate && firstDate && txDate === firstDate),
              cross:             !!(firstType && seg && firstType !== seg),
            }).eq('review_id', r.id);
            recovered++;
          }

          console.log(`[RE-BACKFILL][RECOVERY] ${monthKey}: trovate ${apiMap.size} prenotazioni, recuperate ${group.filter(r => apiMap.has(String(r.reference_id).trim())).length}/${group.length} pending`);
        }
      } else if (!RECOVERY && notFound.length > 0) {
        stillPending = notFound.length;
      }

      await log('agent-api', 're_backfill_completato', { recovered, stillPending });
      console.log(`[RE-BACKFILL] Recuperate: ${recovered} | Ancora pending: ${stillPending}`);

      if (recovered > 0) {
        try {
          const https = require('https');
          const tok = process.env.TELEGRAM_BOT_TOKEN;
          const cid = process.env.TELEGRAM_ALERT_CHAT_ID;
          if (tok && cid) {
            const body = JSON.stringify({ chat_id: cid, parse_mode: 'HTML',
              text: `Re-backfill BO: recuperate <b>${recovered}</b> recensioni pending\nAncora in attesa: ${stillPending}` });
            const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tok}/sendMessage`,
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, () => {});
            req.on('error', () => {});
            req.write(body); req.end();
          }
        } catch (_) {}
      }
    } catch (err) {
      await log('agent-api', 're_backfill_errore', { errore: err.message });
      console.error(`[RE-BACKFILL] Errore: ${err.message}`);
      try {
        const https = require('https');
        const tok = process.env.TELEGRAM_BOT_TOKEN;
        const cid = process.env.TELEGRAM_ALERT_CHAT_ID;
        if (tok && cid) {
          const body = JSON.stringify({ chat_id: cid, parse_mode: 'HTML',
            text: `CRON RE-BACKFILL FALLITO\nData: ${today}\nErrore: <code>${err.message.slice(0, 200)}</code>` });
          const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tok}/sendMessage`,
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, () => {});
          req.on('error', () => {});
          req.write(body); req.end();
        }
      } catch (_) {}
    }
  }, 5 * 60 * 1000); // check ogni 5 minuti
}

module.exports = app;
