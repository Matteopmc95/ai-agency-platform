-- Migrazione: sistema apprendimento correzioni umane
-- Da eseguire su Supabase Dashboard > SQL Editor

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS risposta_pubblicata TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS risposta_modificata BOOLEAN DEFAULT FALSE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS pubblicata_at TIMESTAMPTZ;
