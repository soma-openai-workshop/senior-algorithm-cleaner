// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ImgHTMLAttributes } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RiskResultList, type RiskResult } from '@/components/analysis/risk-result-list'

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized, ...imageProps } = props
    void unoptimized
    return createElement('img', imageProps)
  },
}))

const items: RiskResult[] = [
  {
    channelId: 'success-channel',
    title: '해제 성공 채널',
    thumbnailUrl: null,
    subscribedAt: null,
    contentRisk: 20,
    factoryRisk: 10,
    combinedRisk: 30,
    riskLevel: 'warning',
    reason: '확인이 필요합니다.',
    successfulVideoCount: 5,
    failedVideoCount: 0,
  },
  {
    channelId: 'failed-channel',
    title: '해제 실패 채널',
    thumbnailUrl: null,
    subscribedAt: null,
    contentRisk: 10,
    factoryRisk: 5,
    combinedRisk: 15,
    riskLevel: 'normal',
    reason: '뚜렷한 위험 신호가 없습니다.',
    successfulVideoCount: 5,
    failedVideoCount: 0,
  },
]

describe('RiskResultList', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('removes successful unsubscriptions and keeps failed channels selected', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            confirmationId: 'confirmation-id',
            count: 2,
            channels: items.map(({ channelId, title }) => ({ channelId, title })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            successCount: 1,
            failureCount: 1,
            results: [
              { channelId: 'success-channel', title: '해제 성공 채널', status: 'success' },
              { channelId: 'failed-channel', title: '해제 실패 채널', status: 'failed' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<RiskResultList items={items} analysisJobId="analysis-id" csrfToken="csrf" />)
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox))
    fireEvent.click(screen.getByRole('button', { name: /선택한 2개 구독 해제 검토/ }))
    fireEvent.click(await screen.findByRole('button', { name: '최종 구독 해제' }))

    await waitFor(() => expect(screen.queryByText('해제 성공 채널')).toBeNull())
    expect(screen.getByText('해제 실패 채널')).not.toBeNull()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('구독 해제 성공 1개 · 실패 1개')
  })
})
