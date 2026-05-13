/**
 * Cleanup delle recensioni Trustpilot importate erroneamente fuori range.
 *
 * NOTA: la tabella reviews NON ha created_at.
 * Il filtro usa:
 *   - source = 'trustpilot'
 *   - stato  = 'pending'    (non ancora approvate/pubblicate manualmente)
 *   - data   fuori range 2026-05-04 → 2026-05-08  (data originale Trustpilot)
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/cleanup-trustpilot-bulk.js   ← anteprima sicura
 *   node scripts/cleanup-trustpilot-bulk.js                ← cancellazione reale
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────

const RANGE_START = '2026-05-04';
const RANGE_END   = '2026-05-08';
const DRY_RUN     = process.env.DRY_RUN === 'true';
const COUNTDOWN_S = 5; // secondi di attesa prima della cancellazione reale

// ── Env check ────────────────────────────────────────────────────────────────

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[config] Variabili mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r[safety] Cancellazione tra ${i}s... (Ctrl+C per annullare)  `);
    await sleep(1000);
  }
  process.stdout.write('\r[safety] Avvio cancellazione...                              \n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const rangeStartMs = new Date(`${RANGE_START}T00:00:00Z`).getTime();
  const rangeEndMs   = new Date(`${RANGE_END}T23:59:59Z`).getTime();

  console.log(`\n── Cleanup Trustpilot bulk ─────────────────────────`);
  console.log(`  Range da tenere:  ${RANGE_START} → ${RANGE_END}`);
  console.log(`  Filtro stato:     pending`);
  console.log(`  Filtro source:    trustpilot`);
  console.log(`  Dry run:          ${DRY_RUN ? 'SÌ — nessuna cancellazione' : 'NO — cancellazione reale'}`);
  console.log(`────────────────────────────────────────────────────\n`);

  // 1. Fetch tutte le reviews Trustpilot pending
  const { data: allPending, error } = await supabase
    .from('reviews')
    .select('id, trustpilot_id, data, autore, stelle, stato, analisi_at')
    .eq('source', 'trustpilot')
    .eq('stato', 'pending')
    .order('data', { ascending: false });

  if (error) {
    console.error('[fetch] Errore lettura DB:', error.message);
    process.exit(1);
  }

  console.log(`[fetch] ${allPending?.length ?? 0} reviews Trustpilot con stato=pending nel DB\n`);

  if (!allPending?.length) {
    console.log('[cleanup] Nessuna review pending. Niente da fare.');
    return;
  }

  // 2. Classifica dentro / fuori range
  const fuoriRange = [];
  const dentroRange = [];

  for (const r of allPending) {
    if (!r.data) {
      fuoriRange.push(r); // data mancante → da cancellare
      continue;
    }
    const reviewMs = new Date(r.data).getTime();
    if (reviewMs >= rangeStartMs && reviewMs <= rangeEndMs) {
      dentroRange.push(r);
    } else {
      fuoriRange.push(r);
    }
  }

  console.log(`[analisi] ${dentroRange.length} DENTRO range ${RANGE_START}→${RANGE_END} (da tenere)`);
  console.log(`[analisi] ${fuoriRange.length} FUORI range (candidate alla cancellazione)\n`);

  if (!fuoriRange.length) {
    console.log('[cleanup] Nessuna recensione fuori range. DB già pulito.');
    return;
  }

  // 3. Anteprima — sempre visibile, dry-run o no
  const PREVIEW_LIMIT = 20;
  console.log(`[anteprima] Prime ${Math.min(PREVIEW_LIMIT, fuoriRange.length)} da cancellare:`);
  for (const r of fuoriRange.slice(0, PREVIEW_LIMIT)) {
    const hasAI = r.analisi_at ? '(con AI)' : '(senza AI)';
    console.log(`  id=${r.id}  data=${r.data}  stelle=${r.stelle}★  ${hasAI}  autore=${r.autore}`);
  }
  if (fuoriRange.length > PREVIEW_LIMIT) {
    console.log(`  ... e altre ${fuoriRange.length - PREVIEW_LIMIT} recensioni`);
  }

  console.log(`\n[totale] ${fuoriRange.length} reviews da cancellare + relative righe review_analysis\n`);

  if (DRY_RUN) {
    console.log('[dry-run] Nessuna riga cancellata.');
    console.log('[dry-run] Per cancellare davvero: node scripts/cleanup-trustpilot-bulk.js');
    return;
  }

  // 4. Countdown di sicurezza (solo in modalità reale)
  await countdown(COUNTDOWN_S);

  // 5. Cancellazione a batch
  const stats = { cancellate: 0, errori: 0 };
  const ids = fuoriRange.map(r => r.id);

  // Prima: review_analysis (FK)
  const { error: raError } = await supabase
    .from('review_analysis')
    .delete()
    .in('review_id', ids);

  if (raError) {
    console.error('[delete] Errore review_analysis:', raError.message);
    console.error('[delete] Proseguo comunque con reviews...');
  } else {
    console.log(`[delete] review_analysis: ${ids.length} righe rimosse`);
  }

  // Poi: reviews (a batch da 500 per sicurezza)
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { error: rError } = await supabase
      .from('reviews')
      .delete()
      .in('id', chunk);

    if (rError) {
      console.error(`[delete] Errore batch ${i}-${i + chunk.length}: ${rError.message}`);
      stats.errori += chunk.length;
    } else {
      stats.cancellate += chunk.length;
      console.log(`[delete] reviews: batch ${i + 1}-${i + chunk.length} rimosso`);
    }
  }

  console.log(`
────────────────────────────────────────────────────
  Reviews pending Trustpilot nel DB:  ${allPending.length}
  Dentro range (tenute):              ${dentroRange.length}
  Fuori range (target):               ${fuoriRange.length}
  Cancellate con successo:            ${stats.cancellate}
  Errori:                             ${stats.errori}
────────────────────────────────────────────────────
`);
}

run().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
