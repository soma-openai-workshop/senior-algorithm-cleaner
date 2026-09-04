import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { getOAuthConnection } from '@/server/auth/oauth-repository'
import { requireBrowserSession } from '@/server/auth/request-session'
import { createOrGetJob } from '@/server/collection/job-repository'
import { AppError, errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    if (!getOAuthConnection(session.id)) throw new AppError('reauth_required')
    const body = (await request.json().catch(() => ({}))) as { restartInterrupted?: boolean }
    const result = createOrGetJob(session.id, body.restartInterrupted === true)
    return NextResponse.json(result.job, { status: result.created ? 201 : 200 })
  } catch (error) {
    return errorResponse(error)
  }
}
