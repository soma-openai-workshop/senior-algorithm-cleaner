# 외부 API 데이터·실패 계약

- 기준일: 2026-09-04
- 제품 기준: [PRD.md](./PRD.md)
- 처리 기준: [ANALYSIS_WORKFLOW.md](./ANALYSIS_WORKFLOW.md)

## 1. Google OAuth

서버형 authorization code flow를 사용한다. OAuth 요청에는 정확한 redirect URI, 무작위 일회성
`state`와 YouTube 구독 조회·삭제에 필요한 scope를 포함한다. 콜백에서 `state`를 검증한 뒤 서버가
code를 token으로 교환한다.

`subscriptions.delete`가 허용하고 구독 조회도 가능한
`https://www.googleapis.com/auth/youtube.force-ssl` 하나를 요청한다. 구현 전 테스트 계정에서 실제
승인 scope와 삭제 호출을 계약 테스트하고, 동의 화면에는 계정 데이터 조회와 구독 삭제 목적을
명확히 설명한다.

토큰 처리 원칙:

- OAuth 토큰은 암호화된 서버 세션에만 저장한다.
- 브라우저에는 `HttpOnly`, `Secure`, `SameSite=Lax` 세션 cookie만 전달한다.
- 데모 작업이 한 시간 안에 끝나는 것을 기본으로 하고, refresh token 영구 저장은 하지 않는다.
- access token 만료 시 사용자가 다시 연결한다.
- 연결 해제 시 Google revoke endpoint 호출 후 세션과 관련 데이터를 삭제한다.
- callback, token response, Authorization header는 로그에서 전부 마스킹한다.

출처: [YouTube 서버형 OAuth](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps),
[Google OAuth 정책](https://developers.google.com/identity/protocols/oauth2/policies)

## 2. YouTube Data API 요청 계약

기본 URL은 `https://www.googleapis.com/youtube/v3`다. 모든 목록 API는 응답의 `nextPageToken`만
페이지 진행 기준으로 사용하며 `pageInfo.totalResults`를 종료 조건이나 정확한 개수로 신뢰하지 않는다.

### 2.1 구독 전체 수집

```http
GET /subscriptions
  ?mine=true
  &part=id,snippet
  &maxResults=50
  &pageToken=<nextPageToken>
```

필수 정규화:

| API 필드 | 내부 필드 | 용도 |
|---|---|---|
| `id` | `subscriptionId` | 구독 해제 실행 키 |
| `snippet.publishedAt` | `subscribedAt` | 화면 맥락 |
| `snippet.resourceId.channelId` | `channelId` | 채널 조회 키 |
| `snippet.title` | `channelTitle` | 실패 시 표시 fallback |
| `snippet.description` | `channelDescription` | 건강 후보 보조 |
| `snippet.thumbnails` | `thumbnailUrl` | 결과 UI |

구독 시각과 구독 ID는 LLM에 보내지 않는다. `subscriptionId`는 채널 ID와 다르며
`subscriptions.delete`에는 반드시 구독 ID를 사용한다.

출처: [subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list),
[subscription 리소스](https://developers.google.com/youtube/v3/docs/subscriptions)

### 2.2 채널 상세 배치

```http
GET /channels
  ?id=<최대 50개 channelId CSV>
  &part=snippet,statistics,contentDetails
  &maxResults=50
```

| API 필드 | 내부 필드 | 점수 사용 |
|---|---|---|
| `id` | `channelId` | 식별 |
| `snippet.title` | `title` | 후보·화면 |
| `snippet.description` | `description` | 후보·judge 맥락 |
| `snippet.publishedAt` | `publishedAt` | 화면/관측 정보만 |
| `snippet.thumbnails` | `thumbnailUrl` | 화면 |
| `statistics.videoCount` | `publicVideoCount` | 화면/수집 검증만 |
| `statistics.subscriberCount` | `subscriberCount` | 화면만 |
| `statistics.viewCount` | `viewCount` | 화면만 |
| `contentDetails.relatedPlaylists.uploads` | `uploadsPlaylistId` | 업로드 수집 |

구독자 수, 조회 수, 전체 영상 수와 채널 개설일 자체를 두 점수에 사용하지 않는다. 응답에 요청한
ID가 빠지면 `channel_unavailable`로 기록한다.

출처: [channels.list](https://developers.google.com/youtube/v3/docs/channels/list),
[channel 리소스](https://developers.google.com/youtube/v3/docs/channels)

### 2.3 uploads 재생목록

```http
GET /playlistItems
  ?playlistId=<uploadsPlaylistId>
  &part=snippet,contentDetails,status
  &maxResults=50
  &pageToken=<nextPageToken>
```

| API 필드 | 내부 필드 | 용도 |
|---|---|---|
| `contentDetails.videoId` | `videoId` | 영상 보강·중복 제거 |
| `contentDetails.videoPublishedAt` | `publishedAtCandidate` | 순회 중단·정렬 |
| `snippet.title` | `titleCandidate` | 상세 실패 진단만 |
| `snippet.description` | `descriptionCandidate` | 상세 실패 진단만 |
| `snippet.position` | `playlistPosition` | 최신 순서 검증 |
| `status.privacyStatus` | `playlistPrivacyStatus` | 사전 제외 보조 |

제목·설명·게시 시각과 공개 상태의 최종값은 `videos.list`를 우선한다. private/deleted placeholder,
빈 video ID와 다른 채널 소유 영상은 평가에서 제외한다. 최신 영상은 `search.list(order=date)`가
아니라 uploads 재생목록에서 고른다.

출처: [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[playlistItem 리소스](https://developers.google.com/youtube/v3/docs/playlistItems)

### 2.4 인기 영상 검색

```http
GET /search
  ?channelId=<channelId>
  &type=video
  &order=viewCount
  &part=id,snippet
  &maxResults=3
```

`items[].id.videoId`와 결과 순위를 저장하고 `videos.list`로 다시 검증한다. 검색 문서는 정렬 조건과
날짜 필터 조합에서 결과가 작거나 불완전할 수 있다고 명시하므로 `채널 전체 역대 조회 수 상위 3개`
라고 단정하지 않고 `YouTube 검색 기준 인기 표본`이라고 표시한다.

현재 `search.list`는 Search Queries 별도 버킷에서 호출당 1단위이며 기본 100회/일 제한이 있다.
건강 후보 한 채널당 1회 호출하므로 작업 시작 전 남은 용량을 확인할 수 없다는 전제에서 호출 수와
실패 수를 자체 집계한다. 403 `quotaExceeded`가 나오면 남은 후보를 `popular_sample_quota_exhausted`로
표시하고 최신 표본만으로 채널 점수를 억지로 계산하지 않는다.

출처: [search.list](https://developers.google.com/youtube/v3/docs/search/list),
[YouTube API quota](https://developers.google.com/youtube/v3/determine_quota_cost)

### 2.5 영상 상세 배치

```http
GET /videos
  ?id=<최대 50개 videoId CSV>
  &part=snippet,contentDetails,statistics,status
  &maxResults=50
```

| API 필드 | 내부 필드 | 용도 |
|---|---|---|
| `id` | `videoId` | 식별 |
| `snippet.channelId` | `channelId` | 소유 채널 검증 |
| `snippet.title` | `title` | 후보·judge·화면 |
| `snippet.description` | `description` | 후보·judge·화면 |
| `snippet.tags` | `tags` | 후보 보조 |
| `snippet.publishedAt` | `publishedAt` | 최신·업로드 패턴 |
| `contentDetails.duration` | `durationSeconds` | judge 한계·화면 |
| `statistics.viewCount` | `viewCount` | 인기 결과 검증·화면만 |
| `status.privacyStatus` | `privacyStatus` | public 평가 여부 |
| `status.containsSyntheticMedia` | `containsSyntheticMedia` | 공장형 보조 신호 |

`duration`은 ISO 8601 duration parser로 초 단위 정수로 변환한다. `viewCount`는 10진 문자열을
`bigint`로 파싱한다. 필드가 없거나 파싱할 수 없으면 `null`이다.

`containsSyntheticMedia` 정규화:

```ts
const containsSyntheticMedia =
  typeof status.containsSyntheticMedia === "boolean"
    ? status.containsSyntheticMedia
    : "unknown";
```

`unknown`은 false가 아니고 합성되지 않았다는 뜻도 아니다. true는 현실적으로 보이는 변형·합성
콘텐츠를 업로더가 공개했다는 필드이며 콘텐츠 리스크 점수에는 전달하지 않는다.

출처: [video 리소스](https://developers.google.com/youtube/v3/docs/videos),
[합성 콘텐츠 공개 기준](https://support.google.com/youtube/answer/14328491)

### 2.6 구독 삭제

```http
DELETE /subscriptions?id=<subscriptionId>
```

요청 body는 없다. 성공은 204다. 이 메서드는 호출당 50 quota units를 사용하므로 확인 모달에서
선택 개수와 예상 삭제 호출 수를 표시한다.

| 상태 | 내부 결과 | 재시도 |
|---|---|---|
| 204 | `deleted` | 아니요 |
| 404 `subscriptionNotFound` | `already_absent` | 아니요 |
| 401 또는 token 관련 403 | `reauth_required` | 재인증 후 새 확인 |
| 429, 500, 502, 503, 504 | `temporary_failure` | 최대 2회 자동, 이후 수동 |
| 그 밖의 4xx | `permanent_failure` | 원인 해결 전 아니요 |

출처: [subscriptions.delete](https://developers.google.com/youtube/v3/docs/subscriptions/delete),
[구독 구현 가이드](https://developers.google.com/youtube/v3/guides/implementation/subscriptions)

## 3. 쿼터와 호출 계획

2026-09-04 공식 문서 기준 주요 비용은 다음과 같다. YouTube가 변경할 수 있으므로 코드 상수가
아니라 운영 문서와 계측 기준으로 취급한다.

| 메서드 | 호출 비용/제한 | 배치 |
|---|---:|---:|
| `subscriptions.list` | 1 unit | 페이지당 최대 50 |
| `channels.list` | 1 unit | 최대 50 IDs |
| `playlistItems.list` | 1 unit | 페이지당 최대 50 |
| `search.list` | 1 search unit, 기본 100 calls/day | 채널당 1 |
| `videos.list` | 1 unit | 최대 50 IDs |
| `subscriptions.delete` | 50 units | ID당 1 |

읽기 API는 전역 동시성 5, 채널별 playlist 순회는 동시성 3, Gemini judge는 기본 동시성 2,
구독 삭제는 동시성 3으로 제한한다. 공급자 `Retry-After`가 있으면 이를 우선하고, 없으면 지수
백오프와 jitter를 쓴다. 모든 잘못된 요청도 quota를 소모할 수 있으므로 Zod 입력 검증을 호출 전에
수행한다.

## 4. Gemini 영상 judge 계약

### 4.1 입력

Gemini Interactions API의 공개 YouTube URL 영상 입력을 사용한다.

```ts
type VideoJudgeInput = {
  videoUri: `https://www.youtube.com/watch?v=${string}`;
  metadata: {
    videoId: string;
    title: string;
    description: string;
    channelTitle: string;
    channelDescription: string;
    durationSeconds: number | null;
  };
  rubricVersion: "video-risk-rubric-v1";
};
```

한 요청에 영상 하나만 넣는다. 출력은 `application/json`과 `video-risk-schema-v1` JSON Schema로
제한한다. 응답은 다시 Zod로 검증한다. 모델에는 사용자 계정·구독 데이터나 `containsSyntheticMedia`,
조회 수, 업로드 빈도를 보내지 않는다.

### 4.2 공급자 제약

- YouTube URL 입력은 preview이며 공개 영상만 처리한다.
- 비공개·일부 공개 영상은 지원하지 않는다.
- 공개 영상도 지역, 연령, 삭제, 공급자 처리와 길이 제한으로 실패할 수 있다.
- 모델이 제공한 타임스탬프는 사람이 YouTube 원본 링크에서 확인할 수 있게 한다.
- 영상 binary를 앱이 내려받거나 보관하지 않는다.

출처: [Gemini API video understanding](https://ai.google.dev/gemini-api/docs/video-understanding),
[Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

### 4.3 OpenAI API 사용 여부

OpenAI의 현재 Responses API 공식 입력은 텍스트, 이미지와 파일이며 개별 모델 문서도 video input을
지원하지 않는다고 명시한다. 따라서 v1에서 OpenAI를 영상 judge나 Gemini 결과 재판정 단계로
사용하지 않는다. 향후 공식 영상 입력이 지원돼도 별도 SDD와 eval 없이 어댑터를 교체하지 않는다.

출처: [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

## 5. API 데이터와 파생 지표 정책

YouTube 정책은 API 데이터로 새로운 파생 지표를 만드는 행위를 원칙적으로 제한하며, 2026년 6월
이후 감사받은 분석 용도가 별도 허용을 신청할 수 있다고 안내한다. 공장형 가능성은 YouTube API
메타데이터로 만드는 자체 파생 지표이므로 다음 게이트를 둔다.

1. 개발·워크숍 단계는 팀 소유 API 프로젝트와 명시적으로 동의한 테스트 계정으로 제한한다.
2. 화면에서 두 점수가 YouTube 제공 점수가 아니라 이 제품의 분석 결과임을 명확히 표시한다.
3. 불특정 사용자 공개 전에 YouTube API Compliance Audit과 파생 지표 허용 필요 여부를 확인하고,
   필요한 명시적 승인을 받는다.
4. 승인을 받지 못하면 공개 배포에서 공장형 파생 점수 기능을 활성화하지 않는다.

API 데이터와 분석 결과는 기본 24시간 뒤 삭제한다. 사용자의 연결 해제나 삭제 요청은 가능한 즉시
처리하고 최대 정책 기한보다 짧게 유지한다. 공개 영상의 음성·화면은 다운로드, 캐시 또는 저장하지
않는다.

출처: [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies),
[YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)

## 6. 사용하지 않는 데이터와 API

- Google Data Portability API와 `myactivity.youtube`
- Google Takeout, 최근 시청 기록과 시청 횟수
- `videos.rate`, 좋아요·싫어요 상태
- captions API와 비공식 transcript 서비스
- 댓글, 홈 추천, 검색 기록
- 썸네일 이미지 유사도와 OCR
- 브라우저 자동화, 화면 조작, `yt-dlp`
- OpenAI를 통한 별도 주장 추출 또는 judge 결과 검증
