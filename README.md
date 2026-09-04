# 시니어 알고리즘 클리너

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

## 상태

현재는 구현 기준 문서와 Spec Kit만 구성한 상태입니다. 기존 `openai-workshop` 데모 코드는 설계 기준이나
재사용 기반으로 삼지 않습니다. 기능 구현은 `$speckit-specify`부터 시작합니다.

확정 범위는 다음과 같습니다.

- 입력: YouTube 구독 목록만 사용
- 분석 영상: 채널별 최신 2개와 YouTube 검색 기준 인기 3개
- 콘텐츠 리스크: LLM judge가 행동 유도·구매 유도·출처 명확성 3축을 직접 채점
- 공장형 가능성: 업로드 패턴·제목/설명 반복·합성 공개 비율 3축을 코드로 계산
- 결과: 두 점수, 근거, 표본과 한계를 채널별 표시
- 액션: 사용자가 직접 선택하고 최종 확인한 채널만 구독 해제
- 제외: 최근 시청, Data Portability, 좋아요·싫어요, 자동 액션과 다단계 LLM 검증
