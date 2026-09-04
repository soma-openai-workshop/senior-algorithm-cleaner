import { ArrowClockwise, CheckCircle } from '@phosphor-icons/react'

const phaseCopy: Record<string, string> = {
  queued: '수집을 시작합니다',
  collecting_subscriptions: '구독 목록을 가져오는 중입니다',
  collecting_channels: '채널 정보를 확인하는 중입니다',
  collecting_uploads: '최신 영상 표본을 준비하는 중입니다',
  classifying_candidates: '건강정보 채널 후보를 찾는 중입니다',
  interrupted: '수집이 잠시 멈췄습니다',
  failed: '수집을 완료하지 못했습니다',
  partial: '일부 항목을 제외하고 준비했습니다',
  completed: '구독과 채널 준비를 마쳤습니다',
}

export type ProgressJob = {
  status: string
  counts: {
    discovered: number
    processed: number
    success: number
    failure: number
    duplicate: number
  }
}

export function ProgressPanel({
  job,
  busy,
  onResume,
  onRestart,
}: {
  job: ProgressJob
  busy: boolean
  onResume: () => void
  onRestart: () => void
}) {
  const done = ['completed', 'partial'].includes(job.status)
  return (
    <div className="progress-panel" aria-live="polite" aria-busy={busy}>
      <div className="progress-panel__title">
        {done ? (
          <CheckCircle aria-hidden size={32} weight="fill" />
        ) : (
          <ArrowClockwise aria-hidden size={32} />
        )}
        <strong>{phaseCopy[job.status] ?? '처리 상태를 확인하고 있습니다'}</strong>
      </div>
      <div className="count-grid">
        <div>
          <strong>{job.counts.discovered}</strong>
          <span>발견한 채널</span>
        </div>
        <div>
          <strong>{job.counts.success}</strong>
          <span>저장한 구독</span>
        </div>
        <div>
          <strong>{job.counts.processed}</strong>
          <span>확인한 영상</span>
        </div>
        <div>
          <strong>{job.counts.failure}</strong>
          <span>확인 필요</span>
        </div>
      </div>
      {!done && !busy && (
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onResume}>
            계속 수집하기
          </button>
          {job.status === 'interrupted' && (
            <button className="quiet-button" type="button" onClick={onRestart}>
              처음부터 다시 수집
            </button>
          )}
        </div>
      )}
    </div>
  )
}
