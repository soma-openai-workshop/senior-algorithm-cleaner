import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { getServerEnv } from '@/server/env'
import { AppError } from '@/server/http/errors'

export type JobStatus =
  | 'queued'
  | 'collecting_subscriptions'
  | 'collecting_channels'
  | 'collecting_uploads'
  | 'classifying_candidates'
  | 'interrupted'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'abandoned'
  | 'expired'

export type JobView = {
  id: string
  status: JobStatus
  phase: string
  counts: {
    discovered: number
    processed: number
    success: number
    failure: number
    excluded: number
    duplicate: number
  }
  nextAction: 'advance' | 'wait' | 'resume' | 'restart' | 'view_results' | 'reconnect' | 'none'
  updatedAt: string
  finishedAt: string | null
}

export type JobState = JobView & { checkpoint: Record<string, unknown> }

type JobRow = {
  id: string
  status: JobStatus
  phase: string
  checkpoint: string | null
  discovered_count: number
  processed_count: number
  success_count: number
  failure_count: number
  excluded_count: number
  duplicate_count: number
  lease_owner: string | null
  lease_expires_at: string | null
  updated_at: string
  finished_at: string | null
  expires_at: string | null
}

const activeStatuses = [
  'queued',
  'collecting_subscriptions',
  'collecting_channels',
  'collecting_uploads',
  'classifying_candidates',
  'interrupted',
] as const

export function createOrGetJob(
  sessionId: string,
  restartInterrupted = false,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { job: JobView; created: boolean } {
  return database.transaction(() => {
    const current = database
      .prepare(
        `SELECT * FROM collection_jobs
         WHERE session_id = ? AND status IN (${activeStatuses.map(() => '?').join(',')})
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(sessionId, ...activeStatuses) as JobRow | undefined
    if (current && !(restartInterrupted && current.status === 'interrupted')) {
      return { job: serializeJob(current), created: false }
    }
    if (current) {
      database
        .prepare(
          `UPDATE collection_jobs SET status = 'abandoned', finished_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(now.toISOString(), now.toISOString(), current.id)
    }
    const id = uuidv7()
    const checkpoint = JSON.stringify({ nextPageToken: null, firstPageDone: false })
    database
      .prepare(
        `INSERT INTO collection_jobs
         (id, session_id, status, phase, checkpoint, updated_at)
         VALUES (?, ?, 'queued', 'collecting_subscriptions', ?, ?)`,
      )
      .run(id, sessionId, checkpoint, now.toISOString())
    return { job: serializeJob(getJobRow(id, sessionId, database)), created: true }
  })()
}

export function getOwnedJob(
  jobId: string,
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): JobView {
  const row = database
    .prepare('SELECT * FROM collection_jobs WHERE id = ? AND session_id = ?')
    .get(jobId, sessionId) as JobRow | undefined
  if (!row) throw new AppError('not_found')
  if (row.status === 'expired' || (row.expires_at && row.expires_at <= now.toISOString())) {
    throw new AppError('expired')
  }
  return serializeJob(row)
}

export function claimJobLease(
  jobId: string,
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { leaseOwner: string; checkpoint: Record<string, unknown> } {
  const leaseOwner = uuidv7()
  const expiresAt = new Date(now.getTime() + 30_000).toISOString()
  const result = database
    .prepare(
      `UPDATE collection_jobs
       SET lease_owner = ?, lease_expires_at = ?,
           status = CASE WHEN status = 'queued' THEN 'collecting_subscriptions' ELSE status END,
           started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND session_id = ?
         AND status IN ('queued', 'collecting_subscriptions', 'collecting_channels',
                        'collecting_uploads', 'classifying_candidates', 'interrupted')
         AND (lease_expires_at IS NULL OR lease_expires_at <= ? OR lease_owner = ?)`,
    )
    .run(
      leaseOwner,
      expiresAt,
      now.toISOString(),
      now.toISOString(),
      jobId,
      sessionId,
      now.toISOString(),
      leaseOwner,
    )
  if (result.changes !== 1) {
    getOwnedJob(jobId, sessionId, now, database)
    const active = database
      .prepare('SELECT lease_expires_at FROM collection_jobs WHERE id = ?')
      .get(jobId) as { lease_expires_at: string | null }
    const retryAfter = Math.max(
      100,
      new Date(active.lease_expires_at ?? now).getTime() - now.getTime(),
    )
    throw new AppError('already_advancing', 409, retryAfter)
  }
  const row = getJobRow(jobId, sessionId, database)
  return {
    leaseOwner,
    checkpoint: JSON.parse(row.checkpoint ?? '{}') as Record<string, unknown>,
  }
}

export function finishSubscriptionPage(
  input: {
    jobId: string
    leaseOwner: string
    nextPageToken: string | null
    totalResults: number | null
    inserted: number
    duplicates: number
    finished: boolean
    now?: Date
  },
  database: AppDatabase = getDatabase(),
): void {
  const now = input.now ?? new Date()
  const isComplete = input.finished
  const result = database
    .prepare(
      `UPDATE collection_jobs SET
         status = ?, phase = ?, checkpoint = ?,
         discovered_count = MAX(discovered_count, ?),
         processed_count = processed_count + ?,
         success_count = success_count + ?,
         duplicate_count = duplicate_count + ?,
         lease_owner = NULL, lease_expires_at = NULL,
         updated_at = ?, finished_at = ?, expires_at = ?
       WHERE id = ? AND lease_owner = ?`,
    )
    .run(
      isComplete ? 'collecting_channels' : 'collecting_subscriptions',
      isComplete ? 'collecting_channels' : 'collecting_subscriptions',
      JSON.stringify(
        isComplete
          ? { nextBatchOffset: 0 }
          : { nextPageToken: input.nextPageToken, firstPageDone: true },
      ),
      input.totalResults ?? 0,
      input.inserted,
      input.inserted,
      input.duplicates,
      now.toISOString(),
      null,
      null,
      input.jobId,
      input.leaseOwner,
    )
  if (result.changes !== 1) throw new AppError('already_advancing')
}

export function getJobState(
  jobId: string,
  sessionId: string,
  database: AppDatabase = getDatabase(),
): JobState {
  const row = getJobRow(jobId, sessionId, database)
  return {
    ...serializeJob(row),
    checkpoint: JSON.parse(row.checkpoint ?? '{}') as Record<string, unknown>,
  }
}

export function advanceJobPhase(
  input: {
    jobId: string
    leaseOwner: string
    status: Extract<
      JobStatus,
      'collecting_channels' | 'collecting_uploads' | 'classifying_candidates'
    >
    checkpoint: Record<string, unknown>
    processedDelta?: number
    successDelta?: number
    excludedDelta?: number
    failureDelta?: number
  },
  database: AppDatabase = getDatabase(),
): void {
  const result = database
    .prepare(
      `UPDATE collection_jobs SET status = ?, phase = ?, checkpoint = ?,
       processed_count = processed_count + ?, success_count = success_count + ?,
       excluded_count = excluded_count + ?, failure_count = failure_count + ?,
       lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND lease_owner = ?`,
    )
    .run(
      input.status,
      input.status,
      JSON.stringify(input.checkpoint),
      input.processedDelta ?? 0,
      input.successDelta ?? 0,
      input.excludedDelta ?? 0,
      input.failureDelta ?? 0,
      new Date().toISOString(),
      input.jobId,
      input.leaseOwner,
    )
  if (result.changes !== 1) throw new AppError('already_advancing')
}

export function finishJob(
  jobId: string,
  leaseOwner: string,
  hasFailures: boolean,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): void {
  const expiresAt = new Date(
    now.getTime() + getServerEnv().ANALYSIS_TTL_HOURS * 3_600_000,
  ).toISOString()
  const result = database
    .prepare(
      `UPDATE collection_jobs SET status = ?, phase = 'finalizing', checkpoint = NULL,
       lease_owner = NULL, lease_expires_at = NULL, updated_at = ?, finished_at = ?, expires_at = ?
       WHERE id = ? AND lease_owner = ?`,
    )
    .run(
      hasFailures ? 'partial' : 'completed',
      now.toISOString(),
      now.toISOString(),
      expiresAt,
      jobId,
      leaseOwner,
    )
  if (result.changes !== 1) throw new AppError('already_advancing')
}

export function releaseLeaseAsFailed(
  jobId: string,
  leaseOwner: string,
  fatal: boolean,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): void {
  database
    .prepare(
      `UPDATE collection_jobs SET status = ?, failure_count = failure_count + 1,
       lease_owner = NULL, lease_expires_at = NULL, updated_at = ?, finished_at = ?
       WHERE id = ? AND lease_owner = ?`,
    )
    .run(
      fatal ? 'failed' : 'interrupted',
      now.toISOString(),
      fatal ? now.toISOString() : null,
      jobId,
      leaseOwner,
    )
}

function getJobRow(jobId: string, sessionId: string, database: AppDatabase): JobRow {
  const row = database
    .prepare('SELECT * FROM collection_jobs WHERE id = ? AND session_id = ?')
    .get(jobId, sessionId) as JobRow | undefined
  if (!row) throw new AppError('not_found')
  return row
}

function serializeJob(row: JobRow): JobView {
  const nextAction: JobView['nextAction'] =
    row.status === 'completed' || row.status === 'partial'
      ? 'view_results'
      : row.status === 'interrupted'
        ? 'resume'
        : row.status === 'failed'
          ? 'restart'
          : row.lease_expires_at && row.lease_expires_at > new Date().toISOString()
            ? 'wait'
            : [
                  'queued',
                  'collecting_subscriptions',
                  'collecting_channels',
                  'collecting_uploads',
                  'classifying_candidates',
                ].includes(row.status)
              ? 'advance'
              : 'none'
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    counts: {
      discovered: row.discovered_count,
      processed: row.processed_count,
      success: row.success_count,
      failure: row.failure_count,
      excluded: row.excluded_count,
      duplicate: row.duplicate_count,
    },
    nextAction,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}
