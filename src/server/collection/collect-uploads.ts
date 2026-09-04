import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { listPlaylistItemsPage } from '@/server/youtube/client'
import { nextUploadTarget, saveUploadPage } from './upload-repository'

export async function collectUploadPage(
  jobId: string,
  accessToken: string,
  database: AppDatabase = getDatabase(),
) {
  const target = nextUploadTarget(jobId, database)
  if (!target) return { finished: true, processed: 0, excluded: 0 }
  const page = await listPlaylistItemsPage(accessToken, target.playlistId, target.nextPageToken)
  const started = database
    .prepare('SELECT started_at FROM collection_jobs WHERE id = ?')
    .get(jobId) as {
    started_at: string | null
  }
  saveUploadPage(
    {
      jobId,
      target,
      items: page.items,
      excludedCount: page.excludedCount,
      nextPageToken: page.nextPageToken,
      jobStartedAt: new Date(started.started_at ?? Date.now()),
    },
    database,
  )
  return {
    finished: nextUploadTarget(jobId, database) === null,
    processed: page.items.length,
    excluded: page.excludedCount,
  }
}
