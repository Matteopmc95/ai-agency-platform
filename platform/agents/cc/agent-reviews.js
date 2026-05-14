const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { boLookup } = require('./utils/bo-lookup');
const { calculateUserHistory } = require('./utils/user-history-lookup');

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

async function processaRecensione(_trustpilot_id, testo, autore = '', metadata = {}) {
  // ── BO lookup via Supabase (sostituisce CSV download) ──────────────────────
  let boData = null;
  let enrichmentStatus;

  const referenceId = metadata.referenceId || metadata.reference_id || null;
  if (referenceId) {
    boData = await boLookup(String(referenceId).trim());
    enrichmentStatus = boData ? 'matched' : 'pending_sync';
    if (!boData) console.warn(`[bo-lookup] transaction_id=${referenceId} non trovato in bo_bookings → pending_sync`);
  } else {
    enrichmentStatus = 'organic_or_non_trustpilot';
  }

  const historyData = boData
    ? await calculateUserHistory({ reference_id: String(referenceId), supabase, currentBooking: boData }).catch(() => null)
    : null;

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
    topic:              topicFiltrati,
    segmento:           boData?.segmento           || null,
    prima_prenotazione: boData?.prima_prenotazione ? 1 : 0,
    cross:              boData?.cross              ? 1 : 0,
    localita:           boData?.location_name      || null,  // location_name → localita
    booking_date:       boData?.transaction_date   || null,  // transaction_date → booking_date
    risposta_generata:  risposta,
    flag_referral:      analisi.flag_referral ? 1 : 0,
    flag_cross:         boData?.cross ? 1 : 0,
    tipo_risposta,
    enrichment_status:  enrichmentStatus,
    _historyData:       historyData,
  };
}

module.exports = { processaRecensione };
