import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { requireBrowserSession } from '@/server/auth/request-session'
import { advanceAnalysisJob } from '@/server/analysis/pipeline'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ analysisJobId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const { analysisJobId } = await params
    return NextResponse.json(await advanceAnalysisJob(analysisJobId, session.id))
  } catch (error) {
    return errorResponse(error)
  }
}
