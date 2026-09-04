# 확정 분석 워크플로우

- 기준일: 2026-09-04
- 입력: 사용자의 YouTube 구독 목록
- 출력: 채널별 리스크 점수, 공장형 점수, 판단 이유

## 1. 전체 흐름

```text
YouTube OAuth
→ subscriptions.list 전체 페이지 수집
→ channels.list로 채널 메타데이터와 uploads ID 수집
→ uploads playlist에서 메타데이터 표본과 최신 영상 2개 수집
→ 채널·영상 메타데이터로 건강 관련 후보 선별
→ 건강 후보에 한해 인기 영상 3개 수집
→ 최신·인기 영상 videoId 중복 제거
→ videos.list로 상세 메타데이터 보강
→ LLM-as-judge로 영상별 리스크 루브릭 채점
→ 채널 리스크 점수 집계
→ 메타데이터로 공장형 점수 계산
→ 위험 채널 목록과 판단 이유 표시
→ 사용자 선택 및 최종 확인
→ 선택한 subscriptionId만 subscriptions.delete
```

## 2. 구독 및 채널 수집

### 2.1 구독 목록

`subscriptions.list(mine=true, part=id,snippet, maxResults=50)`를 `nextPageToken`이 없어질 때까지 호출한다.

저장 필드:

```ts
type SubscriptionRecord = {
  subscriptionId: string;
  subscribedAt: string;
  channelId: string;
  channelTitle: string;
  channelDescription: string;
  thumbnailUrl?: string;
};
```

`subscriptionId`는 구독 해제 실행에 사용한다.

### 2.2 채널 정보

채널 ID를 최대 50개씩 묶어 `channels.list(part=snippet,statistics,contentDetails)`를 호출한다.

필수 데이터:

- 채널명, 설명, 썸네일, 개설 시각
- 공개 영상 수
- uploads 재생목록 ID

구독자 수와 전체 조회 수는 결과 맥락에는 표시할 수 있지만 리스크·공장형 점수에는 사용하지 않는다.

## 3. 영상 수집

### 3.1 메타데이터 표본과 최신 영상

uploads 재생목록에서 다음 합집합을 수집하되 최신 50개로 제한한다.

- 최신 영상 20개
- 최근 30일에 게시된 영상

이 표본은 건강 후보 분류와 공장형 점수 계산에 사용한다. 가장 최근 공개 영상 2개는 LLM 평가 표본으로 선택한다.

최신 영상은 검색 인덱스가 아니라 uploads 재생목록을 사용한다.

### 3.2 인기 영상

건강 관련 후보 채널에만 다음 요청을 수행한다.

```text
search.list(
  channelId={channelId},
  type=video,
  order=viewCount,
  maxResults=3,
  part=snippet
)
```

`search.list`는 호출당 quota 100 units를 사용한다. 기본 일일 할당량 10,000 units를 다른 요청과 함께 소비하므로 모든 구독 채널에 무조건 호출하지 않는다. quota가 소진되면 인기 영상 없이 계속 분석하고 `popularSampleStatus = quota_unavailable`을 저장한다.

### 3.3 중복 제거와 상세 보강

최신 2개와 인기 3개를 `videoId`로 중복 제거한 뒤 `videos.list(part=snippet,contentDetails,statistics,status)`로 보강한다.

```ts
type JudgeVideoCandidate = {
  videoId: string;
  channelId: string;
  sampleOrigins: Array<"latest" | "popular">;
  title: string;
  description: string;
  publishedAt: string;
  duration?: string;
  viewCount?: number;
  tags?: string[];
  url: string;
};
```

## 4. 건강 관련 채널 후보

건강 후보 분류는 리스크 점수와 분리한다. 채널명·채널 설명·메타데이터 표본의 제목과 설명을 한 번에 LLM에 입력해 다음만 반환받는다.

```ts
type HealthChannelClassification = {
  isHealthRelated: boolean;
  confidence: number;
  topics: string[];
  reason: string;
};
```

- `confidence`는 0~1 범위다.
- `isHealthRelated=true`이고 `confidence >= 0.6`인 채널만 영상 평가를 진행한다.
- 건강·의료·식품·영양·질환·약·운동·생활요법과 명확한 관련이 있어야 한다.
- 분류 실패 또는 애매한 채널은 `분류 보류`로 남기고 구독 해제 후보에 넣지 않는다.

## 5. LLM-as-judge 입력

각 고유 영상은 고정된 하나의 judge 모델로 평가한다.

입력:

- 공개 YouTube 영상 또는 모델이 처리할 수 있는 영상 콘텐츠
- 영상 제목과 설명
- 채널명과 채널 설명
- 영상 게시 시각과 유형
- 고정된 루브릭 설명

영상 콘텐츠를 모델이 읽지 못하면 제목·설명만으로 평가하지 않고 `judgeStatus = unavailable`로 둔다. 메타데이터 전용 추론을 실제 콘텐츠 평가처럼 표시하지 않는다.

## 6. LLM-as-judge 출력

```ts
type VideoRiskJudgement = {
  videoId: string;
  isHealthRelated: boolean;
  scores: {
    medicalActionRisk: number;       // 0..40
    treatmentOverclaim: number;      // 0..20
    evidenceQualityRisk: number;     // 0..20
    deceptiveSalesRisk: number;      // 0..20
  };
  totalRiskScore: number;            // 0..100
  reasons: Array<{
    category: "medical_action" | "overclaim" | "evidence" | "deception_sales";
    explanation: string;
    quote?: string;
    startSeconds?: number;
  }>;
  limitations: string[];
  model: string;
  promptVersion: string;
  judgedAt: string;
};
```

필수 형식 검사는 수행한다.

- JSON schema와 타입 확인
- 항목별 점수 범위 확인
- 항목 합계와 `totalRiskScore` 일치 확인
- 이유 최대 3개 제한

이는 LLM 판단의 내용이 맞는지 재검증하는 단계가 아니다. 형식이 잘못되면 한 번 재시도하고 다시 실패하면 해당 영상을 `평가 실패`로 처리한다.

## 7. 리스크 루브릭

| 항목 | 0점 기준 | 중간 점수 기준 | 최대 점수 기준 |
|---|---|---|---|
| 의료행동 위험 0~40 | 구체적인 의료행동 권고 없음 | 개인차를 무시한 치료·복용 권고 | 약·진료 중단, 치료 대체, 응급진료 회피 또는 명백히 위험한 행동 권고 |
| 치료효과 과장 0~20 | 효과를 단정하지 않음 | 강한 효능을 일반화 | 완치·100%·무조건·누구나·단기간 효과를 확정 |
| 근거 품질 위험 0~20 | 식별 가능한 연구·기관·전문가 근거와 한계를 제시 | 일부 근거만 식별 가능 | 근거가 없거나 불명확한 권위·체험담만으로 핵심 치료 주장을 정당화 |
| 기만적 설득·판매 0~20 | 공포·음모·판매 유도 없음 | 긴급성 또는 불명확한 권위 사용 | 공포·은폐 음모를 이용하거나 치료 주장과 직접적인 제품 판매를 결합 |

LLM에게 채널의 구독자 수, 조회 수, 사용자의 구독 기간은 제공하더라도 리스크 판단 근거로 사용하지 말라고 명시한다.

## 8. 채널 리스크 집계

평가 성공한 고유 영상이 3개 이상일 때 계산한다.

```text
channelRiskScore
= max(videoRiskScores) × 0.6
+ mean(videoRiskScores) × 0.4
```

```ts
type ChannelRiskSummary = {
  channelId: string;
  score: number | null;
  level: "high" | "review" | "low" | "insufficient";
  evaluatedVideoCount: number;
  latestVideoCount: number;
  popularVideoCount: number;
  topReasons: Array<{
    videoId: string;
    videoTitle: string;
    explanation: string;
    quote?: string;
    startSeconds?: number;
  }>;
};
```

등급:

- `high`: 70 이상
- `review`: 40 이상 70 미만
- `low`: 40 미만
- `insufficient`: 평가 성공 영상 3개 미만

상위 이유는 가장 높은 점수를 받은 영상부터 중복 설명을 제거해 최대 3개만 선택한다.

## 9. 공장형 점수

최근 30일 및 최신 50개 메타데이터 표본으로 계산한다.

```text
최근 업로드량, 최대 25
- 8개 이상: 10
- 15개 이상: 18
- 30개 이상: 25

업로드 간격, 최대 20
- 중앙값 48시간 미만: 8
- 중앙값 24시간 미만: 14
- 중앙값 12시간 미만: 20

제목 반복, 최대 25
- 25 × 유사 제목 쌍 비율

설명 반복, 최대 15
- 15 × 유사 설명 쌍 비율

운영 기간 대비 생산량, 최대 15
- 활성 월당 12개 이상: 7
- 활성 월당 30개 이상: 15
```

- 제목은 Unicode 정규화, 소문자화, 숫자·날짜·질환명 치환 후 토큰 Jaccard 유사도 0.8 이상인 쌍을 반복으로 센다.
- 설명은 외부 링크, 연락처, 공통 채널 안내문을 제거한 뒤 같은 방식으로 비교한다.
- 데이터가 없는 항목은 0점으로 위장하지 않고 `미측정`으로 표시한다.
- 공장형 점수 등급은 `높음 70 이상`, `중간 40~69`, `낮음 0~39`로 표시한다.

## 10. 구독 해제 정책

분석 시스템은 채널을 자동 선택하거나 자동 구독 해제하지 않는다.

```text
채널 분석 결과 표시
→ 모든 체크박스 기본 해제
→ 사용자가 채널 선택
→ 선택한 채널명·개수 확인
→ 사용자 최종 승인
→ subscriptions.delete 실행
→ 채널별 성공·실패 기록
```

구독 해제 요청에는 화면에 표시했던 `subscriptionId`만 사용한다. 중복 실행을 방지하고, 실패 항목은 원인과 다시 시도 버튼을 제공한다.

## 11. 실패 처리

| 실패 | 처리 |
|---|---|
| 구독 목록 일부 페이지 실패 | 전체 분석 중단 후 재시도 안내 |
| 채널 상세 조회 실패 | 해당 채널을 수집 실패로 표시 |
| 인기 영상 quota 부족 | 최신 영상만 평가하고 한계 표시 |
| 영상 비공개·삭제·지역 제한 | 해당 영상을 제외하고 이유 표시 |
| LLM이 영상 콘텐츠를 읽지 못함 | 평가 불가, 메타데이터만으로 대체 채점하지 않음 |
| LLM 형식 오류 | 한 번 재시도 후 평가 실패 |
| 구독 해제 일부 실패 | 성공·실패를 분리하고 실패만 재시도 |

## 12. 제거된 흐름

다음은 구현하거나 호환 레이어를 남기지 않는다.

- Data Portability OAuth, archive initiate, polling, ZIP 다운로드
- 최근 시청 및 Takeout 파싱
- Gemini 근거 수집 후 OpenAI 주장 추출로 이어지는 다단계 파이프라인
- 추출 결과와 원문을 별도 검증하는 검증기
- 규칙 기반 콘텐츠 위험 점수
- 영상 좋아요·싫어요
- 고위험 채널 자동 구독 해제 또는 기본 선택
