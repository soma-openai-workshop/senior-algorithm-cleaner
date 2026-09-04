PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  collection_job_id TEXT NOT NULL UNIQUE REFERENCES collection_jobs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'preparing', 'extracting_evidence', 'judging_content', 'judging_thumbnails',
    'finalizing', 'completed', 'partial', 'failed', 'expired'
  )),
  phase TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS analysis_jobs_session_idx ON analysis_jobs(session_id, updated_at);

CREATE TABLE IF NOT EXISTS analysis_channels (
  analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  preparation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (preparation_status IN ('pending', 'ready', 'failed')),
  failure_code TEXT,
  PRIMARY KEY (analysis_job_id, channel_id)
);

CREATE TABLE IF NOT EXISTS analysis_video_samples (
  analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  sample_order INTEGER NOT NULL,
  sample_role TEXT NOT NULL CHECK (sample_role IN ('latest', 'popular')),
  is_content_sample INTEGER NOT NULL CHECK (is_content_sample IN (0, 1)),
  is_thumbnail_sample INTEGER NOT NULL CHECK (is_thumbnail_sample IN (0, 1)),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  published_at TEXT,
  view_count TEXT,
  thumbnail_url TEXT,
  contains_synthetic_media INTEGER CHECK (contains_synthetic_media IN (0, 1)),
  evidence_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (evidence_status IN ('pending', 'complete', 'failed')),
  judgement_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (judgement_status IN ('pending', 'complete', 'failed', 'skipped')),
  failure_code TEXT,
  PRIMARY KEY (analysis_job_id, channel_id, video_id)
);

CREATE INDEX IF NOT EXISTS analysis_video_samples_work_idx
ON analysis_video_samples(analysis_job_id, evidence_status, judgement_status, sample_order);

CREATE TABLE IF NOT EXISTS video_evidence (
  analysis_job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  PRIMARY KEY (analysis_job_id, channel_id, video_id),
  FOREIGN KEY (analysis_job_id, channel_id, video_id)
    REFERENCES analysis_video_samples(analysis_job_id, channel_id, video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS video_risk_judgements (
  analysis_job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  source_opacity INTEGER NOT NULL CHECK (source_opacity BETWEEN 0 AND 30),
  treatment_change INTEGER NOT NULL CHECK (treatment_change BETWEEN 0 AND 10),
  purchase_inducement INTEGER NOT NULL CHECK (purchase_inducement BETWEEN 0 AND 10),
  total_risk INTEGER NOT NULL CHECK (total_risk BETWEEN 0 AND 50),
  payload TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  judged_at TEXT NOT NULL,
  PRIMARY KEY (analysis_job_id, channel_id, video_id),
  FOREIGN KEY (analysis_job_id, channel_id, video_id)
    REFERENCES analysis_video_samples(analysis_job_id, channel_id, video_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS thumbnail_judgements (
  analysis_job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  similarity_risk INTEGER CHECK (similarity_risk BETWEEN 0 AND 10),
  payload TEXT,
  failure_code TEXT,
  model TEXT,
  prompt_version TEXT,
  judged_at TEXT,
  PRIMARY KEY (analysis_job_id, channel_id)
);

CREATE TABLE IF NOT EXISTS channel_risk_results (
  analysis_job_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  content_risk INTEGER CHECK (content_risk BETWEEN 0 AND 50),
  factory_risk INTEGER CHECK (factory_risk BETWEEN 0 AND 50),
  combined_risk INTEGER CHECK (combined_risk BETWEEN 0 AND 100),
  risk_level TEXT CHECK (risk_level IN ('normal', 'warning', 'danger', 'unavailable')),
  upload_pattern_risk INTEGER CHECK (upload_pattern_risk BETWEEN 0 AND 10),
  synthetic_media_risk INTEGER CHECK (synthetic_media_risk BETWEEN 0 AND 10),
  thumbnail_similarity_risk INTEGER CHECK (thumbnail_similarity_risk BETWEEN 0 AND 30),
  successful_video_count INTEGER NOT NULL DEFAULT 0,
  failed_video_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  limitations TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  PRIMARY KEY (analysis_job_id, channel_id)
);
