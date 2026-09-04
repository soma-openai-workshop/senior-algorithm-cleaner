# 시니어 알고리즘 클리너 — 확정 분석 워크플로우

- 기준일: 2026-09-04
- 상태: 구현 기준으로 확정
- 관련 문서: [PRD.md](./PRD.md), [API_DATA_DETAILS.md](./API_DATA_DETAILS.md)

이 문서는 두 사용자 입력 경로에서 채널과 영상을 발견한 뒤, 영상 근거 수집, 주장 구조화, 검증, 결정적 점수 계산과 액션 결정까지 이어지는 구현 경계를 고정한다.

## 1. 핵심 원칙

1. `Data Portability API`와 `YouTube Data API`는 분석 대상을 발견하고 공개 메타데이터를 수집한다.
2. `Gemini API`는 공개 YouTube 영상을 읽고 발언·화면 문구·타임스탬프를 근거 문서로 만든다.
3. `OpenAI API`는 Gemini 근거 문서와 YouTube 메타데이터를 정해진 주장 스키마로 구조화한다.
4. 검증기는 OpenAI의 구조화 결과를 동일한 Gemini 근거 문서와 저장된 YouTube 메타데이터 원문에 대조한다.
5. 검증을 통과한 주장만 결정적 점수 엔진에 들어간다.
6. 점수, 등급과 액션은 LLM이 아니라 순수 규칙 기반 엔진이 결정한다.
7. 영상당 Gemini 근거 수집은 한 번 수행하고 저장한 결과를 이후 단계와 재검증에서 재사용한다.
8. LLM 또는 데이터 수집이 실패하면 추측으로 보완하지 않고 `근거 부족`으로 처리하며 액션 제안을 금지한다.
9. 액션 정책 엔진은 후보와 기본 선택 여부까지만 결정한다. 실제 YouTube 쓰기 API는 결과와 근거를 본 사용자가 최종 승인한 뒤에만 호출한다.

```text
사용자 데이터와 공개 메타데이터 수집
→ 대표 영상 선택
→ Gemini 영상 근거 수집
→ 근거 문서 저장
→ OpenAI 주장 구조화
→ 구조화 결과와 근거 문서 대조
→ 영상 콘텐츠 점수 계산
→ 채널 콘텐츠 위험도와 공장형 가능성 계산
→ 액션 후보와 기본 선택 정책 결정
→ 사용자에게 근거와 한계 표시
→ 사용자 최종 승인
→ 승인된 YouTube 액션 실행
```

## 2. 입력 경로 A — 구독 목록

```text
YouTube subscriptions.list(mine=true)
→ subscriptionId와 channelId 수집
→ channels.list로 채널 공개정보와 uploads 재생목록 ID 수집
→ playlistItems.list로 최근 업로드 수집
→ videos.list로 영상 메타데이터 보강
```

이 경로의 목적은 구독 중인 채널을 찾고, 채널을 평가할 대표 영상을 선택하며, 구독 취소에 필요한 `subscriptionId`를 확보하는 것이다.

## 3. 입력 경로 B — 최근 시청

```text
Data Portability API로 YouTube 활동 아카이브 요청
→ 완료 상태와 서명된 다운로드 URL 확인
→ 아카이브에서 실제 시청 활동만 파싱
→ videoId와 watchedAt 수집
→ videos.list로 영상과 channelId 보강
→ channels.list로 채널 공개정보와 uploads 재생목록 ID 수집
→ playlistItems.list로 해당 채널의 최근 업로드 수집
```

이 경로의 목적은 사용자가 실제로 본 영상을 찾고, 영상별 싫어요 후보와 해당 채널의 반복 패턴을 분석하는 것이다. `watchedAt`, 시청 횟수와 최근성은 위험 점수에 사용하지 않는다.

## 4. 두 경로 병합

두 경로에서 찾은 채널은 `channelId`로, 영상은 `videoId`로 중복을 제거한다.

```ts
type ChannelOrigin = {
  channelId: string;
  fromSubscription: boolean;
  fromWatchHistory: boolean;
  subscriptionId?: string;
  watchedVideoIds: string[];
};
```

동일 채널이 두 경로에 모두 존재하면 한 번만 채널 정보를 수집하고 분석한다. 최근 시청 경로에서 발견한 영상은 영상 단위 결과를 위해 반드시 본문 분석한다. 이 중 선택 규칙에 든 영상만 채널 집계용 대표 영상 3~5개에 포함하며, 그 밖의 시청 영상 점수는 채널 위험도 표본에 섞지 않는다.

## 5. 채널 공개정보와 결정적 파생 지표

YouTube Data API에서 채널 설명, 개설 시각, 공개 영상 수, 업로드 재생목록과 최근 영상의 제목·설명·태그·게시 시각·썸네일 등을 수집한다.

다음 값은 LLM 없이 코드로 계산한다.

```ts
type ChannelProductionMetrics = {
  channelAgeDays: number;
  totalVideoCount: number;
  uploadsLast30Days: number;
  uploadsPerActiveMonth: number;
  medianUploadIntervalHours: number | null;
  titleDuplicateRatio: number;
  titleTemplateSimilarity: number;
  descriptionDuplicateRatio: number;
  thumbnailSimilarity?: number;
};
```

- `uploadsLast30Days`: 업로드 재생목록을 페이지 순회해 최근 30일 영상 수 계산
- `uploadsPerActiveMonth`: 공개 영상 수를 채널 운영 개월 수로 나눈 값
- `titleDuplicateRatio`: 정규화한 제목의 완전 중복 비율
- `titleTemplateSimilarity`: 상투어 제거 후 문자열 유사도로 계산
- `descriptionDuplicateRatio`: 공통 링크와 안내문을 제거한 본문 중복 비율
- `thumbnailSimilarity`: 썸네일을 확보할 수 있을 때 이미지 유사도와 OCR 반복을 계산

이 값들은 공장형 가능성을 설명하는 근거이며, 단독으로 콘텐츠 위험도나 액션 제안을 만들지 않는다.

## 6. 대표 영상 선택

모든 영상을 Gemini로 분석하지 않는다. 업로드 재생목록을 기준일 이전으로 페이지 순회해 `최근 30일 업로드 수`는 전체를 정확히 센다. 제목·설명 반복성은 `최신 20개`와 `최근 30일 영상`의 합집합 중 최신 50개를 메타데이터 표본으로 삼는다. 이 표본에서 결정적 선택 규칙으로 대표 영상 3~5개를 고른다.

선택 우선순위는 다음과 같다.

1. 사용자가 실제로 최근 시청한 영상
2. 제목·설명에 치료 중단, 완치, 보장, 위험한 섭취·시술 표현이 있는 영상
3. 판매·상담·공동구매 링크나 연락처가 있는 영상
4. 반복 제목 또는 반복 설명 그룹의 대표 영상
5. 가장 최근 게시된 건강 관련 후보 영상

각 영상에는 선택 이유를 저장한다.

```ts
type VideoSelectionReason =
  | "watched"
  | "risky_metadata"
  | "sales_metadata"
  | "repeated_template"
  | "recent";
```

## 7. Gemini 영상 근거 수집

Gemini는 공개 YouTube URL을 입력받아 점수나 허위 여부가 아닌 관측 가능한 근거만 반환한다.

```ts
type VideoEvidenceDocument = {
  videoId: string;
  provider: "gemini";
  model: string;
  promptVersion: string;
  extractedAt: string;
  evidenceHash: string;
  status: "completed" | "unavailable" | "failed";
  segments: Array<{
    id: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    modality: "speech" | "screen_text";
  }>;
};
```

Gemini의 책임은 다음으로 제한한다.

- 건강 주장과 관련된 발언 구간 수집
- 화면에 나타난 관련 문구 수집
- 각 근거의 시작·종료 타임스탬프 제공
- 발언을 요약하지 않고 가능한 한 원문 그대로 기록

Gemini는 위험 점수, 최종 등급, 허위·불법 여부 또는 액션을 생성하지 않는다.

### 7.1 한 번 수집하고 재사용

영상당 성공한 Gemini 결과는 불변의 중간 산출물로 저장한다. OpenAI 주장 추출, 검증, 점수 재계산, 결과 화면과 평가 하네스는 모두 같은 저장 결과를 사용하며 검증을 위해 Gemini를 다시 호출하지 않는다.

```text
videoId + Gemini model + promptVersion
→ 하나의 VideoEvidenceDocument
```

모델이나 영상 근거 추출 프롬프트가 변경되면 기존 결과를 덮어쓰지 않고 새 버전으로 생성한다. 네트워크 오류 재시도는 가능하지만, 최종 성공 결과 하나를 해당 버전의 기준 근거 문서로 고정한다.

## 8. OpenAI 주장 구조화

OpenAI는 YouTube 제목·설명·채널 설명과 저장된 `VideoEvidenceDocument`만 입력받는다. YouTube 영상을 직접 가져오거나 점수를 생성하지 않는다.

모든 추출 항목은 어느 입력 원문에서 왔는지 구분 가능한 참조를 가진다. 따라서 영상 세그먼트뿐 아니라 제목·설명에서 얻은 신호도 같은 방식으로 검증할 수 있다.

```ts
type EvidenceRef =
  | {
      sourceType: "video_segment";
      videoId: string;
      evidenceSegmentId: string;
      sourceSpan: string;
    }
  | {
      sourceType: "video_title" | "video_description";
      videoId: string;
      sourceSpan: string;
    }
  | {
      sourceType: "channel_description";
      channelId: string;
      sourceSpan: string;
    };

type ClaimExtraction = {
  schemaVersion: string;
  isHealthContent: boolean;
  claims: Array<{
    evidence: EvidenceRef;
    subject?: string;
    subjectType: "food" | "supplement" | "drug" | "procedure" | "behavior" | "other";
    condition?: string;
    claimedOutcome: "prevention" | "treatment" | "cure" | "symptom_relief" | "biomarker_change" | "none";
    recommendedAction: "stop_medication" | "replace_treatment" | "consume" | "undergo_procedure" | "none";
    certainty: "guaranteed" | "strong" | "qualified" | "unclear";
    appliesUniversally: boolean;
    context: "endorsed" | "quoted" | "criticized" | "negated" | "unclear";
    hazardCandidate?: {
      kind: "substance" | "dosage" | "procedure" | "interaction";
      target: string;
      amountOrMethod?: string;
    };
  }>;
  evidenceReferences: Array<{
    evidence: EvidenceRef;
    kind: "study" | "institution" | "expert" | "guideline" | "unspecified_research";
    name?: string;
    identifierOrUrl?: string;
  }>;
  authorityClaims: Array<{
    evidence: EvidenceRef;
    kind: "doctor" | "pharmacist" | "institution" | "expert" | "other";
    name?: string;
    credential?: string;
  }>;
  salesSignals: Array<{
    evidence: EvidenceRef;
    kind: "purchase_link" | "contact" | "group_buy" | "sponsorship" | "product_sale" | "consultation";
    target?: string;
  }>;
  persuasionSignals: Array<{
    evidence: EvidenceRef;
    kind: "conspiracy" | "fear" | "urgency" | "testimonial";
  }>;
};
```

각 배열과 중첩 객체는 엄격한 Zod 스키마로 정의한다. 스키마는 버전을 부여하고, 알 수 없는 필드와 허용된 enum 밖의 값은 거부한다. LLM이 `hazardCandidate`를 제시하더라도 위해성 확정은 하지 않으며, 규칙 엔진이 버전 관리되는 위험 행동 카탈로그와 일치시킨 경우에만 `H-DANGER`를 적용한다.

## 9. 추출 결과 검증

검증기는 OpenAI가 구조화한 정보와 그 입력에 사용된 동일한 Gemini 근거 문서 및 저장된 YouTube 메타데이터 원문을 대조한다.

필수 검증은 다음과 같다.

1. JSON과 Zod 스키마가 유효하다.
2. `EvidenceRef.sourceType`에 필요한 ID가 존재하고 현재 분석 대상과 일치한다.
3. `video_segment`의 `evidenceSegmentId`가 Gemini 근거 문서에 존재하고, `sourceSpan`이 해당 세그먼트의 `text`에 정확히 존재한다.
4. 메타데이터 참조의 `sourceSpan`이 지정한 제목·영상 설명·채널 설명 원문에 정확히 존재한다.
5. 영상 근거의 타임스탬프가 음수가 아니며 시작 시각이 종료 시각보다 빠르다.
6. 부정·비판·인용 맥락은 원 주장으로 채점하지 않는다.
7. 같은 근거 구간에 겹치는 규칙은 가장 높은 점수 하나만 적용할 수 있도록 중복을 표시한다.
8. 검증에 실패한 항목은 폐기하고 점수 입력에서 제외한다.

이 검증은 `OpenAI 구조화 결과가 Gemini 근거에 충실한가`를 보장한다. Gemini 근거가 실제 영상과 완전히 일치하는지는 자동으로 확정할 수 없으므로 결과 화면에 YouTube 타임스탬프 링크를 제공해 사람이 원본을 확인할 수 있게 한다.

## 10. 결정적 판정 엔진

### 10.1 영상 콘텐츠 점수 엔진

검증된 주장에 `PRD.md`의 `H-*` 고정 규칙을 적용한다. 동일한 구조화 입력과 규칙 버전에는 항상 동일한 점수와 하드 플래그가 나와야 한다.

규칙 입력의 대응은 다음처럼 고정한다.

- `claims`: `H-REPLACE`, `H-TREAT`, `H-FOOD-AS-DRUG`, `H-GUARANTEE`, `H-UNIVERSAL`
- `claims.hazardCandidate`와 버전 관리 위험 행동 카탈로그의 일치: `H-DANGER`
- 치료 주장과 같은 영상의 `salesSignals`: `H-SALE`
- `persuasionSignals`: `H-CONSPIRACY`, `H-URGENCY`, `H-TESTIMONIAL`
- 식별 정보가 없는 `authorityClaims`와 `evidenceReferences`: `H-AUTHORITY`, `H-SOURCE`

위험 행동 카탈로그는 사람이 검토한 고정 fixture로 관리한다. 라이브 검색 결과나 LLM의 상식만으로 `H-DANGER` 또는 하드 플래그를 만들지 않는다. 카탈로그에 없는 후보는 점수 없이 `확인 필요` 근거로만 표시한다.

### 10.2 채널 콘텐츠 위험도 엔진

대표 영상 3~5개의 영상별 콘텐츠 점수, 같은 위험 주장 반복성, 권위 표방과 판매 유도 반복성을 고정 공식으로 집계한다. 건강 관련 영상 또는 검증된 영상 근거가 부족하면 `근거 부족`으로 처리한다.

### 10.3 공장형 가능성 엔진

채널 공개정보와 최대 50개의 메타데이터 표본에서 생산량과 제목·설명·썸네일 반복성을 계산한다. 의미 기반 `주장 구조 반복`은 Gemini로 분석한 대표 영상 3~5개 안에서만 계산하고 결과에 분석 영상 수를 함께 표시한다. 공장형 점수만으로 콘텐츠 위험 또는 액션 제안을 만들지 않는다.

### 10.4 액션 정책 엔진

콘텐츠 점수, 공장형 점수, 하드 플래그, 표본 충분성과 근거 검증 상태를 입력받아 다음 중 하나의 제안만 결정한다.

```ts
type ActionDecision =
  | { mode: "default_selected"; action: "unsubscribe" | "dislike"; reasonCode: string }
  | { mode: "user_selection"; action: "unsubscribe" | "dislike"; reasonCode: string }
  | { mode: "none"; reasonCode: string };
```

`default_selected`는 결과 화면에서 액션 후보가 기본 선택된다는 뜻이지, 즉시 API를 호출한다는 뜻이 아니다. 별도 실행 계층은 최종 승인 토큰과 현재 사용자의 OAuth 권한을 확인한 뒤 승인된 항목만 처리한다. LLM 실패, 근거 불일치 또는 표본 부족 시 `default_selected`를 반환해서는 안 된다.

## 11. 대상별 최종 결과

### 구독 채널

```text
대표 영상들의 검증된 콘텐츠 점수
+ 채널 내 위험 주장 반복성
+ 별도 공장형 가능성
→ 채널 등급과 구독 취소 정책
```

### 최근 시청 영상

```text
실제로 시청한 영상의 검증된 콘텐츠 점수
+ 해당 채널의 콘텐츠 위험도와 반복 맥락
→ 영상 등급과 싫어요 정책
```

위험한 채널에서 게시했다는 이유만으로 내용상 위험 신호가 없는 최근 시청 영상에 싫어요를 주지 않는다.

## 12. 실패와 폴백 정책

| 상황 | 처리 |
|---|---|
| 공개 영상이 아니거나 Gemini가 읽지 못함 | 영상은 `근거 부족`, 액션 제안 금지 |
| Gemini 근거 수집 실패 | 제목·설명만 보조 표시, 액션 제안 금지 |
| OpenAI 호출 실패 | 저장된 Gemini 근거는 유지하고 재시도 가능, 점수 계산 보류 |
| OpenAI 출력 스키마 오류 | 해당 추출 결과 폐기 |
| `sourceSpan` 불일치 | 해당 주장 폐기 |
| 건강 영상 표본 부족 | 채널을 `근거 부족`으로 표시 |
| 공장형 신호만 높음 | 정보만 표시하고 액션 없음 |
| YouTube 쓰기 API 실패 | 분석 결과와 실행 실패를 분리해 표시 |

OpenAI를 Gemini 실패 시 영상 분석 대체재로 사용하지 않는다. OpenAI가 영상 원문을 보지 못한 상태에서 제목·설명만 분석했다면 그 결과는 액션 제안 근거가 될 수 없다.

## 13. 저장과 재현성

각 결과에는 사용된 버전을 함께 저장한다.

```ts
type AnalysisProvenance = {
  videoId: string;
  geminiModel: string;
  videoEvidencePromptVersion: string;
  evidenceHash: string;
  openaiModel: string;
  claimSchemaVersion: string;
  claimPromptVersion: string;
  scoringRuleVersion: string;
  actionPolicyVersion: string;
};
```

이 정보로 다음 조합을 고정해 동일한 근거에서 점수와 액션을 재현한다.

```text
저장된 Gemini 근거
+ OpenAI 주장 추출 버전
+ 점수 규칙 버전
+ 액션 정책 버전
= 분석 결과
```

점수 규칙이나 액션 정책만 바뀌면 LLM을 다시 호출하지 않고 저장된 검증 결과에서 재계산한다.

## 14. 기술 경계

### 14.1 제품 런타임 스택

확정된 제품 런타임 스택은 다음과 같다.

- Next.js 16 App Router, React 19, TypeScript
- Node.js 런타임에서 실행되는 단일 Next.js 서버
- Next.js Route Handlers: 별도 백엔드 서버 없이 API, OAuth, 분석 작업과 데이터 접근 담당
- YouTube Data API, Google Data Portability API
- Gemini API: 공개 YouTube 영상 근거 수집
- OpenAI Responses API: 주장 구조화
- Zod: 외부 응답과 추출 스키마 검증
- 순수 TypeScript 함수: 점수와 액션 정책
- SQLite: 작업 상태, 근거 문서, 분석 결과와 실행 감사 기록

### 14.2 개발·검증 스택

- Vitest: 단위·계약·결정적 평가 테스트
- Playwright: 브라우저에서 핵심 사용자 흐름을 확인하는 E2E 테스트

Vitest와 Playwright는 제품 기능이 아니며 `devDependencies`로만 둔다. 프로덕션 코드에서 import하지 않고, 배포 이미지에는 Playwright 브라우저 바이너리를 포함하지 않는다.

### 14.3 서버 구성

Next.js 애플리케이션 자체를 Node.js 서버로 실행한다. Next.js 외부에 별도의 Node.js 서버, NestJS 서버 또는 Python API 서버를 추가하지 않는다.

```text
Node.js 런타임
└── Next.js 서버 1개
    ├── React 화면과 정적 자산 제공
    ├── Route Handlers API
    ├── Google OAuth와 세션 처리
    ├── YouTube·Data Portability API 연동
    ├── Gemini·OpenAI 서버 호출
    ├── 검증·점수·액션 정책 엔진
    └── SQLite 접근
```

로컬과 단일 Node 서버 배포 환경에서는 다음 표준 명령으로 실행한다.

```bash
npm run build
npm run start
```

여기서 `next start`가 Node.js 런타임 위에서 웹 화면과 Route Handlers를 함께 제공한다. `Node.js 단일 서버`는 Next.js와 별개의 서버를 의미하지 않는다.

### 14.4 현재 범위에서 제외하는 기술

- NestJS 또는 별도 Express/Fastify 서버
- Python/FastAPI 분석 서버
- 프론트엔드와 백엔드의 독립 배포
- 마이크로서비스와 별도 작업 큐
- LangChain과 벡터 데이터베이스

별도 백엔드는 다수의 클라이언트가 같은 API를 사용하거나, 장시간 작업을 전담하는 워커가 필요하거나, 단일 Next.js 서버의 배포 제약이 실제로 확인될 때 다시 검토한다.

비공식 YouTube 자막 API, 브라우저 스크래핑, `yt-dlp`를 통한 영상·음성 다운로드는 사용하지 않는다. API 키와 OAuth 토큰은 서버에서만 사용하고 저장소, 브라우저 번들, 제출 ZIP에 포함하지 않는다.

## 15. 검증 하네스

검증은 두 층으로 분리한다.

1. 저장된 Gemini 근거 fixture에 OpenAI 주장 추출과 검증기를 실행하는 추출 평가
2. 검증된 주장 fixture에 점수·채널 집계·액션 정책을 실행하는 완전 결정적 평가

```text
npm run eval:extraction
npm run eval:rules
npm run test:e2e
```

`eval:rules`는 외부 API를 호출하지 않아야 하며, 같은 fixture와 규칙 버전에서 항상 같은 결과를 내야 한다. 실제 Gemini 호출을 포함하는 평가는 별도 명령으로 분리하고 데모의 필수 성공 경로로 삼지 않는다.
