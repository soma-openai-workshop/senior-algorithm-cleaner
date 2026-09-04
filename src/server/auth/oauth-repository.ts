import 'server-only'
import { v7 as uuidv7 } from 'uuid'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { AppError } from '@/server/http/errors'
import { decryptSecret, encryptSecret, hashToken, type EncryptedSecret } from './crypto'

type OAuthAttemptRow = {
  code_verifier_ciphertext: Buffer
  code_verifier_iv: Buffer
  code_verifier_auth_tag: Buffer
  redirect_uri: string
}

type OAuthConnectionRow = {
  token_ciphertext: Buffer
  token_iv: Buffer
  token_auth_tag: Buffer
  granted_scopes: string
  token_type: string
  expires_at: string
}

export function createOAuthAttempt(
  input: {
    sessionId: string
    state: string
    codeVerifier: string
    redirectUri: string
    now?: Date
  },
  database: AppDatabase = getDatabase(),
): void {
  const now = input.now ?? new Date()
  const encrypted = encryptSecret(input.codeVerifier)
  database
    .prepare(
      `INSERT INTO oauth_attempts
       (id, session_id, state_hash, code_verifier_ciphertext, code_verifier_iv,
        code_verifier_auth_tag, redirect_uri, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uuidv7(),
      input.sessionId,
      hashToken(input.state),
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      input.redirectUri,
      now.toISOString(),
      new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    )
}

export function consumeOAuthAttempt(
  input: { sessionId: string; state: string; now?: Date },
  database: AppDatabase = getDatabase(),
): { codeVerifier: string; redirectUri: string } {
  const now = input.now ?? new Date()
  const consume = database.transaction(() => {
    const result = database
      .prepare(
        `UPDATE oauth_attempts SET consumed_at = ?
         WHERE session_id = ? AND state_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
      )
      .run(now.toISOString(), input.sessionId, hashToken(input.state), now.toISOString())
    if (result.changes !== 1) throw new AppError('oauth_state_invalid')
    return database
      .prepare(
        `SELECT code_verifier_ciphertext, code_verifier_iv, code_verifier_auth_tag, redirect_uri
         FROM oauth_attempts WHERE session_id = ? AND state_hash = ?`,
      )
      .get(input.sessionId, hashToken(input.state)) as OAuthAttemptRow
  })
  const row = consume()
  return {
    codeVerifier: decryptSecret({
      ciphertext: row.code_verifier_ciphertext,
      iv: row.code_verifier_iv,
      authTag: row.code_verifier_auth_tag,
    }),
    redirectUri: row.redirect_uri,
  }
}

export function saveOAuthConnection(
  input: {
    sessionId: string
    accessToken: string
    grantedScopes: string[]
    expiresAt: Date
    now?: Date
  },
  database: AppDatabase = getDatabase(),
): void {
  const encrypted = encryptSecret(input.accessToken)
  database
    .prepare(
      `INSERT INTO oauth_connections
       (session_id, token_ciphertext, token_iv, token_auth_tag, granted_scopes,
        token_type, expires_at, connected_at)
       VALUES (?, ?, ?, ?, ?, 'Bearer', ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         token_ciphertext = excluded.token_ciphertext,
         token_iv = excluded.token_iv,
         token_auth_tag = excluded.token_auth_tag,
         granted_scopes = excluded.granted_scopes,
         expires_at = excluded.expires_at,
         connected_at = excluded.connected_at`,
    )
    .run(
      input.sessionId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      [...new Set(input.grantedScopes)].sort().join(' '),
      input.expiresAt.toISOString(),
      (input.now ?? new Date()).toISOString(),
    )
}

export function getOAuthConnection(
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): { accessToken: string; grantedScopes: string[]; expiresAt: string } | null {
  const row = database
    .prepare(
      `SELECT token_ciphertext, token_iv, token_auth_tag, granted_scopes, token_type, expires_at
       FROM oauth_connections WHERE session_id = ?`,
    )
    .get(sessionId) as OAuthConnectionRow | undefined
  if (!row) return null
  if (row.token_type !== 'Bearer' || row.expires_at <= now.toISOString()) {
    throw new AppError('reauth_required')
  }
  const secret: EncryptedSecret = {
    ciphertext: row.token_ciphertext,
    iv: row.token_iv,
    authTag: row.token_auth_tag,
  }
  return {
    accessToken: decryptSecret(secret),
    grantedScopes: row.granted_scopes.split(' ').filter(Boolean),
    expiresAt: row.expires_at,
  }
}

export function hasOAuthConnection(
  sessionId: string,
  now = new Date(),
  database: AppDatabase = getDatabase(),
): boolean {
  const row = database
    .prepare('SELECT expires_at FROM oauth_connections WHERE session_id = ?')
    .get(sessionId) as { expires_at: string } | undefined
  return Boolean(row && row.expires_at > now.toISOString())
}
