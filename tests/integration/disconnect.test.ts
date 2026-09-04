import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disconnectSession } from '@/server/auth/disconnect'
import { saveOAuthConnection } from '@/server/auth/oauth-repository'
import { createBrowserSession } from '@/server/auth/session-repository'
import { createOrGetJob } from '@/server/collection/job-repository'
import { resetServerEnvForTests } from '@/server/env'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('disconnect', () => {
  const cleanups: Array<() => void> = []
  beforeEach(() => {
    process.env.APP_BASE_URL = 'http://localhost:3000'
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.SESSION_SECRET = 'x'.repeat(32)
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
    resetServerEnvForTests()
  })
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.unstubAllGlobals()
  })

  it('deletes the complete local graph even when provider revocation fails', async () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    saveOAuthConnection(
      {
        sessionId: session.session.id,
        accessToken: 'token',
        grantedScopes: ['scope'],
        expiresAt: new Date(FIXED_NOW.getTime() + 1000),
        now: FIXED_NOW,
      },
      fixture.database,
    )
    createOrGetJob(session.session.id, false, FIXED_NOW, fixture.database)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const result = await disconnectSession(session.session.id, fixture.database)
    expect(result).toEqual({ localDataDeleted: true, providerRevoked: false })
    expect(
      (
        fixture.database.prepare('SELECT COUNT(*) AS count FROM browser_sessions').get() as {
          count: number
        }
      ).count,
    ).toBe(0)
    expect(
      (
        fixture.database.prepare('SELECT COUNT(*) AS count FROM collection_jobs').get() as {
          count: number
        }
      ).count,
    ).toBe(0)
  })
})
