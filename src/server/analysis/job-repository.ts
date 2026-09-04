import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { getServerEnv } from '@/server/env'
import { AppError } from '@/server/http/errors'

export type AnalysisStatus =
  | 'preparing'
  | 'extracting_evidence'
  | 'judging_content'
  | 'judging_thumbnails'
  | 'finalizing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'expired'

type AnalysisJobRow = {
  id: string
  collection_job_id: string
  session_id: string
  status: AnalysisStatus
  phase: string
  processed_count: number
  total_count: number
  success_count: number
  failure_count: number
  updated_at: string
  finished_at: string | null
  expires_at: string | null
}

export function createOrGetAnalysisJob(
  collectionJobId: string,
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
) {
  const collection = database
    .prepare('SELECT status FROM collection_jobs WHERE id = ? AND session_id = ?')
    .get(collectionJobId, sessionId) as { status: string } | undefined
  if (!collection) throw new AppError('not_found')
  if (!['completed', 'partial'].includes(collection.status)) throw new AppError('invalid_request')
  const current = database
    .prepare('SELECT * FROM analysis_jobs WHERE collection_job_id = ?')
    .get(collectionJobId) as AnalysisJobRow | undefined
  if (current && current.status !== 'expired') return serializeAnalysisJob(current)

  return database.transaction(() => {
    if (current) database.prepare('DELETE FROM analysis_jobs WHERE id = ?').run(current.id)
    const id = uuidv7()
    const channelIds = database
      .prepare(
        `SELECT channel_id FROM health_candidate_classifications
         WHERE job_id = ? AND is_candidate = 1 ORDER BY channel_id`,
      )
      .all(collectionJobId) as Array<{ channel_id: string }>
    database
      .prepare(
        `INSERT INTO analysis_jobs
         (id, collection_job_id, session_id, status, phase, total_count, updated_at)
         VALUES (?, ?, ?, 'preparing', 'preparing', ?, ?)`,
      )
      .run(id, collectionJobId, sessionId, channelIds.length, now.toISOString())
    const insertChannel = database.prepare(
      `INSERT INTO analysis_channels (analysis_job_id, channel_id) VALUES (?, ?)`,
    )
    const insertThumbnail = database.prepare(
      `INSERT INTO thumbnail_judgements (analysis_job_id, channel_id, status)
       VALUES (?, ?, 'pending')`,
    )
    for (const { channel_id: channelId } of channelIds) {
      insertChannel.run(id, channelId)
      insertThumbnail.run(id, channelId)
    }
    return getOwnedAnalysisJob(id, sessionId, now, database)
  })()
}

export function getOwnedAnalysisJob(
  analysisJobId: string,
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
) {
  const row = database
    .prepare('SELECT * FROM analysis_jobs WHERE id = ? AND session_id = ?')
    .get(analysisJobId, sessionId) as AnalysisJobRow | undefined
  if (!row) throw new AppError('not_found')
  if (row.status === 'expired' || (row.expires_at && row.expires_at <= now.toISOString())) {
    throw new AppError('expired')
  }
  return serializeAnalysisJob(row)
}

export function updateAnalysisProgress(
  input: {
    id: string
    status: AnalysisStatus
    total: number
    processed: number
    success: number
    failure: number
    finished?: boolean
  },
  database: AppDatabase = getDatabase(),
) {
  const now = new Date()
  const expiry = input.finished
    ? new Date(now.getTime() + getServerEnv().ANALYSIS_TTL_HOURS * 3_600_000).toISOString()
    : null
  database
    .prepare(
      `UPDATE analysis_jobs SET status = ?, phase = ?, total_count = ?, processed_count = ?,
       success_count = ?, failure_count = ?, updated_at = ?, finished_at = ?, expires_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.status,
      input.total,
      input.processed,
      input.success,
      input.failure,
      now.toISOString(),
      input.finished ? now.toISOString() : null,
      expiry,
      input.id,
    )
}

function serializeAnalysisJob(row: AnalysisJobRow) {
  const label = {
    preparing: '영상 정보를 준비하는 중',
    extracting_evidence: '영상 읽는 중',
    judging_content: '위험도 계산 중',
    judging_thumbnails: '썸네일 비교 중',
    finalizing: '결과를 정리하는 중',
    completed: '분석 완료',
    partial: '일부 분석 완료',
    failed: '분석 실패',
    expired: '분석 만료',
  }[row.status]
  return {
    id: row.id,
    collectionJobId: row.collection_job_id,
    status: row.status,
    phase: row.phase,
    phaseLabel: label,
    counts: {
      processed: row.processed_count,
      total: row.total_count,
      success: row.success_count,
      failure: row.failure_count,
    },
    nextAction: ['completed', 'partial'].includes(row.status) ? 'view_results' : 'advance',
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}
