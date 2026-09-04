import 'server-only'
import { getOAuthConnection } from '@/server/auth/oauth-repository'
import { getDatabase } from '@/server/db/client'
import { AppError } from '@/server/http/errors'
import { listSubscriptionsPage } from '@/server/youtube/client'
import { classifyChannel } from '@/server/health-candidate/classify'
import { collectChannelBatch } from './collect-channels'
import { collectUploadPage } from './collect-uploads'
import { nextUnclassifiedChannels } from './classification-repository'
import {
  advanceJobPhase,
  claimJobLease,
  finishJob,
  finishSubscriptionPage,
  getJobState,
  getOwnedJob,
  releaseLeaseAsFailed,
} from './job-repository'
import { insertSubscriptions } from './subscription-repository'
import { recordCollectionFailure } from './failure-repository'
import { isRetryableProviderError } from '@/server/youtube/retry'

export async function advanceCollectionJob(jobId: string, sessionId: string) {
  const database = getDatabase()
  const connection = getOAuthConnection(sessionId, new Date(), database)
  if (!connection) throw new AppError('reauth_required')
  const state = getJobState(jobId, sessionId, database)
  const lease = claimJobLease(jobId, sessionId, new Date(), database)
  try {
    if (state.phase === 'collecting_subscriptions') {
      const page = await listSubscriptionsPage(
        connection.accessToken,
        (lease.checkpoint.nextPageToken as string | null | undefined) ?? null,
      )
      database.transaction(() => {
        const stored = insertSubscriptions(jobId, page.items, new Date(), database)
        finishSubscriptionPage(
          {
            jobId,
            leaseOwner: lease.leaseOwner,
            nextPageToken: page.nextPageToken,
            totalResults: page.totalResults,
            inserted: stored.inserted,
            duplicates: stored.duplicates,
            finished: page.nextPageToken === null,
          },
          database,
        )
      })()
    } else if (state.phase === 'collecting_channels') {
      const result = await collectChannelBatch(
        jobId,
        connection.accessToken,
        Number(lease.checkpoint.nextBatchOffset ?? 0),
        database,
      )
      advanceJobPhase(
        {
          jobId,
          leaseOwner: lease.leaseOwner,
          status: result.finished ? 'collecting_uploads' : 'collecting_channels',
          checkpoint: result.finished ? {} : { nextBatchOffset: result.nextOffset },
          failureDelta: result.unavailable,
        },
        database,
      )
    } else if (state.phase === 'collecting_uploads') {
      const result = await collectUploadPage(jobId, connection.accessToken, database)
      advanceJobPhase(
        {
          jobId,
          leaseOwner: lease.leaseOwner,
          status: result.finished ? 'classifying_candidates' : 'collecting_uploads',
          checkpoint: {},
          processedDelta: result.processed,
          excludedDelta: result.excluded,
        },
        database,
      )
    } else if (state.phase === 'classifying_candidates') {
      const channelIds = nextUnclassifiedChannels(jobId, 25, database)
      for (const channelId of channelIds) classifyChannel(jobId, channelId, new Date(), database)
      const finished = nextUnclassifiedChannels(jobId, 1, database).length === 0
      if (finished) {
        const failures = database
          .prepare('SELECT failure_count FROM collection_jobs WHERE id = ?')
          .get(jobId) as { failure_count: number }
        finishJob(jobId, lease.leaseOwner, failures.failure_count > 0, new Date(), database)
      } else {
        advanceJobPhase(
          {
            jobId,
            leaseOwner: lease.leaseOwner,
            status: 'classifying_candidates',
            checkpoint: {},
          },
          database,
        )
      }
    }
    return getOwnedJob(jobId, sessionId, new Date(), database)
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'internal_error'
    const stage =
      state.phase === 'classifying_candidates'
        ? 'classification'
        : (state.phase.replace('collecting_', '') as 'subscriptions' | 'channels' | 'uploads')
    recordCollectionFailure(
      {
        jobId,
        stage,
        subjectType: state.phase === 'collecting_uploads' ? 'channel' : 'page',
        code,
        retryable: isRetryableProviderError(code),
      },
      database,
    )
    releaseLeaseAsFailed(
      jobId,
      lease.leaseOwner,
      error instanceof AppError &&
        ['reauth_required', 'provider_schema_invalid'].includes(error.code),
      new Date(),
      database,
    )
    throw error
  }
}
