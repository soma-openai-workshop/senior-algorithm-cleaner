import { describe, expect, it } from 'vitest'
import {
  classifyHealthCandidate,
  HEALTH_CANDIDATE_POLICY_VERSION,
  normalizeHealthText,
} from '@/server/health-candidate/policy-v1'
import { healthCandidateFixtures } from '../fixtures/health-candidates'

describe('health-candidate-policy-v1', () => {
  it('normalizes Unicode, URLs, email, punctuation, and whitespace deterministically', () => {
    expect(normalizeHealthText('  ＨＥＡＬＴＨ!!! https://example.com a@b.com  건강_정보 ')).toBe(
      'health 건강 정보',
    )
  })

  it('passes the labelled 40-positive and 40-negative fixture gate', () => {
    expect(healthCandidateFixtures).toHaveLength(80)
    const positives = healthCandidateFixtures.filter((fixture) => fixture.expected)
    const negatives = healthCandidateFixtures.filter((fixture) => !fixture.expected)
    expect(positives).toHaveLength(40)
    expect(negatives).toHaveLength(40)
    const results = healthCandidateFixtures.map((fixture) => ({
      ...fixture,
      actual: classifyHealthCandidate(fixture).isCandidate,
    }))
    const recalled = results.filter((fixture) => fixture.expected && fixture.actual).length
    const falsePositives = results
      .filter((fixture) => !fixture.expected && fixture.actual)
      .map((fixture) => fixture.id)
    expect(recalled / positives.length).toBeGreaterThanOrEqual(0.95)
    expect(falsePositives).toMatchInlineSnapshot(`
      [
        "negative-25",
        "negative-26",
        "negative-27",
        "negative-28",
      ]
    `)
  })

  it('does not treat one context-only video as a candidate', () => {
    const result = classifyHealthCandidate({
      channelTitle: '일상 기록',
      channelDescription: '',
      videos: [{ videoId: 'one', title: '오늘의 걷기', description: '' }],
    })
    expect(result.policyVersion).toBe(HEALTH_CANDIDATE_POLICY_VERSION)
    expect(result.isCandidate).toBe(false)
  })
})
