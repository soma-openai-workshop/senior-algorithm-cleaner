# Research: YouTube OAuth and Subscription Collection

## 1. Runtime and application boundary

**Decision**: Node.js 24 LTS 위에 Next.js 16 App Router와 TypeScript를 사용하는 단일 장기 실행
서버로 구현한다. Server Component는 DB를 직접 읽고, 브라우저 요청이 필요한 mutation과 polling은
Route Handler를 사용한다.

**Rationale**: 제품 handoff가 단일 TypeScript 웹앱을 잠갔다. Next.js 공식 문서는 App Router를
기본 경로로 안내하고, 쿠키 mutation은 Route Handler/Server Function에서만 수행하도록 한다.
Node.js 24는 LTS이며 Next.js의 최소 Node 요구사항을 충족한다.

**Alternatives considered**:

- 별도 API 서버: 동일 프로세스에서 해결할 수 있어 운영·인증 경계만 늘린다.
- serverless 배포: 로컬 SQLite와 긴 수집 작업의 실행 모델에 맞지 않는다.
- Server Action만 사용: OAuth callback과 명시적인 polling/status 계약에는 Route Handler가 더
  자연스럽다.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation),
[Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[Node.js 24 LTS migration](https://nodejs.org/en/blog/migrations/v22-to-v24)

## 2. OAuth client and session ownership

**Decision**: `google-auth-library`의 `OAuth2Client`로 authorization URL, PKCE, code exchange와
revoke URL을 처리한다. 브라우저에는 무작위 opaque session cookie만 전달하고, cookie 원문은
SHA-256 hash로 조회한다. OAuth `state`는 hash만 저장하며 10분 TTL, 일회성 consume, 현재 session
소유권을 검증한다.

**Rationale**: Google은 보안상 공식 Node.js OAuth library 사용을 권장하며, web-server flow에서
`state`로 CSRF를 방어해야 한다. scope는 현재 제품 계약대로 `youtube.force-ssl` 하나를 요청한다.
PKCE는 authorization code 탈취에 대한 추가 방어이며 state 검증을 대체하지 않는다.

**Alternatives considered**:

- Auth.js: 앱 로그인과 여러 provider session 기능은 필요하지 않고 OAuth access token 수명 정책을
  숨겨 현재 범위보다 복잡하다.
- OAuth HTTP endpoint 직접 구현: 공식 client가 제공하는 검증된 code exchange를 중복 구현한다.
- Google 계정 ID를 앱 사용자 키로 사용: 별도 identity scope가 필요하다. v1은 연결을 시작한
  브라우저 session을 owner로 삼으면 충분하다.

References: [YouTube web-server OAuth](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps),
[Google Auth Library for Node.js](https://googleapis.dev/nodejs/google-auth-library/latest/)

## 3. Token protection and CSRF

**Decision**: access token은 `TOKEN_ENCRYPTION_KEY`(base64 32 bytes)로 AES-256-GCM 암호화하여
SQLite에 ciphertext/iv/auth-tag로 저장한다. refresh token은 요청하거나 저장하지 않는다. session
cookie는 `HttpOnly`, `SameSite=Lax`, `Path=/`를 쓰고 production에서는 `Secure`를 추가한다.
모든 mutation은 session별 CSRF token과 allowlisted `Origin`을 함께 검증한다.

**Rationale**: token은 API 호출 순간에만 복호화해야 하며 cookie나 URL에 들어가면 안 된다.
SameSite만 의존하지 않고 명시적인 header token과 Origin을 검증하면 API mutation의 의도가
분명해진다.

**Alternatives considered**:

- access token을 encrypted cookie에 저장: 매 요청마다 브라우저로 비밀이 이동하며 cookie 탈취
  영향 범위가 커진다.
- refresh token 보관: 현재 한 시간 내 워크숍 흐름과 재연결 계약에 필요하지 않다.
- 세션 전체 JWT: 즉시 연결 해제와 서버측 데이터 삭제/만료를 어렵게 한다.

Reference: [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication)

## 4. YouTube adapter and response validation

**Decision**: OAuth는 공식 auth library를 쓰고 YouTube Data API 호출은 주입 가능한 server-side
`fetch` adapter로 구현한다. `subscriptions.list`, `channels.list`, `playlistItems.list`의 JSON은
각각 Zod schema로 parse한 뒤 최소 내부 모델로 정규화한다. 페이지 종료는 `nextPageToken` 부재로만
판단하며 channels는 50 IDs씩 요청한다.

**Rationale**: REST adapter는 기능에 필요한 세 endpoint만 노출하고 fixture 응답을 쉽게 주입할 수
있다. 외부 JSON을 신뢰하지 않는 constitution 요구와 API별 부분 실패 계약도 한 경계에서 처리한다.

**Alternatives considered**:

- 전체 `googleapis` package: 광범위한 generated client와 transitives가 이 기능의 세 호출보다
  크며 runtime response 검증을 대신하지 않는다.
- API 응답 타입 assertion: 필드 누락과 타입 변경을 정상값으로 오인할 수 있다.
- `pageInfo.totalResults`로 종료: 공식 pagination token과 달리 정확한 종료 cursor가 아니다.

References: [subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list),
[channels.list](https://developers.google.com/youtube/v3/docs/channels/list),
[playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)

## 5. Storage access

**Decision**: `better-sqlite3`와 versioned SQL migrations를 직접 사용한다. repository 함수는 prepared
statement만 사용하고 transaction에서 job state와 child records를 함께 갱신한다. 테스트는
temporary 또는 in-memory database를 각 case마다 생성한다.

**Rationale**: SQLite는 handoff에서 확정됐고 현재 entity 수와 쿼리는 작다. 직접 SQL은 별도 ORM의
schema DSL과 migration runtime을 추가하지 않으면서 partial unique index, cascade deletion과 lease
claim을 명시적으로 제어한다. `node:sqlite`는 현재 release-candidate 안정도라 v1 기본 driver로
선택하지 않는다.

**Alternatives considered**:

- `node:sqlite`: 외부 native dependency가 없지만 현재 안정도 표기가 release candidate다.
- Drizzle/Prisma: 향후 다중 DB 요구가 없고 현재 기능에서는 중복 schema layer가 된다.
- 메모리 저장: restart, TTL, 부분 진행과 즉시 삭제 요구를 충족하지 못한다.

References: [Node.js SQLite](https://nodejs.org/api/sqlite.html),
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## 6. Long-running collection without a queue

**Decision**: `POST /api/collection-jobs/{jobId}/advance`가 한 번에 최대 20초 또는 제한된 공급자 호출
수만 처리한다. job checkpoint를 transaction으로 claim하고 30초 lease를 부여한다. UI는 완료 전
최대 3초마다 advance를 호출하고 status를 렌더링한다. expired lease는 `interrupted`로 표시한 뒤
같은 checkpoint에서 재개할 수 있다. 사용자가 새로 시작을 선택하면 중단 작업을 `abandoned`로
전환하고 새 queued job을 만드는 동작을 한 transaction에서 처리한다.

**Rationale**: 응답 이후 실행되는 in-process promise는 프로세스 lifecycle에 안전하지 않다.
작업 단위를 요청 수명 안에 끝내고 cursor를 매 page/batch 뒤 저장하면 queue 없이도 재시작,
중복 클릭과 부분 실패를 처리할 수 있다. 동일 사용자의 활성 job은 partial unique index로 하나만
허용한다.

**Alternatives considered**:

- 요청 하나에서 전체 수집: 다수 구독/업로드에서 timeout과 진행 표시 요구를 위반한다.
- unawaited background promise: 서버 재시작 시 checkpoint 없이 유실될 수 있다.
- Redis/BullMQ worker: 워크숍 단일 서버 범위에 불필요한 서비스다.

## 7. Upload traversal and bounded sample

**Decision**: 채널마다 playlist page cursor와 scanned count를 저장한다. 최신 공개 영상 20개를
확보하고 90일 경계보다 오래된 항목을 확인할 때까지 순회하되, 최대 500개에서 중단한다. 저장 대상은
최근 90일 합집합 최신 20개이며 invalid/private/deleted placeholder는 제외 reason count로 남긴다.

**Rationale**: 공장형 기능이 다음 단계에서 최근 90일 빈도와 최신 콘텐츠를 동시에 필요로 한다.
상한은 비정상적인 대량 채널이 전체 작업을 독점하지 않게 한다. 각 채널 cursor를 분리하면 세
채널의 한 page씩 제한적으로 병렬 처리할 수 있다.

**Alternatives considered**:

- 최신 20개만 수집: 최근 90일 업로드 수를 계산할 수 없다.
- 모든 업로드 수집: 제품 요구보다 많은 데이터를 저장하고 무제한 실행 위험이 있다.
- `search.list(order=date)`: uploads playlist가 공식 채널 업로드 소스이며 다음 기능의 search quota를
  소모하지 않는다.

Reference: [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)

## 8. Health candidate policy

**Decision**: `health-candidate-policy-v1`은 Unicode NFKC·소문자·공백 정규화 후 채널명/설명과 최신
20개 제목/설명에서 한국어·영어 건강 lexicon phrase를 찾는 결정적 OR 정책이다. 매칭한 signal
category와 source field를 저장하며 점수나 확률은 만들지 않는다. fixture corpus에서 건강 채널
recall 95% gate를 통과해야 정책을 변경할 수 있다.

정확한 용어 ID, 경계·제외 규칙과 최소 fixture 구성은
`contracts/health-candidate-policy-v1.md`를 구현 계약으로 사용한다.

**Rationale**: 이 단계는 LLM 비용을 줄이는 고감도 후보 필터이므로 precision보다 recall이 우선이다.
결정적이고 버전이 있는 정책은 누락 사례를 fixture로 추가해 개선할 수 있다.

**Alternatives considered**:

- LLM 분류: 영상 judge 이전에 비용·실패 축을 추가하고 정책 재현성을 낮춘다.
- YouTube category만 사용: 채널 단위 건강 분류를 충분히 표현하지 않는다.
- 질환명 하나의 exact-match: 활용 문맥과 영문 표기를 놓친다.

## 9. Testing strategy

**Decision**: Vitest로 session crypto, state transition, pagination, normalization, candidate policy를
단위 테스트한다. 주입형 fetch fixture와 임시 SQLite로 OAuth/YouTube adapter 통합 테스트를 만들고,
Playwright로 연결 설명→가짜 OAuth callback→다중 페이지 수집→부분 결과→연결 해제를 검증한다.
실제 Google 테스트 계정 smoke test는 환경변수가 있을 때만 수동 실행한다.

**Rationale**: 기본 CI가 외부 계정·quota 없이 결정적으로 실행돼야 하며, 실제 provider 계약은 별도
opt-in smoke test로 확인해야 한다.

**Alternatives considered**:

- 모든 테스트가 Google API 호출: 비결정적이며 비밀과 quota가 필요하다.
- E2E만 작성: pagination/state/TTL 실패 원인을 국소화하기 어렵다.

References: [Vitest guide](https://vitest.dev/guide/),
[Playwright installation](https://playwright.dev/docs/intro)

## Resolved clarifications

모든 기술 선택이 위 결정으로 해소됐다. 구현 전에 남은 미결정 항목은 없다.
