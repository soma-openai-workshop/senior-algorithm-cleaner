import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { getOAuthConnection } from '@/server/auth/oauth-repository'
import { getServerEnv } from '@/server/env'
import { AppError } from '@/server/http/errors'
import { listVideosBatch, searchPopularVideos } from '@/server/youtube/client'
import type { VideoDetailsRecord } from '@/server/youtube/schemas'
import type { VideoEvidence, VideoRiskJudgement } from './contracts'
import {
  extractVideoEvidence,
  geminiFailureCode,
  judgeThumbnailSimilarity,
  judgeVideoRisk,
} from './gemini'
import { getOwnedAnalysisJob, updateAnalysisProgress } from './job-repository'
import {
  aggregateContentRisk,
  ANALYSIS_POLICY_VERSION,
  buildOneLineReason,
  riskLevel,
  scoreSyntheticMedia,
  scoreUploadPattern,
  scaleThumbnailSimilarityRisk,
  scaleUploadPatternRisk,
} from './scoring'

type JobRow = {
  id: string
  collection_job_id: string
  status: string
}

type VideoWorkRow = {
  channel_id: string
  video_id: string
  title: string
  description: string
}

export async function advanceAnalysisJob(analysisJobId: string, sessionId: string) {
  const database = getDatabase()
  getOwnedAnalysisJob(analysisJobId, sessionId, new Date(), database)
  const row = database
    .prepare('SELECT id, collection_job_id, status FROM analysis_jobs WHERE id = ?')
    .get(analysisJobId) as JobRow
  const connection = getOAuthConnection(sessionId, new Date(), database)
  if (!connection) throw new AppError('reauth_required')

  if (row.status === 'preparing') {
    await prepareNextChannel(row, connection.accessToken, database)
  } else if (row.status === 'extracting_evidence') {
    await extractNextBatch(row, database)
  } else if (row.status === 'judging_content') {
    await judgeNextBatch(row, database)
  } else if (row.status === 'judging_thumbnails') {
    await judgeThumbnailBatch(row, database)
  } else if (row.status === 'finalizing') {
    finalizeAnalysis(row, database)
  }
  return getOwnedAnalysisJob(analysisJobId, sessionId, new Date(), database)
}

async function prepareNextChannel(row: JobRow, accessToken: string, database: AppDatabase) {
  const pending = database
    .prepare(
      `SELECT channel_id FROM analysis_channels
       WHERE analysis_job_id = ? AND preparation_status = 'pending' ORDER BY channel_id LIMIT 1`,
    )
    .get(row.id) as { channel_id: string } | undefined
  if (pending) {
    try {
      await prepareChannel(row, pending.channel_id, accessToken, database)
      database
        .prepare(
          `UPDATE analysis_channels SET preparation_status = 'ready'
           WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .run(row.id, pending.channel_id)
    } catch (error) {
      database
        .prepare(
          `UPDATE analysis_channels SET preparation_status = 'failed', failure_code = ?
           WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .run(errorCode(error), row.id, pending.channel_id)
      database
        .prepare(
          `UPDATE thumbnail_judgements SET status = 'failed', failure_code = ?
           WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .run(errorCode(error), row.id, pending.channel_id)
    }
  }
  const progress = preparationProgress(row.id, database)
  if (progress.pending === 0) {
    const total = countScalar(
      database,
      `SELECT COUNT(*) AS value FROM analysis_video_samples
       WHERE analysis_job_id = ? AND is_content_sample = 1`,
      row.id,
    )
    updateAnalysisProgress(
      { id: row.id, status: 'extracting_evidence', total, processed: 0, success: 0, failure: 0 },
      database,
    )
  } else {
    updateAnalysisProgress(
      {
        id: row.id,
        status: 'preparing',
        total: progress.total,
        processed: progress.complete,
        success: progress.ready,
        failure: progress.failed,
      },
      database,
    )
  }
}

async function prepareChannel(
  row: JobRow,
  channelId: string,
  accessToken: string,
  database: AppDatabase,
) {
  const latestRows = database
    .prepare(
      `SELECT video_id FROM upload_metadata
       WHERE job_id = ? AND channel_id = ? AND privacy_status = 'public'
       ORDER BY published_at DESC LIMIT 10`,
    )
    .all(row.collection_job_id, channelId) as Array<{ video_id: string }>
  const publishedAfter = new Date()
  publishedAfter.setUTCFullYear(publishedAfter.getUTCFullYear() - 1)
  const popular = await searchPopularVideos(accessToken, channelId, publishedAfter)
  const unionIds = [...new Set([...latestRows.map((item) => item.video_id), ...popular.videoIds])]
  if (unionIds.length === 0) throw new Error('video_unavailable')
  const details = await listVideosBatch(accessToken, unionIds)
  const byId = new Map(
    details.filter((item) => item.channelId === channelId).map((item) => [item.videoId, item]),
  )
  const latest = latestRows.map((item) => byId.get(item.video_id)).filter(isDefined)
  const contentLatest = latest.slice(0, 2)
  const contentIds = new Set(contentLatest.map((item) => item.videoId))
  const contentPopular: VideoDetailsRecord[] = []
  for (const videoId of popular.videoIds) {
    const detail = byId.get(videoId)
    if (!detail || contentIds.has(videoId)) continue
    contentPopular.push(detail)
    contentIds.add(videoId)
    if (contentIds.size === 5) break
  }
  const thumbnailIds = new Set(latest.slice(0, 3).map((item) => item.videoId))
  const ordered = [...contentLatest, ...contentPopular, ...latest.slice(0, 3)].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.videoId === item.videoId) === index,
  )
  const insert = database.prepare(
    `INSERT INTO analysis_video_samples
     (analysis_job_id, channel_id, video_id, sample_order, sample_role,
      is_content_sample, is_thumbnail_sample, title, description, published_at,
      view_count, thumbnail_url, contains_synthetic_media)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  database.transaction(() => {
    ordered.forEach((video, index) => {
      insert.run(
        row.id,
        channelId,
        video.videoId,
        index,
        contentLatest.some((item) => item.videoId === video.videoId) ? 'latest' : 'popular',
        contentIds.has(video.videoId) ? 1 : 0,
        thumbnailIds.has(video.videoId) ? 1 : 0,
        video.title,
        video.description,
        video.publishedAt,
        video.viewCount,
        video.thumbnailUrl,
        video.containsSyntheticMedia === null ? null : video.containsSyntheticMedia ? 1 : 0,
      )
    })
  })()
}

async function extractNextBatch(row: JobRow, database: AppDatabase) {
  const limit = getServerEnv().GEMINI_JUDGE_CONCURRENCY
  const work = database
    .prepare(
      `SELECT channel_id, video_id, title, description FROM analysis_video_samples
       WHERE analysis_job_id = ? AND is_content_sample = 1 AND evidence_status = 'pending'
       ORDER BY channel_id, sample_order LIMIT ?`,
    )
    .all(row.id, limit) as VideoWorkRow[]
  const results = await Promise.allSettled(work.map((item) => extractVideoEvidence(item.video_id)))
  database.transaction(() => {
    results.forEach((result, index) => {
      const item = work[index]
      if (result.status === 'fulfilled') {
        database
          .prepare(
            `INSERT INTO video_evidence
             (analysis_job_id, channel_id, video_id, payload, model, prompt_version, extracted_at)
             VALUES (?, ?, ?, ?, ?, 'evidence-extraction-v1', ?)`,
          )
          .run(
            row.id,
            item.channel_id,
            item.video_id,
            JSON.stringify(result.value),
            getServerEnv().GEMINI_JUDGE_MODEL,
            new Date().toISOString(),
          )
        database
          .prepare(
            `UPDATE analysis_video_samples SET evidence_status = 'complete'
             WHERE analysis_job_id = ? AND channel_id = ? AND video_id = ?`,
          )
          .run(row.id, item.channel_id, item.video_id)
      } else {
        database
          .prepare(
            `UPDATE analysis_video_samples
             SET evidence_status = 'failed', judgement_status = 'skipped', failure_code = ?
             WHERE analysis_job_id = ? AND channel_id = ? AND video_id = ?`,
          )
          .run(geminiFailureCode(result.reason), row.id, item.channel_id, item.video_id)
      }
    })
  })()
  updateVideoPhaseProgress(row.id, 'extracting_evidence', database)
  const remaining = countScalar(
    database,
    `SELECT COUNT(*) AS value FROM analysis_video_samples
     WHERE analysis_job_id = ? AND is_content_sample = 1 AND evidence_status = 'pending'`,
    row.id,
  )
  if (remaining === 0) {
    const total = countScalar(
      database,
      `SELECT COUNT(*) AS value FROM analysis_video_samples
       WHERE analysis_job_id = ? AND is_content_sample = 1 AND evidence_status = 'complete'`,
      row.id,
    )
    updateAnalysisProgress(
      { id: row.id, status: 'judging_content', total, processed: 0, success: 0, failure: 0 },
      database,
    )
  }
}

async function judgeNextBatch(row: JobRow, database: AppDatabase) {
  const limit = getServerEnv().GEMINI_JUDGE_CONCURRENCY
  const work = database
    .prepare(
      `SELECT s.channel_id, s.video_id, s.title, s.description, e.payload,
              p.title AS channel_title, p.description AS channel_description
       FROM analysis_video_samples s
       JOIN video_evidence e ON e.analysis_job_id = s.analysis_job_id
         AND e.channel_id = s.channel_id AND e.video_id = s.video_id
       JOIN analysis_jobs j ON j.id = s.analysis_job_id
       JOIN channel_profiles p ON p.job_id = j.collection_job_id AND p.channel_id = s.channel_id
       WHERE s.analysis_job_id = ? AND s.judgement_status = 'pending'
       ORDER BY s.channel_id, s.sample_order LIMIT ?`,
    )
    .all(row.id, limit) as Array<
    VideoWorkRow & {
      payload: string
      channel_title: string
      channel_description: string
    }
  >
  const results = await Promise.allSettled(
    work.map((item) =>
      judgeVideoRisk({
        evidence: JSON.parse(item.payload) as VideoEvidence,
        videoTitle: item.title,
        videoDescription: item.description,
        channelTitle: item.channel_title,
        channelDescription: item.channel_description,
      }),
    ),
  )
  database.transaction(() => {
    results.forEach((result, index) => {
      const item = work[index]
      if (result.status === 'fulfilled') {
        const judgement = result.value
        database
          .prepare(
            `INSERT INTO video_risk_judgements
             (analysis_job_id, channel_id, video_id, source_opacity, treatment_change,
              purchase_inducement, total_risk, payload, model, prompt_version, judged_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'content-risk-v1', ?)`,
          )
          .run(
            row.id,
            item.channel_id,
            item.video_id,
            judgement.riskPoints.sourceOpacity.points,
            judgement.riskPoints.treatmentChangeInducement.points,
            judgement.riskPoints.purchaseInducement.points,
            judgement.totalRiskPoints,
            JSON.stringify(judgement),
            getServerEnv().GEMINI_JUDGE_MODEL,
            new Date().toISOString(),
          )
        database
          .prepare(
            `UPDATE analysis_video_samples SET judgement_status = 'complete'
             WHERE analysis_job_id = ? AND channel_id = ? AND video_id = ?`,
          )
          .run(row.id, item.channel_id, item.video_id)
      } else {
        database
          .prepare(
            `UPDATE analysis_video_samples SET judgement_status = 'failed', failure_code = ?
             WHERE analysis_job_id = ? AND channel_id = ? AND video_id = ?`,
          )
          .run(geminiFailureCode(result.reason), row.id, item.channel_id, item.video_id)
      }
    })
  })()
  updateVideoPhaseProgress(row.id, 'judging_content', database)
  const remaining = countScalar(
    database,
    `SELECT COUNT(*) AS value FROM analysis_video_samples
     WHERE analysis_job_id = ? AND judgement_status = 'pending' AND evidence_status = 'complete'`,
    row.id,
  )
  if (remaining === 0) {
    const total = countScalar(
      database,
      `SELECT COUNT(*) AS value FROM thumbnail_judgements WHERE analysis_job_id = ?`,
      row.id,
    )
    updateAnalysisProgress(
      { id: row.id, status: 'judging_thumbnails', total, processed: 0, success: 0, failure: 0 },
      database,
    )
  }
}

async function judgeThumbnailBatch(row: JobRow, database: AppDatabase) {
  const limit = getServerEnv().GEMINI_JUDGE_CONCURRENCY
  const channels = database
    .prepare(
      `SELECT channel_id FROM thumbnail_judgements
       WHERE analysis_job_id = ? AND status = 'pending' ORDER BY channel_id LIMIT ?`,
    )
    .all(row.id, limit) as Array<{ channel_id: string }>
  const results = await Promise.allSettled(
    channels.map(async ({ channel_id: channelId }) => {
      const thumbnails = database
        .prepare(
          `SELECT video_id, thumbnail_url FROM analysis_video_samples
           WHERE analysis_job_id = ? AND channel_id = ? AND is_thumbnail_sample = 1
             AND thumbnail_url IS NOT NULL ORDER BY published_at DESC LIMIT 3`,
        )
        .all(row.id, channelId) as Array<{ video_id: string; thumbnail_url: string }>
      return judgeThumbnailSimilarity(
        thumbnails.map((item) => ({ videoId: item.video_id, url: item.thumbnail_url })),
      )
    }),
  )
  database.transaction(() => {
    results.forEach((result, index) => {
      const channelId = channels[index].channel_id
      if (result.status === 'fulfilled') {
        database
          .prepare(
            `UPDATE thumbnail_judgements SET status = 'complete', similarity_risk = ?, payload = ?,
             model = ?, prompt_version = 'thumbnail-similarity-v1', judged_at = ?
             WHERE analysis_job_id = ? AND channel_id = ?`,
          )
          .run(
            result.value.thumbnailSimilarity.riskPoints,
            JSON.stringify(result.value),
            getServerEnv().GEMINI_JUDGE_MODEL,
            new Date().toISOString(),
            row.id,
            channelId,
          )
      } else {
        database
          .prepare(
            `UPDATE thumbnail_judgements SET status = 'failed', failure_code = ?
             WHERE analysis_job_id = ? AND channel_id = ?`,
          )
          .run(geminiFailureCode(result.reason), row.id, channelId)
      }
    })
  })()
  const progress = statusProgress('thumbnail_judgements', row.id, database)
  if (progress.pending === 0) {
    updateAnalysisProgress(
      {
        id: row.id,
        status: 'finalizing',
        total: progress.total,
        processed: progress.complete + progress.failed,
        success: progress.complete,
        failure: progress.failed,
      },
      database,
    )
  } else {
    updateAnalysisProgress(
      {
        id: row.id,
        status: 'judging_thumbnails',
        total: progress.total,
        processed: progress.complete + progress.failed,
        success: progress.complete,
        failure: progress.failed,
      },
      database,
    )
  }
}

function finalizeAnalysis(row: JobRow, database: AppDatabase) {
  const channelIds = database
    .prepare(
      'SELECT channel_id FROM analysis_channels WHERE analysis_job_id = ? ORDER BY channel_id',
    )
    .all(row.id) as Array<{ channel_id: string }>
  let unavailable = 0
  database.transaction(() => {
    const insert = database.prepare(
      `INSERT OR REPLACE INTO channel_risk_results
       (analysis_job_id, channel_id, content_risk, factory_risk, combined_risk, risk_level,
        upload_pattern_risk, synthetic_media_risk, thumbnail_similarity_risk,
        successful_video_count, failed_video_count, reason, limitations, policy_version, calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const { channel_id: channelId } of channelIds) {
      const judgementRows = database
        .prepare(
          `SELECT payload FROM video_risk_judgements WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .all(row.id, channelId) as Array<{ payload: string }>
      const judgements = judgementRows.map((item) => JSON.parse(item.payload) as VideoRiskJudgement)
      const content = aggregateContentRisk(judgements)
      const uploadRows = database
        .prepare(
          `SELECT u.published_at FROM upload_metadata u JOIN analysis_jobs j ON j.collection_job_id = u.job_id
           WHERE j.id = ? AND u.channel_id = ? AND u.is_within_last_ninety_days = 1
             AND u.published_at IS NOT NULL`,
        )
        .all(row.id, channelId) as Array<{ published_at: string }>
      const upload = scoreUploadPattern(uploadRows.map((item) => item.published_at))
      const syntheticRows = database
        .prepare(
          `SELECT contains_synthetic_media FROM analysis_video_samples
           WHERE analysis_job_id = ? AND channel_id = ? AND is_content_sample = 1`,
        )
        .all(row.id, channelId) as Array<{ contains_synthetic_media: number | null }>
      const synthetic = scoreSyntheticMedia(
        syntheticRows.map((item) =>
          item.contains_synthetic_media === null ? null : item.contains_synthetic_media === 1,
        ),
      )
      const thumbnail = database
        .prepare(
          `SELECT status, similarity_risk, failure_code FROM thumbnail_judgements
           WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .get(row.id, channelId) as {
        status: string
        similarity_risk: number | null
        failure_code: string | null
      }
      const limitations: string[] = []
      if (upload.points === null) limitations.push('upload_sample_incomplete')
      if (syntheticRows.some((item) => item.contains_synthetic_media === null)) {
        limitations.push('synthetic_media_unknown')
      }
      const failedVideos = countScalar(
        database,
        `SELECT COUNT(*) AS value FROM analysis_video_samples
         WHERE analysis_job_id = ? AND channel_id = ? AND is_content_sample = 1
           AND judgement_status IN ('failed', 'skipped')`,
        row.id,
        channelId,
      )
      if (failedVideos > 0) limitations.push('video_analysis_partial')
      const calculable = content !== null && thumbnail.status === 'complete'
      const thumbnailPoints = thumbnail.similarity_risk ?? 0
      const uploadPoints = upload.points === null ? null : scaleUploadPatternRisk(upload.points)
      const thumbnailWeightedPoints = scaleThumbnailSimilarityRisk(thumbnailPoints)
      const factory = calculable ? (uploadPoints ?? 0) + synthetic + thumbnailWeightedPoints : null
      const combined = calculable ? content.points + (factory ?? 0) : null
      const level = riskLevel(combined)
      if (!calculable) {
        unavailable += 1
        limitations.push(thumbnail.failure_code ?? 'content_analysis_unavailable')
      }
      const reason = calculable
        ? buildOneLineReason(
            {
              ...content.contributions,
              uploadPattern: uploadPoints ?? 0,
              syntheticMedia: synthetic,
              thumbnailSimilarity: thumbnailWeightedPoints,
            },
            level,
          )
        : '일부 영상을 분석하지 못했습니다. 먼저 확인해 주세요.'
      insert.run(
        row.id,
        channelId,
        content?.points ?? null,
        factory,
        combined,
        level,
        uploadPoints,
        synthetic,
        thumbnail.status === 'complete' ? thumbnailWeightedPoints : null,
        judgements.length,
        failedVideos,
        reason,
        JSON.stringify(limitations),
        ANALYSIS_POLICY_VERSION,
        new Date().toISOString(),
      )
    }
  })()
  updateAnalysisProgress(
    {
      id: row.id,
      status: unavailable > 0 ? 'partial' : 'completed',
      total: channelIds.length,
      processed: channelIds.length,
      success: channelIds.length - unavailable,
      failure: unavailable,
      finished: true,
    },
    database,
  )
}

function updateVideoPhaseProgress(
  id: string,
  status: 'extracting_evidence' | 'judging_content',
  database: AppDatabase,
) {
  const field = status === 'extracting_evidence' ? 'evidence_status' : 'judgement_status'
  const rows = database
    .prepare(
      `SELECT ${field} AS status, COUNT(*) AS count FROM analysis_video_samples
       WHERE analysis_job_id = ? AND is_content_sample = 1 GROUP BY ${field}`,
    )
    .all(id) as Array<{ status: string; count: number }>
  const count = (value: string) => rows.find((item) => item.status === value)?.count ?? 0
  const total = rows.reduce((sum, item) => sum + item.count, 0)
  const success = count('complete')
  const failure = count('failed') + (status === 'judging_content' ? count('skipped') : 0)
  updateAnalysisProgress(
    { id, status, total, processed: success + failure, success, failure },
    database,
  )
}

function preparationProgress(id: string, database: AppDatabase) {
  const rows = database
    .prepare(
      `SELECT preparation_status AS status, COUNT(*) AS count FROM analysis_channels
       WHERE analysis_job_id = ? GROUP BY preparation_status`,
    )
    .all(id) as Array<{ status: string; count: number }>
  const count = (value: string) => rows.find((item) => item.status === value)?.count ?? 0
  return {
    total: rows.reduce((sum, item) => sum + item.count, 0),
    pending: count('pending'),
    ready: count('ready'),
    failed: count('failed'),
    complete: count('ready') + count('failed'),
  }
}

function statusProgress(table: 'thumbnail_judgements', id: string, database: AppDatabase) {
  const rows = database
    .prepare(
      `SELECT status, COUNT(*) AS count FROM ${table} WHERE analysis_job_id = ? GROUP BY status`,
    )
    .all(id) as Array<{ status: string; count: number }>
  const count = (value: string) => rows.find((item) => item.status === value)?.count ?? 0
  return {
    total: rows.reduce((sum, item) => sum + item.count, 0),
    pending: count('pending'),
    complete: count('complete'),
    failed: count('failed'),
  }
}

function countScalar(database: AppDatabase, sql: string, ...params: unknown[]) {
  return (database.prepare(sql).get(...params) as { value: number }).value
}

function errorCode(error: unknown) {
  return error instanceof AppError
    ? error.code
    : error instanceof Error
      ? error.message
      : 'internal_error'
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
