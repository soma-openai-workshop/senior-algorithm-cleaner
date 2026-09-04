import 'server-only'

const MAX_BACKOFF_MS = 8000

export function retryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) {
    return Math.min(MAX_BACKOFF_MS, Math.max(100, retryAfterMs))
  }
  return Math.min(MAX_BACKOFF_MS, 250 * 2 ** Math.max(0, attempt - 1))
}

export function isRetryableProviderError(code: string): boolean {
  return code === 'provider_unavailable' || code === 'already_advancing'
}
