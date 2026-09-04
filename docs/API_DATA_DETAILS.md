# YouTube Data API 데이터 계약

## 1. OAuth 권한

구독 목록 조회와 구독 해제에 필요한 최소 YouTube OAuth scope만 요청한다. Data Portability scope는 요청하지 않는다.

## 2. 구독 목록

`subscriptions.list(mine=true, part=id,snippet)`을 전체 페이지에 호출한다.

| 필드 | 용도 |
|---|---|
| `id` | 선택한 채널을 `subscriptions.delete`로 구독 해제할 때 사용 |
| `snippet.publishedAt` | 구독 시작일 표시 |
| `snippet.title` | 채널명 |
| `snippet.description` | 건강 관련 후보 분류 보조 |
| `snippet.resourceId.channelId` | 채널 상세 조회 키 |
| `snippet.thumbnails` | 결과 카드 썸네일 |

출처: [YouTube subscriptions 리소스](https://developers.google.com/youtube/v3/docs/subscriptions)

## 3. 채널 정보

`channels.list(part=snippet,statistics,contentDetails)`를 채널 ID 최대 50개씩 묶어 호출한다.

| 필드 | 용도 |
|---|---|
| `snippet.title` | 채널명 |
| `snippet.description` | 건강 관련 후보 분류 및 judge 맥락 |
| `snippet.publishedAt` | 채널 운영 기간 계산 |
| `snippet.thumbnails` | UI 표시 |
| `statistics.viewCount` | 화면 맥락 표시, 점수 미사용 |
| `statistics.subscriberCount` | 화면 맥락 표시, 점수 미사용 |
| `statistics.videoCount` | 운영 기간 대비 생산량 계산 |
| `contentDetails.relatedPlaylists.uploads` | 업로드 영상 수집 |

출처: [YouTube channels 리소스](https://developers.google.com/youtube/v3/docs/channels)

## 4. 업로드 목록과 최신 영상

`playlistItems.list(part=snippet,contentDetails, playlistId=uploads)`를 사용한다.

| 필드 | 용도 |
|---|---|
| `contentDetails.videoId` | 영상 식별과 상세 조회 |
| `contentDetails.videoPublishedAt` | 최신 영상 및 업로드 간격 계산 |
| `snippet.title` | 건강 후보 분류와 제목 반복도 |
| `snippet.description` | 건강 후보 분류와 설명 반복도 |
| `snippet.thumbnails` | 결과 근거 표시 |

최신 공개 영상 2개는 LLM 평가에 사용한다. 최신 20개와 최근 30일 영상의 합집합 중 최신 50개는 공장형 점수 표본으로 사용한다. `playlistItems.list`는 호출당 최대 50개이며 quota 비용은 1이다.

출처: [YouTube playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)

## 5. 인기 영상

건강 후보 채널에 다음 요청을 사용한다.

```text
search.list(
  channelId={channelId},
  type=video,
  order=viewCount,
  maxResults=3,
  part=snippet
)
```

`order=viewCount`는 조회 수 내림차순 결과를 반환한다. 채널 필터 검색은 최대 500개 결과 제약이 있고 검색 인덱스 특성상 채널의 완전한 원장으로 간주하지 않는다. `search.list`는 호출당 quota 100 units를 사용하고 기본 일일 할당량 10,000 units를 다른 요청과 함께 소비하므로 건강 후보에만 호출한다.

출처: [YouTube search.list](https://developers.google.com/youtube/v3/docs/search/list), [YouTube quota 계산](https://developers.google.com/youtube/v3/determine_quota_cost)

## 6. 영상 상세정보

최신·인기 영상 ID를 최대 50개씩 묶어 `videos.list(part=snippet,contentDetails,statistics,status)`로 보강한다.

| 필드 | 용도 |
|---|---|
| `id` | LLM 평가 대상 식별 |
| `snippet.channelId` | 채널 연결 |
| `snippet.title` | judge 입력과 결과 표시 |
| `snippet.description` | judge 입력 |
| `snippet.tags` | 건강 주제 맥락 |
| `snippet.publishedAt` | 최신성 표시 |
| `statistics.viewCount` | 인기 영상 선정 결과 확인, 리스크 점수 미사용 |
| `contentDetails.duration` | 영상 유형·길이 표시 |
| `status.privacyStatus` | 공개 영상 여부 확인 |

YouTube Data API는 타 채널 영상의 전체 자막이나 음성을 일반적인 읽기 API로 제공하지 않는다. 실제 콘텐츠 평가는 공개 YouTube 영상을 직접 처리할 수 있는 LLM judge 어댑터가 담당한다.

출처: [YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list)

## 7. 구독 해제

사용자가 체크하고 최종 확인한 채널에만 `subscriptions.delete(id=subscriptionId)`를 호출한다.

| 원칙 | 내용 |
|---|---|
| 자동 실행 금지 | 점수나 등급만으로 호출하지 않음 |
| 명시적 선택 | 체크된 채널만 대상 |
| 최종 확인 | 실행 전에 채널명과 개수 표시 |
| 부분 실패 | 채널별 성공·실패를 따로 기록 |

출처: [YouTube subscriptions.delete](https://developers.google.com/youtube/v3/docs/subscriptions/delete)

## 8. 사용하지 않는 API와 데이터

- Google Data Portability API
- Google Takeout
- 최근 시청 기록
- `videos.rate`와 좋아요·싫어요
- 브라우저 자동화와 YouTube 화면 스크래핑
- 홈 추천, `관심 없음`, `채널 추천 안 함`
