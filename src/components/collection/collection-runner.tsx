'use client'

import { CheckCircle, ListMagnifyingGlass, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { SubscriptionList, type SafeSubscription } from './subscription-list'
import { ChannelPreparationList, type ChannelPreparation } from './channel-preparation-list'
import { DisconnectControl } from './disconnect-control'
import { ProgressPanel, type ProgressJob } from './progress-panel'
import { AnalysisRunner } from '@/components/analysis/analysis-runner'

type JobView = ProgressJob & {
  id: string
  status: string
  counts: {
    discovered: number
    processed: number
    success: number
    failure: number
    duplicate: number
  }
  nextAction: string
}

export function CollectionRunner({ csrfToken }: { csrfToken: string }) {
  const [job, setJob] = useState<JobView | null>(null)
  const [items, setItems] = useState<SafeSubscription[]>([])
  const [prepared, setPrepared] = useState<ChannelPreparation[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function request(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? '요청을 처리하지 못했습니다.')
    return result as JobView
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      let current = await request('/api/collection-jobs')
      setJob(current)
      while (
        [
          'queued',
          'collecting_subscriptions',
          'collecting_channels',
          'collecting_uploads',
          'classifying_candidates',
          'interrupted',
        ].includes(current.status)
      ) {
        current = await request(`/api/collection-jobs/${current.id}/advance`)
        setJob(current)
      }
      if (['completed', 'partial'].includes(current.status)) {
        await Promise.all([loadAll(current.id), loadPrepared(current.id)])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구독 목록을 가져오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    setBusy(true)
    setError(null)
    try {
      const replacement = await request('/api/collection-jobs', { restartInterrupted: true })
      setJob(replacement)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '수집을 다시 시작하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function loadPrepared(jobId: string) {
    const collected: ChannelPreparation[] = []
    let cursor: string | null = null
    do {
      const url = new URL(`/api/collection-jobs/${jobId}/results`, window.location.origin)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await fetch(url)
      if (!response.ok) throw new Error('채널 준비 결과를 표시하지 못했습니다.')
      const page = (await response.json()) as {
        items: ChannelPreparation[]
        nextCursor: string | null
      }
      collected.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
    setPrepared(collected)
  }

  async function loadAll(jobId: string) {
    const collected: SafeSubscription[] = []
    let cursor: string | null = null
    do {
      const url = new URL(`/api/collection-jobs/${jobId}/subscriptions`, window.location.origin)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await fetch(url)
      if (!response.ok) throw new Error('구독 목록을 표시하지 못했습니다.')
      const page = (await response.json()) as {
        items: SafeSubscription[]
        nextCursor: string | null
      }
      collected.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
    setItems(collected)
  }

  const done = job && ['completed', 'partial'].includes(job.status)

  return (
    <section aria-labelledby="collection-title">
      <div className="collection-hero">
        <div>
          <p className="eyebrow">YouTube 연결 완료</p>
          <h1 id="collection-title">내 구독 채널을 가져옵니다</h1>
          <p className="lead">
            전체 페이지를 차례로 확인합니다. 가져오는 동안 브라우저를 닫지 마세요.
          </p>
        </div>
        <CheckCircle aria-hidden className="success-icon" size={82} weight="duotone" />
      </div>

      {!job && (
        <button className="primary-button" type="button" onClick={start} disabled={busy}>
          <ListMagnifyingGlass aria-hidden size={30} />
          구독 목록 가져오기
        </button>
      )}

      {job && <ProgressPanel job={job} busy={busy} onResume={start} onRestart={restart} />}
      {error && (
        <p className="error-banner" role="alert">
          <Warning aria-hidden size={26} />
          {error}
        </p>
      )}
      {done && <SubscriptionList items={items} />}
      {done && <ChannelPreparationList items={prepared} />}
      {done && prepared.some((item) => item.candidate) && job && (
        <AnalysisRunner collectionJobId={job.id} csrfToken={csrfToken} />
      )}
      <DisconnectControl csrfToken={csrfToken} />
    </section>
  )
}
