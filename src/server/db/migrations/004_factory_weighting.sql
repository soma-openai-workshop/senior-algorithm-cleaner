PRAGMA foreign_keys = ON;

CREATE TABLE channel_risk_results_v2 (
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

INSERT INTO channel_risk_results_v2
SELECT analysis_job_id,
       channel_id,
       content_risk,
       CASE WHEN factory_risk IS NULL THEN NULL
            ELSE ROUND(COALESCE(upload_pattern_risk, 0) / 3.0)
                 + COALESCE(synthetic_media_risk, 0)
                 + COALESCE(thumbnail_similarity_risk, 0) * 3 END,
       CASE WHEN combined_risk IS NULL OR content_risk IS NULL THEN NULL
            ELSE content_risk
                 + ROUND(COALESCE(upload_pattern_risk, 0) / 3.0)
                 + COALESCE(synthetic_media_risk, 0)
                 + COALESCE(thumbnail_similarity_risk, 0) * 3 END,
       CASE
         WHEN combined_risk IS NULL OR content_risk IS NULL THEN 'unavailable'
         WHEN content_risk + ROUND(COALESCE(upload_pattern_risk, 0) / 3.0)
              + COALESCE(synthetic_media_risk, 0)
              + COALESCE(thumbnail_similarity_risk, 0) * 3 <= 20 THEN 'normal'
         WHEN content_risk + ROUND(COALESCE(upload_pattern_risk, 0) / 3.0)
              + COALESCE(synthetic_media_risk, 0)
              + COALESCE(thumbnail_similarity_risk, 0) * 3 <= 60 THEN 'warning'
         ELSE 'danger'
       END,
       CASE WHEN upload_pattern_risk IS NULL THEN NULL ELSE ROUND(upload_pattern_risk / 3.0) END,
       synthetic_media_risk,
       CASE WHEN thumbnail_similarity_risk IS NULL THEN NULL ELSE thumbnail_similarity_risk * 3 END,
       successful_video_count,
       failed_video_count,
       reason,
       limitations,
       'analysis-policy-v3',
       calculated_at
FROM channel_risk_results;

DROP TABLE channel_risk_results;
ALTER TABLE channel_risk_results_v2 RENAME TO channel_risk_results;
