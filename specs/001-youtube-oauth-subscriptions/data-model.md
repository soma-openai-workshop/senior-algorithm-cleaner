# Data Model: YouTube OAuth and Subscription Collection

## Conventions

- 모든 ID는 서버가 생성한 UUIDv7 문자열이다. YouTube 식별자는 별도 명시된 TEXT 필드다.
- 모든 시각은 UTC ISO 8601 문자열로 기록한다.
- SQLite foreign key를 활성화하고 owner session 삭제 시 관련 행을 `ON DELETE CASCADE`한다.
- 외부 API 원문 JSON은 저장하지 않는다. 검증·정규화한 최소 필드만 저장한다.
- OAuth token, PKCE verifier와 secret 값은 평문으로 저장하지 않는다.
- `unknown`, `unavailable`, `failed`는 `false`, 빈 문자열, 0과 구분한다.

## Entity relationships

```text
BrowserSession 1 ── 0..1 OAuthConnection
BrowserSession 1 ── * OAuthAttempt
BrowserSession 1 ── * CollectionJob
CollectionJob 1 ── * Subscription
CollectionJob 1 ── * ChannelProfile
ChannelProfile 1 ── 1 ChannelCollectionState
ChannelProfile 1 ── * UploadMetadata
ChannelProfile 1 ── 0..1 HealthCandidateClassification
CollectionJob 1 ── * CollectionFailure
```

## BrowserSession

| Field           | Type         | Rules                                                     |
| --------------- | ------------ | --------------------------------------------------------- |
| `id`            | UUIDv7       | Primary key, never sent to browser                        |
| `cookieHash`    | 32-byte blob | Unique SHA-256 of random cookie token                     |
| `csrfTokenHash` | 32-byte blob | SHA-256; raw token may be returned to same-origin UI only |
| `createdAt`     | timestamp    | Required                                                  |
| `lastSeenAt`    | timestamp    | Required, updated with bounded frequency                  |
| `expiresAt`     | timestamp    | Required; expired session cannot own protected access     |

Validation:

- Raw session token and CSRF token each contain at least 256 bits of randomness.
- Cookie options are `HttpOnly`, `SameSite=Lax`, `Path=/`; production additionally uses `Secure`.
- Session lookup uses constant-time hash comparison or indexed exact blob lookup; raw cookie is never logged.

## OAuthAttempt

| Field                   | Type           | Rules                                                 |
| ----------------------- | -------------- | ----------------------------------------------------- |
| `id`                    | UUIDv7         | Primary key                                           |
| `sessionId`             | UUIDv7         | FK BrowserSession, owner                              |
| `stateHash`             | 32-byte blob   | Unique, raw state never stored                        |
| `encryptedCodeVerifier` | blob set       | AES-GCM ciphertext, iv, auth tag                      |
| `redirectUri`           | text           | Exact registered callback used for start and exchange |
| `createdAt`             | timestamp      | Required                                              |
| `expiresAt`             | timestamp      | `createdAt + 10 minutes`                              |
| `consumedAt`            | timestamp/null | Set exactly once before token persistence             |

Validation and transition:

```text
pending ── valid callback owned by same session ──> consumed
pending ── time passes ──> expired
consumed/expired ── callback ──> rejected
```

- Callback errors from Google consume the matching attempt so it cannot be replayed.
- State mismatch does not reveal whether another session owns a state value.

## OAuthConnection

| Field             | Type         | Rules                                        |
| ----------------- | ------------ | -------------------------------------------- |
| `sessionId`       | UUIDv7       | PK/FK BrowserSession                         |
| `tokenCiphertext` | blob         | Required AES-256-GCM ciphertext              |
| `tokenIv`         | 12-byte blob | Unique per encryption                        |
| `tokenAuthTag`    | 16-byte blob | Required                                     |
| `grantedScopes`   | text         | Canonical space-delimited allowlisted scopes |
| `tokenType`       | text         | Must be `Bearer`                             |
| `expiresAt`       | timestamp    | Required; expired means `reauth_required`    |
| `connectedAt`     | timestamp    | Required                                     |

Validation:

- Granted scope must include `https://www.googleapis.com/auth/youtube.force-ssl`.
- Refresh token is rejected and never persisted.
- Token is decrypted only immediately before a provider call and discarded from references afterward.

## CollectionJob

| Field             | Type           | Rules                                              |
| ----------------- | -------------- | -------------------------------------------------- |
| `id`              | UUIDv7         | Primary key                                        |
| `sessionId`       | UUIDv7         | FK BrowserSession, owner                           |
| `status`          | enum           | See state machine                                  |
| `phase`           | enum           | Current collection phase                           |
| `checkpoint`      | JSON text/null | Parsed against internal discriminated-union schema |
| `discoveredCount` | integer        | `>= 0`                                             |
| `processedCount`  | integer        | `>= 0`                                             |
| `successCount`    | integer        | `>= 0`                                             |
| `failureCount`    | integer        | `>= 0`                                             |
| `excludedCount`   | integer        | `>= 0`                                             |
| `duplicateCount`  | integer        | `>= 0`                                             |
| `leaseOwner`      | UUID/null      | Set only while an advance request owns the job     |
| `leaseExpiresAt`  | timestamp/null | 30 seconds after claim                             |
| `startedAt`       | timestamp/null | First successful claim                             |
| `updatedAt`       | timestamp      | Required                                           |
| `finishedAt`      | timestamp/null | Terminal transition time                           |
| `expiresAt`       | timestamp/null | `finishedAt + ANALYSIS_TTL_HOURS`                  |

Status enum:

```text
queued
collecting_subscriptions
collecting_channels
collecting_uploads
classifying_candidates
interrupted
completed
partial
failed
abandoned
expired
```

Phase enum uses the non-terminal collection values plus `finalizing`.

State transitions:

```text
queued -> collecting_subscriptions -> collecting_channels
       -> collecting_uploads -> classifying_candidates -> completed | partial
any active -> interrupted -> same persisted phase
any active -> failed
interrupted -> abandoned -> new queued job (single transaction)
completed | partial | failed | abandoned -> expired
```

Invariants:

- A partial unique index permits one active/interrupted job per `sessionId`; `abandoned` is terminal and 제외된다.
- A non-expired foreign lease returns `already_advancing` without duplicate provider calls.
- Every successful page/batch and its next checkpoint commit in the same transaction.
- `completed` requires zero failures; recoverable or isolated failures produce `partial` when any usable data
  exists. A fatal auth/schema failure before usable results produces `failed`.

Checkpoint union:

- subscriptions: `nextPageToken | null`, `firstPageDone`
- channels: ordered unique channel IDs and `nextBatchOffset`
- uploads: pending channel IDs; each channel owns its cursor in ChannelCollectionState
- classification: `nextChannelOffset`

## Subscription

| Field                | Type           | Rules                                                 |
| -------------------- | -------------- | ----------------------------------------------------- |
| `jobId`              | UUIDv7         | FK CollectionJob                                      |
| `subscriptionId`     | text           | YouTube relation ID; composite primary key with jobId |
| `channelId`          | text           | Required YouTube channel ID                           |
| `subscribedAt`       | timestamp/null | Invalid/missing value remains null                    |
| `sourceTitle`        | text           | Subscription response fallback title                  |
| `sourceDescription`  | text           | Subscription response fallback description            |
| `sourceThumbnailUrl` | text/null      | HTTPS URL only                                        |
| `createdAt`          | timestamp      | Required                                              |

Invariants:

- Unique `(jobId, channelId)` prevents duplicate channel work while preserving duplicate count diagnostics.
- API result serializers never expose `subscriptionId` in this feature.
- Invalid items without both relation ID and channel ID are excluded and recorded as failures.

## ChannelProfile

| Field               | Type              | Rules                                                      |
| ------------------- | ----------------- | ---------------------------------------------------------- |
| `jobId`             | UUIDv7            | FK CollectionJob                                           |
| `channelId`         | text              | Composite primary key with jobId                           |
| `title`             | text              | Latest channel value or subscription fallback on failure   |
| `description`       | text              | Latest channel value or fallback                           |
| `thumbnailUrl`      | text/null         | HTTPS only                                                 |
| `publishedAt`       | timestamp/null    | Context only, never a score input                          |
| `publicVideoCount`  | decimal text/null | Provider integer string retained without JS precision loss |
| `subscriberCount`   | decimal text/null | UI context only, never classification/score input          |
| `viewCount`         | decimal text/null | UI context only, never classification/score input          |
| `uploadsPlaylistId` | text/null         | Required for upload collection                             |
| `detailStatus`      | enum              | `ready`, `unavailable`, `invalid`                          |
| `failureCode`       | text/null         | Required unless ready                                      |
| `updatedAt`         | timestamp         | Required                                                   |

## ChannelCollectionState

| Field                | Type           | Rules                                                      |
| -------------------- | -------------- | ---------------------------------------------------------- |
| `jobId`, `channelId` | composite FK   | One per ChannelProfile                                     |
| `status`             | enum           | `pending`, `collecting`, `complete`, `truncated`, `failed` |
| `nextPageToken`      | text/null      | Opaque provider cursor                                     |
| `scannedCount`       | integer        | `0..500`                                                   |
| `storedCount`        | integer        | `>= 0`                                                     |
| `excludedCount`      | integer        | `>= 0`                                                     |
| `latestPublicCount`  | integer        | `0..20`                                                    |
| `sawOlderThan90Days` | boolean        | Required                                                   |
| `oldestSeenAt`       | timestamp/null | Diagnostics only                                           |
| `failureCode`        | text/null      | Required for failed                                        |
| `updatedAt`          | timestamp      | Required                                                   |

Completion:

- `complete` when no `nextPageToken`, or latest 20 are secured and an item older than the 90-day boundary was
  observed.
- `truncated` when `scannedCount == 500` before the normal completion condition.
- Channels with no uploads complete with zero counts and are not provider failures.

## UploadMetadata

| Field                           | Type           | Rules                                                          |
| ------------------------------- | -------------- | -------------------------------------------------------------- |
| `jobId`, `channelId`, `videoId` | composite key  | Unique normalized video                                        |
| `title`                         | text           | Required non-placeholder title                                 |
| `description`                   | text           | Required; may be empty                                         |
| `publishedAt`                   | timestamp/null | Invalid/missing dates excluded from time metrics, not invented |
| `playlistPosition`              | integer/null   | `>= 0` when present                                            |
| `privacyStatus`                 | enum           | Only `public` rows retained                                    |
| `isLatestTwenty`                | boolean        | Recomputed deterministically after each page                   |
| `isWithinLastNinetyDays`        | boolean        | Boundary uses job start time                                   |
| `createdAt`                     | timestamp      | Required                                                       |

Retention rule: delete rows that are neither in the latest 20 nor within the last 90 days after ordering by
valid `publishedAt`, then playlist position, then video ID.

## HealthCandidateClassification

| Field                | Type            | Rules                                                       |
| -------------------- | --------------- | ----------------------------------------------------------- |
| `jobId`, `channelId` | composite PK/FK | One per available channel                                   |
| `isCandidate`        | boolean         | Required                                                    |
| `policyVersion`      | text            | Exactly `health-candidate-policy-v1` for this feature       |
| `sampleStatus`       | enum            | `sufficient`, `limited`, `no_uploads`                       |
| `matchedSignals`     | JSON text       | Array parsed against signal schema, empty for non-candidate |
| `classifiedAt`       | timestamp       | Required                                                    |

Matched signal fields:

- `category`: versioned lexicon category, e.g. `condition`, `treatment`, `medication`, `nutrition`
- `termId`: stable policy term identifier; do not store a computed probability
- `source`: `channel_title`, `channel_description`, `video_title`, `video_description`
- `videoId`: required only for video sources

## CollectionFailure

| Field            | Type      | Rules                                                                    |
| ---------------- | --------- | ------------------------------------------------------------------------ |
| `id`             | UUIDv7    | Primary key                                                              |
| `jobId`          | UUIDv7    | FK CollectionJob                                                         |
| `stage`          | enum      | `oauth`, `subscriptions`, `channels`, `uploads`, `classification`        |
| `subjectType`    | enum      | `job`, `page`, `channel`, `video`                                        |
| `subjectRef`     | text/null | Internal non-secret ref; never serialized if it is subscription-specific |
| `code`           | enum      | Stable internal failure code                                             |
| `retryable`      | boolean   | Required                                                                 |
| `userMessageKey` | text      | Localized UI lookup key, no raw provider message                         |
| `attemptCount`   | integer   | `>= 1`                                                                   |
| `createdAt`      | timestamp | Required                                                                 |

Failure codes include:

```text
oauth_denied, oauth_state_invalid, auth_expired, quota_exceeded,
provider_temporary, provider_permanent, provider_schema_invalid,
channel_unavailable, uploads_unavailable, upload_item_invalid,
collection_truncated, internal_interrupted
```

Provider response bodies, tokens, descriptions and authorization headers are not stored in this table.

## Deletion and TTL

1. Every protected read/mutation first expires overdue sessions/jobs in a bounded cleanup transaction.
2. Expiring a job cascades its subscriptions, channels, upload metadata, classifications and failures.
3. Disconnect starts one Google token-revocation request with a 3-second timeout and deletes BrowserSession in a
   local transaction without waiting for that provider result. The HTTP response may wait for the bounded revoke
   result, but local deletion never depends on it.
4. Deleting BrowserSession cascades OAuthConnection, OAuthAttempt and every job/result.
5. The disconnect response may report `externalRevocation: failed`; it must never restore locally deleted data.
