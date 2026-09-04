import 'server-only'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import { getServerEnv } from '@/server/env'
import { AppError } from '@/server/http/errors'

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'

function client(redirectUri?: string): OAuth2Client {
  const env = getServerEnv()
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri)
}

export function oauthRedirectUri(): string {
  return `${getServerEnv().APP_BASE_URL}/api/oauth/callback`
}

export async function createGoogleAuthorization(state: string): Promise<{
  authorizationUrl: string
  codeVerifier: string
}> {
  const oauth = client(oauthRedirectUri())
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync()
  return {
    codeVerifier,
    authorizationUrl: oauth.generateAuthUrl({
      access_type: 'online',
      include_granted_scopes: true,
      scope: [YOUTUBE_SCOPE],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  }
}

export async function exchangeGoogleCode(input: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<{ accessToken: string; grantedScopes: string[]; expiresAt: Date }> {
  try {
    const { tokens } = await client(input.redirectUri).getToken({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    })
    const scopes = (tokens.scope ?? '').split(' ').filter(Boolean)
    if (!tokens.access_token || !tokens.expiry_date || !scopes.includes(YOUTUBE_SCOPE)) {
      throw new AppError('oauth_exchange_failed')
    }
    return {
      accessToken: tokens.access_token,
      grantedScopes: scopes,
      expiresAt: new Date(tokens.expiry_date),
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('oauth_exchange_failed')
  }
}

export async function revokeGoogleToken(accessToken: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}
