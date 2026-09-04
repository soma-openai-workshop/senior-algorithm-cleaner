import { ShieldCheck } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { ConnectionPanel } from '@/components/collection/connection-panel'

export default function CollectPage() {
  return (
    <main>
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="brand" href="/">
            <ShieldCheck aria-hidden size={34} weight="fill" />
            <span>유튜브 건강검진</span>
          </Link>
          <span className="step-status">1단계 · YouTube 연결과 구독 확인</span>
        </div>
      </header>
      <div className="page-shell collect-shell">
        <ConnectionPanel />
      </div>
    </main>
  )
}
