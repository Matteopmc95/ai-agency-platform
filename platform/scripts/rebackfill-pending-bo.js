/**
 * rebackfill-pending-bo.js
 * Ritenta il match BO per recensioni con enrichment_status='pending_sync'.
 * Da schedulare su Railway alle 04:00 (dopo cron BO sync delle 03:00).
 *
 * Run from platform/ directory:
 *   DRY_RUN=true node scripts/rebackfill-pending-bo.js
 *   node scripts/rebackfill-pending-bo.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { boLookupBatch } = require('../agents/cc/utils/bo-lookup');
const { sendTelegramAlert } = require('./lib/telegram-alert');

const DRY_RUN    = process.env.DRY_RUN === 'true';
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE) || 100;

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
  // 1. Carica tutte le recensioni pending_sync con ref_id
  const pending = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, reference_id')
      .eq('enrichment_status', 'pending_sync')
      .not('reference_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) { console.error('[fetch] Errore:', error.message); break; }
    if (!data?.length) break;
    pending.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  console.log(`[re-backfill] ${pending.length} recensioni in pending_sync`);
  if (!pending.length) return;

  // 2. Batch lookup BO in chunk da BATCH_SIZE
  let recovered = 0, stillPending = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk  = pending.slice(i, i + BATCH_SIZE);
    const refIds = chunk.map(r => String(r.reference_id).trim());
    const boMap  = await boLookupBatch(refIds);

    for (const r of chunk) {
      const refId  = String(r.reference_id).trim();
      const boData = boMap.get(refId);

      if (boData) {
        if (!DRY_RUN) {
          // Aggiorna solo le colonne che esistono in reviews
          const { error: revErr } = await supabase.from('reviews').update({
            enrichment_status: 'matched',
            booking_date:      boData.transaction_date || null,
          }).eq('id', r.id);
          if (revErr) { console.error(`[update reviews ${r.id}] ${revErr.message}`); }

          // Aggiorna review_analysis per segmento/localita/cross/prima_prenotazione
          const { error: raErr } = await supabase.from('review_analysis')
            .update({
              segmento:          boData.segmento           || null,
              localita:          boData.location_name      || null,
              prima_prenotazione: boData.prima_prenotazione ? true : false,
              cross:             boData.cross              ? true : false,
            })
            .eq('review_id', r.id);
          if (raErr) { console.error(`[update review_analysis ${r.id}] ${raErr.message}`); }
        }
        recovered++;
      } else {
        stillPending++;
      }
    }
  }

  console.log(`[re-backfill] Recuperate: ${recovered} | Ancora pending: ${stillPending}`);

  if (!DRY_RUN && recovered > 0) {
    await sendTelegramAlert(
      `♻️ <b>Re-backfill BO</b>: recuperate <b>${recovered}</b> recensioni pending\n` +
      `Ancora in attesa: ${stillPending}`
    );
  }
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
