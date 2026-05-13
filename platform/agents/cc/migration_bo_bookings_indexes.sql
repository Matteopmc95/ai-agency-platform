-- Migrazione: indici aggiuntivi su bo_bookings
-- Indici già presenti (creati con la tabella):
--   PRIMARY KEY (transaction_id)
--   INDEX bo_bookings_email_idx (user_email_sha256)
--
-- Indice mancante: transaction_date DESC
--   Necessario per:
--   - Cache warming query: WHERE transaction_date >= NOW() - INTERVAL '7 days'
--   - Cron sync notturno: ORDER BY transaction_date DESC
--
-- Da eseguire su Supabase Dashboard > SQL Editor

CREATE INDEX IF NOT EXISTS bo_bookings_transaction_date_idx
  ON bo_bookings (transaction_date DESC);
