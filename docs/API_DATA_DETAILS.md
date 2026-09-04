# API·데이터 계약 v2

## YouTube Data API

| 단계 | 호출 | 주요 필드 |
|---|---|---|
| 구독 | `subscriptions.list(mine=true, part=id,snippet)` | subscriptionId, channelId, 구독 시각 |
| 채널 | `channels.list(part=snippet,statistics,contentDetails)` | 설명, uploads playlist, 화면용 통계 |
| 업로드 | `playlistItems.list(part=snippet,contentDetails,status)` | 최신 영상 ID, 제목, 설명, 게시 시각 |
| 인기 | `search.list(channelId,type=video,order=viewCount,publishedAfter=1년 전)` | 인기 후보 videoId |
| 상세 | `videos.list(part=snippet,contentDetails,statistics,status)` | 제목, 설명, 게시 시각, 길이, 조회 수, 썸네일, 합성 공개 |
| 삭제 | `subscriptions.delete(id=subscriptionId)` | 사용자 최종 승인 항목만 |

`search.list`의 viewCount는 최근 1년 동안 증가한 조회 수가 아니라 최근 1년에 게시된 영상의 현재
누적 조회 수다. 인기 후보를 넉넉히 받아 최신 영상과 중복되면 다음 순위를 사용한다.

`status.containsSyntheticMedia`가 없으면 DB에는 null/unknown으로 저장한다. true는 업로더의 합성·
변형 콘텐츠 공개 표시이며 허위정보 또는 AI 탐지 결과가 아니다.

## Gemini 요청 경계

- 증거 추출: YouTube URL, 지시문, JSON schema만 전송.
- 콘텐츠 채점: 증거 JSON, 영상 제목·설명, 채널 제목·설명, 루브릭·schema만 전송.
- 썸네일: 서버가 공식 HTTPS 썸네일 3개를 크기·형식 검사 후 inline image로 한 요청에 전송.
- 금지: OAuth 토큰, API 키, sessionId, subscriptionId, 구독자·조회 수, 업로드 지표를 콘텐츠
  채점 프롬프트에 포함하는 것.

모델은 `GEMINI_JUDGE_MODEL`, 단계별 동시 상한은 `GEMINI_JUDGE_CONCURRENCY`에서 읽는다. 외부
응답은 Zod schema와 항목 합계로 검증한다. 시간 초과, 429, 5xx, 잘못된 JSON만 최대 3회 시도한다.

## 저장 데이터

- 분석 작업: collectionJobId, phase, 진행·성공·실패 수, 만료 시각.
- 영상 표본: role(latest/popular), rank, 제목·설명, 게시 시각, 조회 수, 썸네일 URL,
  containsSyntheticMedia(null/0/1).
- 영상 증거: 원본 JSON, 모델, promptVersion, 처리 시각.
- 영상 채점: 세 축 점수·이유·근거, 총점, 모델, promptVersion, 처리 시각.
- 썸네일 채점: 점수, 이유, 공통 패턴, 한계, 모델, promptVersion, 처리 시각.
- 채널 결과: 콘텐츠·공장형·합산 점수, 업로드 0..10, 합성 표시 0..10, 썸네일 0..30,
  등급, 한 줄 이유, 성공·실패 표본 수, 정책 버전.

모든 행은 사용자의 collection job에 종속하고 `ANALYSIS_TTL_HOURS` 만료와 연결 해제 삭제 정책을
따른다. 토큰과 API 키는 암호화된 OAuth 저장소 또는 환경 변수에만 둔다.

## 실패 코드

`timeout`, `rate_limited`, `provider_unavailable`, `provider_schema_invalid`, `video_unavailable`,
`thumbnail_unavailable`, `unauthorized`, `internal_error`를 구분한다. 실패 영상은 점수 0으로 저장하지
않는다. 콘텐츠 전부 실패 또는 썸네일 최종 실패는 해당 채널 합산 점수를 계산 불가로 만든다.
