# 시니어 알고리즘 클리너

건강 관련 YouTube 구독 채널과 실제 최근 시청 영상을 분석해, 콘텐츠 위험도와 공장형 채널 가능성을 근거로 계정 정리를 돕는 웹 애플리케이션입니다.

이 디렉터리는 기존 `openai-workshop`의 임시 데모 구현과 분리한 신규 구현 공간입니다. 기존 데모 코드는 설계 기준이나 재사용 기반으로 삼지 않습니다. 아래 문서와 앞으로 작성할 기능별 SDD spec을 기준으로 새로 구현합니다.

## 기준 문서

- [PRD](./docs/PRD.md): 제품 범위, 판정 원칙, 사용자 흐름, 완료 조건
- [분석 워크플로](./docs/ANALYSIS_WORKFLOW.md): 데이터 수집부터 LLM 추출·검증·점수·액션까지의 구현 경계
- [API 데이터 상세](./docs/API_DATA_DETAILS.md): YouTube Data API와 Google Data Portability API의 데이터 계약
- [문제 근거](./docs/PROBLEM_RESEARCH.md): 시니어 건강 영상 문제의 기사·조사·연구
- [워크숍 맥락](./docs/WORKSHOP.md): 행사 목적과 평가 기준
- [SDD spec 안내](./docs/specs/README.md): 기능별 명세 작성 규칙과 예정 구조

## 상태

현재는 문서만 복사한 상태이며 애플리케이션 소스, 패키지 설정, 환경변수와 기존 Git 이력은 포함하지 않았습니다.
