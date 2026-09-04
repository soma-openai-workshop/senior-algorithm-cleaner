# 기능별 SDD spec

이 디렉터리에는 기능별로 검토 가능한 명세를 둡니다. PRD의 제품 결정을 반복해서 복사하지 않고 요구사항 ID로 참조합니다.

예정된 기능 경계는 다음과 같습니다.

```text
docs/specs/
├── google-data-ingestion/
├── youtube-enrichment/
├── health-content-analysis/
├── channel-factory-analysis/
├── review-and-actions/
└── results-experience/
```

각 기능 디렉터리는 구현 전에 다음 파일을 갖습니다.

| 파일 | 역할 |
|---|---|
| `requirements.md` | 범위, 비범위, 요구사항 ID, 테스트 가능한 인수 조건 |
| `design.md` | 데이터 흐름, 인터페이스, 타입, 실패 처리, 보안과 테스트 설계 |
| `tasks.md` | 요구사항과 테스트에 연결된 구현 작업 및 완료 조건 |

명세가 검토되기 전에는 해당 기능 구현을 시작하지 않습니다. 태스크 완료는 코드 작성만이 아니라 연결된 lint, typecheck, unit, integration, E2E 또는 eval 검증 통과를 포함합니다.
