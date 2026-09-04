import 'server-only'
import type { AppDatabase } from '@/server/db/client'
import { getDatabase } from '@/server/db/client'
import { revokeGoogleToken } from './google-oauth'
import { getOAuthConnection } from './oauth-repository'
import { deleteBrowserSession } from './session-repository'

export async function disconnectSession(
  sessionId: string,
  database: AppDatabase = getDatabase(),
): Promise<{ localDataDeleted: true; providerRevoked: boolean }> {
  let accessToken: string | null = null
  try {
    accessToken = getOAuthConnection(sessionId, new Date(0), database)?.accessToken ?? null
  } catch {
    accessToken = null
  }
  const revocation = accessToken ? revokeGoogleToken(accessToken, 3000) : Promise.resolve(true)
  deleteBrowserSession(sessionId, database)
  return { localDataDeleted: true, providerRevoked: await revocation }
}
