# 분석 워크플로우 v2

## 전체 흐름

```text
수집 완료
  → 건강 후보 선별
  → 영상 표본·상세 준비
  → [A] 영상별 증거 추출 (동시 최대 8)
  → [B] 증거별 콘텐츠 채점 (동시 최대 8)
  → [C] 채널별 썸네일 3장 비교 (동시 최대 8)
  → 결정적 집계·한 줄 이유 생성
  → 위험도 목록
```

한 단계의 모든 작업이 종결된 뒤 다음 단계로 간다. 요청은 시간 초과, 429, 5xx, JSON 형식 오류에
대해 최초 포함 3회까지 시도한다.

## 후보와 표본

건강 후보 선별은 `health-candidate-v1` 규칙을 유지한다. 분석 표본에서는 건강 여부와 영상 형식을
다시 분류하지 않는다. 최신 공개 영상 2개를 먼저 넣고, 1년 이내 공개 영상을 `search.list`의 현재
누적 조회 수 내림차순으로 받아 중복을 건너뛰며 총 5개까지 채운다.

## 단계 A — 증거 추출

입력은 공개 YouTube URL 한 개와 `evidence-extraction-v1` schema다. 출력은 다음 구조다.

```ts
type VideoEvidence = {
  videoId: string;
  healthClaims: { claim: string; evidence: string; startSeconds?: number }[];
  actionDirectives: { action: string; evidence: string; startSeconds?: number }[];
  commercialSignals: { signal: string; evidence: string; startSeconds?: number }[];
  sourceSignals: {
    source: string;
    traceable: boolean;
    evidence: string;
    startSeconds?: number;
  }[];
  speakerIdentity: { name?: string; credential?: string; organization?: string };
  limitations: string[];
  model: string;
  promptVersion: "evidence-extraction-v1";
  extractedAt: string;
};
```

각 배열은 최대 10개다. 근거 문구와 가능한 타임스탬프만 기록하고 점수·추측·외부 검색 결과는
넣지 않는다.

## 단계 B — 콘텐츠 채점

입력은 `VideoEvidence`, 영상 제목·설명, 채널 제목·설명과 루브릭이다. URL, 조회 수, 구독자 수,
업로드 빈도, 합성 공개 표시와 썸네일은 전달하지 않는다.

```ts
type VideoRiskJudgement = {
  videoId: string;
  riskPoints: {
    sourceOpacity: RiskAxis;                 // 0..30
    treatmentChangeInducement: RiskAxis;     // 0..10
    purchaseInducement: RiskAxis;            // 0..10
  };
  totalRiskPoints: number;                   // 세 축 합
  limitations: string[];
  model: string;
  promptVersion: "content-risk-v1";
  judgedAt: string;
};
type RiskAxis = { points: number; reason: string; evidence?: string; startSeconds?: number };
```

### 출처 불명확 0..30

- 0: 중요한 건강 주장이 없거나 모두 추적 가능.
- 1..5: 대체로 명확하고 연결이 조금 부족.
- 6..12: 일부 주장만 출처 또는 연결이 있음.
- 13..20: `연구·전문가에 따르면` 같은 모호한 권위.
- 21..26: 강한 치료·예방 주장이나 발화자 자격·근거를 제공 내용에서 거의 확인 불가.
- 27..30: 익명 권위로 중대한 주장을 단정하고 추적 가능한 근거 없음.

자격이나 링크 존재만으로 0점이 되지 않는다. 일상적인 저위험 조언은 논문이 없다는 이유만으로
크게 올리지 않는다.

### 치료·복약 변경 유도 0..10

- 0: 변경 유도 없음.
- 1..2: 대체가 아닌 저위험 일반 생활 조언.
- 3..4: 안전 맥락을 갖춘 질환별 제안.
- 5..6: 안전 설명이 약한 구체적 복약 시점·용량 변경 또는 진료 지연.
- 7..8: 중단·변경, 진단·진료 회피, 대체요법 치환을 명시.
- 9..10: 즉시 중단·치환을 강요하거나 전문 진료를 부정.

### 구매 유도 0..10

- 0: 없음.
- 1..2: 건강 효과나 구매와 연결되지 않은 상품·일반 URL.
- 3..4: 공개된 협찬과 균형 잡힌 설명.
- 5..6: 건강 주장과 구매 URL·가격·주문 수단이 직접 연결.
- 7..8: 치료·예방 구매를 권하고 협찬이 불명확하거나 긴급성을 사용.
- 9..10: 공포·희소성·완치·즉효 표현으로 거래 압박.

## 단계 C — 썸네일 비교

최신 공개 영상 3개 썸네일을 한 요청에 함께 제공한다. 구성·텍스트 배치·색상·아트스타일을 나누지
않고 0..10 단일 원점수로 채점한다. 한 쌍만 비슷하면 최대 6, 7 이상은 세 장 모두 공통 패턴이
있어야 한다. 출력에는 점수, 쉬운 이유, 공통 패턴과 한계, 버전을 저장한다. 공장형 기여도는
`원점수 × 3`으로 0..30에 맞춘다.

## 결정적 공장형 계산

최근 90일 업로드를 게시 시각 순으로 놓고 모든 5개 연속 창을 검사한다. 창의 네 간격에 대해
`cadence=(last-first)/4`와 `NMAD=median(abs(gap-medianGap))/medianGap`을 계산한다.

| cadence | 속도 점수 |
|---:|---:|
| ≤3h | 20 |
| ≤6h | 18 |
| ≤12h | 15 |
| ≤24h | 12 |
| ≤48h | 8 |
| ≤72h | 4 |
| >72h | 0 |

| NMAD | 규칙성 점수 |
|---:|---:|
| ≤10% | 10 |
| ≤25% | 7 |
| ≤50% | 4 |
| >50% | 0 |

cadence가 72시간을 넘으면 규칙성은 0이다. 최고 창의 합을 업로드 패턴 점수로 사용한다.
표의 합은 0..30 측정 원점수이며 `round(원점수 / 3)`으로 최종 0..10 기여도를 만든다. 합성
공개 표시는 선택한 고유 영상 중 true 한 개당 2점, 최대 10점이다.

## 집계와 한 줄 이유

콘텐츠 채널 점수는 성공한 영상 중 최고 총점과 평균 총점을 0.5씩 반영해 반올림한다. 같은 공식을
각 콘텐츠 축에 적용해 한 줄 이유용 기여도를 얻는다. 공장형 점수는 업로드 + 합성 + 썸네일이다.
둘을 합산해 0..100 위험도를 만든다.

한 줄 이유는 여섯 기여도 중 큰 두 축의 결정적 한국어 문구를 결합한다. 동률은 치료·복약,
구매, 출처, 업로드, 합성, 썸네일 순이다. 모두 0이면 명확한 위험 신호가 없다는 고정 문구를 쓴다.
분석 불가 결과를 목록 최상단에 두고, 나머지는 점수 내림차순으로 정렬한다.
