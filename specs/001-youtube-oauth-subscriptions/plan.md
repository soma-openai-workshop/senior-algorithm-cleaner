# Implementation Plan: YouTube OAuth and Subscription Collection

**Branch**: `feat/speckit-development` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-youtube-oauth-subscriptions/spec.md`

## Summary

Google OAuth 웹 서버 흐름으로 사용자를 연결하고 전체 YouTube 구독, 채널 정보와 최근 공개 업로드
메타데이터를 수집한 뒤 고감도 건강 후보를 준비한다. 구현은 한 개의 Next.js App Router/Node.js
애플리케이션과 SQLite를 사용한다. OAuth 토큰은 서버에서 암호화해 보관하고, 외부 응답은 Zod로
경계 검증한다. 긴 수집 작업은 별도 큐 대신 짧은 `advance` 요청과 영속 체크포인트·lease로
진행하여 중복 실행과 프로세스 재시작을 견딘다.

## Technical Context

**Language/Version**: TypeScript 6.0.x, Node.js 24 LTS

**Primary Dependencies**: Next.js 16.3.x, React 19.2.x, `google-auth-library` 11.x,
`better-sqlite3` 13.x, Zod 4.x

**Storage**: 로컬 SQLite 파일. OAuth access token은 AES-256-GCM 암호문으로 저장하고 작업·결과는
완료 또는 실패 후 24시간 TTL을 적용한다.

**Testing**: Vitest 5.x(unit/integration), 주입형 fetch fixture(provider contract),
Playwright 1.62.x(E2E)

**Target Platform**: 장기 실행 가능한 단일 Node.js 24 서버, 최신 Chrome/Edge/Firefox/Safari

**Project Type**: 단일 저장소의 서버 렌더링 웹 애플리케이션

**Performance Goals**: 수집 시작 응답 1초 이내, 진행 정보 최대 5초 간격 갱신, YouTube 배치 API는
허용 최대 50개 사용, 한 `advance` 요청은 20초 이내 또는 구성된 API-call budget에서 반환

**Constraints**: refresh token 장기 보관 금지, 사용자별 활성 작업 1개, 채널별 업로드 최대 500개,
완료 데이터 24시간 보관, OAuth·구독 ID의 클라이언트/로그/LLM 노출 금지, 개발·허용 테스트
계정에서만 실행, 비공식 YouTube 접근 금지, 기본 18px/조작 영역 52px 이상과 200% 확대 대응

**Scale/Scope**: 워크숍/프로토타입 단일 인스턴스, 사용자당 0~500개 구독 fixture, OAuth 연결·진행·
수집 결과·연결 해제 화면과 9개 HTTP operation

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. User-Controlled Irreversible Actions — PASS**: 이 기능은 쓰기 scope를 설명하지만
  `subscriptions.delete`와 채널 선택을 구현하지 않는다. 연결 해제만 별도의 사용자 확인 뒤 실행한다.
- **II. Evidence-Bounded Judgement — PASS**: 후보 분류는 공개 메타데이터의 매칭 신호와 정책 버전을
  남기며 위험 점수를 만들지 않는다. 누락·실패·상한 도달을 별도 상태로 보존한다.
- **III. Independent, Versioned Scores — PASS**: 두 점수는 범위 밖이다. 후보 분류만
  `health-candidate-policy-v1`으로 버전 관리한다.
- **IV. Privacy and API Compliance — PASS**: 공식 OAuth/YouTube API만 사용하고 토큰 서버 암호화,
  24시간 TTL, 즉시 삭제, 로그 redaction을 계약으로 둔다.
- **V. Specification and Verification First — PASS**: 구현 전에 spec, 이 plan, research, data model,
  HTTP contract, quickstart와 dependency-ordered tasks를 완성한다.
- **Simplicity gate — PASS**: 단일 앱과 SQLite로 충분하며 별도 worker, queue, Redis, ORM을 도입하지
  않는다.

### Post-design re-check

Phase 1 data model은 session 소유권과 cascade deletion을, HTTP contract는 CSRF·owner 검증과
부분 실패를, quickstart는 fixture/실제 계정 검증을 명시했다. 신규 constitution 위반은 없으며 모든
gate는 계속 PASS다.

## Project Structure

### Documentation (this feature)

```text
specs/001-youtube-oauth-subscriptions/
├── plan.md
├── research.md
├── data-model.md
├── design-brief.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── connection/
│   │   ├── collection-jobs/
│   │   └── oauth/
│   ├── collect/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── collection/
├── server/
│   ├── auth/
│   ├── collection/
│   ├── db/
│   ├── health-candidate/
│   ├── youtube/
│   └── env.ts
└── shared/
    └── contracts/

tests/
├── e2e/
├── integration/
├── unit/
└── fixtures/
```

**Structure Decision**: App Router UI와 Route Handler를 `src/app`에 두고, 브라우저에서 import할 수
없는 인증·DB·공급자 코드는 `src/server`에 `server-only` 경계로 둔다. Route Handler는 얇은 입력·
권한 경계이며 상태 전이와 공급자 호출은 기능 모듈이 담당한다. 외부 API 타입을 앱 전체에 퍼뜨리지
않고 `src/server/youtube`에서 내부 모델로 정규화한다.

**Visual Decision**: `design-brief.md`를 기준으로 알약 UI 참고 이미지의 연두색 강조, 밝은 회색
표면, 굵은 구획과 대형 타일을 재해석한다. Noto Sans KR과 Phosphor 아이콘을 사용하고 제3자
로고·캐릭터·캡슐 이미지는 사용하지 않는다.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| 없음      | 해당 없음  | 해당 없음                            |
