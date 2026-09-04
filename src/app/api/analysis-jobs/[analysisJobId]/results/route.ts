import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireBrowserSession } from '@/server/auth/request-session'
import { getOwnedAnalysisJob } from '@/server/analysis/job-repository'
import { listAnalysisResults } from '@/server/analysis/results'
import { errorResponse } from '@/server/http/errors'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ analysisJobId: string }> },
) {
  try {
    const session = requireBrowserSession(request)
    const { analysisJobId } = await params
    getOwnedAnalysisJob(analysisJobId, session.id)
    return NextResponse.json(listAnalysisResults(analysisJobId))
  } catch (error) {
    return errorResponse(error)
  }
}
