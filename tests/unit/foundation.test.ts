import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret, hashToken, tokenHashMatches } from '@/server/auth/crypto'
import {
  createBrowserSession,
  findBrowserSession,
  rotateCsrfToken,
} from '@/server/auth/session-repository'
import { parseServerEnv } from '@/server/env'
import { redactForTest } from '@/server/observability/logger'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'
import { TEST_ENCRYPTION_KEY } from '../fixtures/providers'

describe('foundation security', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.restoreAllMocks()
  })

  it('validates required environment without exposing values', () => {
    expect(() => parseServerEnv({ APP_BASE_URL: 'bad' })).toThrow(/APP_BASE_URL/)
  })

  it('encrypts with authenticated AES-256-GCM', () => {
    const encrypted = encryptSecret('access-token', TEST_ENCRYPTION_KEY)
    expect(encrypted.ciphertext.toString('utf8')).not.toContain('access-token')
    expect(decryptSecret(encrypted, TEST_ENCRYPTION_KEY)).toBe('access-token')
  })

  it('hashes and compares opaque tokens', () => {
    const hash = hashToken('opaque')
    expect(tokenHashMatches('opaque', hash)).toBe(true)
    expect(tokenHashMatches('different', hash)).toBe(false)
  })

  it('creates, finds, and rotates a browser session', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    const created = createBrowserSession(FIXED_NOW, fixture.database)
    expect(findBrowserSession(created.cookieToken, FIXED_NOW, fixture.database)?.id).toBe(
      created.session.id,
    )
    const rotated = rotateCsrfToken(created.session.id, fixture.database)
    expect(rotated.csrfTokenHash.equals(created.session.csrfTokenHash)).toBe(false)
  })

  it('redacts secret fields recursively', () => {
    expect(redactForTest({ accessToken: 'secret', nested: { subscriptionId: 'hidden' } })).toEqual({
      accessToken: '[REDACTED]',
      nested: { subscriptionId: '[REDACTED]' },
    })
  })
})
