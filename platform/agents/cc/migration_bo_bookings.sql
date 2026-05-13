-- Migrazione: tabella bo_bookings per mirror CSV BO API
-- Da eseguire su Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS bo_bookings (
  transaction_id                  TEXT        PRIMARY KEY,
  user_email_sha256               TEXT,
  segmento                        TEXT,       -- da colonna CSV 'type': airport/port/station/city/camper
  transaction_date                TIMESTAMPTZ,
  booking_start                   TIMESTAMPTZ,
  booking_end                     TIMESTAMPTZ,
  location_name                   TEXT,
  parking_name                    TEXT,
  final_price                     NUMERIC,
  paid_price                      NUMERIC,
  user_first_booking_date         TIMESTAMPTZ,
  user_first_booking_parking_type TEXT,
  transaction_state               TEXT,
  synced_at                       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bo_bookings_email_idx
  ON bo_bookings (user_email_sha256);
