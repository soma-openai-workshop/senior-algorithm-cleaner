PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  cookie_hash BLOB NOT NULL UNIQUE,
  csrf_token_hash BLOB NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS browser_sessions_expires_idx ON browser_sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  state_hash BLOB NOT NULL UNIQUE,
  code_verifier_ciphertext BLOB NOT NULL,
  code_verifier_iv BLOB NOT NULL,
  code_verifier_auth_tag BLOB NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS oauth_attempts_session_idx ON oauth_attempts(session_id);
CREATE INDEX IF NOT EXISTS oauth_attempts_expires_idx ON oauth_attempts(expires_at);

CREATE TABLE IF NOT EXISTS oauth_connections (
  session_id TEXT PRIMARY KEY REFERENCES browser_sessions(id) ON DELETE CASCADE,
  token_ciphertext BLOB NOT NULL,
  token_iv BLOB NOT NULL,
  token_auth_tag BLOB NOT NULL,
  granted_scopes TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type = 'Bearer'),
  expires_at TEXT NOT NULL,
  connected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'collecting_subscriptions', 'collecting_channels', 'collecting_uploads',
    'classifying_candidates', 'interrupted', 'completed', 'partial', 'failed',
    'abandoned', 'expired'
  )),
  phase TEXT NOT NULL CHECK (phase IN (
    'collecting_subscriptions', 'collecting_channels', 'collecting_uploads',
    'classifying_candidates', 'finalizing'
  )),
  checkpoint TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  excluded_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  lease_owner TEXT,
  lease_expires_at TEXT,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_jobs_one_active_per_session_idx
ON collection_jobs(session_id)
WHERE status IN (
  'queued', 'collecting_subscriptions', 'collecting_channels', 'collecting_uploads',
  'classifying_candidates', 'interrupted'
);
CREATE INDEX IF NOT EXISTS collection_jobs_expiry_idx ON collection_jobs(expires_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  job_id TEXT NOT NULL REFERENCES collection_jobs(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  subscribed_at TEXT,
  source_title TEXT NOT NULL,
  source_description TEXT NOT NULL,
  source_thumbnail_url TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, subscription_id),
  UNIQUE (job_id, channel_id)
);

CREATE INDEX IF NOT EXISTS subscriptions_job_channel_idx ON subscriptions(job_id, channel_id);

CREATE TABLE IF NOT EXISTS channel_profiles (
  job_id TEXT NOT NULL REFERENCES collection_jobs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TEXT,
  public_video_count TEXT,
  subscriber_count TEXT,
  view_count TEXT,
  uploads_playlist_id TEXT,
  detail_status TEXT NOT NULL CHECK (detail_status IN ('ready', 'unavailable', 'invalid')),
  failure_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, channel_id)
);

CREATE TABLE IF NOT EXISTS channel_collection_states (
  job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'collecting', 'complete', 'truncated', 'failed')),
  next_page_token TEXT,
  scanned_count INTEGER NOT NULL DEFAULT 0 CHECK (scanned_count BETWEEN 0 AND 500),
  stored_count INTEGER NOT NULL DEFAULT 0 CHECK (stored_count >= 0),
  excluded_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  latest_public_count INTEGER NOT NULL DEFAULT 0 CHECK (latest_public_count BETWEEN 0 AND 20),
  saw_older_than_90_days INTEGER NOT NULL DEFAULT 0 CHECK (saw_older_than_90_days IN (0, 1)),
  oldest_seen_at TEXT,
  failure_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, channel_id),
  FOREIGN KEY (job_id, channel_id) REFERENCES channel_profiles(job_id, channel_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS upload_metadata (
  job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  published_at TEXT,
  playlist_position INTEGER CHECK (playlist_position IS NULL OR playlist_position >= 0),
  privacy_status TEXT NOT NULL CHECK (privacy_status = 'public'),
  is_latest_twenty INTEGER NOT NULL CHECK (is_latest_twenty IN (0, 1)),
  is_within_last_ninety_days INTEGER NOT NULL CHECK (is_within_last_ninety_days IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, channel_id, video_id),
  FOREIGN KEY (job_id, channel_id) REFERENCES channel_profiles(job_id, channel_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS upload_metadata_sample_idx
ON upload_metadata(job_id, channel_id, is_latest_twenty, is_within_last_ninety_days);

CREATE TABLE IF NOT EXISTS health_candidate_classifications (
  job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  is_candidate INTEGER NOT NULL CHECK (is_candidate IN (0, 1)),
  policy_version TEXT NOT NULL,
  sample_status TEXT NOT NULL CHECK (sample_status IN ('sufficient', 'limited', 'no_uploads')),
  matched_signals TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  PRIMARY KEY (job_id, channel_id),
  FOREIGN KEY (job_id, channel_id) REFERENCES channel_profiles(job_id, channel_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_failures (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES collection_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('oauth', 'subscriptions', 'channels', 'uploads', 'classification')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('job', 'page', 'channel', 'video')),
  subject_ref TEXT,
  code TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  user_message_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS collection_failures_job_idx ON collection_failures(job_id, created_at);
