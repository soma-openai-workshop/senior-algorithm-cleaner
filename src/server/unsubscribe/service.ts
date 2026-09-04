import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getOAuthConnection } from '@/server/auth/oauth-repository'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { AppError } from '@/server/http/errors'
import { deleteSubscription } from '@/server/youtube/client'

const channelIdsSchema = z.array(z.string().min(1)).min(1).max(100)

type Selection = { channelId: string; subscriptionId: string; title: string }
type UnsubscribeResult = {
  channelId: string
  title: string
  status: 'success' | 'failed'
  failureCode?: string
}

export function createUnsubscribeConfirmation(
  input: { analysisJobId: string; channelIds: string[] },
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
) {
  const channelIds = [...new Set(channelIdsSchema.parse(input.channelIds))]
  const placeholders = channelIds.map(() => '?').join(',')
  const rows = database
    .prepare(
      `SELECT r.channel_id, s.subscription_id, p.title
       FROM channel_risk_results r
       JOIN analysis_jobs a ON a.id = r.analysis_job_id
       JOIN channel_profiles p ON p.job_id = a.collection_job_id AND p.channel_id = r.channel_id
       JOIN subscriptions s ON s.job_id = a.collection_job_id AND s.channel_id = r.channel_id
       WHERE r.analysis_job_id = ? AND a.session_id = ? AND r.channel_id IN (${placeholders})`,
    )
    .all(input.analysisJobId, sessionId, ...channelIds) as Array<{
    channel_id: string
    subscription_id: string
    title: string
  }>
  if (rows.length !== channelIds.length) throw new AppError('invalid_request')
  const selections = rows.map((row) => ({
    channelId: row.channel_id,
    subscriptionId: row.subscription_id,
    title: row.title,
  }))
  const id = uuidv7()
  database
    .prepare(
      `INSERT INTO unsubscribe_confirmations
       (id, session_id, analysis_job_id, selections, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sessionId,
      input.analysisJobId,
      JSON.stringify(selections),
      now.toISOString(),
      new Date(now.getTime() + 10 * 60_000).toISOString(),
    )
  return { confirmationId: id, count: selections.length, channels: selections.map(publicSelection) }
}

export async function executeUnsubscribeConfirmation(
  confirmationId: string,
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
) {
  const connection = getOAuthConnection(sessionId, now, database)
  if (!connection) throw new AppError('reauth_required')
  const selections = database.transaction(() => {
    const row = database
      .prepare(
        `SELECT selections, expires_at, consumed_at FROM unsubscribe_confirmations
         WHERE id = ? AND session_id = ?`,
      )
      .get(confirmationId, sessionId) as
      { selections: string; expires_at: string; consumed_at: string | null } | undefined
    if (!row) throw new AppError('not_found')
    if (row.consumed_at || row.expires_at <= now.toISOString()) throw new AppError('expired')
    const update = database
      .prepare(
        `UPDATE unsubscribe_confirmations SET consumed_at = ?
         WHERE id = ? AND session_id = ? AND consumed_at IS NULL`,
      )
      .run(now.toISOString(), confirmationId, sessionId)
    if (update.changes !== 1) throw new AppError('expired')
    return JSON.parse(row.selections) as Selection[]
  })()

  const results: UnsubscribeResult[] = []
  for (const selection of selections) {
    try {
      await deleteSubscription(connection.accessToken, selection.subscriptionId)
      results.push({ ...publicSelection(selection), status: 'success' as const })
    } catch (error) {
      results.push({
        ...publicSelection(selection),
        status: 'failed' as const,
        failureCode: error instanceof AppError ? error.code : 'internal_error',
      })
    }
  }
  const insert = database.prepare(
    `INSERT INTO unsubscribe_results
     (confirmation_id, channel_id, title, status, failure_code, finished_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  database.transaction(() => {
    for (const result of results) {
      insert.run(
        confirmationId,
        result.channelId,
        result.title,
        result.status,
        result.status === 'failed' ? result.failureCode : null,
        new Date().toISOString(),
      )
    }
  })()
  return {
    results,
    successCount: results.filter((result) => result.status === 'success').length,
    failureCount: results.filter((result) => result.status === 'failed').length,
  }
}

function publicSelection(selection: Selection) {
  return { channelId: selection.channelId, title: selection.title }
}
