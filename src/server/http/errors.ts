import { NextResponse } from 'next/server'
import { errorMessagesKo } from '@/shared/contracts/messages.ko'
import type { ApiErrorCode, ApiErrorView } from '@/shared/contracts/errors'

const statusByCode: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  expired: 410,
  reauth_required: 401,
  oauth_denied: 400,
  oauth_state_invalid: 400,
  oauth_exchange_failed: 502,
  already_advancing: 409,
  provider_unavailable: 503,
  provider_schema_invalid: 502,
  internal_error: 500,
}

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status = statusByCode[code],
    public readonly retryAfterMs?: number,
  ) {
    super(code)
    this.name = 'AppError'
  }
}

export function errorResponse(error: unknown): NextResponse<ApiErrorView> {
  const appError = error instanceof AppError ? error : new AppError('internal_error')
  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: errorMessagesKo[appError.code],
        ...(appError.retryAfterMs ? { retryAfterMs: appError.retryAfterMs } : {}),
      },
    },
    { status: appError.status },
  )
}
