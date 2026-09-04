<!--
Sync Impact Report
- Version change: template (unratified) -> 1.0.0
- Added principles:
  - I. User-Controlled Irreversible Actions
  - II. Evidence-Bounded Judgement
  - III. Independent, Versioned Scores
  - IV. Privacy and API Compliance
  - V. Specification and Verification First
- Added sections:
  - Product and Technical Constraints
  - Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->
# Senior Algorithm Cleaner Constitution

## Core Principles

### I. User-Controlled Irreversible Actions

The application MUST NOT preselect channels, unsubscribe automatically, or infer consent from a
risk score. Every channel checkbox MUST start unselected. Only subscription IDs selected by the
current user MAY appear in the confirmation dialog, and `subscriptions.delete` MUST run only after
an explicit final confirmation. The result MUST preserve per-channel success and failure states,
and retries MUST target failed items only. Analysis and recommendation code MUST remain incapable
of invoking a write API without a separate, verified confirmation boundary.

### II. Evidence-Bounded Judgement

Every deduction MUST be based on data observed in the current channel or video input and MUST carry
a human-readable reason. Content-risk deductions MUST include video evidence when available; the
system MUST NOT fill missing facts with model background knowledge or external searches. Unknown,
unavailable, and failed states MUST remain distinct from `false` and from a zero deduction. The UI
MUST expose sample size, unavailable evidence, provider failures, and other limitations. The product
MUST describe signals as risk or likelihood, never as a definitive finding of falsity, illegality,
fraud, or AI generation.

### III. Independent, Versioned Scores

Content risk and factory-like likelihood answer different questions and MUST remain separate from
collection through presentation. They MUST NOT be merged into a composite score or used as a proxy
for one another. Subscriber count, view count, synthetic-media disclosure, and upload frequency
MUST NOT affect content risk. Every scoring threshold, normalization rule, prompt, schema, and
aggregation formula MUST have an explicit version. Rule-based calculations MUST be deterministic
for the same normalized input and policy version.

### IV. Privacy and API Compliance

OAuth credentials, access tokens, refresh tokens, API keys, and user-specific subscription IDs MUST
remain server-side and MUST NOT enter logs, client bundles, repositories, LLM prompts, or exported
demo artifacts. The implementation MUST use official YouTube and Google APIs and MUST NOT scrape
YouTube, use unofficial transcript endpoints, automate the YouTube interface, or download/separate
YouTube audiovisual content. Only the minimum data required for an active analysis and its user-
visible result MAY be retained, with a documented expiry policy and account-disconnect deletion
path.

### V. Specification and Verification First

Each bounded feature MUST have a reviewed Spec Kit specification, implementation plan, and
dependency-ordered task list before application code is written. Requirements MUST trace to tests:
pure scoring and normalization rules to unit tests, provider and API contracts to integration tests,
LLM judge behavior to versioned evaluation fixtures, and selection-confirmation-unsubscribe behavior
to end-to-end tests. Existing `openai-workshop` demo code MUST NOT be copied, imported, or treated as
a design reference. Simplicity is mandatory: no service, queue, framework, or persistence layer may
be introduced without a requirement that the existing single-server design cannot satisfy.

## Product and Technical Constraints

- The only user-data discovery source in scope is the authenticated user's YouTube subscriptions.
- The product analyzes health-related YouTube channels and displays `content risk` and
  `factory-like likelihood`, each from 0 to 100 where a larger number means a stronger warning.
- Content risk is judged per video by a single LLM judge call against the approved three-part
  rubric. Code validates structure and arithmetic but MUST NOT reinterpret the model's meaning.
- Factory-like likelihood is computed per channel by pure TypeScript rules against three approved
  metadata dimensions: upload pattern, title/description repetition, and synthetic-media disclosure.
- Synthetic-media disclosure is a production-pattern signal only. An absent disclosure MUST be
  stored as `unknown`, not `false`.
- The runtime remains a single TypeScript web application unless a reviewed spec demonstrates a
  concrete need to change it.
- Google Data Portability, Takeout, watch history, likes/dislikes, `videos.rate`, recommendation
  controls, browser automation, and automatic unsubscribe are outside scope.

## Development Workflow and Quality Gates

1. Treat `docs/IMPLEMENTATION_HANDOFF.md` as the product decision source, then `docs/PRD.md`,
   `docs/ANALYSIS_WORKFLOW.md`, and `docs/API_DATA_DETAILS.md` as successively more detailed
   contracts. A narrower, newer specification may refine but MUST NOT silently contradict them.
2. Run `$speckit-specify`, optionally `$speckit-clarify`, then `$speckit-plan` and `$speckit-tasks`
   for each feature. Resolve every material ambiguity before `$speckit-implement`.
3. Keep external API clients behind typed adapters. Parse every external response at the boundary
   and preserve explicit partial, unavailable, and retryable failure states.
4. A change is complete only when formatting, lint, type checking, relevant unit and integration
   tests, and affected end-to-end or LLM evaluations pass.
5. Reviews MUST verify authorization boundaries, score-axis separation, evidence traceability,
   policy-version provenance, and compliance with all explicit non-goals.

## Governance

This constitution governs every specification, plan, task, implementation, and review in the
repository. Amendments require a written rationale, an updated Sync Impact Report, and migration
notes for affected specs, policies, fixtures, or persisted results. Version changes follow semantic
versioning: MAJOR for incompatible principle changes or removals, MINOR for new principles or
materially expanded obligations, and PATCH for non-semantic clarification. Every pull request MUST
declare whether it complies or identify an approved amendment. Product documentation and feature
specifications MUST be updated in the same change whenever behavior or contracts change.

**Version**: 1.0.0 | **Ratified**: 2026-09-04 | **Last Amended**: 2026-09-04
