'use client'

import { Plugs, Warning } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

export function DisconnectControl({ csrfToken }: { csrfToken: string }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    dialogRef.current?.close()
    triggerRef.current?.focus()
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connection', {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
      })
      const result = (await response.json()) as {
        providerRevoked?: boolean
        manualRevocationUrl?: string | null
        error?: { message?: string }
      }
      if (!response.ok) throw new Error(result.error?.message ?? '연결을 끊지 못했습니다.')
      router.push(result.providerRevoked ? '/' : '/?revoke=manual')
      router.refresh()
    } catch (cause) {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : '연결을 끊지 못했습니다.')
    }
  }

  return (
    <div className="disconnect-area">
      <button
        ref={triggerRef}
        className="disconnect-trigger"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plugs aria-hidden size={24} />
        YouTube 연결 끊기
      </button>
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        onClose={() => triggerRef.current?.focus()}
      >
        <Warning aria-hidden size={54} weight="duotone" />
        <h2>연결을 끊을까요?</h2>
        <p>저장된 구독·채널·영상 표본과 분석 준비 결과를 이 기기에서 즉시 삭제합니다.</p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={close} disabled={busy}>
            취소
          </button>
          <button className="danger-button" type="button" onClick={disconnect} disabled={busy}>
            {busy ? '삭제 중…' : '연결 끊고 모두 삭제'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
