const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOPICS_VALIDI = [
  'facilità',
  'velocità',
  'posizione',
  'parcheggio',
  'convenienza',
  'soddisfazione generale',
  'customer care',
  'servizi',
  'app',
  'cancellazione',
  'rimborso',
  'sicurezza',
  'pagamento in parcheggio',
];

const SYSTEM_PROMPT_ANALISI = `Sei un assistente specializzato nell'analisi di recensioni per un servizio di parcheggio.
Il tuo compito è analizzare il testo di una recensione e restituire un JSON strutturato.

TOPIC DISPONIBILI (scegli solo da questa lista):
${TOPICS_VALIDI.map((t) => `- ${t}`).join('\n')}

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza commenti, con questa struttura:
{
  "topic": ["topic1", "topic2"],
  "parole_chiave": ["parola1", "parola2"],
  "flag_referral": true/false,
  "sentiment_dominante": "positivo/neutro/negativo"
}

flag_referral = true se la recensione contiene frasi come "lo consiglio", "consiglio", "raccomando", "suggerisco" o simili.`;

const SYSTEM_PROMPT_RISPOSTA = `Sei il responsabile delle relazioni con i clienti di un servizio di parcheggio.
Scrivi risposte personalizzate alle recensioni Trustpilot in italiano, in modo caldo e professionale.

REGOLE:
- Usa le parole chiave dell'utente per personalizzare la risposta
- Tono: cordiale, umano, non robotico
- Lunghezza: 3-5 frasi
- Non usare frasi generiche come "siamo felici del tuo feedback"
- Firma sempre con: "Il team [NomeServizio]"
- NON inventare nomi di persone

VADEMECUM PROVVISORIO:
Il nostro servizio offre parcheggi sicuri, veloci e convenienti in tutta Italia.
Puntiamo sulla facilità di prenotazione tramite app e sulla comodità per il cliente.
Offriamo tariffe competitive, cancellazione flessibile e pagamento digitale.
Il customer care è disponibile per qualsiasi necessità prima, durante e dopo il parcheggio.`;

async function fetchBackofficeData(trustpilot_id) {
  const auth = Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };
  const baseUrl = process.env.BO_API_BASE;

  const [bookingRes, stayRes] = await Promise.allSettled([
    axios.get(`${baseUrl}/reporting/marketing/booking-details`, {
      headers,
      params: { trustpilot_id },
      timeout: 5000,
    }),
    axios.get(`${baseUrl}/reporting/marketing/stay-details`, {
      headers,
      params: { trustpilot_id },
      timeout: 5000,
    }),
  ]);

  const booking = bookingRes.status === 'fulfilled' ? bookingRes.value.data : null;
  const stay = stayRes.status === 'fulfilled' ? stayRes.value.data : null;

  if (!booking && !stay) {
    console.warn(`[BO API] Nessun dato trovato per trustpilot_id=${trustpilot_id}`);
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null };
  }

  const dati = booking || stay;
  return {
    segmento: dati.segmento || null,
    prima_prenotazione: dati.prima_prenotazione ?? false,
    cross: dati.cross ?? false,
    localita: dati.localita || null,
  };
}

async function analizzaRecensione(testo) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: SYSTEM_PROMPT_ANALISI,
    messages: [{ role: 'user', content: `Analizza questa recensione:\n\n"${testo}"` }],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

async function generaRisposta(testo, analisi, datiBO) {
  const { topic, parole_chiave, flag_referral } = analisi;
  const { segmento, prima_prenotazione, cross, localita } = datiBO;

  let tipoRisposta = 'standard';
  let istruzione_extra = '';

  if (flag_referral) {
    tipoRisposta = 'referral';
    istruzione_extra =
      'Il cliente ha consigliato il servizio. Ringrazialo esplicitamente per la raccomandazione e incoraggialo a condividere con amici e familiari.';
  } else if (cross) {
    tipoRisposta = 'cross_selling';
    istruzione_extra = `Il cliente potrebbe essere interessato ad altri servizi. Accenna in modo naturale (non invasivo) che offriamo servizi anche in altre città o tipologie di parcheggio.`;
  }

  const contesto = [
    `Testo originale: "${testo}"`,
    `Topic identificati: ${topic.join(', ')}`,
    `Parole chiave del cliente: ${parole_chiave.join(', ')}`,
    `Località del parcheggio: ${localita || 'non specificata'}`,
    `Segmento cliente: ${segmento}`,
    prima_prenotazione ? 'È la prima prenotazione del cliente.' : '',
    istruzione_extra,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: SYSTEM_PROMPT_RISPOSTA,
    messages: [{ role: 'user', content: `Scrivi una risposta alla recensione con questi dati:\n\n${contesto}` }],
  });

  return {
    risposta: response.content[0].text.trim(),
    tipo_risposta: tipoRisposta,
  };
}

async function processaRecensione(trustpilot_id, testo) {
  const analisi = await analizzaRecensione(testo);

  const topicFiltrati = (analisi.topic || []).filter((t) => TOPICS_VALIDI.includes(t));

  const datiBO = await fetchBackofficeData(trustpilot_id);

  const { risposta, tipo_risposta } = await generaRisposta(testo, analisi, datiBO);

  return {
    topic: topicFiltrati,
    segmento: datiBO.segmento,
    prima_prenotazione: datiBO.prima_prenotazione ? 1 : 0,
    cross: datiBO.cross ? 1 : 0,
    localita: datiBO.localita,
    risposta_generata: risposta,
    flag_referral: analisi.flag_referral ? 1 : 0,
    flag_cross: datiBO.cross ? 1 : 0,
    tipo_risposta,
  };
}

module.exports = { processaRecensione };
