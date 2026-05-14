-- Migration: cross-segmento + storia utente
-- Aggiunge 10 campi a review_analysis per analytics customer journey
-- Eseguire nel SQL Editor di Supabase Dashboard

ALTER TABLE review_analysis
  ADD COLUMN IF NOT EXISTS segmenti_precedenti               TEXT[],
  ADD COLUMN IF NOT EXISTS segmenti_precedenti_completed     TEXT[],
  ADD COLUMN IF NOT EXISTS segmento_origine                  TEXT,
  ADD COLUMN IF NOT EXISTS n_prenotazioni_precedenti         INTEGER,
  ADD COLUMN IF NOT EXISTS n_prenotazioni_precedenti_completed INTEGER,
  ADD COLUMN IF NOT EXISTS cross_with_cancelled              BOOLEAN,
  ADD COLUMN IF NOT EXISTS cross_completed_only              BOOLEAN,
  ADD COLUMN IF NOT EXISTS cross_ever_with_cancelled         BOOLEAN,
  ADD COLUMN IF NOT EXISTS cross_ever_completed_only         BOOLEAN,
  ADD COLUMN IF NOT EXISTS giorni_da_prima_prenotazione      INTEGER;

-- Indice critico per performance lookup storico utente
CREATE INDEX IF NOT EXISTS bo_bookings_user_email_idx
  ON bo_bookings(user_email_sha256);

-- Indice composito per query "storia utente prima di data X"
CREATE INDEX IF NOT EXISTS bo_bookings_user_date_idx
  ON bo_bookings(user_email_sha256, transaction_date);
