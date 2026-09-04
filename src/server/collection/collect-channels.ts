import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { listChannelsBatch } from '@/server/youtube/client'
import { nextChannelBatch, saveChannelBatch } from './channel-repository'

export async function collectChannelBatch(
  jobId: string,
  accessToken: string,
  offset: number,
  database: AppDatabase = getDatabase(),
) {
  const requested = nextChannelBatch(jobId, offset, database)
  if (requested.length === 0)
    return { finished: true, nextOffset: offset, ready: 0, unavailable: 0 }
  const received = await listChannelsBatch(
    accessToken,
    requested.map((channel) => channel.channelId),
  )
  const saved = saveChannelBatch(jobId, requested, received, new Date(), database)
  const total = (
    database.prepare('SELECT COUNT(*) AS count FROM subscriptions WHERE job_id = ?').get(jobId) as {
      count: number
    }
  ).count
  return {
    finished: offset + requested.length >= total,
    nextOffset: offset + requested.length,
    ...saved,
  }
}
