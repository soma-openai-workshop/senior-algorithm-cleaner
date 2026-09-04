import { describe, expect, it } from 'vitest'
import { normalizeSubscriptionsPage } from '@/server/youtube/schemas'

function item(id: string, channelId: string) {
  return {
    id,
    snippet: {
      publishedAt: '2025-01-01T00:00:00Z',
      title: `채널 ${channelId}`,
      description: '설명',
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
      resourceId: { channelId },
    },
  }
}

describe('subscriptions.list normalization', () => {
  it('normalizes a valid page and cursor', () => {
    const page = normalizeSubscriptionsPage({
      nextPageToken: 'next',
      pageInfo: { totalResults: 51 },
      items: [item('sub-1', 'channel-1')],
    })
    expect(page.totalResults).toBe(51)
    expect(page.nextPageToken).toBe('next')
    expect(page.items[0]).toMatchObject({ subscriptionId: 'sub-1', channelId: 'channel-1' })
  })

  it('rejects items without a subscription or channel id', () => {
    expect(() => normalizeSubscriptionsPage({ items: [{ id: '', snippet: {} }] })).toThrow()
  })

  it('drops non-https thumbnails without inventing a value', () => {
    const unsafe = item('sub-1', 'channel-1')
    unsafe.snippet.thumbnails.default.url = 'http://example.com/thumb.jpg'
    expect(normalizeSubscriptionsPage({ items: [unsafe] }).items[0]?.thumbnailUrl).toBeNull()
  })
})
