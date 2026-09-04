import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import type { UploadRecord } from '@/server/youtube/schemas'

export type UploadTarget = {
  channelId: string
  playlistId: string
  nextPageToken: string | null
  scannedCount: number
}

export function nextUploadTarget(
  jobId: string,
  database: AppDatabase = getDatabase(),
): UploadTarget | null {
  const row = database
    .prepare(
      `SELECT s.channel_id, p.uploads_playlist_id, s.next_page_token, s.scanned_count
       FROM channel_collection_states s
       JOIN channel_profiles p ON p.job_id = s.job_id AND p.channel_id = s.channel_id
       WHERE s.job_id = ? AND s.status IN ('pending', 'collecting')
       ORDER BY CASE s.status WHEN 'collecting' THEN 0 ELSE 1 END, s.channel_id LIMIT 1`,
    )
    .get(jobId) as
    | {
        channel_id: string
        uploads_playlist_id: string
        next_page_token: string | null
        scanned_count: number
      }
    | undefined
  return row
    ? {
        channelId: row.channel_id,
        playlistId: row.uploads_playlist_id,
        nextPageToken: row.next_page_token,
        scannedCount: row.scanned_count,
      }
    : null
}

export function saveUploadPage(
  input: {
    jobId: string
    target: UploadTarget
    items: UploadRecord[]
    excludedCount: number
    nextPageToken: string | null
    jobStartedAt: Date
    now?: Date
  },
  database: AppDatabase = getDatabase(),
): { done: boolean; truncated: boolean; stored: number } {
  const now = input.now ?? new Date()
  const scannedCount = input.target.scannedCount + input.items.length + input.excludedCount
  const cutoff = new Date(input.jobStartedAt.getTime() - 90 * 24 * 3_600_000)
  const sawOlder = input.items.some(
    (item) => item.publishedAt && new Date(item.publishedAt).getTime() < cutoff.getTime(),
  )
  const truncated = scannedCount >= 500
  const hasBoundary = scannedCount >= 20 && sawOlder
  const done = !input.nextPageToken || truncated || hasBoundary
  const insert = database.prepare(
    `INSERT OR REPLACE INTO upload_metadata
     (job_id, channel_id, video_id, title, description, published_at, playlist_position,
      privacy_status, is_latest_twenty, is_within_last_ninety_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'public', 0, ?, ?)`,
  )
  return database.transaction(() => {
    for (const item of input.items) {
      const recent = item.publishedAt
        ? new Date(item.publishedAt).getTime() >= cutoff.getTime()
        : false
      insert.run(
        input.jobId,
        input.target.channelId,
        item.videoId,
        item.title,
        item.description,
        item.publishedAt,
        item.playlistPosition,
        recent ? 1 : 0,
        now.toISOString(),
      )
    }
    database
      .prepare(
        `UPDATE upload_metadata SET is_latest_twenty = 0
         WHERE job_id = ? AND channel_id = ?`,
      )
      .run(input.jobId, input.target.channelId)
    database
      .prepare(
        `UPDATE upload_metadata SET is_latest_twenty = 1
         WHERE rowid IN (
           SELECT rowid FROM upload_metadata WHERE job_id = ? AND channel_id = ?
           ORDER BY CASE WHEN published_at IS NULL THEN 1 ELSE 0 END,
                    published_at DESC, playlist_position ASC, video_id LIMIT 20
         )`,
      )
      .run(input.jobId, input.target.channelId)
    if (done) {
      database
        .prepare(
          `DELETE FROM upload_metadata
           WHERE job_id = ? AND channel_id = ?
             AND is_latest_twenty = 0 AND is_within_last_ninety_days = 0`,
        )
        .run(input.jobId, input.target.channelId)
    }
    const stored = (
      database
        .prepare(
          'SELECT COUNT(*) AS count FROM upload_metadata WHERE job_id = ? AND channel_id = ?',
        )
        .get(input.jobId, input.target.channelId) as { count: number }
    ).count
    database
      .prepare(
        `UPDATE channel_collection_states SET status = ?, next_page_token = ?,
         scanned_count = MIN(500, ?), stored_count = ?, excluded_count = excluded_count + ?,
         latest_public_count = MIN(20, ?), saw_older_than_90_days = ?, updated_at = ?
         WHERE job_id = ? AND channel_id = ?`,
      )
      .run(
        done ? (truncated ? 'truncated' : 'complete') : 'collecting',
        done ? null : input.nextPageToken,
        scannedCount,
        stored,
        input.excludedCount,
        stored,
        sawOlder ? 1 : 0,
        now.toISOString(),
        input.jobId,
        input.target.channelId,
      )
    return { done, truncated, stored }
  })()
}
