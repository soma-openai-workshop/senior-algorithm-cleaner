import { describe, expect, it } from 'vitest'
import { normalizePlaylistItemsResponse } from '@/server/youtube/schemas'

describe('playlistItems.list normalization', () => {
  it('excludes private/deleted placeholders and keeps valid public metadata', () => {
    const page = normalizePlaylistItemsResponse({
      nextPageToken: 'next',
      items: [
        {
          snippet: {
            title: '공개 영상',
            description: '설명',
            publishedAt: '2026-09-01T00:00:00Z',
            position: 0,
            resourceId: { videoId: 'v1' },
          },
          contentDetails: { videoId: 'v1' },
          status: { privacyStatus: 'public' },
        },
        {
          snippet: {
            title: 'Private video',
            description: '',
            position: 1,
            resourceId: { videoId: 'v2' },
          },
          status: { privacyStatus: 'private' },
        },
      ],
    })
    expect(page.items).toHaveLength(1)
    expect(page.excludedCount).toBe(1)
    expect(page.nextPageToken).toBe('next')
  })
})
