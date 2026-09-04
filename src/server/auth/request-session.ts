import 'server-only'
import type { NextRequest } from 'next/server'
import { AppError } from '@/server/http/errors'
import { findBrowserSession, type BrowserSession } from './session-repository'
import { SESSION_COOKIE_NAME } from './session-cookie'

export function requireBrowserSession(request: NextRequest): BrowserSession {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookieToken) throw new AppError('forbidden')
  const session = findBrowserSession(cookieToken)
  if (!session) throw new AppError('forbidden')
  return session
}
