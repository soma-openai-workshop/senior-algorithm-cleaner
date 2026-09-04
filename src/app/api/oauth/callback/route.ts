import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { exchangeGoogleCode } from '@/server/auth/google-oauth'
import { consumeOAuthAttempt, saveOAuthConnection } from '@/server/auth/oauth-repository'
import { requireBrowserSession } from '@/server/auth/request-session'
import { AppError } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const appUrl = new URL('/collect', request.url)
  try {
    const session = requireBrowserSession(request)
    const state = request.nextUrl.searchParams.get('state')
    if (!state) throw new AppError('oauth_state_invalid')
    const attempt = consumeOAuthAttempt({ sessionId: session.id, state })
    if (request.nextUrl.searchParams.has('error')) throw new AppError('oauth_denied')
    const code = request.nextUrl.searchParams.get('code')
    if (!code) throw new AppError('invalid_request')
    const token = await exchangeGoogleCode({ code, ...attempt })
    saveOAuthConnection({ sessionId: session.id, ...token })
    appUrl.searchParams.set('connected', '1')
  } catch (error) {
    appUrl.searchParams.set(
      'oauth',
      error instanceof AppError ? error.code : 'oauth_exchange_failed',
    )
  }
  return NextResponse.redirect(appUrl, 303)
}
