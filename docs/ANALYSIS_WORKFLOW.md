# 시니어 알고리즘 클리너 — 확정 분석 워크플로

- 기준일: 2026-09-04
- 상태: 구현 기준 확정
- 상위 기준: [IMPLEMENTATION_HANDOFF.md](./IMPLEMENTATION_HANDOFF.md)
- 요구사항: [PRD.md](./PRD.md)
- 외부 계약: [API_DATA_DETAILS.md](./API_DATA_DETAILS.md)

## 1. 설계 원칙

1. 분석 대상은 현재 사용자의 YouTube 구독 목록에서만 발견한다.
2. 공장형 가능성은 공개 메타데이터를 입력으로 하는 결정적 규칙 엔진이 계산한다.
3. 콘텐츠 리스크는 영상 하나당 한 번의 LLM judge가 세 항목을 직접 평가한다.
4. 별도 주장 추출 LLM, 의미 재검증 LLM과 규칙 기반 콘텐츠 재채점은 두지 않는다.
5. 코드 검증은 형식, 범위, 합계와 필수 이유에 한정한다.
6. 실패·미측정·필드 부재는 0 또는 `false`로 바꾸지 않는다.
7. 분석 단계와 구독 해제 단계는 서로 다른 서버 경계와 명령으로 분리한다.
8. 두 점수는 독립적으로 저장·표시하고 종합점수를 만들지 않는다.

## 2. 전체 처리 순서

```text
OAuth 세션 확인
→ 구독 전체 수집
→ 채널 상세 일괄 보강
→ 업로드 재생목록 수집
→ 건강 후보 선별
→ 최신 2개·인기 3개 선택
→ 영상 상세 일괄 보강과 중복 제거
→ 공장형 지표·점수 계산
→ 건강 후보 영상 LLM 평가
→ 채널 콘텐츠 리스크 집계
→ 결과·근거·한계 표시
→ 사용자 선택
→ 서버 확인 모달 데이터 생성
→ 최종 승인 검증
→ 선택 구독 삭제
→ 성공·실패 및 재시도 표시
```

분석 작업은 채널이나 영상 하나의 실패로 중단하지 않는다. 인증 철회, 데이터베이스 장애처럼 작업
전체의 전제가 깨진 경우만 `failed`로 종료하고 나머지는 `partial`로 완료한다.

## 3. 런타임 경계

- Next.js App Router, React, TypeScript
- 단일 장기 실행 Node.js 서버와 Route Handlers
- SQLite에 세션, 작업 상태, 정규화 결과, 판단 결과와 액션 감사 이벤트 저장
- Zod로 모든 외부 응답과 내부 명령 입력 검증
- Vitest로 순수 규칙·계약 테스트, Playwright로 선택·확인·삭제 E2E

별도 NestJS/FastAPI 서버, 외부 작업 큐, LangChain, 벡터 DB는 도입하지 않는다. 분석은 서버의
제한된 in-process worker에서 실행하고 상태를 SQLite에 기록한다. 서버 재시작 시 `running` 작업은
`interrupted` 원인으로 `partial` 처리해 사용자가 새 분석을 시작할 수 있게 한다.

## 4. 정규화 데이터 모델

```ts
type TriState = true | false | "unknown";

type SubscriptionRecord = {
  subscriptionId: string;
  channelId: string;
  channelTitle: string;
  channelDescription: string;
  thumbnailUrl: string | null;
  subscribedAt: string;
};

type ChannelRecord = {
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string;
  subscriberCount: bigint | null;
  viewCount: bigint | null;
  publicVideoCount: bigint | null;
};

type VideoRecord = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  durationSeconds: number | null;
  viewCount: bigint | null;
  privacyStatus: "public" | "unlisted" | "private" | "unknown";
  containsSyntheticMedia: TriState;
};

type VideoSelection = {
  videoId: string;
  reasons: Array<"latest" | "popular">;
  latestRank: 1 | 2 | null;
  popularRank: 1 | 2 | 3 | null;
};
```

API의 64비트 정수 문자열은 `bigint`로 파싱한다. JSON·SQLite 경계에서는 10진 문자열로 저장해
JavaScript 안전 정수 범위 손실을 막는다. 모든 시각은 원본 RFC 3339 UTC 문자열과 파싱된 epoch를
함께 다룰 수 있으나 저장 기준은 UTC다.

## 5. 단계별 수집

### 5.1 OAuth와 구독

OAuth 콜백은 `state`, redirect URI, 발급된 scope를 검증한다. 최초 구현은 구독 조회와 삭제를 모두
허용하는 `https://www.googleapis.com/auth/youtube.force-ssl` 하나를 요청하고 동의 직전에 삭제 권한이
필요한 이유를 설명한다. 액세스 토큰은 암호화된 서버 세션에만 두며 브라우저에는 불투명 세션 ID만
전달한다.

`subscriptions.list`는 `mine=true`, `part=id,snippet`, `maxResults=50`으로 호출하고
`nextPageToken`이 없을 때까지 순회한다. 중복 `subscriptionId`는 첫 레코드를 유지하고 경고를 남긴다.

### 5.2 채널 상세

고유 `channelId`를 최대 50개씩 묶어 `channels.list(part=snippet,statistics,contentDetails)`로
조회한다. 응답에 없는 ID는 `channel_unavailable`로 기록한다. 구독 목록의 채널명·썸네일은 상세
조회 실패 때 표시용으로만 유지하고 점수 입력으로 사용하지 않는다.

### 5.3 업로드 메타데이터

각 uploads 재생목록을 `playlistItems.list(part=snippet,contentDetails,status,maxResults=50)`로
최신순 순회한다. 다음 두 조건을 모두 만족하면 중단한다.

1. 최신 20개 항목을 확보했다.
2. 마지막으로 확인한 공개 후보 게시 시각이 분석 기준 시각의 90일 이전이다.

채널당 최대 500개 playlist item 또는 10페이지를 안전 상한으로 둔다. 상한에 닿으면
`collectionTruncated=true`를 기록한다. 삭제·비공개 placeholder는 개수와 이유만 남기고 제목 반복,
표본 선택과 업로드 간격 계산에서 제외한다. 공개 여부의 최종 판정은 `videos.list` 결과를 따른다.

### 5.4 건강 후보 선별

`health-candidate-policy-v1`은 채널 제목·설명과 최신 공개 영상 20개의 제목·설명에 Unicode NFKC,
소문자화, 공백 정규화를 적용한 뒤 고감도 건강 용어 사전을 검사한다.

후보 조건은 다음 중 하나다.

- 채널 제목이나 설명에 질환, 치료, 의약품, 의료 직역, 검사·시술을 뜻하는 강한 용어가 1개 이상
- 서로 다른 최신 영상 2개 이상에서 건강·영양·운동·증상·생체지표 문맥 용어가 각각 1개 이상
- 하나의 영상 제목·설명에 약한 건강 용어가 서로 다른 범주에서 2개 이상

URL, 해시태그와 태그는 보조 텍스트로만 사용한다. 이 단계는 LLM 호출을 줄이는 recall 우선 후보
분류이며 최종 건강 관련성은 각 영상 judge의 `isHealthRelated`가 결정한다. 사전과 규칙은 fixture와
함께 버전 관리한다. 후보 탈락 채널은 점수를 만들지 않고 `not_health_candidate`로 표시한다.

### 5.5 콘텐츠 평가 표본

- 최신: uploads 재생목록에서 `videos.list`로 public이 확인된 최신 영상 2개
- 인기: `search.list(part=id,snippet,channelId=<id>,type=video,order=viewCount,maxResults=3)` 결과 3개
- 병합: 최신 목록을 먼저 넣고 인기 목록을 추가하며 `videoId`로 중복 제거

같은 영상은 한 번만 평가하되 `latest`와 `popular` 선택 이유를 모두 보존한다. 검색 결과는 검색
색인 특성상 불완전할 수 있으므로 실제 조회 수 전체 순위라고 표현하지 않고 `YouTube 검색 기준 인기
표본`으로 표시한다. 상세 조회에서 public이 아니거나 채널 ID가 다르면 제외한다.

### 5.6 공장형 표본

- 업로드 패턴: 수집한 최근 90일 공개 영상, 최대 500개
- 반복도: 최근 30일 공개 영상과 최신 20개의 합집합을 최신순으로 최대 50개
- 합성 공개 비율: 반복도 표본 중 `containsSyntheticMedia`가 true/false로 확인되는 영상

표본 상한에 닿은 채널은 원시 개수에 `atLeast` 의미를 보존하고 결과 한계에 `수집 상한 도달`을
표시한다.

## 6. 공장형 가능성 엔진

### 6.1 공통 출력

```ts
type FactoryLikelihoodResult = {
  channelId: string;
  policyVersion: "factory-policy-v1";
  deductions: {
    uploadPattern: FactoryDeduction;       // 0..40
    templateRepetition: FactoryDeduction;  // 0..40
    syntheticMedia: FactoryDeduction;      // 0..20
  };
  totalDeduction: number;
  factoryLikelihood: number;
  productionHealthScore: number;
  limitations: string[];
};

type FactoryDeduction = {
  status: "measured" | "unmeasured" | "partial";
  points: number | null;
  reason: string;
};
```

항목이 `unmeasured`면 `points=null`이다. 화면의 총 공장형 가능성은 측정된 항목 점수 합계를
그대로 표시하되 `부분 측정` 배지를 붙이고, 모든 항목이 미측정이면 총점도 `null`이다. 미측정 최대
점수를 비례 확대하거나 0으로 간주하지 않는다.

### 6.2 업로드 간격 및 집중 업로드 — 최대 40

```ts
type UploadPatternMetrics = {
  uploadsLast30Days: number;
  uploadsLast90Days: number;
  medianUploadIntervalHours: number | null;
  activeUploadDaysLast30Days: number;
  maxUploadsInSingleDay: number;
  burstUploadRatio: number;
};
```

`burstUploadRatio`는 최근 30일 업로드 중 같은 현지 날짜에 2개 이상 게시된 영상의 비율이다.
날짜 경계는 채널 국가가 아니라 제품 기준인 `Asia/Seoul`로 고정하고 정책 버전에 포함한다.

측정 조건은 최근 90일 공개 영상 5개 이상과 서로 다른 게시 시각 2개 이상이다. 충족하지 않으면
전체 항목을 `unmeasured`로 둔다.

중앙 간격 점수(최대 24):

| 중앙 간격 | 감점 |
|---:|---:|
| 6시간 이하 | 24 |
| 12시간 이하 | 20 |
| 24시간 이하 | 14 |
| 48시간 이하 | 8 |
| 48시간 초과 | 0 |

집중 업로드 점수(최대 16)는 비율 점수와 하루 최대치 보너스 합을 16으로 제한한다.

| `burstUploadRatio` | 감점 |
|---:|---:|
| 0.75 이상 | 12 |
| 0.50 이상 | 8 |
| 0.25 이상 | 4 |
| 0.25 미만 | 0 |

| `maxUploadsInSingleDay` | 추가 감점 |
|---:|---:|
| 5개 이상 | 4 |
| 3~4개 | 2 |
| 0~2개 | 0 |

### 6.3 제목·설명 템플릿 반복도 — 최대 40

```ts
type TemplateRepetitionMetrics = {
  sampledVideoCount: number;
  titleTemplateRatio: number;
  descriptionTemplateRatio: number;
  repeatedTitleExamples: string[][];
  repeatedDescriptionExamples: string[][];
};
```

측정 최소 표본은 공개 영상 5개다. 정규화 순서는 다음과 같다.

1. Unicode NFKC, 소문자화, HTML entity 해제와 연속 공백 축소
2. 날짜, 회차, 순번, 독립 숫자, emoji와 장식 특수문자를 자리표시자로 치환
3. 설명의 URL, 이메일, 전화번호, 해시태그 블록, 광고·협찬 고지 제거
4. 표본의 60% 이상에서 같은 마지막 줄이 나오면 채널 footer로 제거
5. 빈 문자열과 20자 미만 설명은 설명 비교 분모에서 제외

두 문자열의 유사도는 `0.6 × 문자 3-gram cosine + 0.4 × token Jaccard`다. 유사도 0.82 이상인
쌍을 반복 쌍으로 보고 `반복 쌍 수 / 비교 가능한 전체 쌍 수`를 각 비율로 정의한다. 단순히 같은
질환·식품 단어만 공유하고 문장 구조가 다른 경우를 줄이기 위해 token Jaccard 단독으로 판정하지
않는다.

| 반복 쌍 비율 | 제목 감점(최대 24) | 설명 감점(최대 16) |
|---:|---:|---:|
| 0.70 이상 | 24 | 16 |
| 0.50 이상 | 18 | 12 |
| 0.30 이상 | 12 | 8 |
| 0.15 이상 | 6 | 4 |
| 0.15 미만 | 0 | 0 |

각 예시는 유사도가 높은 순으로 원문 쌍 최대 3개를 저장한다. UI에 전체 설명을 노출하지 않고
각 문자열을 120자로 제한한다.

### 6.4 합성 콘텐츠 표시 비율 — 최대 20

```text
syntheticMediaRatio = true 개수 / (true 개수 + false 개수)
```

확인 가능한 영상이 3개 미만이면 `unmeasured`다. `unknown`은 분모에서 제외하고 별도 개수로
표시한다.

| 확인 비율 | 감점 |
|---:|---:|
| 0.75 이상 | 20 |
| 0.50 이상 | 14 |
| 0.25 이상 | 8 |
| 0 초과 | 4 |
| 0 | 0 |

### 6.5 공장형 등급

| 점수 | 등급 |
|---:|---|
| 70~100 | 높음 |
| 40~69 | 확인 필요 |
| 0~39 | 뚜렷한 공장형 신호 없음 |
| 계산 불가 | 미측정 |

등급은 표시 편의를 위한 구간일 뿐 콘텐츠 리스크 또는 구독 해제 권고로 변환하지 않는다.

## 7. LLM 영상 judge

### 7.1 어댑터 결정

v1은 `GeminiYouTubeVideoJudgeAdapter`를 사용한다. 공개 YouTube URL, 영상 제목·설명, 채널명·설명,
세 항목 루브릭과 JSON Schema를 한 요청에 전달한다. Gemini의 YouTube URL 입력은 preview이므로
어댑터 밖으로 SDK 타입을 노출하지 않고 모델 ID는 `GEMINI_JUDGE_MODEL` 구성값에 둔다.

OpenAI Responses API 모델은 공식적으로 영상 입력을 지원하지 않으므로 v1 judge로 쓰지 않는다.
비공식 자막 API, 브라우저 스크래핑, 영상·음성 다운로드나 프레임 추출 폴백도 금지한다.

### 7.2 출력 계약

```ts
type VideoRiskJudgement = {
  videoId: string;
  isHealthRelated: boolean;
  signals: {
    actionInducement: ActionInducementSignals;
    purchaseInducement: PurchaseInducementSignals;
    sourceClarity: SourceClaritySignals;
  };
  deductions: {
    actionInducement: RiskDeduction;
    purchaseInducement: RiskDeduction;
    sourceClarity: RiskDeduction;
  };
  totalRiskScore: number;
  safetyScore: number;
  summaryReasons: string[];
  limitations: string[];
  model: string;
  promptVersion: "video-risk-prompt-v1";
  schemaVersion: "video-risk-schema-v1";
  judgedAt: string;
};

type RiskDeduction = {
  points: number;
  reason: string;
  evidence?: string;
  startSeconds?: number;
};

type ActionInducementSignals = {
  recommendsChangingMedication: boolean;
  recommendsStoppingMedication: boolean;
  recommendsChangingTreatment: boolean;
  recommendsAvoidingDiagnosisOrCare: boolean;
  presentsAlternativeAsReplacement: boolean;
  acknowledgesIndividualDifferences: boolean;
  advisesProfessionalConsultation: boolean;
};

type PurchaseInducementSignals = {
  productMentioned: boolean;
  purchaseUrlPresent: boolean;
  priceMentioned: boolean;
  orderOrContactMethodPresent: boolean;
  sponsorshipDisclosed: boolean;
  healthClaimLinkedToProduct: boolean;
  urgencyOrScarcityUsed: boolean;
};

type SourceClaritySignals = {
  speakerIdentified: boolean;
  speakerCredentialSpecified: boolean;
  credentialVerifiableFromProvidedContext: boolean;
  organizationIdentified: boolean;
  studyOrGuidelineNamed: boolean;
  sourceLinkProvided: boolean;
  claimTraceableToSource: boolean;
  reliesOnAnonymousAuthority: boolean;
};
```

`ActionInducementSignals`, `PurchaseInducementSignals`, `SourceClaritySignals`는 Handoff의 필드를
그대로 사용하고 모든 boolean을 필수로 한다. 출력 JSON Schema에는 `additionalProperties=false`,
정수 범위, 배열 최대 길이와 필수 필드를 지정한다.

### 7.3 형식 검증

코드는 다음만 검증한다.

1. JSON과 Zod schema가 유효하다.
2. 응답 `videoId`가 요청 영상과 같다.
3. 감점 범위가 각각 0~40, 0~30, 0~30인 정수다.
4. 세 감점의 합이 `totalRiskScore`이고 `safetyScore = 100 - totalRiskScore`다.
5. 감점이 1점 이상이면 해당 `reason`이 비어 있지 않다.
6. `summaryReasons`가 최대 3개이고 감점이 큰 항목 순서다.
7. `startSeconds`가 있으면 0 이상이고 영상 길이를 5초 넘게 벗어나지 않는다.

코드는 근거의 의미가 맞는지, 신호 boolean과 점수가 논리적으로 맞는지 재해석하지 않는다. 이런
품질은 버전 고정 eval fixture와 사람 검토로 관리한다.

### 7.4 실패와 재시도

| 실패 | 처리 |
|---|---|
| 네트워크, 429, 5xx | 1초·3초 지수 백오프와 jitter로 최대 2회 재시도 |
| timeout | 요청당 120초 후 중단, 재시도 후 `timeout` |
| schema·산식 오류 | 새 독립 요청으로 1회 재시도, 다시 실패하면 `schema_invalid` |
| 비공개·삭제·지역·연령 제한 | 재시도 없이 `unavailable` 또는 `blocked` |
| 안전 필터 차단 | `blocked`, 점수 없음 |
| `isHealthRelated=false` | 성공 결과로 저장하되 채널 집계 표본에서 제외 |

실패 영상에는 점수와 안전 점수를 만들지 않는다. 같은 `videoId + model + promptVersion +
schemaVersion`의 성공 결과는 작업 내에서 재사용한다.

## 8. 채널 콘텐츠 리스크 집계

`status=completed && isHealthRelated=true`인 고유 영상만 포함한다. 3개 미만이면 점수는 `null`,
등급은 `표본 부족`이다.

```text
raw = max(video.totalRiskScore) × 0.6
    + mean(video.totalRiskScore) × 0.4
channelRisk = roundHalfUp(raw)
```

이유는 영상 감점 점수가 큰 순, 같은 점수면 영상 리스크가 큰 순, 다시 같으면 최신 영상 순으로
후보를 만든다. NFKC·소문자화·숫자 제거 후 token Jaccard 0.8 이상이면 중복 이유로 보고 먼저 나온
하나만 유지한다. 최대 3개를 표시하며 영상 제목, `evidence`, `startSeconds`를 연결한다.

## 9. 결과와 액션

### 9.1 결과 행

각 채널 행은 다음을 포함한다.

- 기본 미선택 checkbox
- 채널명, 썸네일, 구독 시작일
- 콘텐츠 리스크 점수·등급 또는 표본 부족
- 공장형 가능성 점수·등급·부분 측정 상태
- 이유 최대 3개와 영상 제목, 가능한 근거·타임스탬프
- 선택된 영상 수, 평가 성공·실패·비건강 영상 수
- API, 검색 색인, LLM과 표본 한계

구독자·조회 수를 표시할 때는 `YouTube 제공 맥락 정보이며 점수에 사용하지 않음`을 함께 보인다.
자체 계산 점수에는 `YouTube가 제공한 점수가 아님`을 명시한다.

### 9.2 확인 계약

```ts
type UnsubscribeConfirmation = {
  confirmationId: string;
  userId: string;
  analysisJobId: string;
  subscriptionIdsHash: string;
  channelNames: string[];
  count: number;
  expiresAt: string;
  consumedAt: string | null;
};
```

서버는 선택된 ID가 현재 사용자 작업의 활성 구독인지 확인한 뒤 정렬된 ID 목록의 SHA-256 해시와
5분 만료 confirmation을 만든다. 최종 요청은 원래 ID 목록과 confirmation ID를 함께 보내며 서버가
소유권, 해시, 만료와 미사용 상태를 다시 확인한다. 검증 성공 시 먼저 consumed 처리해 중복 제출을
막은 후 삭제를 실행한다.

### 9.3 삭제와 재시도

`subscriptions.delete(id=<subscriptionId>)`는 동시성 3으로 개별 실행한다. 204는 성공,
`subscriptionNotFound`는 현재 상태가 이미 해제된 것으로 별도 성공 취급한다. 인증 실패는 남은
호출을 중단하고, 429·5xx는 최대 2회 재시도한다. 나머지 실패는 채널별 오류 코드만 사용자에게
표시하고 원문 응답이나 토큰은 노출하지 않는다.

실패 재시도는 새 선택 목록과 새 confirmation을 요구한다. 성공한 subscription ID는 재시도 목록에
포함할 수 없다.

## 10. 저장, 보안과 관측성

- 사용자·구독·분석·judge·액션 데이터 기본 TTL: 분석 완료 또는 실패 후 24시간
- 연결 해제: Google token revoke 요청 후 세션과 사용자 관련 저장 데이터 즉시 삭제
- LLM 전송: 공개 YouTube URL, 공개 영상·채널 메타데이터, 루브릭만 허용
- LLM 금지: 사용자 ID, 이메일, 구독 시각, `subscriptionId`, OAuth 토큰
- 로그 허용: `jobId`, 단계, 익명화 provider 이름, HTTP 상태, attempt, duration, count
- 로그 금지: 토큰, API 키, 설명 원문, judge evidence, 구독 ID, 채널·영상 전체 URL

YouTube API 데이터로 만든 공장형 점수는 자체 파생 지표임을 명확히 표시한다. 공개 배포는 파생
지표와 데이터 저장에 대한 YouTube 컴플라이언스 검토 및 필요한 명시적 승인을 완료한 뒤 허용한다.

## 11. 테스트와 평가

### 단위 테스트

- 시각·bigint·tri-state 정규화
- 30/90일 경계, 중앙 간격, burst 비율
- footer 제거, 문자열 유사도, 반복 쌍 비율
- 세 공장형 감점 구간과 미측정 처리
- 채널 집계 반올림과 이유 중복 제거
- confirmation 해시·만료·재사용 방지

### 통합 테스트

- subscriptions 페이지네이션과 channels/videos 50개 batching
- 비공개·삭제 영상, 부분 응답과 쿼터 오류
- 최신·인기 병합과 중복 제거
- Gemini 성공, timeout, 429, 차단, schema 오류
- subscriptions.delete 부분 성공과 인증 만료

### LLM eval

- 치료·복약 중단, 진료 회피와 대체요법
- 일반 건강 설명과 저위험 생활 습관 제안
- 제품 언급만 있는 사례와 건강 주장+구매 경로+긴급성 사례
- 구체 출처, 모호한 `연구에 따르면`, 확인 불가 전문가 권위
- 같은 근거의 중복 감점 방지
- 화면 문구와 발언 타임스탬프, 정보 부족 제한 표시

### E2E

- 최초 결과에서 모든 checkbox 미선택
- 선택 목록과 확인 모달의 채널명·개수 일치
- 취소 시 delete 0회
- 최종 승인 시 선택 ID만 delete
- 이중 제출 방지와 실패 항목만 재시도

## 12. 정책 버전

```ts
type AnalysisProvenance = {
  healthCandidatePolicyVersion: "health-candidate-policy-v1";
  factoryPolicyVersion: "factory-policy-v1";
  judgeProvider: "gemini";
  judgeModel: string;
  judgePromptVersion: "video-risk-prompt-v1";
  judgeSchemaVersion: "video-risk-schema-v1";
  channelAggregationVersion: "channel-risk-v1";
  actionPolicyVersion: "unsubscribe-confirmation-v1";
  calculatedAt: string;
};
```

정책이나 프롬프트가 바뀌면 버전을 올리고 기존 결과를 덮어쓰지 않는다. 규칙 정책만 바뀐 경우
보존 기간 안의 정규화 입력으로 재계산할 수 있지만 judge 점수는 새 프롬프트 버전으로 자동 재해석하지
않는다.
