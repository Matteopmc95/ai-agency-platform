-- Migrazione: colonna enrichment_status su reviews
-- Valori possibili:
--   'matched'                      → ref_id trovato in bo_bookings, campi BO popolati
--   'pending_sync'                 → ref_id presente ma non ancora in bo_bookings (booking recente)
--   'organic_or_non_trustpilot'   → source != trustpilot, oppure trustpilot senza ref_id
--   NULL                           → non ancora classificata (pre-migration)
--
-- Da eseguire su Supabase Dashboard > SQL Editor

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS enrichment_status TEXT;

CREATE INDEX IF NOT EXISTS reviews_enrichment_status_idx
  ON reviews (enrichment_status);
