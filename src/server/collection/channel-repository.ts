import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import type { ChannelRecord } from '@/server/youtube/schemas'

export function nextChannelBatch(
  jobId: string,
  offset: number,
  database: AppDatabase = getDatabase(),
): Array<{ channelId: string; title: string; description: string; thumbnailUrl: string | null }> {
  return (
    database
      .prepare(
        `SELECT channel_id, source_title, source_description, source_thumbnail_url
         FROM subscriptions WHERE job_id = ? ORDER BY channel_id LIMIT 50 OFFSET ?`,
      )
      .all(jobId, offset) as Array<{
      channel_id: string
      source_title: string
      source_description: string
      source_thumbnail_url: string | null
    }>
  ).map((row) => ({
    channelId: row.channel_id,
    title: row.source_title,
    description: row.source_description,
    thumbnailUrl: row.source_thumbnail_url,
  }))
}

export function saveChannelBatch(
  jobId: string,
  requested: ReturnType<typeof nextChannelBatch>,
  received: ChannelRecord[],
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { ready: number; unavailable: number } {
  const byId = new Map(received.map((channel) => [channel.channelId, channel]))
  const upsert = database.prepare(
    `INSERT OR REPLACE INTO channel_profiles
     (job_id, channel_id, title, description, thumbnail_url, published_at,
      public_video_count, subscriber_count, view_count, uploads_playlist_id,
      detail_status, failure_code, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const state = database.prepare(
    `INSERT OR REPLACE INTO channel_collection_states
     (job_id, channel_id, status, updated_at) VALUES (?, ?, ?, ?)`,
  )
  return database.transaction(() => {
    let ready = 0
    let unavailable = 0
    for (const fallback of requested) {
      const channel = byId.get(fallback.channelId)
      if (channel) {
        upsert.run(
          jobId,
          channel.channelId,
          channel.title,
          channel.description,
          channel.thumbnailUrl,
          channel.publishedAt,
          channel.publicVideoCount,
          channel.subscriberCount,
          channel.viewCount,
          channel.uploadsPlaylistId,
          'ready',
          null,
          now.toISOString(),
        )
        state.run(jobId, channel.channelId, 'pending', now.toISOString())
        ready += 1
      } else {
        upsert.run(
          jobId,
          fallback.channelId,
          fallback.title,
          fallback.description,
          fallback.thumbnailUrl,
          null,
          null,
          null,
          null,
          null,
          'unavailable',
          'channel_unavailable',
          now.toISOString(),
        )
        state.run(jobId, fallback.channelId, 'failed', now.toISOString())
        unavailable += 1
      }
    }
    return { ready, unavailable }
  })()
}
