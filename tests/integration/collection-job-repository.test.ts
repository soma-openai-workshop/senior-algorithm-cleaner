import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrowserSession } from '@/server/auth/session-repository'
import { createOrGetJob, getOwnedJob } from '@/server/collection/job-repository'
import {
  insertSubscriptions,
  listSafeSubscriptions,
} from '@/server/collection/subscription-repository'
import { resetServerEnvForTests } from '@/server/env'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('collection repositories', () => {
  const cleanups: Array<() => void> = []
  beforeEach(() => {
    process.env.APP_BASE_URL = 'http://localhost:3000'
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.SESSION_SECRET = 'x'.repeat(32)
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    resetServerEnvForTests()
  })
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  it('returns one active job and hides foreign jobs', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const owner = createBrowserSession(FIXED_NOW, fixture.database)
    const foreign = createBrowserSession(FIXED_NOW, fixture.database)
    const first = createOrGetJob(owner.session.id, false, FIXED_NOW, fixture.database)
    const second = createOrGetJob(owner.session.id, false, FIXED_NOW, fixture.database)
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.job.id).toBe(first.job.id)
    expect(() =>
      getOwnedJob(first.job.id, foreign.session.id, FIXED_NOW, fixture.database),
    ).toThrow('not_found')
  })

  it('deduplicates channels and never serializes subscriptionId', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const owner = createBrowserSession(FIXED_NOW, fixture.database)
    const job = createOrGetJob(owner.session.id, false, FIXED_NOW, fixture.database).job
    const stored = insertSubscriptions(
      job.id,
      [
        {
          subscriptionId: 'secret-a',
          channelId: 'channel-a',
          subscribedAt: null,
          title: 'A',
          description: '',
          thumbnailUrl: null,
        },
        {
          subscriptionId: 'secret-b',
          channelId: 'channel-a',
          subscribedAt: null,
          title: 'A2',
          description: '',
          thumbnailUrl: null,
        },
      ],
      FIXED_NOW,
      fixture.database,
    )
    expect(stored).toEqual({ inserted: 1, duplicates: 1 })
    const safe = listSafeSubscriptions(job.id, null, 50, fixture.database)
    expect(JSON.stringify(safe)).not.toContain('secret-a')
    expect(JSON.stringify(safe)).not.toContain('subscriptionId')
  })
})
