'use client'

import { CalendarBlank, CheckCircle, FirstAid, Trash, Warning, X } from '@phosphor-icons/react'
import Image from 'next/image'
import { useState } from 'react'

export type RiskResult = {
  channelId: string
  title: string
  thumbnailUrl: string | null
  subscribedAt: string | null
  contentRisk: number | null
  factoryRisk: number | null
  combinedRisk: number | null
  riskLevel: 'normal' | 'warning' | 'danger' | 'unavailable'
  reason: string
  successfulVideoCount: number
  failedVideoCount: number
}

const levelText = { normal: '정상', warning: '경고', danger: '위험', unavailable: '확인 필요' }

type Confirmation = {
  confirmationId: string
  count: number
  channels: Array<{ channelId: string; title: string }>
}

type ExecutionResult = {
  successCount: number
  failureCount: number
  results: Array<{ channelId: string; title: string; status: 'success' | 'failed' }>
}

export function RiskResultList({
  items,
  analysisJobId,
  csrfToken,
}: {
  items: RiskResult[]
  analysisJobId: string
  csrfToken: string
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [execution, setExecution] = useState<ExecutionResult | null>(null)
  const [unsubscribed, setUnsubscribed] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const visibleItems = items.filter((item) => !unsubscribed.has(item.channelId))

  function toggle(channelId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }

  async function createConfirmation() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/unsubscribe-confirmations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ analysisJobId, channelIds: [...selected] }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? '선택 내용을 확인하지 못했습니다.')
      setConfirmation(result as Confirmation)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '선택 내용을 확인하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function execute() {
    if (!confirmation) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/unsubscribe-confirmations/${confirmation.confirmationId}/execute`,
        { method: 'POST', headers: { 'x-csrf-token': csrfToken } },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? '구독 해제를 완료하지 못했습니다.')
      const completed = result as ExecutionResult
      setExecution(completed)
      setUnsubscribed((current) => {
        const next = new Set(current)
        completed.results
          .filter((item) => item.status === 'success')
          .forEach((item) => next.add(item.channelId))
        return next
      })
      setSelected(
        new Set(
          completed.results
            .filter((item) => item.status === 'failed')
            .map((item) => item.channelId),
        ),
      )
      setConfirmation(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구독 해제를 완료하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="risk-results" aria-labelledby="risk-results-title">
      <div className="risk-results__heading">
        <div>
          <p className="eyebrow">검진 결과</p>
          <h3 id="risk-results-title">채널별 위험도</h3>
        </div>
        <strong>{selected.size}개 선택</strong>
      </div>
      <p className="result-explainer">
        점수가 높아도 자동 선택하지 않습니다. 직접 확인하고 고르세요.
      </p>
      <div className="risk-card-list">
        {visibleItems.map((item) => (
          <article className={`risk-card risk-card--${item.riskLevel}`} key={item.channelId}>
            <label className="risk-card__select">
              <input
                type="checkbox"
                checked={selected.has(item.channelId)}
                onChange={() => toggle(item.channelId)}
              />
              <span>이 채널 선택</span>
            </label>
            <div className="risk-card__identity">
              {item.thumbnailUrl ? (
                <Image
                  className="channel-thumbnail channel-thumbnail--large"
                  src={item.thumbnailUrl}
                  width={88}
                  height={88}
                  unoptimized
                  alt={`${item.title} 채널 썸네일`}
                />
              ) : (
                <span className="thumbnail-fallback channel-thumbnail--large">
                  <FirstAid aria-hidden size={42} />
                </span>
              )}
              <div>
                <h4>{item.title}</h4>
                <p className="subscription-date">
                  <CalendarBlank aria-hidden size={22} />
                  {item.subscribedAt
                    ? `${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(item.subscribedAt))} 구독`
                    : '구독 날짜 확인 불가'}
                </p>
              </div>
            </div>
            <div className="risk-card__score">
              <span className={`risk-level risk-level--${item.riskLevel}`}>
                {levelText[item.riskLevel]}
              </span>
              <strong>{item.combinedRisk ?? '—'}</strong>
              <small>/ 100</small>
            </div>
            <div className="risk-card__subscores">
              <span>
                콘텐츠 위험 <strong>{item.contentRisk ?? '—'} / 50</strong>
              </span>
              <span>
                공장형 가능성 <strong>{item.factoryRisk ?? '—'} / 50</strong>
              </span>
            </div>
            <p className="risk-card__reason">
              {item.riskLevel === 'unavailable' && <Warning aria-hidden size={25} />}
              {item.reason}
            </p>
          </article>
        ))}
        {visibleItems.length === 0 && execution?.successCount ? (
          <p className="success-banner" role="status">
            <CheckCircle aria-hidden size={28} weight="fill" /> 선택한 채널의 구독을 모두
            해제했습니다.
          </p>
        ) : null}
      </div>
      {error && <p className="error-banner">{error}</p>}
      {execution && (
        <p className="unsubscribe-result" role="status">
          구독 해제 성공 {execution.successCount}개 · 실패 {execution.failureCount}개
          {execution.failureCount > 0 && ' — 실패한 채널만 다시 선택해 두었습니다.'}
        </p>
      )}
      <div className="unsubscribe-action">
        <button
          className="danger-button"
          type="button"
          disabled={selected.size === 0 || busy}
          onClick={createConfirmation}
        >
          <Trash aria-hidden size={26} /> 선택한 {selected.size}개 구독 해제 검토
        </button>
      </div>
      {confirmation && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsubscribe-title"
          >
            <button
              className="dialog-close"
              type="button"
              aria-label="확인 창 닫기"
              onClick={() => setConfirmation(null)}
            >
              <X aria-hidden size={28} />
            </button>
            <Warning aria-hidden size={44} weight="duotone" />
            <h2 id="unsubscribe-title">정말 구독을 해제할까요?</h2>
            <p>아래 {confirmation.count}개 채널만 구독 해제합니다.</p>
            <ul className="confirmation-channel-list">
              {confirmation.channels.map((channel) => (
                <li key={channel.channelId}>{channel.title}</li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmation(null)}
              >
                취소
              </button>
              <button className="danger-button" type="button" disabled={busy} onClick={execute}>
                {busy ? '처리 중…' : '최종 구독 해제'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
