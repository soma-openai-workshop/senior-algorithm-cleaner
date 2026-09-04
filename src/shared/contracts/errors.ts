export const apiErrorCodes = [
  'invalid_request',
  'forbidden',
  'not_found',
  'expired',
  'reauth_required',
  'oauth_denied',
  'oauth_state_invalid',
  'oauth_exchange_failed',
  'already_advancing',
  'provider_unavailable',
  'provider_schema_invalid',
  'internal_error',
] as const

export type ApiErrorCode = (typeof apiErrorCodes)[number]

export type ApiErrorView = {
  error: {
    code: ApiErrorCode
    message: string
    retryAfterMs?: number
  }
}
