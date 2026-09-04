import type { AxisContributions, VideoRiskJudgement } from './contracts'

export const ANALYSIS_POLICY_VERSION = 'analysis-policy-v3'

export type UploadPatternScore = {
  points: number | null
  speedPoints: number | null
  regularityPoints: number | null
  cadenceHours: number | null
  normalizedMad: number | null
}

export function scoreUploadPattern(publishedAt: string[]): UploadPatternScore {
  const times = publishedAt
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (times.length < 5) return unmeasuredUploadPattern()

  let best: UploadPatternScore = unmeasuredUploadPattern()
  for (let index = 0; index <= times.length - 5; index += 1) {
    const window = times.slice(index, index + 5)
    const gaps = window.slice(1).map((time, gapIndex) => (time - window[gapIndex]) / 3_600_000)
    const cadenceHours = (window[4] - window[0]) / 4 / 3_600_000
    const medianGap = median(gaps)
    const normalizedMad =
      medianGap === 0
        ? gaps.every((gap) => gap === 0)
          ? 0
          : Number.POSITIVE_INFINITY
        : median(gaps.map((gap) => Math.abs(gap - medianGap))) / medianGap
    const speedPoints = speedScore(cadenceHours)
    const regularityPoints = cadenceHours > 72 ? 0 : regularityScore(normalizedMad)
    const candidate = {
      points: speedPoints + regularityPoints,
      speedPoints,
      regularityPoints,
      cadenceHours,
      normalizedMad,
    }
    if ((candidate.points ?? -1) > (best.points ?? -1)) best = candidate
  }
  return best
}

export function scoreSyntheticMedia(values: Array<boolean | null>): number {
  return Math.min(10, values.filter((value) => value === true).length * 2)
}

export function scaleUploadPatternRisk(rawPoints: number): number {
  return Math.round(rawPoints / 3)
}

export function scaleThumbnailSimilarityRisk(rawPoints: number): number {
  return rawPoints * 3
}

export function aggregateContentRisk(judgements: VideoRiskJudgement[]) {
  if (judgements.length === 0) return null
  const highest = judgements.reduce((current, item) =>
    item.totalRiskPoints > current.totalRiskPoints ? item : current,
  )
  const averageTotal = average(judgements.map((item) => item.totalRiskPoints))
  const contribution = (axis: keyof VideoRiskJudgement['riskPoints']) =>
    highest.riskPoints[axis].points * 0.5 +
    average(judgements.map((item) => item.riskPoints[axis].points)) * 0.5
  return {
    points: Math.round(highest.totalRiskPoints * 0.5 + averageTotal * 0.5),
    contributions: {
      sourceOpacity: contribution('sourceOpacity'),
      treatmentChangeInducement: contribution('treatmentChangeInducement'),
      purchaseInducement: contribution('purchaseInducement'),
    },
  }
}

const reasonOrder: Array<keyof AxisContributions> = [
  'treatmentChangeInducement',
  'purchaseInducement',
  'sourceOpacity',
  'uploadPattern',
  'syntheticMedia',
  'thumbnailSimilarity',
]

const reasonText: Record<keyof AxisContributions, string> = {
  treatmentChangeInducement: '치료나 복약 행동을 바꾸도록 유도하는 표현',
  purchaseInducement: '건강 주장과 특정 상품 구매를 연결하는 표현',
  sourceOpacity: '중요한 건강 주장의 출처를 확인하기 어려운 점',
  uploadPattern: '짧고 일정한 간격으로 영상을 반복 게시한 패턴',
  syntheticMedia: '분석 영상에 합성 콘텐츠 공개 표시가 있는 점',
  thumbnailSimilarity: '최근 썸네일이 같은 틀처럼 반복되는 점',
}

export function buildOneLineReason(
  contributions: AxisContributions,
  level: 'normal' | 'warning' | 'danger' | 'unavailable' = 'warning',
): string {
  const ranked = reasonOrder
    .map((key, priority) => ({ key, points: contributions[key], priority }))
    .filter((item) => item.points > 0)
    .sort((left, right) => right.points - left.points || left.priority - right.priority)
    .slice(0, 2)
  if (ranked.length === 0) return '분석한 영상에서 뚜렷한 위험 신호를 찾지 못했습니다.'
  const signals = ranked.map((item) => reasonText[item.key]).join('과 ')
  if (level === 'normal') return `${signals}이 일부 보였지만 전체 위험 신호는 낮습니다.`
  if (level === 'danger') return `${signals}이 크게 나타나 위험으로 표시했습니다.`
  return `${signals} 때문에 경고로 표시했습니다.`
}

export function riskLevel(score: number | null) {
  if (score === null) return 'unavailable' as const
  if (score <= 20) return 'normal' as const
  if (score <= 60) return 'warning' as const
  return 'danger' as const
}

function speedScore(hours: number): number {
  if (hours <= 3) return 20
  if (hours <= 6) return 18
  if (hours <= 12) return 15
  if (hours <= 24) return 12
  if (hours <= 48) return 8
  if (hours <= 72) return 4
  return 0
}

function regularityScore(value: number): number {
  if (value <= 0.1) return 10
  if (value <= 0.25) return 7
  if (value <= 0.5) return 4
  return 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function unmeasuredUploadPattern(): UploadPatternScore {
  return {
    points: null,
    speedPoints: null,
    regularityPoints: null,
    cadenceHours: null,
    normalizedMad: null,
  }
}
