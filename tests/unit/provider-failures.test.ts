import { describe, expect, it } from 'vitest'
import { providerErrorFromResponse } from '@/server/youtube/errors'
import { isRetryableProviderError, retryDelayMs } from '@/server/youtube/retry'

describe('provider failure policy', () => {
  it('classifies authentication and temporary failures', () => {
    expect(providerErrorFromResponse(new Response(null, { status: 401 })).code).toBe(
      'reauth_required',
    )
    expect(providerErrorFromResponse(new Response(null, { status: 503 })).code).toBe(
      'provider_unavailable',
    )
    expect(isRetryableProviderError('provider_unavailable')).toBe(true)
    expect(isRetryableProviderError('reauth_required')).toBe(false)
  })

  it('caps exponential and Retry-After delays', () => {
    expect(retryDelayMs(1)).toBe(250)
    expect(retryDelayMs(10)).toBe(8000)
    expect(retryDelayMs(1, 30_000)).toBe(8000)
  })
})
