import 'server-only'
import { AppError } from '@/server/http/errors'
import { providerErrorFromResponse } from './errors'
import {
  normalizeChannelsResponse,
  normalizePlaylistItemsResponse,
  normalizeSearchVideosResponse,
  normalizeSubscriptionsPage,
  normalizeVideosDetailsResponse,
} from './schemas'

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3'

export async function listSubscriptionsPage(
  accessToken: string,
  pageToken: string | null,
  providerFetch: typeof fetch = fetch,
) {
  const url = new URL(`${YOUTUBE_API}/subscriptions`)
  url.searchParams.set('mine', 'true')
  url.searchParams.set('part', 'id,snippet')
  url.searchParams.set('maxResults', '50')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  const response = await providerFetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw providerErrorFromResponse(response)
  try {
    return normalizeSubscriptionsPage(await response.json())
  } catch {
    throw new AppError('provider_schema_invalid')
  }
}

async function getJson(
  url: URL,
  accessToken: string,
  providerFetch: typeof fetch,
): Promise<unknown> {
  const response = await providerFetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw providerErrorFromResponse(response)
  return response.json()
}

export async function listChannelsBatch(
  accessToken: string,
  channelIds: string[],
  providerFetch: typeof fetch = fetch,
) {
  if (channelIds.length === 0 || channelIds.length > 50) throw new AppError('invalid_request')
  const url = new URL(`${YOUTUBE_API}/channels`)
  url.searchParams.set('part', 'snippet,statistics,contentDetails')
  url.searchParams.set('id', channelIds.join(','))
  try {
    return normalizeChannelsResponse(await getJson(url, accessToken, providerFetch))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('provider_schema_invalid')
  }
}

export async function listPlaylistItemsPage(
  accessToken: string,
  playlistId: string,
  pageToken: string | null,
  providerFetch: typeof fetch = fetch,
) {
  const url = new URL(`${YOUTUBE_API}/playlistItems`)
  url.searchParams.set('part', 'snippet,contentDetails,status')
  url.searchParams.set('playlistId', playlistId)
  url.searchParams.set('maxResults', '50')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  try {
    return normalizePlaylistItemsResponse(await getJson(url, accessToken, providerFetch))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('provider_schema_invalid')
  }
}

export async function searchPopularVideos(
  accessToken: string,
  channelId: string,
  publishedAfter: Date,
  providerFetch: typeof fetch = fetch,
) {
  const url = new URL(`${YOUTUBE_API}/search`)
  url.searchParams.set('part', 'id')
  url.searchParams.set('channelId', channelId)
  url.searchParams.set('type', 'video')
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('publishedAfter', publishedAfter.toISOString())
  url.searchParams.set('maxResults', '10')
  try {
    return normalizeSearchVideosResponse(await getJson(url, accessToken, providerFetch))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('provider_schema_invalid')
  }
}

export async function listVideosBatch(
  accessToken: string,
  videoIds: string[],
  providerFetch: typeof fetch = fetch,
) {
  if (videoIds.length === 0 || videoIds.length > 50) throw new AppError('invalid_request')
  const url = new URL(`${YOUTUBE_API}/videos`)
  url.searchParams.set('part', 'snippet,contentDetails,statistics,status')
  url.searchParams.set('id', videoIds.join(','))
  try {
    return normalizeVideosDetailsResponse(await getJson(url, accessToken, providerFetch))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('provider_schema_invalid')
  }
}

export async function deleteSubscription(
  accessToken: string,
  subscriptionId: string,
  providerFetch: typeof fetch = fetch,
) {
  const url = new URL(`${YOUTUBE_API}/subscriptions`)
  url.searchParams.set('id', subscriptionId)
  const response = await providerFetch(url, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw providerErrorFromResponse(response)
}
