# Quickstart Validation: YouTube OAuth and Subscription Collection

## Prerequisites

- Node.js 24 LTS and npm 11+
- Google Cloud test project with YouTube Data API v3 enabled
- OAuth 2.0 Web application client for an allowed test account
- Authorized redirect URI: `http://localhost:3000/api/oauth/callback`

Public deployment is outside this feature gate. Use only development/allowed test accounts until YouTube API
compliance review is complete.

## Environment

Copy `.env.example` to `.env.local` and fill these first-feature values:

```dotenv
APP_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<web-client-id>
GOOGLE_CLIENT_SECRET=<web-client-secret>
SESSION_SECRET=<at-least-32-random-characters>
TOKEN_ENCRYPTION_KEY=<base64-encoded-32-random-bytes>
DATABASE_PATH=./data/senior-algorithm-cleaner.db
ANALYSIS_TTL_HOURS=24
```

Generate the token encryption key locally without printing it into shell history by using a password manager or
an equivalent cryptographically secure 32-byte base64 generator. Never commit `.env.local`; `.gitignore` excludes
all `.env*` except `.env.example`.

`GEMINI_API_KEY` and `GEMINI_JUDGE_MODEL` are not required by this feature.

## Install and initialize

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

Expected initial state:

- The page explains subscription read/delete permission before a connect action.
- No OAuth request starts until the user presses connect.
- The browser contains only the opaque HttpOnly session cookie; no access token appears in storage or URL.

## Deterministic validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Expected fixture coverage:

1. OAuth state mismatch, expiry and replay are rejected.
2. 0, 1, 51 and 500 subscription datasets finish with no missing/duplicate subscription.
   Every item is visible by channel identity and subscription time without exposing `subscriptionId`.
3. Missing channel details become isolated channel failures.
4. Upload traversal retains latest 20 and recent 90-day union, then truncates at 500 with a limitation.
5. Health fixture recall is at least 95% and the output has no risk/factory score field.
6. A second start/advance does not create or execute a duplicate active job.
   An interrupted job can be resumed or atomically abandoned and replaced.
7. Token expiry returns `reauth_required` without additional provider calls.
8. Disconnect deletes all session-owned rows even when provider revocation fails.
9. Another session receives 404 for a known foreign job ID.
10. With a 200-subscription fixture, the first progress state appears within one second and updates remain at most
    five seconds apart.

## Manual Google smoke test

With valid `.env.local` credentials:

1. Start the app and read the permission explanation.
2. Connect an allowed Google test account and approve the requested scope.
3. Start collection and keep the page open while stage/count values update.
4. Compare the final unique subscription count with the account's subscription list.
5. Confirm unavailable channels and collection limits appear as limitations, not zero scores.
6. Disconnect and verify the UI requires a new connection.
7. Confirm the SQLite database has no rows for the deleted session and Google Account permissions no longer list
   the access grant. If external revocation failed, follow the UI's manual revocation link.

Do not paste tokens, authorization codes, database rows or subscription IDs into issue reports. Record only the
job ID, internal failure code, stage, provider status code and attempt count.

## Contract pointers

- HTTP/UI boundary: [contracts/openapi.yaml](./contracts/openapi.yaml)
- Persistence and transitions: [data-model.md](./data-model.md)
- Provider request mapping: [../../docs/API_DATA_DETAILS.md](../../docs/API_DATA_DETAILS.md)
