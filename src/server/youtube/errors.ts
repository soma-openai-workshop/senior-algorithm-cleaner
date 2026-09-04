import 'server-only'
import { AppError } from '@/server/http/errors'

export function providerErrorFromResponse(response: Response): AppError {
  if (response.status === 401 || response.status === 403) return new AppError('reauth_required')
  if (response.status === 400) return new AppError('provider_schema_invalid')
  const retryAfter = response.headers.get('retry-after')
  const retryAfterMs = retryAfter ? Math.max(0, Number(retryAfter) * 1000) : undefined
  return new AppError('provider_unavailable', 503, retryAfterMs)
}
