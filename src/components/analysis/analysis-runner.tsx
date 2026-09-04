'use client'

import { ChartDonut, CheckCircle, SpinnerGap, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { RiskResultList, type RiskResult } from './risk-result-list'

type AnalysisJob = {
  id: string
  status: string
  phaseLabel: string
  counts: { processed: number; total: number; success: number; failure: number }
}

export function AnalysisRunner({
  collectionJobId,
  csrfToken,
}: {
  collectionJobId: string
  csrfToken: string
}) {
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const [items, setItems] = useState<RiskResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!job || !['completed', 'partial'].includes(job.status)) return
    let active = true
    fetch(`/api/analysis-jobs/${job.id}/results`)
      .then(async (response) => {
        if (!response.ok) throw new Error('분석 결과를 불러오지 못했습니다.')
        return response.json() as Promise<{ items: RiskResult[] }>
      })
      .then((results) => {
        if (active) setItems(results.items)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '분석 결과를 불러오지 못했습니다.')
      })
    return () => {
      active = false
    }
  }, [job])

  async function post(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? '분석 요청을 처리하지 못했습니다.')
    return result as AnalysisJob
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      let current = await post('/api/analysis-jobs', { collectionJobId })
      setJob(current)
      while (!['completed', 'partial', 'failed'].includes(current.status)) {
        current = await post(`/api/analysis-jobs/${current.id}/advance`)
        setJob(current)
      }
      if (['completed', 'partial'].includes(current.status)) {
        const response = await fetch(`/api/analysis-jobs/${current.id}/results`)
        if (!response.ok) throw new Error('분석 결과를 불러오지 못했습니다.')
        const results = (await response.json()) as { items: RiskResult[] }
        setItems(results.items)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '위험도 분석을 완료하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const progress = job?.counts.total
    ? Math.round((job.counts.processed / job.counts.total) * 100)
    : 0

  return (
    <section className="analysis-section" aria-labelledby="analysis-title">
      <div className="section-heading result-heading">
        <div>
          <p className="eyebrow">건강정보 채널 검진</p>
          <h2 id="analysis-title">위험 신호를 확인합니다</h2>
        </div>
        <span className="safe-badge">높을수록 주의 필요</span>
      </div>
      {!job && (
        <>
          <p className="result-explainer">
            영상 내용, 업로드 패턴과 최근 썸네일을 차례로 확인합니다. 몇 분 정도 걸릴 수 있습니다.
          </p>
          <button className="primary-button" type="button" onClick={start} disabled={busy}>
            <ChartDonut aria-hidden size={30} /> 위험도 분석 시작
          </button>
        </>
      )}
      {job && !['completed', 'partial'].includes(job.status) && (
        <div className="analysis-progress" aria-live="polite">
          <SpinnerGap className={busy ? 'spin' : ''} aria-hidden size={42} />
          <div>
            <strong>{job.phaseLabel}</strong>
            <p>
              {job.counts.processed} / {job.counts.total} 완료
            </p>
          </div>
          <progress max="100" value={progress} aria-label={`분석 진행률 ${progress}%`} />
        </div>
      )}
      {job && ['completed', 'partial'].includes(job.status) && (
        <p className="success-banner">
          <CheckCircle aria-hidden size={28} weight="fill" /> 위험도 분석이 끝났습니다.
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          <Warning aria-hidden size={26} /> {error}
        </p>
      )}
      {items.length > 0 && (
        <RiskResultList items={items} analysisJobId={job?.id ?? ''} csrfToken={csrfToken} />
      )}
    </section>
  )
}
