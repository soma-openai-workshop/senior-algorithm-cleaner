"use client";

import { useEffect, useState } from "react";

type JsonRecord = Record<string, unknown>;

type Status = {
  configured: {
    clientId: boolean;
    clientSecret: boolean;
    apiKey: boolean;
    sessionSecret: boolean;
    baseUrl: string;
  };
  connected: boolean;
  tokenExpiresAt: string | null;
  grantedScope: string | null;
};

function jobIdFrom(payload: JsonRecord | null) {
  const body = payload?.payload;
  if (!body || typeof body !== "object") return null;
  const candidate = (body as JsonRecord).archiveJobId ?? (body as JsonRecord).jobId;
  return typeof candidate === "string" ? candidate : null;
}

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<JsonRecord | null>(null);
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    setStatus(await response.json());
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/status", { cache: "no-store" }).then((response) => response.json() as Promise<Status>),
      Promise.resolve(window.localStorage.getItem("portability-smoke-job-id")),
    ]).then(([nextStatus, savedJobId]) => {
      if (!active) return;
      setStatus(nextStatus);
      if (savedJobId) setJobId(savedJobId);
    });
    return () => { active = false; };
  }, []);

  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    try {
      const response = await fetch(path, init);
      const body = (await response.json()) as JsonRecord;
      setResult(body);
      const nextJobId = jobIdFrom(body);
      if (nextJobId) {
        setJobId(nextJobId);
        window.localStorage.setItem("portability-smoke-job-id", nextJobId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setResult(null);
    await refreshStatus();
  }

  const configured = status && status.configured.clientId && status.configured.clientSecret && status.configured.sessionSecret;

  return (
    <main>
      <header>
        <p className="eyebrow">REAL API SMOKE TEST</p>
        <h1>Google Data Portability</h1>
        <p className="lede">YouTube My Activity 아카이브를 실제로 요청하고 Google 응답을 확인합니다. 샘플 데이터나 지연 시뮬레이션은 사용하지 않습니다.</p>
      </header>

      <section className="card">
        <div className="sectionTitle">
          <div><span>01</span><h2>환경 확인</h2></div>
          <strong className={configured ? "good" : "bad"}>{configured ? "READY" : "CHECK ENV"}</strong>
        </div>
        {!status ? <p>환경을 확인하고 있습니다…</p> : (
          <div className="checks">
            <Check label="OAuth client ID" ok={status.configured.clientId} />
            <Check label="OAuth client secret" ok={status.configured.clientSecret} />
            <Check label="Session secret" ok={status.configured.sessionSecret} />
            <Check label="API key (선택 전달)" ok={status.configured.apiKey} optional />
            <div className="wide"><span>Callback URL</span><code>{status.configured.baseUrl}/api/auth/callback</code></div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="sectionTitle">
          <div><span>02</span><h2>전용 OAuth</h2></div>
          <strong className={status?.connected ? "good" : "muted"}>{status?.connected ? "CONNECTED" : "NOT CONNECTED"}</strong>
        </div>
        <p>일반 YouTube Data API 권한과 섞지 않고 <code>dataportability.myactivity.youtube</code> scope만 요청합니다.</p>
        <div className="actions">
          <a className="primary" href="/api/auth/portability/start">Google 계정 연결</a>
          {status?.connected && <button className="secondary" onClick={logout}>로컬 세션 삭제</button>}
        </div>
        {status?.connected && <dl><dt>토큰 만료 예정</dt><dd>{status.tokenExpiresAt}</dd><dt>승인 scope</dt><dd>{status.grantedScope}</dd></dl>}
      </section>

      <section className="card">
        <div className="sectionTitle"><div><span>03</span><h2>실 API 호출</h2></div></div>
        <div className="steps">
          <button disabled={!status?.connected || busy} onClick={() => call("/api/portability/access-type", { method: "POST" })}>1. Access type 확인</button>
          <button disabled={!status?.connected || busy} onClick={() => call("/api/portability/initiate", { method: "POST" })}>2. 최근 30일 아카이브 요청</button>
          <button disabled={!status?.connected || busy || !jobId} onClick={() => call(`/api/portability/status?jobId=${encodeURIComponent(jobId)}`)}>3. 작업 상태 조회</button>
        </div>
        <label className="job">
          <span>Archive job ID</span>
          <input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="아카이브 요청 후 자동 입력됩니다" />
        </label>
        <p className="hint">한 번만 허용한 scope로 이미 내보냈다면 재요청은 <code>RESOURCE_EXHAUSTED</code>가 정상입니다. 완료에는 수분에서 수시간이 걸릴 수 있습니다.</p>
      </section>

      <section className="card output">
        <div className="sectionTitle"><div><span>04</span><h2>응답</h2></div>{busy && <strong className="muted">CALLING…</strong>}</div>
        <pre>{result ? JSON.stringify(result, null, 2) : "아직 API를 호출하지 않았습니다."}</pre>
      </section>
    </main>
  );
}

function Check({ label, ok, optional = false }: { label: string; ok: boolean; optional?: boolean }) {
  return <div><span>{label}{optional ? " · optional" : ""}</span><strong className={ok ? "good" : optional ? "muted" : "bad"}>{ok ? "SET" : "MISSING"}</strong></div>;
}
