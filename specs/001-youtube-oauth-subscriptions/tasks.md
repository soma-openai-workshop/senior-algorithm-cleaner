---
description: 'Dependency-ordered implementation tasks for YouTube OAuth and subscription collection'
---

# Tasks: YouTube OAuth and Subscription Collection

**Input**: Design documents from `specs/001-youtube-oauth-subscriptions/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`,
`quickstart.md`

**Tests**: Required by the project constitution. Within each story, create the listed failing tests before its
implementation tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no incomplete dependency
- **[Story]**: Maps the task to a user story in `spec.md`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the single Next.js/TypeScript application and deterministic test harness.

- [x] T001 Create the Node.js 24/Next.js application manifest, scripts, and pinned dependencies in `package.json` and `package-lock.json`
- [x] T002 [P] Configure strict TypeScript and Next.js paths in `tsconfig.json` and `next.config.ts`
- [x] T003 [P] Configure ESLint and Prettier in `eslint.config.mjs`, `.prettierrc.json`, and `.prettierignore`
- [x] T004 [P] Configure Vitest and Playwright projects in `vitest.config.ts` and `playwright.config.ts`
- [x] T005 [P] Add the responsive senior-friendly App Router shell from `specs/001-youtube-oauth-subscriptions/design-brief.md` in `src/app/layout.tsx`, `src/app/page.tsx`, and `src/app/globals.css`
- [x] T006 Document and validate first-feature environment keys in `.env.example` and create ignored runtime directories via `data/.gitkeep`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement privacy, persistence, validation, and test primitives required by every story.

**Critical**: No user story work begins until this phase passes its unit tests.

- [X] T007 Implement fail-fast server environment parsing in `src/server/env.ts`
- [X] T008 [P] Define sanitized API error codes and response helpers in `src/shared/contracts/errors.ts` and `src/server/http/errors.ts`
- [X] T009 [P] Implement safe structured logging with mandatory secret-field redaction in `src/server/observability/logger.ts`
- [X] T010 Create versioned SQLite schema and indexes from the data model in `src/server/db/migrations/001_oauth_collection.sql`
- [X] T011 Implement SQLite initialization, migration, foreign-key, WAL, and transaction helpers in `src/server/db/client.ts` and `scripts/migrate.mjs`
- [X] T012 [P] Implement AES-256-GCM secret encryption and SHA-256 token hashing in `src/server/auth/crypto.ts`
- [X] T013 Implement browser-session creation, lookup, expiry, and cookie helpers in `src/server/auth/session-repository.ts` and `src/server/auth/session-cookie.ts`
- [X] T014 Implement same-origin plus session-bound CSRF validation in `src/server/auth/csrf.ts`
- [X] T015 [P] Add temporary SQLite, deterministic clock, provider fetch, and secret fixtures in `tests/fixtures/database.ts`, `tests/fixtures/clock.ts`, and `tests/fixtures/providers.ts`

**Checkpoint**: Environment, DB, crypto, owner session, CSRF, sanitized errors, and fixture harness are ready.

---

## Phase 3: User Story 1 - Connect and Collect Every Subscription (Priority: P1) MVP

**Goal**: Explain permission use, connect one Google account safely, and collect every subscription page without
duplicates.

**Independent Test**: Use fake OAuth and 0/1/51/500-item paginated provider fixtures; confirm valid state connects,
invalid/replayed state fails, and every unique subscription is stored while no token or subscription ID reaches the
browser response.

### Tests for User Story 1

- [X] T016 [P] [US1] Write failing OAuth state, PKCE, token-encryption, denial, expiry, and replay tests in `tests/unit/oauth-flow.test.ts`
- [X] T017 [P] [US1] Write failing subscription response validation, pagination, and deduplication tests in `tests/unit/youtube-subscriptions.test.ts`
- [X] T018 [P] [US1] Write failing owner isolation, active-job uniqueness, and safe subscription-list repository tests in `tests/integration/collection-job-repository.test.ts`
- [ ] T019 [P] [US1] Write failing session, OAuth start/callback, collection, and subscription-list HTTP contract tests in `tests/integration/oauth-collection-routes.test.ts`
- [ ] T020 [P] [US1] Write a failing permission explanation and connect-to-complete-subscription-list E2E fixture in `tests/e2e/connect-and-collect.spec.ts`

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement the Google OAuth2Client adapter and exact redirect URI/scope policy in `src/server/auth/google-oauth.ts`
- [X] T022 [P] [US1] Implement OAuthAttempt and OAuthConnection persistence with one-time state consumption in `src/server/auth/oauth-repository.ts`
- [X] T023 [P] [US1] Implement Zod-validated `subscriptions.list` page normalization in `src/server/youtube/schemas.ts` and `src/server/youtube/client.ts`
- [X] T024 [US1] Implement subscription and collection-job repositories with checkpointed pagination and safe list serialization in `src/server/collection/job-repository.ts` and `src/server/collection/subscription-repository.ts`
- [X] T025 [US1] Implement bounded subscription collection and fatal auth/schema failure transitions in `src/server/collection/advance-job.ts`
- [X] T026 [US1] Implement session and OAuth start/callback handlers in `src/app/api/session/route.ts`, `src/app/api/oauth/start/route.ts`, and `src/app/api/oauth/callback/route.ts`
- [X] T027 [US1] Implement create/get/advance/subscription-list job handlers with owner and CSRF checks in `src/app/api/collection-jobs/route.ts`, `src/app/api/collection-jobs/[jobId]/route.ts`, `src/app/api/collection-jobs/[jobId]/advance/route.ts`, and `src/app/api/collection-jobs/[jobId]/subscriptions/route.ts`
- [X] T028 [US1] Build permission disclosure, connection state, collection start, and complete safe subscription-list UI in `src/components/collection/connection-panel.tsx`, `src/components/collection/collection-runner.tsx`, `src/components/collection/subscription-list.tsx`, and `src/app/collect/page.tsx`

**Checkpoint**: P1 works independently and is the first demoable MVP; downstream channel analysis is absent.

---

## Phase 4: User Story 2 - Prepare Channels for Health Analysis (Priority: P2)

**Goal**: Enrich every unique channel, traverse bounded public uploads, and classify high-recall health candidates
without producing either risk score.

**Independent Test**: With a prepared connected-session fixture containing normal, missing, private, empty, and
over-500-upload channels, verify ready/failure states, latest-20 plus recent-90-day retention, truncation, and the
versioned candidate decision.

### Tests for User Story 2

- [X] T029 [P] [US2] Write failing channel batch validation and missing-channel isolation tests in `tests/unit/youtube-channels.test.ts`
- [X] T030 [P] [US2] Write failing upload boundary, placeholder exclusion, retention, and 500-item cap tests in `tests/unit/upload-traversal.test.ts`
- [X] T031 [P] [US2] Write failing Unicode normalization, boundary/exclusion, non-candidate, and 40-positive/40-negative fixture tests enforcing at least 95% recall in `tests/unit/health-candidate-policy.test.ts` and `tests/fixtures/health-candidates.ts`
- [X] T032 [P] [US2] Write a failing end-to-end channel preparation pipeline test in `tests/integration/channel-preparation.test.ts`
- [X] T033 [P] [US2] Write failing result serialization tests proving `subscriptionId`, tokens, and score fields are absent in `tests/integration/collection-results-route.test.ts`

### Implementation for User Story 2

- [X] T034 [P] [US2] Add Zod schemas and adapter methods for `channels.list` and `playlistItems.list` in `src/server/youtube/schemas.ts` and `src/server/youtube/client.ts`
- [X] T035 [P] [US2] Implement ChannelProfile and ChannelCollectionState persistence in `src/server/collection/channel-repository.ts`
- [X] T036 [P] [US2] Implement UploadMetadata retention and exclusion counters in `src/server/collection/upload-repository.ts`
- [X] T037 [US2] Implement 50-ID channel enrichment and missing-channel failures in `src/server/collection/collect-channels.ts`
- [X] T038 [US2] Implement round-robin playlist page traversal, 90-day/latest-20 union, and 500-item cap in `src/server/collection/collect-uploads.ts`
- [X] T039 [P] [US2] Implement the exact versioned lexicon, term IDs, boundaries, and exclusions from `contracts/health-candidate-policy-v1.md` in `src/server/health-candidate/policy-v1.ts`
- [X] T040 [US2] Implement deterministic health candidate classification and signal persistence in `src/server/health-candidate/classify.ts` and `src/server/collection/classification-repository.ts`
- [X] T041 [US2] Extend the job state machine across channel, upload, classification, and partial-result phases in `src/server/collection/advance-job.ts`
- [X] T042 [US2] Implement paginated safe result serialization in `src/server/collection/results.ts` and `src/app/api/collection-jobs/[jobId]/results/route.ts`
- [X] T043 [US2] Render prepared channels, candidate state, sample size, and limitations in `src/components/collection/channel-preparation-list.tsx` and `src/app/collect/page.tsx`

**Checkpoint**: P1 and P2 produce complete analysis-ready inputs but no content/factory score or unsubscribe action.

---

## Phase 5: User Story 3 - Understand Progress and Partial Results (Priority: P3)

**Goal**: Keep long collection understandable and restart-safe with leases, progress counts, interrupted state,
isolated failures, and actionable next steps.

**Independent Test**: Inject delay, retryable failure, expired auth, competing advance requests, and a process-style
lease interruption; verify truthful progress, no duplicated provider page, and completed/partial/failed/interrupted
states with correct next action.

### Tests for User Story 3

- [X] T044 [P] [US3] Write failing lease claim, expiry, resume, atomic abandon-and-restart, and competing-advance tests in `tests/unit/job-lease.test.ts`
- [X] T045 [P] [US3] Write failing retry classification, bounded backoff, and partial/fatal transition tests in `tests/unit/provider-failures.test.ts`
- [ ] T046 [P] [US3] Write a failing polling/progress/accessibility E2E fixture including the 200-subscription one-second start and five-second update budgets in `tests/e2e/collection-progress.spec.ts`

### Implementation for User Story 3

- [X] T047 [P] [US3] Implement stable provider error classification and bounded Retry-After/backoff policy in `src/server/youtube/errors.ts` and `src/server/youtube/retry.ts`
- [X] T048 [US3] Implement atomic 30-second job leases, expired-lease interruption, and resume in `src/server/collection/job-repository.ts`
- [X] T049 [US3] Integrate per-page checkpoints, retry limits, counters, and isolated CollectionFailure rows in `src/server/collection/advance-job.ts` and `src/server/collection/failure-repository.ts`
- [X] T050 [US3] Return truthful next actions, atomic `restartInterrupted`, and 409 retry timing from job handlers in `src/app/api/collection-jobs/route.ts`, `src/app/api/collection-jobs/[jobId]/route.ts`, and `src/app/api/collection-jobs/[jobId]/advance/route.ts`
- [X] T051 [US3] Implement at-most-three-second polling, wait/reconnect/resume/restart controls, and accessible live status in `src/components/collection/collection-runner.tsx` and `src/components/collection/progress-panel.tsx`

**Checkpoint**: Provider delays, partial failures, restarts, and duplicate clicks are visible and recoverable.

---

## Phase 6: User Story 4 - Disconnect and Delete Collected Data (Priority: P4)

**Goal**: Let the user revoke access and immediately erase every locally held session-owned record, even if external
revocation fails.

**Independent Test**: Seed a complete session graph, disconnect with successful and failed revoke fixtures, and
verify every local row and cookie is gone, the old job returns 404, and failed revoke shows manual guidance.

### Tests for User Story 4

- [X] T052 [P] [US4] Write failing cascade deletion, revoke-success, revoke-failure, and three-second revoke-timeout tests in `tests/integration/disconnect.test.ts`
- [ ] T053 [P] [US4] Write a failing keyboard confirmation and post-delete access E2E fixture in `tests/e2e/disconnect.spec.ts`

### Implementation for User Story 4

- [X] T054 [P] [US4] Implement Google token revocation with sanitized result mapping in `src/server/auth/google-oauth.ts`
- [X] T055 [US4] Start bounded three-second revocation while immediately executing local cascade deletion in `src/server/auth/disconnect.ts` and `src/server/auth/session-repository.ts`
- [X] T056 [US4] Implement the CSRF-protected disconnect handler and cookie expiry in `src/app/api/connection/route.ts`
- [X] T057 [US4] Build the explicit disconnect confirmation and manual-revocation fallback UI in `src/components/collection/disconnect-control.tsx` and `src/app/collect/page.tsx`

**Checkpoint**: Account access and all locally retained collection data are user-revocable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Enforce retention, security, accessibility, documentation, and full quality gates across all stories.

- [X] T058 [P] Implement bounded request/startup TTL cleanup and test it in `src/server/db/cleanup.ts` and `tests/integration/ttl-cleanup.test.ts`
- [X] T059 [P] Add Korean user-facing error/limitation copy without raw provider payloads in `src/shared/contracts/messages.ko.ts`
- [ ] T060 Audit keyboard order, live-region behavior, focus restoration, contrast, and responsive layouts in `src/app/globals.css` and `tests/e2e/accessibility.spec.ts`
- [ ] T061 Add an opt-in real Google test-account smoke script that never prints credentials or subscription IDs in `scripts/google-smoke.mjs`
- [X] T062 Update developer setup, feature scope, and compliance warning in `README.md` and `docs/WORKSHOP.md`
- [ ] T063 Run every command in `specs/001-youtube-oauth-subscriptions/quickstart.md`, fix failures, and record validated versions in `package-lock.json`
- [X] T064 Search the repository, built client assets, logs, and HTTP fixture snapshots for token, secret, and `subscriptionId` leakage and document the clean check in `specs/001-youtube-oauth-subscriptions/checklists/security.md`
- [ ] T065 Capture 360px, 768px, and 1280px UI states, compare them with both supplied references, fix P0-P2 findings, and record a passing result in `design-qa.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: starts immediately.
- **Foundational (Phase 2)**: depends on setup and blocks every story.
- **US1 (Phase 3)**: depends on foundational; first executable MVP.
- **US2 (Phase 4)**: depends on US1's connected-session, job, subscription, and YouTube adapter boundaries.
- **US3 (Phase 5)**: depends on US1/US2 state-machine paths so every phase can use the same lease/failure policy.
- **US4 (Phase 6)**: depends only on foundational session/OAuth storage, but follows US3 to validate deletion of the full
  result graph.
- **Polish (Phase 7)**: depends on every selected user story.

### User story dependency graph

```text
Setup -> Foundation -> US1 (OAuth + subscriptions) -> US2 (channel preparation) -> US3 (resilience)
                         \-----------------------------------------------> US4 (disconnect)
US2 + US3 + US4 -> Polish and complete quickstart validation
```

### Within each story

1. Add the listed tests and confirm they fail for the missing behavior.
2. Add boundary schemas/repositories before orchestration.
3. Add services before Route Handlers.
4. Add UI after the server contract passes.
5. Run the independent test before moving to the next story.

## Parallel Opportunities

- In Setup, T002-T006 touch independent configuration or shell files after T001 defines scripts.
- In Foundation, error/logging (T008-T009), crypto (T012), and fixtures (T015) can proceed around the sequential
  migration/session path.
- All test files at the start of a story can be authored in parallel.
- US2 channel persistence, upload persistence, and lexicon work (T035, T036, T039) are independent after schemas.
- US4 test authoring and revoke-adapter work can begin after US1 even while US2/US3 are underway.
- Polish copy, TTL cleanup, and documentation tasks use separate files.

## Parallel Examples

### User Story 1

```text
T016 OAuth security tests
T017 subscription pagination tests
T018 job ownership tests
T019 HTTP contract tests
T020 E2E fixture
```

### User Story 2

```text
T029 channel validation tests
T030 upload traversal tests
T031 candidate recall tests
T032 preparation integration test
T033 safe serialization test
```

### User Story 4 after US1

```text
T052 disconnect integration tests
T053 disconnect E2E fixture
T054 revoke adapter
```

## Implementation Strategy

### MVP first

1. Complete T001-T015.
2. Complete T016-T028 for User Story 1.
3. Stop and run the US1 independent fixtures plus lint/typecheck/build.
4. Demo OAuth consent and complete subscription pagination before adding analysis preparation.

### Incremental delivery

1. **US1** proves safe account connection and complete subscription discovery.
2. **US2** produces bounded, versioned inputs for later scoring specs.
3. **US3** makes the entire collection operationally truthful and restart-safe.
4. **US4** completes privacy control and deletion.
5. **Polish** closes TTL, accessibility, real-provider smoke, and secret-leak gates.

## Notes

- Commit after each logical task group, not after each mechanically small file.
- `subscriptionId` remains server-only even though the database needs it for a future unsubscribe feature.
- Do not add popular-video search, `videos.list`, either score, Gemini, channel selection, or unsubscribe execution.
- Do not use scraping, unofficial transcript clients, media downloaders, background promise work, or a new queue.
- When application dependencies are installed, read the matching current Next.js guides under
  `node_modules/next/dist/docs/` before implementing framework-specific files, as required by `AGENTS.md`.
