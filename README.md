# 유튜브 건강검진

사용자의 YouTube 구독 채널을 분석해 `콘텐츠 리스크`와 `공장형 가능성`을 근거와 함께 보여주고,
사용자가 직접 선택하고 최종 확인한 채널만 일괄 구독 해제하는 웹 애플리케이션입니다.

이 디렉터리는 기존 `openai-workshop`의 임시 데모 구현과 분리한 신규 구현 공간입니다. 기존 데모 코드는 설계 기준이나 재사용 기반으로 삼지 않습니다. 아래 문서와 앞으로 작성할 기능별 SDD spec을 기준으로 새로 구현합니다.

## 기준 문서

- [구현 인계](./docs/IMPLEMENTATION_HANDOFF.md): 문서 우선순위와 잠긴 제품·기술 결정
- [PRD](./docs/PRD.md): 요구사항 ID, 범위, 점수·액션 정책과 완료 조건
- [분석 워크플로](./docs/ANALYSIS_WORKFLOW.md): 수집, 표본화, 판정, 집계, 실패 처리와 실행 경계
- [API 데이터 상세](./docs/API_DATA_DETAILS.md): YouTube Data API와 Gemini API의 요청·응답 계약
- [문제 근거](./docs/PROBLEM_RESEARCH.md): 시니어 건강 영상 문제의 기사·조사·연구
- [워크숍 맥락](./docs/WORKSHOP.md): 행사 목적과 평가 기준
- [SDD spec 안내](./docs/specs/README.md): Spec Kit 기능 경계와 명세 작성 순서

## 현재 구현 상태

`feat/speckit-development` 브랜치에서 Spec Kit의 첫 기능인 YouTube OAuth와 분석 입력 수집을
구현하고 있습니다. 현재 Google OAuth(PKCE/state), 암호화 토큰 저장, 전체 구독 페이지 수집,
채널 상세·업로드 표본 수집, 룰 기반 건강 채널 후보 분류와 연결 해제를 포함합니다. 콘텐츠 리스크와
공장형 가능성 점수, 최종 구독 해제는 후속 기능 spec에서 구현합니다.

확정 범위는 다음과 같습니다.

- 입력: YouTube 구독 목록만 사용
- 분석 영상: 채널별 최신 2개와 YouTube 검색 기준 인기 3개
- 콘텐츠 리스크: LLM judge가 행동 유도·구매 유도·출처 명확성 3축을 직접 채점
- 공장형 가능성: 업로드 패턴·제목/설명 반복·합성 공개 비율 3축을 코드로 계산
- 결과: 두 점수, 근거, 표본과 한계를 채널별 표시
- 액션: 사용자가 직접 선택하고 최종 확인한 채널만 구독 해제
- 제외: 최근 시청, Data Portability, 좋아요·싫어요, 자동 액션과 다단계 LLM 검증

## 로컬 실행

요구 버전은 Node.js 24 이상과 npm 11 이상입니다.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

`.env.local`에는 Google OAuth 웹 클라이언트와 32바이트 암호화 키가 필요합니다. 허용된 테스트
계정과 `http://localhost:3000/api/oauth/callback` 리디렉션 URI를 사용하세요. 공개 배포와 실제 사용자
대상 운영은 YouTube API Services 정책·검증 절차를 확인하기 전까지 지원 범위가 아닙니다.

## 품질 검사

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```
