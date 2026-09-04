import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { hashToken, randomToken } from './crypto'

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export type BrowserSession = {
  id: string
  csrfTokenHash: Buffer
  expiresAt: string
}

type SessionRow = {
  id: string
  csrf_token_hash: Buffer
  last_seen_at: string
  expires_at: string
}

export function createBrowserSession(
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { session: BrowserSession; cookieToken: string; csrfToken: string } {
  const id = uuidv7()
  const cookieToken = randomToken()
  const csrfToken = randomToken()
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString()
  database
    .prepare(
      `INSERT INTO browser_sessions
       (id, cookie_hash, csrf_token_hash, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      hashToken(cookieToken),
      hashToken(csrfToken),
      now.toISOString(),
      now.toISOString(),
      expiresAt,
    )
  return { session: { id, csrfTokenHash: hashToken(csrfToken), expiresAt }, cookieToken, csrfToken }
}

export function findBrowserSession(
  cookieToken: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): BrowserSession | null {
  const row = database
    .prepare(
      `SELECT id, csrf_token_hash, last_seen_at, expires_at
       FROM browser_sessions WHERE cookie_hash = ? AND expires_at > ?`,
    )
    .get(hashToken(cookieToken), now.toISOString()) as SessionRow | undefined
  if (!row) return null
  if (now.getTime() - new Date(row.last_seen_at).getTime() >= TOUCH_INTERVAL_MS) {
    database
      .prepare('UPDATE browser_sessions SET last_seen_at = ? WHERE id = ?')
      .run(now.toISOString(), row.id)
  }
  return { id: row.id, csrfTokenHash: row.csrf_token_hash, expiresAt: row.expires_at }
}

export function rotateCsrfToken(
  sessionId: string,
  database: AppDatabase = getDatabase(),
): { csrfToken: string; csrfTokenHash: Buffer } {
  const csrfToken = randomToken()
  const csrfTokenHash = hashToken(csrfToken)
  database
    .prepare('UPDATE browser_sessions SET csrf_token_hash = ? WHERE id = ?')
    .run(csrfTokenHash, sessionId)
  return { csrfToken, csrfTokenHash }
}

export function deleteBrowserSession(
  sessionId: string,
  database: AppDatabase = getDatabase(),
): void {
  database.prepare('DELETE FROM browser_sessions WHERE id = ?').run(sessionId)
}
