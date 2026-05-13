/**
 * warm-bo-cache.js
 * Pre-carica in LRU cache le prenotazioni BO degli ultimi N giorni.
 * Da eseguire alle 06:00 su Railway (dopo il cron BO sync delle 03:00).
 *
 * Run from platform/ directory:
 *   node scripts/warm-bo-cache.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { boLookupBatch, cacheStats } = require('../agents/cc/utils/bo-lookup');

const WARM_DAYS = Number(process.env.BO_CACHE_WARM_DAYS) || 7;

const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
if (missing.length) { console.error('[config] Variabili mancanti:', missing.join(', ')); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
  const since = new Date(Date.now() - WARM_DAYS * 86_400_000).toISOString();
  console.log(`[warm-bo-cache] Pre-carico prenotazioni >= ${since.slice(0, 10)} (ultimi ${WARM_DAYS} giorni)...`);

  const t0 = Date.now();

  // Legge tutti i transaction_id recenti da bo_bookings
  const ids = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('bo_bookings')
      .select('transaction_id')
      .gte('transaction_date', since)
      .range(from, from + PAGE - 1);

    if (error) { console.error('[warm-bo-cache] Errore Supabase:', error.message); break; }
    if (!data?.length) break;
    data.forEach(r => ids.push(r.transaction_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[warm-bo-cache] ${ids.length} transaction_id trovati — carico in cache...`);

  // boLookupBatch li carica tutti in LRU cache (chunk da 100 internamente)
  await boLookupBatch(ids);

  const elapsed = Date.now() - t0;
  const stats = cacheStats();
  console.log(`[warm-bo-cache] Completato in ${elapsed}ms — cache: ${stats.size}/${stats.max} entries, hit_rate: ${stats.hit_rate}`);
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
