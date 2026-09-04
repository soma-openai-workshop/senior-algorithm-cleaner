import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import type { VideoRiskJudgement } from './contracts'
import { aggregateContentRisk, buildOneLineReason } from './scoring'

type AnalysisResultRow = {
  channel_id: string
  title: string
  thumbnail_url: string | null
  subscribed_at: string | null
  content_risk: number | null
  factory_risk: number | null
  combined_risk: number | null
  risk_level: 'normal' | 'warning' | 'danger' | 'unavailable'
  upload_pattern_risk: number | null
  synthetic_media_risk: number | null
  thumbnail_similarity_risk: number | null
  successful_video_count: number
  failed_video_count: number
  reason: string
  limitations: string
}

export function listAnalysisResults(analysisJobId: string, database: AppDatabase = getDatabase()) {
  const rows = database
    .prepare(
      `SELECT r.channel_id, p.title, p.thumbnail_url, s.subscribed_at,
              r.content_risk, r.factory_risk, r.combined_risk, r.risk_level,
              r.upload_pattern_risk, r.synthetic_media_risk, r.thumbnail_similarity_risk,
              r.successful_video_count, r.failed_video_count, r.reason, r.limitations
       FROM channel_risk_results r
       JOIN analysis_jobs j ON j.id = r.analysis_job_id
       JOIN channel_profiles p ON p.job_id = j.collection_job_id AND p.channel_id = r.channel_id
       LEFT JOIN subscriptions s ON s.job_id = j.collection_job_id AND s.channel_id = r.channel_id
       WHERE r.analysis_job_id = ?
       ORDER BY (r.combined_risk IS NOT NULL) ASC, r.combined_risk DESC, p.title ASC`,
    )
    .all(analysisJobId) as AnalysisResultRow[]
  return {
    items: rows.map((row) => {
      const judgements = database
        .prepare(
          `SELECT payload FROM video_risk_judgements
           WHERE analysis_job_id = ? AND channel_id = ?`,
        )
        .all(analysisJobId, row.channel_id) as Array<{ payload: string }>
      const content = aggregateContentRisk(
        judgements.map((item) => JSON.parse(item.payload) as VideoRiskJudgement),
      )
      const reason =
        content && row.combined_risk !== null
          ? buildOneLineReason(
              {
                ...content.contributions,
                uploadPattern: row.upload_pattern_risk ?? 0,
                syntheticMedia: row.synthetic_media_risk ?? 0,
                thumbnailSimilarity: row.thumbnail_similarity_risk ?? 0,
              },
              row.risk_level,
            )
          : row.reason
      return {
        channelId: row.channel_id,
        title: row.title,
        thumbnailUrl: row.thumbnail_url,
        subscribedAt: row.subscribed_at,
        contentRisk: row.content_risk,
        factoryRisk: row.factory_risk,
        combinedRisk: row.combined_risk,
        riskLevel: row.risk_level,
        reason,
        successfulVideoCount: row.successful_video_count,
        failedVideoCount: row.failed_video_count,
        limitations: JSON.parse(row.limitations) as string[],
      }
    }),
  }
}
