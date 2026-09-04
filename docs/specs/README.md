# Spec Kit 기능 명세 안내

Spec Kit이 생성하는 실제 기능 명세는 저장소 루트의 `specs/NNN-<feature-name>/`에 둔다. 이 문서는
기능 분할과 실행 순서만 정의하며, PRD 내용을 복사하지 않고 `FR-*`, `SR-*`, `AR-*`, `NR-*`
요구사항 ID를 참조한다.

## 권장 기능 순서

| 순서 | 기능명 예시 | 핵심 범위 |
|---:|---|---|
| 1 | `youtube-oauth-subscriptions` | OAuth, 세션, 구독 전체 수집, 연결 해제 |
| 2 | `channel-video-sampling` | 채널 보강, 업로드 순회, 건강 후보, 최신·인기 표본 |
| 3 | `factory-likelihood-engine` | 세 메타데이터 축, 정책 버전, 단위 테스트 |
| 4 | `video-risk-judge` | Gemini 영상 어댑터, 구조화 출력, 실패·평가 계약 |
| 5 | `channel-risk-aggregation` | 영상 결과 집계, 이유 중복 제거, 표본 부족 |
| 6 | `review-unsubscribe-flow` | 결과 UI, 기본 미선택, 확인 모달, 부분 실패 재시도 |

각 기능은 다음 순서로 진행한다.

```text
$speckit-specify <기능 설명과 관련 요구사항 ID>
→ $speckit-clarify (중대한 모호성이 있을 때만)
→ $speckit-plan
→ $speckit-tasks
→ $speckit-analyze
→ $speckit-implement
```

명세가 검토되기 전에는 구현하지 않는다. 완료는 코드 작성뿐 아니라 연결된 format, lint,
typecheck, unit, integration, E2E 또는 LLM eval 통과를 포함한다. `docs/specs/` 아래에 별도
`requirements.md`·`design.md`·`tasks.md` 체계를 만들지 않는다.
