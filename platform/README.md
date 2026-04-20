# AI Agency Platform — CC Agent

Backend per l'analisi e la gestione delle recensioni Trustpilot con risposte generate da Claude AI.

## Avvio rapido

```bash
cd platform
cp .env.example .env
# Compila .env con le tue credenziali
npm install
npm start          # produzione
npm run dev        # sviluppo con auto-reload
```

Il server parte su `http://localhost:3001` (configurabile via `PORT` in `.env`).

Il database SQLite viene creato automaticamente in `db/reviews.db` al primo avvio.

---

## Endpoint esposti

### Webhook

#### `POST /webhook/trustpilot`
Riceve nuove recensioni da Trustpilot. Filtra automaticamente le recensioni < 4 stelle.

**Body (Trustpilot webhook payload):**
```json
{
  "reviews": [
    {
      "id": "abc123",
      "stars": 5,
      "text": "Ottimo servizio, lo consiglio a tutti!",
      "consumer": { "displayName": "Mario Rossi" },
      "createdAt": "2026-04-17T10:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "risultati": [
    { "trustpilot_id": "abc123", "review_id": 1, "status": "accepted" }
  ]
}
```

`status` può essere: `accepted` | `skipped` (con campo `motivo`: `stelle_insufficienti` | `duplicato` | `dati_mancanti`)

---

### Recensioni

#### `GET /reviews`
Lista recensioni con analisi AI. Supporta filtri via query string.

**Query params:**
| Param | Tipo | Default | Descrizione |
|-------|------|---------|-------------|
| `stato` | string | — | `pending` \| `approved` \| `published` \| `skipped` |
| `stelle_min` | int | 1 | Stelle minime |
| `stelle_max` | int | 5 | Stelle massime |
| `limit` | int | 50 | Risultati per pagina |
| `offset` | int | 0 | Paginazione |

**Response:**
```json
{
  "totale": 42,
  "limit": 50,
  "offset": 0,
  "recensioni": [
    {
      "id": 1,
      "trustpilot_id": "abc123",
      "testo": "Ottimo servizio...",
      "autore": "Mario Rossi",
      "data": "2026-04-17T10:00:00Z",
      "stelle": 5,
      "stato": "pending",
      "topic": ["facilità", "velocità"],
      "segmento": "leisure",
      "prima_prenotazione": false,
      "cross": false,
      "localita": "Milano Malpensa",
      "risposta_generata": "Grazie Mario per le tue parole...",
      "flag_referral": true,
      "flag_cross": false,
      "analisi_at": "2026-04-17T10:00:05Z"
    }
  ]
}
```

---

#### `GET /reviews/:id`
Singola recensione con analisi. Stesso formato di un elemento dell'array `recensioni`.

---

#### `POST /reviews/:id/approve`
Approva la risposta generata e la pubblica su Trustpilot via API.

**Body (opzionale — per override risposta):**
```json
{
  "risposta_custom": "Testo risposta personalizzato dall'operatore"
}
```

**Response:**
```json
{
  "ok": true,
  "review_id": 1,
  "trustpilot_id": "abc123",
  "risposta_pubblicata": "Grazie Mario..."
}
```

---

#### `POST /reviews/:id/regenerate`
Rigenera l'analisi AI e la risposta per una recensione esistente.

**Response:**
```json
{
  "ok": true,
  "review_id": 1,
  "analisi": {
    "topic": ["facilità"],
    "segmento": "business",
    "prima_prenotazione": 0,
    "cross": 0,
    "localita": "Roma Fiumicino",
    "risposta_generata": "...",
    "flag_referral": 1,
    "flag_cross": 0,
    "tipo_risposta": "referral"
  }
}
```

---

### Utility

#### `GET /logs`
Log degli agenti.

**Query params:** `agent` (filtro), `limit` (default 100), `offset`

**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "agent": "agent-api",
      "azione": "analisi_completata",
      "timestamp": "2026-04-17T10:00:05Z",
      "dettaglio": { "review_id": 1, "tipo_risposta": "referral" }
    }
  ]
}
```

---

#### `GET /stats`
Statistiche aggregate.

**Response:**
```json
{
  "per_stato": [{ "stato": "pending", "n": 10 }, { "stato": "published", "n": 5 }],
  "per_stelle": [{ "stelle": 5, "n": 12 }, { "stelle": 4, "n": 3 }],
  "flag_referral": 4,
  "flag_cross": 2,
  "top_topic": [
    { "topic": "facilità", "count": 8 },
    { "topic": "velocità", "count": 6 }
  ]
}
```

---

## Variabili d'ambiente

| Variabile | Descrizione |
|-----------|-------------|
| `ANTHROPIC_API_KEY` | API key Anthropic (Claude) |
| `TRUSTPILOT_API_KEY` | API key Trustpilot |
| `TRUSTPILOT_API_SECRET` | Secret Trustpilot |
| `TRUSTPILOT_ACCESS_TOKEN` | Bearer token OAuth2 per pubblicare reply |
| `TRUSTPILOT_BUSINESS_UNIT_ID` | ID business unit Trustpilot |
| `PORT` | Porta server (default: 3001) |

---

## Logica di priorità risposta

1. **Referral** — se la recensione contiene "lo consiglio" o simili → risposta che ringrazia e incoraggia la condivisione
2. **Cross-selling** — se il BO indica cross=true → risposta che accenna ad altri servizi
3. **Standard** — risposta personalizzata con le parole chiave del cliente

## Topic riconosciuti (13 categorie)

`facilità` · `velocità` · `posizione` · `parcheggio` · `convenienza` · `soddisfazione generale` · `customer care` · `servizi` · `app` · `cancellazione` · `rimborso` · `sicurezza` · `pagamento in parcheggio`

---

## TODO (prossime fasi)

- [ ] Sostituire mock BO con chiamata reale all'API aziendale
- [ ] Caricare vademecum reale nel system prompt
- [ ] Aggiungere autenticazione (`core/auth`)
- [ ] Migrare SQLite → DB aziendale
- [ ] Aggiungere rate limiting sul webhook
