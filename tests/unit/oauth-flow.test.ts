import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrowserSession } from '@/server/auth/session-repository'
import {
  consumeOAuthAttempt,
  createOAuthAttempt,
  getOAuthConnection,
  saveOAuthConnection,
} from '@/server/auth/oauth-repository'
import { resetServerEnvForTests } from '@/server/env'
import { AppError } from '@/server/http/errors'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('OAuth persistence contract', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    process.env.APP_BASE_URL = 'http://localhost:3000'
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    process.env.SESSION_SECRET = 'x'.repeat(32)
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    process.env.DATABASE_PATH = ':memory:'
    resetServerEnvForTests()
  })

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    resetServerEnvForTests()
  })

  it('consumes state once and rejects replay', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    createOAuthAttempt(
      {
        sessionId: session.session.id,
        state: 'one-time-state',
        codeVerifier: 'pkce-verifier',
        redirectUri: 'http://localhost:3000/api/oauth/callback',
        now: FIXED_NOW,
      },
      fixture.database,
    )
    expect(
      consumeOAuthAttempt(
        { sessionId: session.session.id, state: 'one-time-state', now: FIXED_NOW },
        fixture.database,
      ).codeVerifier,
    ).toBe('pkce-verifier')
    expect(() =>
      consumeOAuthAttempt(
        { sessionId: session.session.id, state: 'one-time-state', now: FIXED_NOW },
        fixture.database,
      ),
    ).toThrow(AppError)
  })

  it('rejects expired and foreign-session state without revealing ownership', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const owner = createBrowserSession(FIXED_NOW, fixture.database)
    const foreign = createBrowserSession(FIXED_NOW, fixture.database)
    createOAuthAttempt(
      {
        sessionId: owner.session.id,
        state: 'state',
        codeVerifier: 'verifier',
        redirectUri: 'http://localhost:3000/api/oauth/callback',
        now: FIXED_NOW,
      },
      fixture.database,
    )
    expect(() =>
      consumeOAuthAttempt(
        { sessionId: foreign.session.id, state: 'state', now: FIXED_NOW },
        fixture.database,
      ),
    ).toThrow('oauth_state_invalid')
    expect(() =>
      consumeOAuthAttempt(
        {
          sessionId: owner.session.id,
          state: 'state',
          now: new Date(FIXED_NOW.getTime() + 11 * 60 * 1000),
        },
        fixture.database,
      ),
    ).toThrow('oauth_state_invalid')
  })

  it('stores the access token encrypted and enforces expiry', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const session = createBrowserSession(FIXED_NOW, fixture.database)
    saveOAuthConnection(
      {
        sessionId: session.session.id,
        accessToken: 'provider-access-token',
        grantedScopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
        expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
        now: FIXED_NOW,
      },
      fixture.database,
    )
    const raw = fixture.database
      .prepare('SELECT token_ciphertext FROM oauth_connections WHERE session_id = ?')
      .get(session.session.id) as { token_ciphertext: Buffer }
    expect(raw.token_ciphertext.toString('utf8')).not.toContain('provider-access-token')
    expect(getOAuthConnection(session.session.id, FIXED_NOW, fixture.database)?.accessToken).toBe(
      'provider-access-token',
    )
    expect(() =>
      getOAuthConnection(
        session.session.id,
        new Date(FIXED_NOW.getTime() + 3_600_001),
        fixture.database,
      ),
    ).toThrow('reauth_required')
  })
})
