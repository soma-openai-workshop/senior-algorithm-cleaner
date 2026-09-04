import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserSession } from '@/server/auth/session-repository'
import { cleanupExpiredData } from '@/server/db/cleanup'
import { FIXED_NOW } from '../fixtures/clock'
import { temporaryDatabase } from '../fixtures/database'

describe('TTL cleanup', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  it('deletes expired sessions and their complete child graph', () => {
    const fixture = temporaryDatabase()
    cleanups.push(fixture.cleanup)
    createBrowserSession(FIXED_NOW, fixture.database)
    const later = new Date(FIXED_NOW.getTime() + 25 * 60 * 60 * 1000)
    expect(cleanupExpiredData(later, fixture.database).sessions).toBe(1)
    expect(
      (
        fixture.database.prepare('SELECT COUNT(*) AS count FROM browser_sessions').get() as {
          count: number
        }
      ).count,
    ).toBe(0)
  })
})
