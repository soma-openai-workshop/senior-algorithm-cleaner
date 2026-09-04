import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { disconnectSession } from '@/server/auth/disconnect'
import { requireBrowserSession } from '@/server/auth/request-session'
import { expiredSessionCookieOptions, SESSION_COOKIE_NAME } from '@/server/auth/session-cookie'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function DELETE(request: NextRequest) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const result = await disconnectSession(session.id)
    const response = NextResponse.json({
      ...result,
      manualRevocationUrl: result.providerRevoked
        ? null
        : 'https://myaccount.google.com/connections',
    })
    response.cookies.set(SESSION_COOKIE_NAME, '', expiredSessionCookieOptions())
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
