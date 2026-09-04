import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireBrowserSession } from '@/server/auth/request-session'
import { getOwnedJob } from '@/server/collection/job-repository'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    const { jobId } = await params
    return NextResponse.json(getOwnedJob(jobId, session.id))
  } catch (error) {
    return errorResponse(error)
  }
}
