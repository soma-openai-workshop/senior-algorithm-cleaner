import type { NextRequest } from 'next/server'
import { getServerEnv } from '@/server/env'
import { AppError } from '@/server/http/errors'
import { tokenHashMatches } from './crypto'

export function assertCsrf(request: NextRequest, csrfTokenHash: Buffer): void {
  const origin = request.headers.get('origin')
  const token = request.headers.get('x-csrf-token')
  if (origin !== getServerEnv().APP_BASE_URL || !token || !tokenHashMatches(token, csrfTokenHash)) {
    throw new AppError('forbidden')
  }
}
