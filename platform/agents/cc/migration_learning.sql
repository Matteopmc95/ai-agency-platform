-- Migrazione: sistema apprendimento correzioni umane + campi analisi
-- Da eseguire su Supabase Dashboard > SQL Editor

-- Nuove colonne su reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS risposta_pubblicata TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS risposta_modificata BOOLEAN DEFAULT FALSE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS pubblicata_at TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS analisi_at TIMESTAMPTZ;

-- Nuove colonne su review_analysis
ALTER TABLE review_analysis ADD COLUMN IF NOT EXISTS tipo_risposta TEXT;
ALTER TABLE review_analysis ADD COLUMN IF NOT EXISTS booking_date DATE;
