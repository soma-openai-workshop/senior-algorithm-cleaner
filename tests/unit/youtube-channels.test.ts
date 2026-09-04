import { describe, expect, it } from 'vitest'
import { normalizeChannelsResponse } from '@/server/youtube/schemas'

describe('channels.list normalization', () => {
  it('preserves decimal statistics as strings', () => {
    const channels = normalizeChannelsResponse({
      items: [
        {
          id: 'channel-1',
          snippet: { title: '건강 채널', description: '', publishedAt: '2020-01-01T00:00:00Z' },
          statistics: { videoCount: '9007199254740993', subscriberCount: '10', viewCount: '20' },
          contentDetails: { relatedPlaylists: { uploads: 'UU-1' } },
        },
      ],
    })
    expect(channels[0]?.publicVideoCount).toBe('9007199254740993')
    expect(channels[0]?.uploadsPlaylistId).toBe('UU-1')
  })

  it('rejects a channel without an uploads playlist', () => {
    expect(() =>
      normalizeChannelsResponse({ items: [{ id: 'channel-1', snippet: {}, contentDetails: {} }] }),
    ).toThrow()
  })
})
