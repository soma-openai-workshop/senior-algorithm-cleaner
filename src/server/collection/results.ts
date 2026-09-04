import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'

type ResultRow = {
  channel_id: string
  title: string
  description: string
  thumbnail_url: string | null
  detail_status: string
  failure_code: string | null
  is_candidate: number | null
  policy_version: string | null
  sample_status: string | null
  matched_signals: string | null
  sample_count: number
  collection_status: string | null
}

export function listCollectionResults(
  jobId: string,
  cursor: string | null,
  limit: number,
  database: AppDatabase = getDatabase(),
) {
  const rows = database
    .prepare(
      `SELECT p.channel_id, p.title, p.description, p.thumbnail_url,
              p.detail_status, p.failure_code, c.is_candidate, c.policy_version,
              c.sample_status, c.matched_signals, s.status AS collection_status,
              (SELECT COUNT(*) FROM upload_metadata u
               WHERE u.job_id = p.job_id AND u.channel_id = p.channel_id) AS sample_count
       FROM channel_profiles p
       LEFT JOIN health_candidate_classifications c
         ON c.job_id = p.job_id AND c.channel_id = p.channel_id
       LEFT JOIN channel_collection_states s
         ON s.job_id = p.job_id AND s.channel_id = p.channel_id
       WHERE p.job_id = ? AND (? IS NULL OR p.channel_id > ?)
       ORDER BY p.channel_id LIMIT ?`,
    )
    .all(jobId, cursor, cursor, limit + 1) as ResultRow[]
  const page = rows.slice(0, limit)
  return {
    items: page.map((row) => ({
      channelId: row.channel_id,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      detailStatus: row.detail_status,
      candidate: row.is_candidate === null ? null : row.is_candidate === 1,
      policyVersion: row.policy_version,
      sampleStatus: row.sample_status,
      sampleCount: row.sample_count,
      collectionStatus: row.collection_status,
      matchedSignals: row.matched_signals ? (JSON.parse(row.matched_signals) as unknown[]) : [],
      limitations: [
        ...(row.failure_code ? [row.failure_code] : []),
        ...(row.collection_status === 'truncated' ? ['upload_sample_truncated'] : []),
      ],
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.channel_id ?? null) : null,
  }
}
