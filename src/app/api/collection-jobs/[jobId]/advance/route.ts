import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { requireBrowserSession } from '@/server/auth/request-session'
import { advanceCollectionJob } from '@/server/collection/advance-job'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const { jobId } = await params
    return NextResponse.json(await advanceCollectionJob(jobId, session.id))
  } catch (error) {
    return errorResponse(error)
  }
}
