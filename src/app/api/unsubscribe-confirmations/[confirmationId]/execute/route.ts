import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { requireBrowserSession } from '@/server/auth/request-session'
import { errorResponse } from '@/server/http/errors'
import { executeUnsubscribeConfirmation } from '@/server/unsubscribe/service'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ confirmationId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const { confirmationId } = await params
    return NextResponse.json(await executeUnsubscribeConfirmation(confirmationId, session.id))
  } catch (error) {
    return errorResponse(error)
  }
}
