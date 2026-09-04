import { describe, expect, it } from 'vitest'
import {
  aggregateContentRisk,
  buildOneLineReason,
  riskLevel,
  scoreSyntheticMedia,
  scoreUploadPattern,
  scaleThumbnailSimilarityRisk,
  scaleUploadPatternRisk,
} from '@/server/analysis/scoring'
import type { VideoRiskJudgement } from '@/server/analysis/contracts'

describe('analysis scoring v2', () => {
  it('scores the fastest and most regular rolling upload window', () => {
    const start = Date.parse('2026-09-01T00:00:00Z')
    const timestamps = Array.from({ length: 5 }, (_, index) =>
      new Date(start + index * 3 * 3_600_000).toISOString(),
    )
    expect(scoreUploadPattern(timestamps)).toMatchObject({
      points: 30,
      speedPoints: 20,
      regularityPoints: 10,
      cadenceHours: 3,
      normalizedMad: 0,
    })
  })

  it('does not award regularity to a cadence over 72 hours', () => {
    const start = Date.parse('2026-01-01T00:00:00Z')
    const timestamps = Array.from({ length: 5 }, (_, index) =>
      new Date(start + index * 73 * 3_600_000).toISOString(),
    )
    expect(scoreUploadPattern(timestamps)).toMatchObject({ points: 0, regularityPoints: 0 })
  })

  it('keeps unknown synthetic labels distinct while scoring only true', () => {
    expect(scoreSyntheticMedia([true, null, false, true, true])).toBe(6)
    expect(scoreSyntheticMedia(Array(8).fill(true))).toBe(10)
  })

  it('keeps raw measurement methods while applying the new factory weights', () => {
    expect(scaleUploadPatternRisk(22)).toBe(7)
    expect(scaleUploadPatternRisk(30)).toBe(10)
    expect(scaleThumbnailSimilarityRisk(5)).toBe(15)
    expect(scaleThumbnailSimilarityRisk(10)).toBe(30)
  })

  it('uses equal highest and average weights for channel content risk', () => {
    const judgements = [judgement(40, 25, 10, 5), judgement(10, 8, 1, 1)]
    const result = aggregateContentRisk(judgements)
    expect(result?.points).toBe(33)
    expect(result?.contributions.sourceOpacity).toBe(20.75)
  })

  it('uses contribution tie priority and strict three risk bands', () => {
    expect(
      buildOneLineReason({
        sourceOpacity: 5,
        treatmentChangeInducement: 5,
        purchaseInducement: 5,
        uploadPattern: 0,
        syntheticMedia: 0,
        thumbnailSimilarity: 0,
      }),
    ).toContain('치료나 복약')
    expect(riskLevel(20)).toBe('normal')
    expect(riskLevel(21)).toBe('warning')
    expect(riskLevel(60)).toBe('warning')
    expect(riskLevel(61)).toBe('danger')
  })
})

function judgement(
  totalRiskPoints: number,
  sourceOpacity: number,
  treatmentChangeInducement: number,
  purchaseInducement: number,
): VideoRiskJudgement {
  return {
    videoId: String(totalRiskPoints),
    riskPoints: {
      sourceOpacity: { points: sourceOpacity, reason: '', evidence: '' },
      treatmentChangeInducement: { points: treatmentChangeInducement, reason: '', evidence: '' },
      purchaseInducement: { points: purchaseInducement, reason: '', evidence: '' },
    },
    totalRiskPoints,
    limitations: [],
  }
}
