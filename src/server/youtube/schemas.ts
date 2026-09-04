import { z } from 'zod'

const httpsUrl = z
  .url()
  .refine((value) => value.startsWith('https://'))
  .nullable()

const subscriptionItemSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    publishedAt: z.iso.datetime().optional(),
    title: z.string().default('이름 없는 채널'),
    description: z.string().default(''),
    thumbnails: z
      .object({
        default: z.object({ url: z.string() }).optional(),
        medium: z.object({ url: z.string() }).optional(),
        high: z.object({ url: z.string() }).optional(),
      })
      .optional(),
    resourceId: z.object({ channelId: z.string().min(1) }),
  }),
})

export const subscriptionsPageSchema = z.object({
  nextPageToken: z.string().min(1).optional(),
  pageInfo: z.object({ totalResults: z.number().int().nonnegative() }).optional(),
  items: z.array(subscriptionItemSchema),
})

export type SubscriptionRecord = {
  subscriptionId: string
  channelId: string
  subscribedAt: string | null
  title: string
  description: string
  thumbnailUrl: string | null
}

export function normalizeSubscriptionsPage(value: unknown): {
  items: SubscriptionRecord[]
  nextPageToken: string | null
  totalResults: number | null
} {
  const page = subscriptionsPageSchema.parse(value)
  return {
    nextPageToken: page.nextPageToken ?? null,
    totalResults: page.pageInfo?.totalResults ?? null,
    items: page.items.map((item) => {
      const thumbnail =
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ??
        null
      return {
        subscriptionId: item.id,
        channelId: item.snippet.resourceId.channelId,
        subscribedAt: item.snippet.publishedAt ?? null,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: thumbnail && httpsUrl.safeParse(thumbnail).success ? thumbnail : null,
      }
    }),
  }
}

const channelItemSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    title: z.string().default('이름 없는 채널'),
    description: z.string().default(''),
    publishedAt: z.iso.datetime().optional(),
    thumbnails: z
      .object({
        default: z.object({ url: z.string() }).optional(),
        medium: z.object({ url: z.string() }).optional(),
        high: z.object({ url: z.string() }).optional(),
      })
      .optional(),
  }),
  statistics: z
    .object({
      videoCount: z.string().regex(/^\d+$/).optional(),
      subscriberCount: z.string().regex(/^\d+$/).optional(),
      viewCount: z.string().regex(/^\d+$/).optional(),
    })
    .optional(),
  contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().min(1) }) }),
})

export const channelsResponseSchema = z.object({ items: z.array(channelItemSchema) })

export type ChannelRecord = {
  channelId: string
  title: string
  description: string
  thumbnailUrl: string | null
  publishedAt: string | null
  publicVideoCount: string | null
  subscriberCount: string | null
  viewCount: string | null
  uploadsPlaylistId: string
}

export function normalizeChannelsResponse(value: unknown): ChannelRecord[] {
  const response = channelsResponseSchema.parse(value)
  return response.items.map((item) => {
    const thumbnail =
      item.snippet.thumbnails?.high?.url ??
      item.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.default?.url ??
      null
    return {
      channelId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: thumbnail && httpsUrl.safeParse(thumbnail).success ? thumbnail : null,
      publishedAt: item.snippet.publishedAt ?? null,
      publicVideoCount: item.statistics?.videoCount ?? null,
      subscriberCount: item.statistics?.subscriberCount ?? null,
      viewCount: item.statistics?.viewCount ?? null,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    }
  })
}

const playlistItemSchema = z.object({
  snippet: z.object({
    title: z.string().default(''),
    description: z.string().default(''),
    publishedAt: z.iso.datetime().optional(),
    position: z.number().int().nonnegative().optional(),
    resourceId: z.object({ videoId: z.string().min(1) }),
  }),
  contentDetails: z.object({ videoId: z.string().min(1) }).optional(),
  status: z.object({ privacyStatus: z.string().optional() }).optional(),
})

export const playlistItemsResponseSchema = z.object({
  nextPageToken: z.string().min(1).optional(),
  items: z.array(playlistItemSchema),
})

export type UploadRecord = {
  videoId: string
  title: string
  description: string
  publishedAt: string | null
  playlistPosition: number | null
  privacyStatus: 'public'
}

export function normalizePlaylistItemsResponse(value: unknown): {
  items: UploadRecord[]
  excludedCount: number
  nextPageToken: string | null
} {
  const response = playlistItemsResponseSchema.parse(value)
  const items: UploadRecord[] = []
  let excludedCount = 0
  for (const item of response.items) {
    const title = item.snippet.title.trim()
    const privacyStatus = item.status?.privacyStatus
    if (
      privacyStatus === 'private' ||
      privacyStatus === 'unlisted' ||
      ['Private video', 'Deleted video'].includes(title)
    ) {
      excludedCount += 1
      continue
    }
    items.push({
      videoId: item.contentDetails?.videoId ?? item.snippet.resourceId.videoId,
      title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt ?? null,
      playlistPosition: item.snippet.position ?? null,
      privacyStatus: 'public',
    })
  }
  return { items, excludedCount, nextPageToken: response.nextPageToken ?? null }
}
