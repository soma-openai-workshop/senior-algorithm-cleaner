import { CalendarBlank, YoutubeLogo } from '@phosphor-icons/react'
import Image from 'next/image'

export type SafeSubscription = {
  channelId: string
  subscribedAt: string | null
  title: string
  description: string
  thumbnailUrl: string | null
}

function formatDate(value: string | null): string {
  if (!value) return '구독 날짜 확인 불가'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(value))
}

export function SubscriptionList({ items }: { items: SafeSubscription[] }) {
  return (
    <section className="result-section" aria-labelledby="subscription-list-title">
      <div className="section-heading result-heading">
        <div>
          <p className="eyebrow">수집 결과</p>
          <h2 id="subscription-list-title">구독 채널 {items.length}개</h2>
        </div>
        <span className="safe-badge">구독 ID는 화면에 표시하지 않음</span>
      </div>
      {items.length === 0 ? (
        <p className="empty-panel">구독 채널이 없습니다.</p>
      ) : (
        <div className="subscription-grid">
          {items.map((item) => (
            <article className="subscription-card" key={item.channelId}>
              {item.thumbnailUrl ? (
                <Image
                  className="channel-thumbnail"
                  src={item.thumbnailUrl}
                  alt={`${item.title} 채널 썸네일`}
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                <span className="thumbnail-fallback">
                  <YoutubeLogo aria-hidden size={38} weight="fill" />
                </span>
              )}
              <div>
                <h3>{item.title}</h3>
                <p className="channel-description">{item.description || '채널 설명이 없습니다.'}</p>
                <p className="subscription-date">
                  <CalendarBlank aria-hidden size={22} />
                  {formatDate(item.subscribedAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
