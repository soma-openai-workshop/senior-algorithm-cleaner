import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'

export function recordCollectionFailure(
  input: {
    jobId: string
    stage: 'subscriptions' | 'channels' | 'uploads' | 'classification'
    subjectType: 'job' | 'page' | 'channel' | 'video'
    code: string
    retryable: boolean
    attemptCount?: number
  },
  database: AppDatabase = getDatabase(),
): void {
  database
    .prepare(
      `INSERT INTO collection_failures
       (id, job_id, stage, subject_type, code, retryable, user_message_key, attempt_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uuidv7(),
      input.jobId,
      input.stage,
      input.subjectType,
      input.code,
      input.retryable ? 1 : 0,
      input.code,
      input.attemptCount ?? 1,
      new Date().toISOString(),
    )
}
