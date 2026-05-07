const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

console.log('[anthropic] key loaded:', process.env.ANTHROPIC_API_KEY ? 'YES (' + process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...)' : 'NO');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

2. CROSS-SELLING — se cross=true:
- Se segmento è "business" o "city" → l'utente usa parcheggi urbani, promuovi viaggi:
  Template: "Ciao [Nome], grazie per aver apprezzato il nostro servizio! ParkingMyCar ti accompagna non solo in città, ma anche nei tuoi viaggi: con le nostre soluzioni di parcheggio, partire da aeroporti, porti o stazioni è più semplice e veloce. 😉"
- Se segmento è "airport", "port" o "station" → l'utente viaggia, promuovi città:
  Template: "Ciao [Nome], siamo contenti che tu abbia apprezzato il nostro servizio! ParkingMyCar ti accompagna non solo nei viaggi, ma anche nella vita di tutti i giorni, con soluzioni comode per la sosta in città. Chi ha detto che il senza stress vale solo in vacanza? 😉"
tipo_risposta: "cross_selling"

3. RECENSIONE SUL PARCHEGGIO (non sulla piattaforma) — se recensione_sul_parcheggio=true:
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

function getBookingDateFromRow(row = {}) {
  return normalizeDateOnly(
    row.booking_date
      || row.bookingDate
      || row.booking_start_date
      || row.bookingStartDate
      || row.parking_start_date
      || row.parkingStartDate
      || row.check_in_date
      || row.checkInDate
      || row.arrival_date
      || row.arrivalDate
  );
}

async function fetchBackofficeData(trustpilot_id, { referenceId = null, consumer_id = null } = {}) {
  // La corrispondenza avviene via referenceId (solitamente l'email impostata nell'invito Trustpilot)
  const isEmail = referenceId && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referenceId.trim());

  if (!isEmail) {
    console.warn(
      `[BO API] Corrispondenza non trovata per trustpilot_id=${trustpilot_id} consumer_id=${consumer_id ?? 'n.d.'}: referenceId mancante o non è un'email`
    );
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  const auth = Buffer.from(`${process.env.BO_API_USERNAME}:${process.env.BO_API_PASSWORD}`).toString('base64');

  try {
    const response = await axios.get(`${process.env.BO_API_BASE}/reporting/marketing/booking-details`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'text/csv',
      },
      params: {
        start_date: toISODate(startDate),
        end_date: toISODate(endDate),
      },
      timeout: 10000,
    });

    const rows = parseCSV(response.data);
    const email = referenceId.trim().toLowerCase();
    const userRows = rows.filter(r => r.user_email?.trim().toLowerCase() === email);

    if (!userRows.length) {
      console.warn(
        `[BO API] Nessuna prenotazione trovata per email=${email} (trustpilot_id=${trustpilot_id})`
      );
      return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
    }

    const lastRow = userRows[userRows.length - 1];
    const segmentiUnici = [...new Set(userRows.map(r => r.parking_type).filter(Boolean))];

    // prima_prenotazione = true se la data della prima prenotazione dell'utente ricade nel range 90gg
    const primaPrenotazione =
      !!lastRow.user_first_booking_date &&
      lastRow.user_first_booking_date >= toISODate(startDate);

    return {
      segmento: lastRow.parking_type || null,
      prima_prenotazione: primaPrenotazione,
      cross: segmentiUnici.length > 1,
      localita: lastRow.location_name || null,
      booking_date: getBookingDateFromRow(lastRow),
    };
  } catch (err) {
    console.error(`[BO API] Errore chiamata booking-details: ${err.message}`);
    return { segmento: null, prima_prenotazione: false, cross: false, localita: null, booking_date: null };
  }
}

// --- SUPABASE: RISPOSTE APPROVATE ---

async function fetchRisposteApprovate() {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('testo, review_analysis(risposta_generata)')
      .in('stato', ['published', 'approved'])
      .order('id', { ascending: false })
      .limit(10);

    if (error || !data?.length) return [];

    return data
      .map((r) => ({
        recensione: r.testo,
        risposta: r.review_analysis?.[0]?.risposta_generata,
      }))
      .filter((r) => r.recensione && r.risposta);
  } catch (err) {
    console.warn('[fetchRisposteApprovate] errore:', err.message);
    return [];
  }
}

// --- ANALISI RECENSIONE ---

async function analizzaRecensione(testo) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT_ANALISI,
    messages: [{ role: 'user', content: `Analizza questa recensione:\n\n"${testo}"` }],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

// --- GENERAZIONE RISPOSTA ---

async function generaRisposta(testo, autore, analisi, datiBO, esempiApprovati) {
  const { topic, parole_chiave, flag_referral, recensione_sul_parcheggio } = analisi;
  const { segmento, prima_prenotazione, cross } = datiBO;
  const nome = autore?.split(' ')[0] || autore || 'Cliente';

  const contesto = [
    `Nome cliente: ${nome}`,
    `Testo recensione: "${testo}"`,
    `Topic identificati: ${topic.length ? topic.join(', ') : 'nessuno'}`,
    `Parole chiave esatte del cliente: ${parole_chiave?.length ? parole_chiave.join(', ') : 'nessuna'}`,
    `flag_referral: ${flag_referral}`,
    `recensione_sul_parcheggio: ${recensione_sul_parcheggio ?? false}`,
    `cross: ${cross}`,
    `segmento: ${segmento || 'non disponibile'}`,
    prima_prenotazione ? 'prima_prenotazione: true' : '',
  ]
    .filter(Boolean)
    .join('\n');

  let fewShot = '';
  if (esempiApprovati.length > 0) {
    fewShot =
      '\n\n### ESEMPI DI RISPOSTE APPROVATE IN PASSATO (usa per calibrare stile e tono)\n' +
      esempiApprovati
        .map((e) => `RECENSIONE: ${e.recensione}\nRISPOSTA APPROVATA: ${e.risposta}`)
        .join('\n\n');
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT_RISPOSTA,
    messages: [
      {
        role: 'user',
        content: `Genera la risposta per questa recensione.\n\n${contesto}${fewShot}`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

// --- ENTRY POINT ---

async function processaRecensione(trustpilot_id, testo, autore = '', metadata = {}) {
  const [analisi, datiBO, esempiApprovati] = await Promise.all([
    analizzaRecensione(testo),
    fetchBackofficeData(trustpilot_id, metadata),
    fetchRisposteApprovate(),
  ]);

  const topicFiltrati = (analisi.topic || []).filter((t) => TOPICS_VALIDI.includes(t));

  const { risposta, tipo_risposta } = await generaRisposta(
    testo,
    autore,
    { ...analisi, topic: topicFiltrati },
    datiBO,
    esempiApprovati
  );

  return {
    topic: topicFiltrati,
    segmento: datiBO.segmento,
    prima_prenotazione: datiBO.prima_prenotazione ? 1 : 0,
    cross: datiBO.cross ? 1 : 0,
    localita: datiBO.localita,
    booking_date: datiBO.booking_date || null,
    risposta_generata: risposta,
    flag_referral: analisi.flag_referral ? 1 : 0,
    flag_cross: datiBO.cross ? 1 : 0,
    tipo_risposta,
  };
}

module.exports = { processaRecensione };
