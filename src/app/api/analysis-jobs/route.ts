import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { assertCsrf } from '@/server/auth/csrf'
import { requireBrowserSession } from '@/server/auth/request-session'
import { createOrGetAnalysisJob } from '@/server/analysis/job-repository'
import { errorResponse } from '@/server/http/errors'
import { AppError } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = requireBrowserSession(request)
    assertCsrf(request, session.csrfTokenHash)
    const body = (await request.json()) as { collectionJobId?: string }
    if (!body.collectionJobId) throw new AppError('invalid_request')
    return NextResponse.json(createOrGetAnalysisJob(body.collectionJobId, session.id), {
      status: 201,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
