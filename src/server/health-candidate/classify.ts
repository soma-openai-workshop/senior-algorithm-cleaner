import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { classifyHealthCandidate } from './policy-v1'

export function classifyChannel(
  jobId: string,
  channelId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
) {
  const channel = database
    .prepare('SELECT title, description FROM channel_profiles WHERE job_id = ? AND channel_id = ?')
    .get(jobId, channelId) as { title: string; description: string }
  const videos = database
    .prepare(
      `SELECT video_id, title, description FROM upload_metadata
       WHERE job_id = ? AND channel_id = ? AND is_latest_twenty = 1
       ORDER BY published_at DESC, playlist_position ASC LIMIT 20`,
    )
    .all(jobId, channelId) as Array<{ video_id: string; title: string; description: string }>
  const result = classifyHealthCandidate({
    channelTitle: channel.title,
    channelDescription: channel.description,
    videos: videos.map((video) => ({
      videoId: video.video_id,
      title: video.title,
      description: video.description,
    })),
  })
  database
    .prepare(
      `INSERT OR REPLACE INTO health_candidate_classifications
       (job_id, channel_id, is_candidate, policy_version, sample_status, matched_signals, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      jobId,
      channelId,
      result.isCandidate ? 1 : 0,
      result.policyVersion,
      videos.length === 0 ? 'no_uploads' : videos.length < 3 ? 'limited' : 'sufficient',
      JSON.stringify(result.matchedSignals),
      now.toISOString(),
    )
  return result
}
