import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'

export function nextUnclassifiedChannels(
  jobId: string,
  limit = 25,
  database: AppDatabase = getDatabase(),
): string[] {
  return (
    database
      .prepare(
        `SELECT p.channel_id FROM channel_profiles p
         LEFT JOIN health_candidate_classifications c
           ON c.job_id = p.job_id AND c.channel_id = p.channel_id
         WHERE p.job_id = ? AND c.channel_id IS NULL
         ORDER BY p.channel_id LIMIT ?`,
      )
      .all(jobId, limit) as Array<{ channel_id: string }>
  ).map((row) => row.channel_id)
}
