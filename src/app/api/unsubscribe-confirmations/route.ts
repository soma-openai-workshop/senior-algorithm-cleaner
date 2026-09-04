import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { requireBrowserSession } from '@/server/auth/request-session'
import { errorResponse } from '@/server/http/errors'
import { createUnsubscribeConfirmation } from '@/server/unsubscribe/service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const body = (await request.json()) as { analysisJobId: string; channelIds: string[] }
    return NextResponse.json(createUnsubscribeConfirmation(body, session.id), { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
