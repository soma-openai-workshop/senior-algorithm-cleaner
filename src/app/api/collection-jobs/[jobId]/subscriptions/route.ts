import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireBrowserSession } from '@/server/auth/request-session'
import { getOwnedJob } from '@/server/collection/job-repository'
import { listSafeSubscriptions } from '@/server/collection/subscription-repository'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    const { jobId } = await params
    getOwnedJob(jobId, session.id)
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50),
    )
    return NextResponse.json(
      listSafeSubscriptions(jobId, request.nextUrl.searchParams.get('cursor'), limit),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
