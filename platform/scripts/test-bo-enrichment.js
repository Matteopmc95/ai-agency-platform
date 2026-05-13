/**
 * test-bo-enrichment.js
 * Verifica end-to-end il flusso di enrichment BO senza chiamare Anthropic.
 * Testa i 4 casi: matched, pending_sync, organic (no ref_id), organic (non-trustpilot).
 *
 * Run from platform/ directory:
 *   node scripts/test-bo-enrichment.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { boLookup } = require('../agents/cc/utils/bo-lookup');

// ── Fixtures (da DB reale) ────────────────────────────────────────────────────
// Test 1: Trustpilot + ref_id che matcha bo_bookings (id=1589, ref=1460594)
// Test 2: Trustpilot + ref_id che NON matcha (id=6144, ref=1464380 — prenotazione recente)
// Test 3: Trustpilot senza ref_id (id=5940)
// Test 4: Apple (source != trustpilot, id=1571)

const TESTS = [
  {
    name: 'Test 1 — Trustpilot CON ref_id che matcha BO',
    metadata: { referenceId: '1460594' },
    source:   'trustpilot',
    expected_status: 'matched',
    expect_bo_data:  true,
  },
  {
    name: 'Test 2 — Trustpilot CON ref_id che NON matcha BO',
    metadata: { referenceId: '1464380' },
    source:   'trustpilot',
    expected_status: 'pending_sync',
    expect_bo_data:  false,
  },
  {
    name: 'Test 3 — Trustpilot SENZA ref_id (organica)',
    metadata: {},
    source:   'trustpilot',
    expected_status: 'organic_or_non_trustpilot',
    expect_bo_data:  false,
  },
  {
    name: 'Test 4 — Apple (source != trustpilot)',
    metadata: {},
    source:   'apple',
    expected_status: 'organic_or_non_trustpilot',
    expect_bo_data:  false,
  },
];

// ── Logica enrichment (speculare a processaRecensione, senza AI) ──────────────

async function computeEnrichment(metadata) {
  const referenceId = metadata.referenceId || metadata.reference_id || null;
  let boData = null;
  let enrichmentStatus;

  if (referenceId) {
    boData = await boLookup(String(referenceId).trim());
    enrichmentStatus = boData ? 'matched' : 'pending_sync';
  } else {
    enrichmentStatus = 'organic_or_non_trustpilot';
  }

  return { boData, enrichmentStatus };
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  const hr = () => console.log('─'.repeat(60));
  let passed = 0, failed = 0;

  hr();
  console.log('TEST ENRICHMENT BO — 4 casi\n');

  for (const t of TESTS) {
    const { boData, enrichmentStatus } = await computeEnrichment(t.metadata);

    const statusOk  = enrichmentStatus === t.expected_status;
    const boDataOk  = t.expect_bo_data ? boData !== null : boData === null;
    const pass      = statusOk && boDataOk;

    console.log(`${pass ? '✅' : '❌'} ${t.name}`);
    console.log(`   enrichment_status: ${enrichmentStatus}  (atteso: ${t.expected_status}) ${statusOk ? '✓' : '✗'}`);
    console.log(`   boData presente:   ${boData !== null}  (atteso: ${t.expect_bo_data}) ${boDataOk ? '✓' : '✗'}`);
    if (boData) {
      console.log(`   segmento: ${boData.segmento}, location: ${boData.location_name}, cross: ${boData.cross}, prima: ${boData.prima_prenotazione}`);
    }
    console.log();

    pass ? passed++ : failed++;
  }

  hr();
  console.log(`Risultato: ${passed}/4 PASS${failed > 0 ? `, ${failed} FAIL` : ''}`);
  hr();

  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
