import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrowserSession } from '@/server/auth/session-repository'
import { claimJobLease, createOrGetJob } from '@/server/collection/job-repository'
import { resetServerEnvForTests } from '@/server/env'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('collection job lease', () => {
  const cleanups: Array<() => void> = []
  beforeEach(() => {
    process.env.APP_BASE_URL = 'http://localhost:3000'
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.SESSION_SECRET = 'x'.repeat(32)
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64')
    resetServerEnvForTests()
  })
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  it('rejects a competing lease and permits takeover after 30 seconds', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    const job = createOrGetJob(session.session.id, false, FIXED_NOW, fixture.database).job
    claimJobLease(job.id, session.session.id, FIXED_NOW, fixture.database)
    expect(() => claimJobLease(job.id, session.session.id, FIXED_NOW, fixture.database)).toThrow(
      'already_advancing',
    )
    expect(() =>
      claimJobLease(
        job.id,
        session.session.id,
        new Date(FIXED_NOW.getTime() + 30_001),
        fixture.database,
      ),
    ).not.toThrow()
  })

  it('atomically abandons an interrupted job when restarting', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    const first = createOrGetJob(session.session.id, false, FIXED_NOW, fixture.database).job
    fixture.database
      .prepare("UPDATE collection_jobs SET status = 'interrupted' WHERE id = ?")
      .run(first.id)
    const second = createOrGetJob(session.session.id, true, FIXED_NOW, fixture.database)
    expect(second.created).toBe(true)
    expect(second.job.id).not.toBe(first.id)
    expect(
      (
        fixture.database
          .prepare('SELECT status FROM collection_jobs WHERE id = ?')
          .get(first.id) as { status: string }
      ).status,
    ).toBe('abandoned')
  })
})
