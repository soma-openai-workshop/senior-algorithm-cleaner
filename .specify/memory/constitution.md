<!--
Sync Impact Report
- Version change: 3.0.0 -> 3.1.0
- Breaking changes: one combined 0..100 risk score; two-stage content analysis;
  factory-like thumbnail judgement; direct context-first delivery without mandatory SpecKit artifacts.
- Synchronized documents: IMPLEMENTATION_HANDOFF, PRD, ANALYSIS_WORKFLOW, API_DATA_DETAILS.
-->
# 유튜브 건강검진 Constitution

## I. 사용자가 통제하는 구독 해제

채널은 기본 미선택이어야 한다. 점수로 채널을 자동 선택하거나 자동 구독 해제하지 않는다.
현재 사용자가 고른 `subscriptionId`만 확인 화면에 올리고, 명시적인 최종 승인 뒤에만
`subscriptions.delete`를 호출한다. 성공과 실패를 채널별로 보존하고 실패 항목만 재시도한다.

## II. 관찰된 근거만 사용

LLM은 제공된 영상·메타데이터·썸네일에서 관찰한 사실만 반환하며 외부 검색이나 추측을 하지
않는다. 모든 양수 점수에는 이유와 근거가 있어야 한다. `unknown`, 실패, 0점을 구분한다.
점수는 위험 신호이지 허위·사기·불법·AI 생성을 확정하는 판정이 아니다.

## III. 단일 방향의 버전 점수

모든 점수는 클수록 위험하다. 콘텐츠 리스크 0..50과 공장형 가능성 0..50을 합산하여 채널 위험도
0..100을 표시한다. 정책, 프롬프트, JSON schema와 집계식은 버전 관리한다. 결정적 규칙은 같은
정규화 입력에 항상 같은 결과를 내야 하며, 코드는 LLM의 형식·범위·산식만 검증한다.

## IV. 분석 계약

- 표본: 최신 공개 영상 2개 + 최근 1년 공개 영상 중 현재 누적 조회 수 상위 영상 3개. 중복은
  건너뛰고 가능하면 고유 영상 5개를 채운다. 롱폼·숏폼을 구분하지 않는다.
- 콘텐츠 0..50: 출처 불명확 0..30, 치료·복약 변경 유도 0..10, 구매 유도 0..10.
- 콘텐츠는 영상 URL 증거 추출과 증거 JSON 채점이라는 두 번의 독립 LLM 호출로 처리한다.
- 영상 채널 집계는 `round(최고 영상 0.5 + 성공 영상 평균 0.5)`이다. 비건강 영상도 같은
  루브릭으로 평가하고 0점 결과를 평균에 포함한다.
- 공장형 0..50: 최근 90일 5개 연속 업로드 창의 속도·기계적 규칙성 0..10, 선택 영상의
  `containsSyntheticMedia=true` 1개당 2점(최대 10), 최신 공개 영상 3개 썸네일의 전체적
  유사도 0..30. 업로드 원점수와 썸네일 0..10 측정 방식은 유지하고 각각 `round(raw/3)`과
  `raw*3`으로 최종 기여도를 변환한다.
- Gemini 단계는 증거 추출 → 콘텐츠 채점 → 썸네일 비교 순서로 완전히 분리한다. 각 단계의
  동시 호출 상한은 `GEMINI_JUDGE_CONCURRENCY`이며 현재 운영값은 8이다.
- 일시 오류, 429, 5xx, 시간 초과와 잘못된 JSON은 최초 요청을 포함해 최대 3회 시도한다.

## V. 개인정보와 API 경계

OAuth 토큰, API 키, 세션·구독 식별자는 서버 밖이나 LLM 입력으로 보내지 않는다. 공식 Google·
YouTube API와 Gemini 공개 YouTube URL 입력만 사용한다. 스크래핑, 비공식 자막, 영상 다운로드,
브라우저 자동화는 금지한다. 보관 기간은 `ANALYSIS_TTL_HOURS`로 제한한다.

## VI. 화면과 검증

채널은 분석 불가 우선, 이후 합산 위험도 내림차순으로 정렬한다. 등급은 0..20 `정상`, 21..60
`경고`, 61..100 `위험`이다. 카드에는 합산 점수, 두 하위 점수와 결정적으로 고른 간결한 한 줄
이유만 크게 표시하며 상세 근거 UI는 두지 않는다. 규칙은 단위 테스트, API·LLM 계약은 통합
테스트, 선택·확인·해제는 E2E로 검증한다.

## Governance

`docs/IMPLEMENTATION_HANDOFF.md`가 제품 결정의 최상위 문서다. 기능 변경은 관련 컨텍스트 문서와
테스트를 같은 변경에 포함한다. 단일 Next.js·TypeScript·SQLite 구조로 해결할 수 있는 요구에
별도 서비스나 큐를 추가하지 않는다.

**Version**: 3.1.0 | **Ratified**: 2026-09-04 | **Last Amended**: 2026-09-04
