import 'server-only'
import type { AppDatabase } from './client'
import { getDatabase } from './client'

export function cleanupExpiredData(
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { sessions: number; jobs: number; attempts: number } {
  return database.transaction(() => {
    const attempts = database
      .prepare('DELETE FROM oauth_attempts WHERE expires_at <= ?')
      .run(now.toISOString()).changes
    const expiredWhere = `SELECT id FROM collection_jobs
      WHERE status IN ('completed', 'partial', 'failed', 'abandoned')
        AND expires_at IS NOT NULL AND expires_at <= ?`
    database
      .prepare(`DELETE FROM collection_failures WHERE job_id IN (${expiredWhere})`)
      .run(now.toISOString())
    database
      .prepare(`DELETE FROM subscriptions WHERE job_id IN (${expiredWhere})`)
      .run(now.toISOString())
    database
      .prepare(`DELETE FROM channel_profiles WHERE job_id IN (${expiredWhere})`)
      .run(now.toISOString())
    const jobs = database
      .prepare(
        `UPDATE collection_jobs SET status = 'expired'
         WHERE status IN ('completed', 'partial', 'failed', 'abandoned')
           AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .run(now.toISOString()).changes
    const sessions = database
      .prepare('DELETE FROM browser_sessions WHERE expires_at <= ?')
      .run(now.toISOString()).changes
    return { sessions, jobs, attempts }
  })()
}
