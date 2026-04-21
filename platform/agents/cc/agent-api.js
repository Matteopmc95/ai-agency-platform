require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { processaRecensione } = require('./agent-reviews');
const { avviaPollingPlayStore, rispondiPlayStore } = require('./sources/play-store');

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

function buildStatsAccumulator() {
  return {
    per_stato: {
      pending: 0,
      approved: 0,
      published: 0,
      skipped: 0,
    },
    per_stelle: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
    per_segment: {
      airport: 0,
      port: 0,
      station: 0,
      city: 0,
    },
    top_topic: {},
    flag_referral: 0,
    flag_cross: 0,
    cross_users: 0,
    prima_prenotazione: 0,
    total_reviews: 0,
    reviews_today: 0,
  };
}

function serializeStats(acc) {
  return {
    per_stato: Object.entries(acc.per_stato).map(([stato, n]) => ({ stato, n })),
    per_stelle: [1, 2, 3, 4, 5].map((stelle) => ({ stelle, n: acc.per_stelle[String(stelle)] || 0 })),
    per_segment: Object.entries(acc.per_segment).map(([segmento, count]) => ({ segmento, count })),
    flag_referral: acc.flag_referral,
    flag_cross: acc.flag_cross,
    cross_users: acc.cross_users,
    prima_prenotazione: acc.prima_prenotazione,
    total_reviews: acc.total_reviews,
    reviews_today: acc.reviews_today,
    top_topic: Object.entries(acc.top_topic)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count })),
  };
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

async function pubblicaRispostaTrustpilot(trustpilot_id, testo_risposta) {
  const url = `https://api.trustpilot.com/v1/private/reviews/${trustpilot_id}/reply`;
  await axios.post(
    url,
    { message: testo_risposta },
    {
      headers: {
        Authorization: `Bearer ${process.env.TRUSTPILOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
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
      referenceId: r.referenceIdentifier || r.referenceId || null,
      consumer_id: r.consumer?.id || null,
    };

    await log('agent-api', 'webhook_debug', { payload_raw: r });

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

  let testo_risposta = risposta_custom;

  if (!testo_risposta) {
    const { data: analisi } = await supabase
      .from('review_analysis')
      .select('risposta_generata')
      .eq('review_id', review_id)
      .maybeSingle();

    testo_risposta = analisi?.risposta_generata?.trim() || null;
  }

  if (!testo_risposta) {
    return res.status(422).json({ errore: 'Nessuna risposta disponibile: fornisci una risposta_custom o attendi la generazione AI' });
  }

  try {
    await pubblicaRispostaTrustpilot(review.trustpilot_id, testo_risposta);

    await supabase.from('reviews').update({ stato: 'published' }).eq('id', review_id);
    await log('agent-api', 'reply_pubblicata', { review_id, trustpilot_id: review.trustpilot_id });

    res.json({ ok: true, review_id, trustpilot_id: review.trustpilot_id, risposta_pubblicata: testo_risposta });
  } catch (err) {
    await log('agent-api', 'publish_errore', { review_id, errore: err.message });
    res.status(502).json({ errore: 'Errore pubblicazione Trustpilot', dettaglio: err.message });
  }
});

// --- LISTA RECENSIONI ---
// GET /reviews
// Query params: stato (pending|approved|published|skipped), stelle_min, stelle_max, limit, offset
app.get('/reviews', async (req, res) => {
  const {
    stato,
    stelle_min = 1,
    stelle_max = 5,
    limit = 50,
    offset = 0,
    source,
  } = req.query;

  const lim = parseInt(limit);
  const off = parseInt(offset);

  let query = supabase
    .from('reviews')
    .select(`
      id, trustpilot_id, reference_id, testo, autore, data, stelle, stato, source,
      review_analysis (
        topic, segmento, prima_prenotazione, cross, localita,
        risposta_generata, flag_referral, flag_cross, created_at
      )
    `)
    .gte('stelle', parseInt(stelle_min))
    .lte('stelle', parseInt(stelle_max))
    .order('data', { ascending: false })
    .range(off, off + lim - 1);

  if (stato) query = query.eq('stato', stato);
  query = applySourceFilter(query, source);

  let countQuery = supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .gte('stelle', parseInt(stelle_min))
    .lte('stelle', parseInt(stelle_max));

  if (stato) countQuery = countQuery.eq('stato', stato);
  countQuery = applySourceFilter(countQuery, source);

  const [{ data: recensioni, error }, { count: totale }] = await Promise.all([query, countQuery]);

  if (error) return res.status(500).json({ errore: error.message });

  res.json({
    totale: totale || 0,
    limit: lim,
    offset: off,
    recensioni: (recensioni || []).map((r) => {
      const a = r.review_analysis?.[0] || {};
      return {
        id: r.id,
        trustpilot_id: r.trustpilot_id,
        reference_id: r.reference_id || null,
        testo: r.testo,
        autore: r.autore,
        data: r.data,
        stelle: r.stelle,
        stato: r.stato,
        source: r.source || 'trustpilot',
        topic: a.topic || [],
        segmento: a.segmento || null,
        prima_prenotazione: Boolean(a.prima_prenotazione),
        cross: Boolean(a.cross),
        localita: a.localita || null,
        risposta_generata: a.risposta_generata || null,
        flag_referral: Boolean(a.flag_referral),
        flag_cross: Boolean(a.flag_cross),
        analisi_at: a.created_at || null,
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
    .select(`
      id, trustpilot_id, reference_id, testo, autore, data, stelle, stato, source,
      review_analysis (
        topic, segmento, prima_prenotazione, cross, localita,
        risposta_generata, flag_referral, flag_cross, created_at
      )
    `)
    .eq('id', review_id)
    .maybeSingle();

  if (error) return res.status(500).json({ errore: error.message });
  if (!r) return res.status(404).json({ errore: 'Non trovata' });

  const a = r.review_analysis?.[0] || {};
  res.json({
    id: r.id,
    trustpilot_id: r.trustpilot_id,
    reference_id: r.reference_id || null,
    testo: r.testo,
    autore: r.autore,
    data: r.data,
    stelle: r.stelle,
    stato: r.stato,
    source: r.source || 'trustpilot',
    topic: a.topic || [],
    segmento: a.segmento || null,
    prima_prenotazione: Boolean(a.prima_prenotazione),
    cross: Boolean(a.cross),
    localita: a.localita || null,
    risposta_generata: a.risposta_generata || null,
    flag_referral: Boolean(a.flag_referral),
    flag_cross: Boolean(a.flag_cross),
    analisi_at: a.created_at || null,
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

  let testo_risposta = risposta_custom;

  if (!testo_risposta) {
    const { data: analisi } = await supabase
      .from('review_analysis')
      .select('risposta_generata')
      .eq('review_id', review_id)
      .maybeSingle();

    testo_risposta = analisi?.risposta_generata?.trim() || null;
  }

  if (!testo_risposta) {
    return res.status(422).json({ errore: 'Nessuna risposta disponibile: fornisci risposta_custom o attendi la generazione AI' });
  }

  try {
    await rispondiPlayStore(review.trustpilot_id, testo_risposta);

    await supabase.from('reviews').update({ stato: 'published' }).eq('id', review_id);
    await log('agent-api', 'reply_playstore_pubblicata', { review_id, play_review_id: review.trustpilot_id });

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

  try {
    const analisi = await processaRecensione(
      review.trustpilot_id,
      review.testo,
      review.autore,
      { referenceId: review.reference_id ?? null }
    );

    await supabase.from('review_analysis').upsert(
      {
        review_id,
        topic: analisi.topic,
        segmento: analisi.segmento,
        prima_prenotazione: Boolean(analisi.prima_prenotazione),
        cross: Boolean(analisi.cross),
        localita: analisi.localita,
        risposta_generata: analisi.risposta_generata,
        flag_referral: Boolean(analisi.flag_referral),
        flag_cross: Boolean(analisi.flag_cross),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'review_id' }
    );

    await log('agent-api', 'risposta_rigenerata', { review_id });
    res.json({ ok: true, review_id, analisi });
  } catch (err) {
    await log('agent-api', 'regenerate_errore', { review_id, errore: err.message });
    res.status(500).json({ errore: err.message });
  }
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
  const { period = 'month', source } = req.query;
  const periodStart = getPeriodStart(period);

  let query = supabase
    .from('reviews')
    .select(`
      id, data, stelle, stato,
      review_analysis (
        topic, segmento, prima_prenotazione, cross, flag_referral, flag_cross
      )
    `);

  if (periodStart) {
    query = query.gte('data', periodStart);
  }
  query = applySourceFilter(query, source);

  const { data: reviews, error } = await query;

  if (error) {
    return res.status(500).json({ errore: error.message });
  }

  const acc = buildStatsAccumulator();
  const today = new Date();

  for (const review of reviews || []) {
    const analysis = review.review_analysis?.[0] || {};
    const topics = normalizeTopicList(analysis.topic).map((topic) => topic.trim().toLowerCase());
    const segmento = analysis.segmento;
    const currentDate = new Date(review.data);

    acc.total_reviews += 1;
    if (
      currentDate.getFullYear() === today.getFullYear()
      && currentDate.getMonth() === today.getMonth()
      && currentDate.getDate() === today.getDate()
    ) {
      acc.reviews_today += 1;
    }
    if (acc.per_stato[review.stato] !== undefined) acc.per_stato[review.stato] += 1;
    if (acc.per_stelle[String(review.stelle)] !== undefined) acc.per_stelle[String(review.stelle)] += 1;
    if (segmento && acc.per_segment[segmento] !== undefined) acc.per_segment[segmento] += 1;
    if (analysis.flag_referral) acc.flag_referral += 1;
    if (analysis.flag_cross) acc.flag_cross += 1;
    if (analysis.cross) acc.cross_users += 1;
    if (analysis.prima_prenotazione) acc.prima_prenotazione += 1;

    for (const topic of topics) {
      acc.top_topic[topic] = (acc.top_topic[topic] || 0) + 1;
    }
  }

  res.json({
    period,
    ...serializeStats(acc),
  });
});

// --- TOPICS BY SEGMENT ---
// GET /stats/topics-by-segment
app.get('/stats/topics-by-segment', async (req, res) => {
  const { period = 'month', source } = req.query;
  const periodStart = getPeriodStart(period);

  let query = supabase
    .from('reviews')
    .select(`
      id, data,
      review_analysis (
        topic, segmento
      )
    `);

  if (periodStart) {
    query = query.gte('data', periodStart);
  }
  query = applySourceFilter(query, source);

  const { data: reviews, error } = await query;

  if (error) {
    return res.status(500).json({ errore: error.message });
  }

  const grouped = {};

  for (const review of reviews || []) {
    const analysis = review.review_analysis?.[0] || {};
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
  avviaPollingPlayStore(supabase, log);
});

module.exports = app;
