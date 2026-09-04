# API별 취득 가능 데이터 상세

## 1. YouTube Data API

### A. 구독 목록에서 제공되는 값

`subscriptions.list(mine=true, part=id,snippet)`을 호출하면 구독마다 다음 값을 받을 수 있습니다.

| 필드 | 의미 | 활용 가능성 |
|---|---|---|
| `id` | 구독 관계 자체의 ID | `subscriptions.delete`에 필요 |
| `snippet.publishedAt` | 해당 채널을 구독한 날짜와 시각 | 오래 구독한 채널인지 표시 |
| `snippet.title` | 구독한 채널 이름 | 채널 식별 |
| `snippet.description` | 구독 대상 설명 | 건강 채널 분류 보조 |
| `snippet.resourceId.channelId` | 구독한 채널 ID | 채널 상세 조회 |
| `snippet.channelId` | 구독한 사용자의 YouTube 채널 ID | 요청 계정 식별 |
| `snippet.thumbnails` | 채널 썸네일 URL과 크기 | UI 표시 |

따라서 질문한 **“언제 구독했는가”는 제공됩니다.** `snippet.publishedAt`이 구독 관계가 생성된 시각입니다.

출처: [YouTube subscription 리소스](https://developers.google.com/youtube/v3/docs/subscriptions)

구독 시각은 사용자에게 맥락을 보여주는 표시 정보로 사용할 수 있지만 위험 점수에는 반영하지 않습니다.

### B. 채널 상세정보

구독 목록에서 얻은 채널 ID로 `channels.list`를 호출하면 다음을 가져올 수 있습니다.

| 필드 | 의미 |
|---|---|
| `snippet.title` | 채널명 |
| `snippet.description` | 채널 소개 |
| `snippet.customUrl` | 채널 사용자 지정 URL |
| `snippet.publishedAt` | 채널 개설 시각 |
| `snippet.thumbnails` | 채널 썸네일 |
| `snippet.country` | 채널 설정 국가, 제공되는 경우 |
| `statistics.viewCount` | 채널 전체 공개 조회 수 |
| `statistics.subscriberCount` | 구독자 수, 일부 반올림 |
| `statistics.hiddenSubscriberCount` | 구독자 수 공개 여부 |
| `statistics.videoCount` | 공개 영상 수 |
| `contentDetails.relatedPlaylists.uploads` | 해당 채널의 업로드 재생목록 ID |

출처: [YouTube channel 리소스](https://developers.google.com/youtube/v3/docs/channels)

여기서 만들 수 있는 채널 지표는 다음과 같습니다.

- 채널 개설 후 경과일
- 공개 영상 수
- 하루·월평균 업로드 수
- 구독자 대비 영상 수
- 최근 업로드 빈도
- 짧은 기간에 대량 업로드하는 채널인지
- 채널 설명에서 의사·약사·전문기관 등을 표방하는지

단, 구독자 수나 조회 수가 높다고 건강정보가 정확한 것은 아닙니다. 채널의 생산 패턴을 보여주는 보조 신호로만 써야 합니다.

### C. 구독 채널의 최근 업로드

`uploads` 재생목록 ID를 `playlistItems.list`에 넣으면 다음을 받습니다.

| 필드 | 의미 |
|---|---|
| `contentDetails.videoId` | 영상 ID |
| `contentDetails.videoPublishedAt` | 실제 영상 게시 시각 |
| `snippet.title` | 영상 제목 |
| `snippet.description` | 영상 설명 |
| `snippet.thumbnails` | 썸네일 |
| `snippet.videoOwnerChannelId` | 영상 소유 채널 ID |
| `snippet.videoOwnerChannelTitle` | 영상 소유 채널명 |
| `snippet.position` | 업로드 재생목록 내 위치 |

출처: [YouTube playlistItem 리소스](https://developers.google.com/youtube/v3/docs/playlistItems)

정확한 최근 30일 목록은 업로드 재생목록을 페이지 순회하면서 게시 시각이 기준일보다 오래된 항목에 도달할 때까지 수집합니다. 이것은 사용자의 “최근 시청”이 아니라 채널 생산 패턴과 콘텐츠 위험도를 분석하기 위한 표본입니다.

### D. `videos.list`로 추가할 수 있는 값

영상 ID를 확보한 뒤 `videos.list`를 호출하면 추가로 다음을 얻을 수 있습니다.

- 영상 길이
- 조회 수
- 좋아요 수
- 댓글 수
- 카테고리
- 태그
- 라이브 방송 여부
- 아동용 콘텐츠 여부
- 공개 상태
- 임베드 허용 여부

건강 콘텐츠 분석에서는 다음 값이 유용합니다.

- 영상 길이
- 태그
- 카테고리

조회 수, 좋아요 수, 댓글 수는 UI 맥락으로 표시할 수 있지만 콘텐츠 위험도나 공장형 가능성 점수에는 사용하지 않습니다. 인기도는 정확성의 근거가 아니기 때문입니다.

하지만 자막, 영상 음성, 출연자 자격, AI 생성 여부는 여기서 제공되지 않습니다.

## 2. Google Data Portability API

Data Portability API는 데이터베이스처럼 영상을 한 건씩 조회하는 API가 아닙니다.

```text
사용자 별도 동의
→ 기간을 지정해 YouTube 활동 아카이브 요청
→ 비동기 작업 완료 대기
→ 서명된 다운로드 URL 획득
→ ZIP 안의 JSON 파싱
```

요청 리소스는 `myactivity.youtube`이며, 데모 분석 기간은 최근 30일을 기본값으로 사용합니다.

### A. 활동 레코드의 공통 필드

Google이 공식적으로 문서화한 필드는 다음과 같습니다.

| 필드 | 의미 |
|---|---|
| `header` | 제품 또는 활동 카드 이름, 보통 `YouTube` |
| `title` | 활동 요약 |
| `titleUrl` | 해당 활동의 YouTube URL |
| `subtitles` | 채널명과 채널 URL 등 부가정보 |
| `description` | 활동에 대한 추가 설명 |
| `time` | 활동이 발생한 정확한 날짜와 시각 |
| `products` | 해당 활동이 속한 Google 제품 |
| `details` | 광고에서 유입됐는지 등 활동 출처 |
| `activityControls` | YouTube 시청 기록·검색 기록 등 저장 근거 |
| `locationInfos` | 활동에 연결된 위치정보가 있는 경우 |
| `imageFile` | 연결된 이미지 첨부파일 |
| `audioFiles` | 연결된 음성 첨부파일 |
| `attachedFiles` | 기타 첨부파일 |

모든 레코드가 모든 필드를 갖는 것은 아닙니다. 사용자 행동과 Google의 기록 상태에 따라 달라집니다.

출처: [Google My Activity 공식 스키마](https://developers.google.com/data-portability/schema-reference/my_activity)

### B. YouTube에서 나타날 수 있는 활동

공식 스키마는 `title` 예시로 다음 활동을 명시합니다.

- `Watched ...`: 영상을 시청함
- `Subscribed to ...`: 채널을 구독함
- `Visited ...`: YouTube 페이지나 항목을 방문함
- YouTube 검색 활동
- YouTube 광고 상호작용
- 저장 설정에 따라 YouTube 음성·오디오 활동

따라서 `myactivity.youtube`는 순수 시청 기록만 들어오는 리소스가 아닙니다. YouTube와 관련된 여러 활동이 섞인 아카이브입니다.

우리 서비스는 이 중 `Watched`, `시청함`, `시청:`으로 시작하고 유효한 영상 URL이 있는 레코드만 골라야 합니다.

### C. 시청 영상 한 건에서 얻을 수 있는 값

시청 활동에서 정규화할 값은 다음과 같습니다.

| 정규화 필드 | 원본 | 의미 |
|---|---|---|
| `videoId` | `titleUrl` | 시청한 영상 ID |
| `title` | `title` | 시청한 영상 제목 |
| `videoUrl` | `titleUrl` | 영상 링크 |
| `channelTitle` | `subtitles` | 채널명, 제공되는 경우 |
| `channelUrl` | `subtitles` | 채널 링크, 제공되는 경우 |
| `watchedAt` | `time` | 실제 시청 시각 |

여러 레코드를 모으면 추가로 계산할 수 있습니다.

- 같은 영상과 채널의 활동 레코드 수
- 최초·마지막 시청 시각
- 날짜별 시청 추이

이 값들은 결과 설명이나 통계에는 사용할 수 있지만 콘텐츠 또는 채널 위험 점수에는 반영하지 않습니다.

### D. 제공되지 않거나 보장되지 않는 정보

특히 중요한 제한입니다.

- 정확히 몇 초 동안 시청했는지
- 영상을 끝까지 봤는지
- 어느 구간까지 봤는지
- 자동재생으로 본 것인지 직접 선택했는지
- 홈 피드의 어떤 추천 위치에서 들어왔는지
- 추천된 영상 중 클릭하지 않은 영상
- 영상의 전체 자막과 음성
- 시청 당시의 제목과 현재 제목이 같은지
- 시청자의 반응이나 이해 정도

따라서 “3번 시청했다”는 계산은 가능하지만 “영상의 90%를 집중해서 봤다”는 판정은 할 수 없습니다.

또한 다음 활동은 기록에서 빠질 수 있습니다.

- 시청 기록을 꺼둔 동안 본 영상
- 시크릿 모드에서 본 영상
- 사용자가 삭제한 활동
- 자동 삭제 기간이 지나 제거된 활동
- 다른 Google 계정이나 브랜드 계정에서 본 영상

YouTube도 시청 기록을 끄면 해당 영상이 기록에 나타나지 않는다고 안내합니다.

출처: [YouTube 시청 기록 안내](https://support.google.com/youtube/answer/95725)

## 3. Gemini API와 OpenAI API

YouTube Data API는 공개 영상의 제목·설명과 자막 존재 여부를 제공하지만, 타 채널 영상의 자막 본문이나 음성을 일반적인 읽기 API로 제공하지 않습니다. 우리 서비스는 비공식 자막 API, 스크래핑 또는 영상·음성 다운로드 대신 Gemini의 공개 YouTube URL 영상 입력을 사용합니다.

### A. Gemini API — 영상 근거 수집

대표 영상과 실제 최근 시청 영상의 공개 YouTube URL을 Gemini에 전달해 다음 근거를 수집합니다.

- 건강 주장과 관련된 발언 구간
- 화면에 표시된 관련 문구
- 발언·화면 문구의 시작 및 종료 타임스탬프
- 음성과 화면 문구를 구분하는 근거 유형

Gemini는 점수, 위험 등급, 허위 여부 또는 액션을 결정하지 않습니다. 영상당 성공 결과를 모델·프롬프트 버전과 함께 한 번 저장하고, 이후 주장 구조화와 검증에서 동일한 결과를 재사용합니다.

공개 영상만 처리할 수 있으며, 비공개·일부 공개 영상 또는 처리 실패 영상은 본문 근거를 확보하지 못한 것으로 표시합니다.

출처: [Gemini API 영상 이해](https://ai.google.dev/gemini-api/docs/video-understanding)

### B. OpenAI API — 주장 구조화

OpenAI에는 YouTube 제목·설명·채널 설명과 저장된 Gemini 근거 문서를 입력합니다. OpenAI는 다음과 같은 의미 요소만 정해진 스키마로 구조화합니다.

- 건강 관련성
- 질환과 대상
- 권고 행동
- 주장 결과
- 확실성 및 보편 적용 표현
- 부정·비판·인용 맥락
- 판매, 권위 표방, 공포와 긴급성 신호
- 해당 원문 출처를 구분하는 `EvidenceRef`와 `sourceSpan`

`EvidenceRef`는 `video_segment`, `video_title`, `video_description`, `channel_description` 중 하나입니다. 서버 검증기는 영상 세그먼트 참조는 동일한 Gemini 근거 문서에, 메타데이터 참조는 YouTube API에서 저장한 해당 원문에 대조합니다. 검증을 통과한 항목만 결정적 점수 엔진으로 전달합니다.

## 4. 우리 서비스에서의 최종 역할 분담

| 데이터 | 역할 |
|---|---|
| 구독 ID | 구독 해제 실행 |
| 구독 시각 | 오래 유지한 구독인지 표시 |
| 채널 개설일·영상 수 | 채널 생산 패턴 분석 |
| 최근 업로드 제목·설명 | 메타데이터 반복성과 대표 영상 선택 분석 |
| 실제 시청 영상 제목 | 대표 영상 선택과 보조 맥락 표시 |
| 실제 시청 시각 | 최근 시청 목록 구성과 사용자 맥락 표시 |
| 동일 영상·채널 활동 | 결과 설명용 통계이며 위험 점수에는 미사용 |
| 영상 ID | 싫어요 실행 및 영상 상세정보 보강 |
| 공개 YouTube 영상 URL | Gemini 영상 근거 수집 |
| Gemini 근거 세그먼트 | 영상 본문에 대한 OpenAI 주장 구조화의 입력과 결과 검증 기준 |
| 저장된 제목·설명 원문 | 메타데이터에서 추출한 구조화 결과의 검증 기준 |
| 검증된 주장 구조 | 결정적 콘텐츠 점수 계산 |

핵심적으로는 이렇게 정리됩니다.

> YouTube Data API는 “무엇을 구독하고 그 채널이 무엇을 생산하는가”를 보여주고, Data Portability API는 “그중 무엇을 실제로 언제 봤는가”를 보여줍니다.

구현 요구사항과 판정 기준은 [제품 요구사항·판정 기준](./PRD.md)를 따르고, 구체적인 처리 순서와 데이터 재사용은 [확정 분석 워크플로우](./ANALYSIS_WORKFLOW.md)를 따릅니다. 기존 임시 데모의 애플리케이션 코드는 이 문서의 데이터 계약을 구현한 것으로 간주하지 않습니다.
