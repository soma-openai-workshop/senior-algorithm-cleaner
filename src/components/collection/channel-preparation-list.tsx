import { CheckCircle, FirstAid, Info, Warning } from '@phosphor-icons/react'
import Image from 'next/image'

export type ChannelPreparation = {
  channelId: string
  title: string
  description: string
  thumbnailUrl: string | null
  detailStatus: string
  candidate: boolean | null
  sampleStatus: string | null
  sampleCount: number
  limitations: string[]
}

export function ChannelPreparationList({ items }: { items: ChannelPreparation[] }) {
  const candidates = items.filter((item) => item.candidate)
  return (
    <section className="result-section" aria-labelledby="prepared-title">
      <div className="section-heading result-heading">
        <div>
          <p className="eyebrow">분석 준비 결과</p>
          <h2 id="prepared-title">건강정보 후보 채널 {candidates.length}개</h2>
        </div>
        <span className="safe-badge">룰 기반 1차 선별 · 위험도 점수 아님</span>
      </div>
      <p className="result-explainer">
        전체 구독 중 채널 이름·설명과 최신 영상에서 건강 관련 표현이 확인된 채널입니다.
      </p>
      <div className="subscription-grid">
        {candidates.map((item) => (
          <article className="candidate-card" key={item.channelId}>
            {item.thumbnailUrl ? (
              <Image
                className="channel-thumbnail"
                src={item.thumbnailUrl}
                width={72}
                height={72}
                unoptimized
                alt={`${item.title} 채널 썸네일`}
              />
            ) : (
              <span className="thumbnail-fallback">
                <FirstAid aria-hidden size={38} weight="duotone" />
              </span>
            )}
            <div className="candidate-card__content">
              <h3>{item.title}</h3>
              <p className="channel-description">{item.description || '채널 설명이 없습니다.'}</p>
              <p className={`candidate-status ${item.candidate ? 'candidate-status--yes' : ''}`}>
                {item.detailStatus !== 'ready' ? (
                  <Warning aria-hidden size={22} />
                ) : item.candidate ? (
                  <CheckCircle aria-hidden size={22} weight="fill" />
                ) : (
                  <Info aria-hidden size={22} />
                )}
                {item.detailStatus !== 'ready'
                  ? '채널 상세 확인 불가'
                  : item.candidate
                    ? '건강정보 분석 후보'
                    : '건강정보 후보 신호 없음'}
              </p>
              <p className="sample-copy">
                확인한 공개 영상 {item.sampleCount}개
                {item.sampleStatus === 'limited' ? ' · 표본 부족' : ''}
              </p>
            </div>
          </article>
        ))}
        {candidates.length === 0 && (
          <p className="empty-panel">건강정보 후보 채널을 찾지 못했습니다.</p>
        )}
      </div>
    </section>
  )
}
