import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { getServerEnv } from '@/server/env'
import {
  thumbnailJudgementSchema,
  type ThumbnailJudgement,
  videoEvidenceSchema,
  type VideoEvidence,
  videoRiskJudgementSchema,
  type VideoRiskJudgement,
} from './contracts'

const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 180_000
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024

type InputBlock =
  | { type: 'text'; text: string }
  | { type: 'video'; uri: string }
  | { type: 'image'; data: string; mime_type: string }

type StructuredSchema = Record<string, unknown>

export async function extractVideoEvidence(videoId: string): Promise<VideoEvidence> {
  const prompt = `당신은 영상 관찰 기록기입니다. 이 공개 YouTube 영상에서 아래 콘텐츠 위험도 루브릭에
직접 관련된 관찰 근거만 한국어 JSON으로 추출하세요. 점수를 매기거나 위험을 추정하지 마세요.
건강 주장, 복약·치료·진료 행동 지시, 상품·가격·구매·협찬 신호, 주장 출처와 발화자 정보를
영상의 실제 표현과 가능한 시작 초 단위 시각으로 기록하세요. 확인하지 못한 내용은 만들지 마세요.
각 배열은 중요한 순서로 최대 10개이며 영상 내용에 해당 신호가 없으면 빈 배열로 반환하세요.
videoId는 정확히 ${videoId} 이어야 합니다.`
  return structuredInteraction(
    [
      { type: 'video', uri: `https://www.youtube.com/watch?v=${videoId}` },
      { type: 'text', text: prompt },
    ],
    videoEvidenceJsonSchema,
    (raw) => {
      const parsed = videoEvidenceSchema.parse(raw)
      if (parsed.videoId !== videoId) throw new RetryableGeminiError('provider_schema_invalid')
      return parsed
    },
  )
}

export async function judgeVideoRisk(input: {
  evidence: VideoEvidence
  videoTitle: string
  videoDescription: string
  channelTitle: string
  channelDescription: string
}): Promise<VideoRiskJudgement> {
  const prompt = `당신은 제공된 관찰 근거만 채점하는 건강 콘텐츠 위험도 judge입니다.
외부 검색이나 배경 지식을 사용하지 말고, 같은 사실을 같은 축에서 중복 반영하지 마세요.

출처 불명확 0..30: 0 중요 건강 주장 없음/모두 추적 가능, 1..5 사소한 연결 누락,
6..12 일부만 추적 가능, 13..20 모호한 연구·전문가 권위, 21..26 강한 치료·예방 주장인데
자격·근거 대부분 확인 불가, 27..30 익명 권위의 중대한 단정과 추적 근거 없음.
치료·복약 변경 유도 0..10: 0 없음, 1..2 대체 아닌 저위험 생활 조언, 3..4 안전 맥락이 있는
질환별 제안, 5..6 안전 설명이 약한 구체적 복약/진료 변경, 7..8 중단·진료회피·대체요법 치환,
9..10 즉시 중단/치환 강요 또는 전문 진료 부정.
구매 유도 0..10: 0 없음, 1..2 건강 효과와 무관한 상품/URL, 3..4 공개 협찬과 균형 설명,
5..6 건강 주장과 구매 경로 직접 연결, 7..8 치료·예방 구매와 불명확 협찬/긴급성,
9..10 공포·희소성·완치·즉효로 거래 압박.

비건강 영상은 신호가 없으면 세 축 0점입니다. 양수 점수에는 제공 근거에서 짧은 reason과 evidence를
반드시 넣고, 세 축의 합을 totalRiskPoints에 넣으세요.

입력:
${JSON.stringify(input)}`
  return structuredInteraction([{ type: 'text', text: prompt }], riskJsonSchema, (raw) => {
    const parsed = videoRiskJudgementSchema.parse(raw)
    if (parsed.videoId !== input.evidence.videoId) {
      throw new RetryableGeminiError('provider_schema_invalid')
    }
    return parsed
  })
}

export async function judgeThumbnailSimilarity(
  thumbnails: Array<{ videoId: string; url: string }>,
): Promise<ThumbnailJudgement> {
  if (thumbnails.length !== 3) throw new Error('thumbnail_sample_incomplete')
  const images = await Promise.all(thumbnails.map((thumbnail) => loadThumbnail(thumbnail.url)))
  const prompt = `세 장은 한 채널의 최신 공개 영상 썸네일이며 순서대로 ${thumbnails
    .map((item) => item.videoId)
    .join(', ')} 입니다. 구성, 텍스트 배치, 색상, 아트스타일을 나누지 말고 전체적 템플릿
유사도를 위험 점수 0..10으로 평가하세요. 0 공통 패턴 없음, 1..2 우연한 일부 유사,
3..4 반복 요소가 있으나 배치·스타일이 다름, 5..6 변형이 뚜렷한 공통 템플릿,
7..8 배치·텍스트·색·스타일 대부분 반복, 9 같은 틀에서 제목·인물·주제만 교체,
10 사실상 동일한 템플릿입니다. 한 쌍만 비슷하면 최대 6점이며 7점 이상은 세 장 모두에서
공통 패턴이 보여야 합니다. 영상 내용이나 채널 의도는 추측하지 말고 쉽고 짧은 한국어 이유를
반환하세요.`
  return structuredInteraction(
    [...images, { type: 'text', text: prompt }],
    thumbnailJsonSchema,
    (raw) => thumbnailJudgementSchema.parse(raw),
  )
}

async function structuredInteraction<T>(
  input: InputBlock[],
  schema: StructuredSchema,
  validate: (value: unknown) => T,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const env = getServerEnv()
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required')
      const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1beta' })
      const interaction = await client.interactions.create(
        {
          model: env.GEMINI_JUDGE_MODEL,
          input,
          store: false,
          generation_config: { seed: 7 },
          response_format: { type: 'text', mime_type: 'application/json', schema },
        },
        { timeout_ms: REQUEST_TIMEOUT_MS },
      )
      if (interaction.status !== 'completed' || !interaction.output_text) {
        throw new RetryableGeminiError('provider_unavailable')
      }
      try {
        return validate(JSON.parse(interaction.output_text) as unknown)
      } catch {
        throw new RetryableGeminiError('provider_schema_invalid')
      }
    } catch (error) {
      lastError = error
      if (attempt === MAX_ATTEMPTS || !isRetryable(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

async function loadThumbnail(url: string): Promise<InputBlock> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('thumbnail_unavailable')
  const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new RetryableGeminiError('thumbnail_unavailable')
  const mimeType = response.headers.get('content-type')?.split(';')[0]
  if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('thumbnail_unavailable')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new Error('thumbnail_unavailable')
  }
  return { type: 'image', data: Buffer.from(bytes).toString('base64'), mime_type: mimeType }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableGeminiError) return true
  if (error instanceof Error && ['AbortError', 'TimeoutError', 'TypeError'].includes(error.name)) {
    return true
  }
  const status = Number((error as { status?: unknown })?.status)
  return status === 429 || status >= 500
}

export function geminiFailureCode(error: unknown): string {
  if (error instanceof RetryableGeminiError) return error.code
  const status = Number((error as { status?: unknown })?.status)
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_unavailable'
  if (error instanceof Error && error.message.includes('thumbnail')) return 'thumbnail_unavailable'
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return 'timeout'
  return 'internal_error'
}

class RetryableGeminiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const signalProperties = {
  evidence: { type: 'string', minLength: 1 },
  startSeconds: { type: 'number', minimum: 0 },
}

const videoEvidenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    videoId: { type: 'string', minLength: 1 },
    healthClaims: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { claim: { type: 'string', minLength: 1 }, ...signalProperties },
        required: ['claim', 'evidence'],
      },
    },
    actionDirectives: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { action: { type: 'string', minLength: 1 }, ...signalProperties },
        required: ['action', 'evidence'],
      },
    },
    commercialSignals: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { signal: { type: 'string', minLength: 1 }, ...signalProperties },
        required: ['signal', 'evidence'],
      },
    },
    sourceSignals: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string', minLength: 1 },
          traceable: { type: 'boolean' },
          ...signalProperties,
        },
        required: ['source', 'traceable', 'evidence'],
      },
    },
    speakerIdentity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1 },
        credential: { type: 'string', minLength: 1 },
        organization: { type: 'string', minLength: 1 },
      },
    },
    limitations: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1 } },
  },
  required: [
    'videoId',
    'healthClaims',
    'actionDirectives',
    'commercialSignals',
    'sourceSignals',
    'speakerIdentity',
    'limitations',
  ],
}

const riskAxisJsonSchema = (maximum: number) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    points: { type: 'integer', minimum: 0, maximum },
    reason: { type: 'string' },
    evidence: { type: 'string' },
    startSeconds: { type: 'number', minimum: 0 },
  },
  required: ['points', 'reason'],
})

const riskJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    videoId: { type: 'string', minLength: 1 },
    riskPoints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sourceOpacity: riskAxisJsonSchema(30),
        treatmentChangeInducement: riskAxisJsonSchema(10),
        purchaseInducement: riskAxisJsonSchema(10),
      },
      required: ['sourceOpacity', 'treatmentChangeInducement', 'purchaseInducement'],
    },
    totalRiskPoints: { type: 'integer', minimum: 0, maximum: 50 },
    limitations: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1 } },
  },
  required: ['videoId', 'riskPoints', 'totalRiskPoints', 'limitations'],
}

const thumbnailJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thumbnailSimilarity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        riskPoints: { type: 'integer', minimum: 0, maximum: 10 },
        reason: { type: 'string', minLength: 1 },
        commonPatterns: {
          type: 'array',
          maxItems: 6,
          items: { type: 'string', minLength: 1 },
        },
        limitations: {
          type: 'array',
          maxItems: 6,
          items: { type: 'string', minLength: 1 },
        },
      },
      required: ['riskPoints', 'reason', 'commonPatterns', 'limitations'],
    },
  },
  required: ['thumbnailSimilarity'],
}
