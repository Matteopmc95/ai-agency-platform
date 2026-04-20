CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  trustpilot_id TEXT UNIQUE NOT NULL,
  testo TEXT NOT NULL,
  autore TEXT NOT NULL,
  data TEXT NOT NULL,
  stelle SMALLINT NOT NULL CHECK (stelle BETWEEN 1 AND 5),
  stato TEXT NOT NULL DEFAULT 'pending' CHECK (stato IN ('pending', 'approved', 'published', 'skipped'))
);

CREATE TABLE IF NOT EXISTS review_analysis (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
  topic JSONB NOT NULL DEFAULT '[]',
  segmento TEXT,
  prima_prenotazione BOOLEAN NOT NULL DEFAULT FALSE,
  cross BOOLEAN NOT NULL DEFAULT FALSE,
  localita TEXT,
  risposta_generata TEXT,
  flag_referral BOOLEAN NOT NULL DEFAULT FALSE,
  flag_cross BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  azione TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dettaglio JSONB
);

CREATE INDEX IF NOT EXISTS idx_reviews_stato ON reviews(stato);
CREATE INDEX IF NOT EXISTS idx_reviews_stelle ON reviews(stelle);
CREATE INDEX IF NOT EXISTS idx_analysis_review_id ON review_analysis(review_id);
CREATE INDEX IF NOT EXISTS idx_logs_agent ON agent_logs(agent);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON agent_logs(timestamp);
