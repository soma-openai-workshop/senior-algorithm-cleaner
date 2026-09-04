'use client'

import { ArrowRight, CheckCircle, LockKey, ShieldCheck, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { CollectionRunner } from './collection-runner'

type SessionView = { connected: boolean; csrfToken: string; sessionExpiresAt: string }

export function ConnectionPanel() {
  const [session, setSession] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/session', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('session_failed')
        return response.json() as Promise<SessionView>
      })
      .then(setSession)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError('안전한 연결 준비에 실패했습니다. 화면을 새로고침해 주세요.')
      })
    return () => controller.abort()
  }, [])

  async function connect() {
    if (!session) return
    setConnecting(true)
    setError(null)
    try {
      const response = await fetch('/api/oauth/start', {
        method: 'POST',
        headers: { 'x-csrf-token': session.csrfToken },
      })
      const result = (await response.json()) as {
        authorizationUrl?: string
        error?: { message?: string }
      }
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error?.message ?? 'oauth_start_failed')
      }
      window.location.assign(result.authorizationUrl)
    } catch (cause) {
      setConnecting(false)
      setError(
        cause instanceof Error && cause.message !== 'oauth_start_failed'
          ? cause.message
          : 'Google 연결을 시작하지 못했습니다.',
      )
    }
  }

  if (!session) {
    return (
      <section className="status-panel" aria-live="polite">
        <p>안전한 연결을 준비하고 있습니다…</p>
      </section>
    )
  }

  if (session.connected) return <CollectionRunner csrfToken={session.csrfToken} />

  return (
    <section className="connection-layout" aria-labelledby="connect-title">
      <div className="permission-panel">
        <p className="eyebrow">연결 전 꼭 확인하세요</p>
        <h1 id="connect-title">어떤 정보를 사용하나요?</h1>
        <p className="lead">
          구독 채널을 살펴보고, 나중에 사용자가 고른 채널만 구독 해제하기 위한 권한입니다.
        </p>
        <div className="permission-list">
          <div>
            <CheckCircle aria-hidden size={34} weight="fill" />
            <span>
              <strong>구독 목록 읽기</strong>
              <small>채널명, 설명, 구독한 날짜를 확인합니다.</small>
            </span>
          </div>
          <div>
            <CheckCircle aria-hidden size={34} weight="fill" />
            <span>
              <strong>선택한 구독만 해제</strong>
              <small>자동으로 해제하지 않으며 최종 확인을 거칩니다.</small>
            </span>
          </div>
          <div>
            <LockKey aria-hidden size={34} weight="duotone" />
            <span>
              <strong>이 기기에만 임시 저장</strong>
              <small>연결을 끊으면 저장된 자료를 즉시 삭제합니다.</small>
            </span>
          </div>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            <Warning aria-hidden size={26} />
            {error}
          </p>
        )}
        <button className="primary-button" type="button" disabled={connecting} onClick={connect}>
          {connecting ? '연결 중…' : 'Google 계정으로 연결'}
          {!connecting && <ArrowRight aria-hidden size={28} weight="bold" />}
        </button>
      </div>
      <aside className="privacy-card permission-aside">
        <ShieldCheck aria-hidden className="privacy-card__icon" size={84} weight="duotone" />
        <h2>이것은 하지 않아요</h2>
        <ul className="plain-list">
          <li>시청 기록은 가져오지 않습니다.</li>
          <li>Google 비밀번호는 볼 수 없습니다.</li>
          <li>채널을 자동 선택하지 않습니다.</li>
          <li>승인 없이 구독 해제하지 않습니다.</li>
        </ul>
      </aside>
    </section>
  )
}
