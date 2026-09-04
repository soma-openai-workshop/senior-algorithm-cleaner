import {
  ArrowRight,
  CheckCircle,
  ListMagnifyingGlass,
  LockKey,
  ShieldCheck,
} from '@phosphor-icons/react/ssr'
import Link from 'next/link'

const steps = [
  {
    icon: ShieldCheck,
    number: '1',
    title: '안전하게 연결',
    description: 'Google 로그인으로 내 구독 목록만 불러옵니다.',
  },
  {
    icon: ListMagnifyingGlass,
    number: '2',
    title: '채널 살펴보기',
    description: '건강정보 채널 후보와 분석에 쓸 영상 표본을 준비합니다.',
  },
  {
    icon: CheckCircle,
    number: '3',
    title: '내가 직접 결정',
    description: '결과를 읽고 정리할 채널은 내가 선택합니다.',
  },
]

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ revoke?: string }>
}) {
  const showManualRevoke = (await searchParams).revoke === 'manual'
  return (
    <main>
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="brand" href="/" aria-label="유튜브 건강검진 홈">
            <ShieldCheck aria-hidden size={34} weight="fill" />
            <span>유튜브 건강검진</span>
          </Link>
          <span className="topbar__status">
            <LockKey aria-hidden size={22} weight="bold" />내 정보는 이 기기에만 저장
          </span>
        </div>
      </header>

      <div className="page-shell">
        {showManualRevoke && (
          <aside className="error-banner manual-revoke" role="alert">
            <LockKey aria-hidden size={26} />
            <span>
              이 기기의 자료는 모두 삭제했습니다. Google 권한 해제가 확인되지 않았습니다.{' '}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
                Google 계정에서 직접 연결 해제하기
              </a>
            </span>
          </aside>
        )}
        <section className="intro-panel" aria-labelledby="page-title">
          <div className="intro-panel__copy">
            <p className="eyebrow">유튜브 건강정보 채널 점검 도우미</p>
            <h1 id="page-title">
              내 YouTube 구독을
              <br />
              한눈에 살펴보세요
            </h1>
            <p className="lead">
              건강정보 채널의 위험 신호와 반복 제작 가능성을 이유와 함께 보여드립니다. 자동으로
              구독을 해제하지 않습니다.
            </p>
            <Link className="primary-button" href="/collect">
              YouTube 연결하기
              <ArrowRight aria-hidden size={28} weight="bold" />
            </Link>
          </div>

          <aside className="privacy-card" aria-label="안심 안내">
            <ShieldCheck aria-hidden className="privacy-card__icon" size={72} weight="duotone" />
            <h2>안심하고 사용하세요</h2>
            <ul className="check-list">
              <li>
                <CheckCircle aria-hidden size={24} weight="fill" /> 비밀번호를 받지 않습니다
              </li>
              <li>
                <CheckCircle aria-hidden size={24} weight="fill" /> 분석 결과를 외부에 공개하지
                않습니다
              </li>
              <li>
                <CheckCircle aria-hidden size={24} weight="fill" /> 언제든 연결을 끊고 삭제할 수
                있습니다
              </li>
            </ul>
          </aside>
        </section>

        <section className="steps-section" aria-labelledby="steps-title">
          <div className="section-heading">
            <p className="eyebrow">이용 순서</p>
            <h2 id="steps-title">세 단계면 충분합니다</h2>
          </div>
          <div className="tile-grid">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <article className="utility-tile" key={number}>
                <span className="step-number" aria-label={`${number}단계`}>
                  {number}
                </span>
                <Icon aria-hidden size={58} weight="duotone" />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="notice-row" aria-label="중요 안내">
          <LockKey aria-hidden size={30} weight="duotone" />
          <div>
            <strong>선택과 해제는 반드시 본인이 합니다.</strong>
            <p>점수가 높아도 자동 선택하거나 자동 구독 해제하지 않습니다.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
