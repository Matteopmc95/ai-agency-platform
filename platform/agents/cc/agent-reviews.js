const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

console.log('[anthropic] key loaded:', process.env.ANTHROPIC_API_KEY ? 'YES (' + process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...)' : 'NO');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// BO API disabilitato: non connesso, ogni chiamata va in timeout (5-20 min).
// Impostare a true solo quando BO_API_BASE è raggiungibile e testato.
const BO_ENABLED = false;

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

const SYSTEM_PROMPT_ANALISI = `Sei un assistente specializzato nell'analisi di recensioni per ParkingMyCar, piattaforma italiana di prenotazione parcheggi.
Analizza il testo di una recensione e restituisci un JSON strutturato.

TOPIC DISPONIBILI (scegli solo da questa lista):
${TOPICS_VALIDI.map((t) => `- ${t}`).join('\n')}

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza commenti, con questa struttura:
{
  "topic": ["topic1", "topic2"],
  "parole_chiave": ["parola1", "parola2"],
  "flag_referral": true/false,
  "recensione_sul_parcheggio": true/false,
  "sentiment_dominante": "positivo/neutro/negativo"
}

flag_referral = true se la recensione contiene frasi come "lo consiglio", "consiglio a tutti", "raccomando", "suggerisco" o simili riferiti al servizio ParkingMyCar.
recensione_sul_parcheggio = true se l'utente parla della struttura fisica del parcheggio (pulizia, spazio, personale del parcheggio) piuttosto che della piattaforma ParkingMyCar in sé.
parole_chiave = le parole/espressioni ESATTE usate dall'utente che descrivono la sua esperienza (non sinonimi, le parole originali).`;

const SYSTEM_PROMPT_RISPOSTA = `Sei l'agente di risposta alle recensioni positive di ParkingMyCar, una piattaforma italiana che permette di cercare, confrontare e prenotare parcheggi vicino ad aeroporti, porti, stazioni e in città.

### REGOLE DI TONO E STILE
- Dai sempre del TU e chiama l'utente per nome (es. "Ciao Mario,")
- Sii breve ed empatico, non entrare nel dettaglio se non necessario
- Cita sempre dettagli specifici della recensione per dimostrare attenzione
- Usa punteggiatura esclamativa con parsimonia (max 1 "!" per risposta)
- Emoji consentite SOLO: 😊 🧡 😉 🫶 (solo se utente sembra giovane/gen Z)
- Non usare mai più di 1 emoji per risposta
- Risposte brevi: 2-4 righe massimo

### LOGICA DI PRIORITÀ RISPOSTA (segui in ordine)

1. REFERRAL — se flag_referral=true:
Template: "Ciao [Nome], grazie per aver condiviso la tua esperienza e per aver consigliato ParkingMyCar! 🧡 Sapere che ci raccomanderesti ai tuoi cari è per noi il miglior riconoscimento. A presto!"
tipo_risposta: "referral"

2. RECENSIONE SUL PARCHEGGIO (non sulla piattaforma) — se recensione_sul_parcheggio=true:
Template: "Gentile [Nome], grazie per la tua recensione! Siamo felici che la tua esperienza sia stata nel complesso positiva. Ti ricordiamo che ParkingMyCar non è il parcheggio stesso, ma la piattaforma che ti permette di cercare, confrontare e prenotare strutture in tutta Italia. A presto."
tipo_risposta: "topic_specifico"

4. TOPIC SPECIFICI — usa le PAROLE ESATTE del cliente (non sinonimi):

FACILITÀ (senza velocità):
Template: "Ciao [Nome], grazie per aver condiviso la tua esperienza! La nostra missione è semplificare la ricerca e prenotazione del parcheggio, così da rendere ogni spostamento più comodo e sereno. 😊 A presto."

VELOCITÀ (senza facilità):
Template: "Gentile [Nome], siamo felici che tu abbia trovato il nostro servizio facile e veloce: far risparmiare tempo a chi si muove è la nostra priorità! Grazie per aver condiviso la tua esperienza. 😊"

VELOCITÀ + FACILITÀ insieme:
Template: "Gentile [Nome], la nostra missione è rendere la ricerca e prenotazione del parcheggio il più possibile facile, veloce e senza stress. La tua recensione ci incoraggia a continuare su questa strada. Grazie! 🧡"

POSIZIONE / COMODITÀ:
Template: "Gentile [Nome], siamo felici che tu abbia trovato il parcheggio comodo e ben posizionato per il tuo viaggio. Rendere gli spostamenti più facili è proprio ciò che ci motiva ogni giorno! 😊 A presto."

CONVENIENZA / PREZZO:
Template: "Gentile [Nome], siamo felici che tu abbia trovato il servizio conveniente. Speriamo di rivederti presto sulla nostra piattaforma per scoprire anche altre soluzioni di sosta! 🧡"

CUSTOMER CARE:
Template: "Gentile [Nome], ci fa piacere sapere che hai apprezzato il nostro supporto. Ogni contatto diretto con i nostri utenti è per noi fondamentale. 🧡 A presto!"

CLIENTE DI RITORNO (soddisfazione generale, utente fedele):
Template: "Gentile [Nome], siamo felici di offrirti un servizio su cui puoi contare! Ti ricordiamo che puoi invitare i tuoi amici su ParkingMyCar tramite il programma referral. Accedi alla tua area personale per scoprire come funziona. 😊"

tipo_risposta: "topic_specifico" per tutti i casi sopra.

5. GENERICO (nessun topic specifico riconoscibile):
Template: "Ciao [Nome], che bello leggere le tue parole. Grazie per aver scelto ParkingMyCar! 🧡 Alla prossima sosta."
tipo_risposta: "generico"

### PERSONALIZZAZIONE CON PAROLE CHIAVE
IMPORTANTE: usa sempre le parole ESATTE dell'utente nella risposta.
- Se scrive "semplicità" → usa "semplicità", NON "facilità"
- Se scrive "comodo" → usa "comodo", NON "pratico"
- Se scrive "veloce" → usa "veloce", NON "rapido"
I template sono una base: adattali incorporando le parole originali dell'utente.

### OUTPUT ATTESO
Rispondi SOLO con un oggetto JSON valido, senza markdown, con questa struttura:
{
  "risposta": "testo della risposta",
  "tipo_risposta": "referral|cross_selling|topic_specifico|generico"
}`;

// --- JSON PARSER ---

function parseJSONResponse(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// --- CSV PARSER ---

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// --- BO API ---

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const italianMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (italianMatch) return `${italianMatch[3]}-${italianMatch[2]}-${italianMatch[1]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// Cache in memoria per i CSV scaricati dal BO: chiave "start-end", scadenza 1 ora
const boCache = new Map();
const BO_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchBOChunk(auth, startDate, endDate) {
  const key = `${toISODate(startDate)}-${toISODate(endDate)}`;
  const cached = boCache.get(key);
  if (cached && Date.now() - cached.ts < BO_CACHE_TTL_MS) {
    return cached.rows;
  }

  const response = await axios.get(`${process.env.BO_API_BASE}/reporting/marketing/booking-details`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'text/csv',
    },
    params: {
      start_date: toISODate(startDate),
      end_date: toISODate(endDate),
    },
    timeout: 15000,
  });

  const rows = parseCSV(response.data);
  boCache.set(key, { rows, ts: Date.now() });
  return rows;
}

async function fetchBackofficeData(trustpilot_id, { referenceId = null, consumer_id = null, data = null } = {}) {
  if (!BO_ENABLED) {
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  }
  if (!referenceId) {
    console.warn(
      `[BO API] referenceId mancante per trustpilot_id=${trustpilot_id} consumer_id=${consumer_id ?? 'n.d.'}`
    );
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  }

  const transactionId = String(referenceId).trim();
  const auth = Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64');

  // La prenotazione è sempre PRIMA della review: cerchiamo a ritroso fino a 6 mesi
  const endDate = data ? new Date(data) : new Date();
  const limitDate = new Date(endDate);
  limitDate.setDate(limitDate.getDate() - 180);

  let chunkEnd = new Date(endDate);
  let attempt = 0;

  try {
    while (chunkEnd > limitDate) {
      attempt++;
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - 31);
      if (chunkStart < limitDate) chunkStart.setTime(limitDate.getTime());

      const rows = await fetchBOChunk(auth, chunkStart, chunkEnd);
      const bookingRow = rows.find(r => String(r.transaction_id ?? '').trim() === transactionId);

      console.log(`[bo] tentativo ${attempt}: range ${toISODate(chunkStart)} - ${toISODate(chunkEnd)}, trovato=${!!bookingRow}, transaction_id=${transactionId}`);

      if (bookingRow) {
        const bookingDate = normalizeDateOnly(bookingRow.booking_start);
        const firstBookingDate = normalizeDateOnly(bookingRow.user_first_booking_date);
        const primaPrenotazione = !!(bookingDate && firstBookingDate && firstBookingDate === bookingDate);

        const firstParkingType = bookingRow.user_first_booking_parking_type?.trim() || null;
        const currentParkingType = bookingRow.parking_type?.trim() || null;
        const cross = !!(firstParkingType && currentParkingType && firstParkingType !== currentParkingType);

        return {
          segmento: currentParkingType || null,
          prima_prenotazione: primaPrenotazione,
          cross,
          localita: bookingRow.location_name || null,
          booking_date: bookingDate,
        };
      }

      // Sposta la finestra indietro di 31 giorni
      chunkEnd = new Date(chunkStart);
    }

    console.warn(`[bo] transaction_id=${transactionId} non trovato in 6 mesi di storico (${attempt} tentativi)`);
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  } catch (err) {
    console.error(`[BO API] Errore chiamata booking-details: ${err.message}`);
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  }
}

// --- SUPABASE: RISPOSTE APPROVATE E CORREZIONI UMANE ---

async function fetchRisposteApprovate() {
  try {
    // Ultime 20 risposte modificate da Stefania: contengono il feedback implicito
    const { data: corrette, error: e1 } = await supabase
      .from('reviews')
      .select('testo, risposta_pubblicata, review_analysis(risposta_generata, topic)')
      .eq('stato', 'published')
      .eq('risposta_modificata', true)
      .order('pubblicata_at', { ascending: false })
      .limit(20);

    const correzioni = (e1 || !corrette?.length) ? [] : corrette
      .map((r) => ({
        recensione: r.testo,
        topic: r.review_analysis?.[0]?.topic ?? [],
        risposta_ai: r.review_analysis?.[0]?.risposta_generata,
        risposta_corretta: r.risposta_pubblicata,
      }))
      .filter((r) => r.recensione && r.risposta_ai && r.risposta_corretta && r.risposta_ai !== r.risposta_corretta);

    return { correzioni };
  } catch (err) {
    console.warn('[fetchRisposteApprovate] errore:', err.message);
    return { correzioni: [] };
  }
}

function buildCorrezioniPrompt(correzioni) {
  if (!correzioni?.length) return '';
  return (
    '\n\n## ESEMPI DI CORREZIONI UMANE\n' +
    'Stefania ha modificato queste risposte AI per migliorarle. Impara dal pattern:\n\n' +
    correzioni
      .map((c, i) => {
        const topicStr = Array.isArray(c.topic) && c.topic.length ? `Topic: ${c.topic.join(', ')}\n` : '';
        return `ESEMPIO ${i + 1}:\nRecensione: ${c.recensione}\n${topicStr}Risposta AI iniziale: ${c.risposta_ai}\nRisposta corretta: ${c.risposta_corretta}`;
      })
      .join('\n\n')
  );
}

// --- ANALISI RECENSIONE ---

async function analizzaRecensione(testo, correzioni = []) {
  const systemPrompt = SYSTEM_PROMPT_ANALISI + buildCorrezioniPrompt(correzioni);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Analizza questa recensione:\n\n"${testo}"` }],
  });

  const raw = response.content[0].text.trim();
  return parseJSONResponse(raw);
}

// --- GENERAZIONE RISPOSTA ---

async function generaRisposta(testo, autore, analisi, correzioni = []) {
  const { topic, parole_chiave, flag_referral, recensione_sul_parcheggio } = analisi;
  const nome = autore?.split(' ')[0] || autore || 'Cliente';

  const contesto = [
    `Nome cliente: ${nome}`,
    `Testo recensione: "${testo}"`,
    `Topic identificati: ${topic.length ? topic.join(', ') : 'nessuno'}`,
    `Parole chiave esatte del cliente: ${parole_chiave?.length ? parole_chiave.join(', ') : 'nessuna'}`,
    `flag_referral: ${flag_referral}`,
    `recensione_sul_parcheggio: ${recensione_sul_parcheggio ?? false}`,
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = SYSTEM_PROMPT_RISPOSTA + buildCorrezioniPrompt(correzioni);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Genera la risposta per questa recensione.\n\n${contesto}`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  return parseJSONResponse(raw);
}

// --- ENTRY POINT ---

async function processaRecensione(_trustpilot_id, testo, autore = '', _metadata = {}) {
  const { correzioni } = await fetchRisposteApprovate();

  const analisi = await analizzaRecensione(testo, correzioni);
  const topicFiltrati = (analisi.topic || []).filter((t) => TOPICS_VALIDI.includes(t));

  const { risposta, tipo_risposta } = await generaRisposta(
    testo,
    autore,
    { ...analisi, topic: topicFiltrati },
    correzioni
  );

  return {
    topic: topicFiltrati,
    segmento: null,
    prima_prenotazione: 0,
    cross: 0,
    localita: null,
    booking_date: null,
    risposta_generata: risposta,
    flag_referral: analisi.flag_referral ? 1 : 0,
    flag_cross: 0,
    tipo_risposta,
  };
}

module.exports = { processaRecensione };
