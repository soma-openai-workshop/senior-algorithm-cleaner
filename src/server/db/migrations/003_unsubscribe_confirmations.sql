PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS unsubscribe_confirmations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  selections TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS unsubscribe_confirmations_session_idx
ON unsubscribe_confirmations(session_id, expires_at);

CREATE TABLE IF NOT EXISTS unsubscribe_results (
  confirmation_id TEXT NOT NULL REFERENCES unsubscribe_confirmations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  failure_code TEXT,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (confirmation_id, channel_id)
);
