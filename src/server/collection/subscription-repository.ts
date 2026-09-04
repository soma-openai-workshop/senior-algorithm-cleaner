import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import type { SubscriptionRecord } from '@/server/youtube/schemas'

export function insertSubscriptions(
  jobId: string,
  items: SubscriptionRecord[],
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { inserted: number; duplicates: number } {
  const insert = database.prepare(
    `INSERT OR IGNORE INTO subscriptions
     (job_id, subscription_id, channel_id, subscribed_at, source_title,
      source_description, source_thumbnail_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  return database.transaction(() => {
    let inserted = 0
    for (const item of items) {
      const result = insert.run(
        jobId,
        item.subscriptionId,
        item.channelId,
        item.subscribedAt,
        item.title,
        item.description,
        item.thumbnailUrl,
        now.toISOString(),
      )
      inserted += result.changes
    }
    return { inserted, duplicates: items.length - inserted }
  })()
}

export function listSafeSubscriptions(
  jobId: string,
  cursor: string | null,
  limit: number,
  database: AppDatabase = getDatabase(),
) {
  const rows = database
    .prepare(
      `SELECT channel_id, subscribed_at, source_title, source_description, source_thumbnail_url
       FROM subscriptions WHERE job_id = ? AND (? IS NULL OR channel_id > ?)
       ORDER BY channel_id LIMIT ?`,
    )
    .all(jobId, cursor, cursor, limit + 1) as Array<{
    channel_id: string
    subscribed_at: string | null
    source_title: string
    source_description: string
    source_thumbnail_url: string | null
  }>
  const hasNext = rows.length > limit
  const page = rows.slice(0, limit)
  return {
    items: page.map((row) => ({
      channelId: row.channel_id,
      subscribedAt: row.subscribed_at,
      title: row.source_title,
      description: row.source_description,
      thumbnailUrl: row.source_thumbnail_url,
    })),
    nextCursor: hasNext ? (page.at(-1)?.channel_id ?? null) : null,
  }
}
