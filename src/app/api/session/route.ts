import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { hasOAuthConnection } from '@/server/auth/oauth-repository'
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/server/auth/session-cookie'
import {
  createBrowserSession,
  findBrowserSession,
  rotateCsrfToken,
} from '@/server/auth/session-repository'
import { errorResponse } from '@/server/http/errors'
import { cleanupExpiredData } from '@/server/db/cleanup'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    cleanupExpiredData()
    const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const current = currentToken ? findBrowserSession(currentToken) : null
    const created = current ? null : createBrowserSession()
    const session = current ?? created?.session
    if (!session) throw new Error('session_creation_failed')
    const csrf = current ? rotateCsrfToken(current.id) : { csrfToken: created!.csrfToken }
    const response = NextResponse.json({
      connected: hasOAuthConnection(session.id),
      csrfToken: csrf.csrfToken,
      sessionExpiresAt: session.expiresAt,
    })
    if (created) {
      response.cookies.set(
        SESSION_COOKIE_NAME,
        created.cookieToken,
        sessionCookieOptions(new Date(created.session.expiresAt)),
      )
    }
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
