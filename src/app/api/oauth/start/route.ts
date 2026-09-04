import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { randomToken } from '@/server/auth/crypto'
import { createGoogleAuthorization, oauthRedirectUri } from '@/server/auth/google-oauth'
import { createOAuthAttempt } from '@/server/auth/oauth-repository'
import { requireBrowserSession } from '@/server/auth/request-session'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const state = randomToken()
    const authorization = await createGoogleAuthorization(state)
    createOAuthAttempt({
      sessionId: session.id,
      state,
      codeVerifier: authorization.codeVerifier,
      redirectUri: oauthRedirectUri(),
    })
    return NextResponse.json({ authorizationUrl: authorization.authorizationUrl })
  } catch (error) {
    return errorResponse(error)
  }
}
