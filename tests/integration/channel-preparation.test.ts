import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrowserSession } from '@/server/auth/session-repository'
import { saveChannelBatch } from '@/server/collection/channel-repository'
import { createOrGetJob } from '@/server/collection/job-repository'
import { listCollectionResults } from '@/server/collection/results'
import { insertSubscriptions } from '@/server/collection/subscription-repository'
import { saveUploadPage } from '@/server/collection/upload-repository'
import { resetServerEnvForTests } from '@/server/env'
import { classifyChannel } from '@/server/health-candidate/classify'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('channel preparation pipeline', () => {
  const cleanups: Array<() => void> = []
  beforeEach(() => {
    process.env.APP_BASE_URL = 'http://localhost:3000'
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.SESSION_SECRET = 'x'.repeat(32)
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64')
    resetServerEnvForTests()
  })
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  it('prepares a candidate without exposing secrets or score fields', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    const job = createOrGetJob(session.session.id, false, FIXED_NOW, fixture.database).job
    insertSubscriptions(
      job.id,
      [
        {
          subscriptionId: 'provider-secret-id',
          channelId: 'channel-1',
          subscribedAt: null,
          title: '일상 채널',
          description: '',
          thumbnailUrl: null,
        },
      ],
      FIXED_NOW,
      fixture.database,
    )
    saveChannelBatch(
      job.id,
      [{ channelId: 'channel-1', title: '일상 채널', description: '', thumbnailUrl: null }],
      [
        {
          channelId: 'channel-1',
          title: '일상 채널',
          description: '',
          thumbnailUrl: null,
          publishedAt: null,
          publicVideoCount: '2',
          subscriberCount: '10',
          viewCount: '20',
          uploadsPlaylistId: 'UU-1',
        },
      ],
      FIXED_NOW,
      fixture.database,
    )
    saveUploadPage(
      {
        jobId: job.id,
        target: {
          channelId: 'channel-1',
          playlistId: 'UU-1',
          nextPageToken: null,
          scannedCount: 0,
        },
        items: [
          {
            videoId: 'v1',
            title: '혈압 기록하기',
            description: '',
            publishedAt: '2026-09-03T00:00:00Z',
            playlistPosition: 0,
            privacyStatus: 'public',
          },
          {
            videoId: 'v2',
            title: '걷기 운동',
            description: '',
            publishedAt: '2026-09-02T00:00:00Z',
            playlistPosition: 1,
            privacyStatus: 'public',
          },
        ],
        excludedCount: 0,
        nextPageToken: null,
        jobStartedAt: FIXED_NOW,
        now: FIXED_NOW,
      },
      fixture.database,
    )
    classifyChannel(job.id, 'channel-1', FIXED_NOW, fixture.database)
    const serialized = JSON.stringify(listCollectionResults(job.id, null, 50, fixture.database))
    expect(serialized).not.toContain('provider-secret-id')
    expect(serialized).not.toContain('subscriptionId')
    expect(serialized).not.toMatch(/riskScore|factoryScore|contentRisk/i)
    expect(JSON.parse(serialized).items[0].candidate).toBe(true)
  })
})
