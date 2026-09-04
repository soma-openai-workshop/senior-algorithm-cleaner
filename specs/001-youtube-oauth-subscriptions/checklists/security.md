# Security Verification: YouTube OAuth and Collection

**Validated**: 2026-09-04

- [x] `.env.local` is ignored and no configured secret value appears in 759 built client/report artifacts.
- [x] Built client assets contain no `subscriptionId` field name.
- [x] OAuth state is one-time, session-owned, expires after 10 minutes, and its replay test passes.
- [x] PKCE verifier and access token are stored with AES-256-GCM; opaque cookies and CSRF tokens are hashed.
- [x] Mutations require a same-origin request and a session-bound CSRF token.
- [x] Foreign job lookup returns the same not-found result as an unknown job.
- [x] Browser result serializers omit OAuth tokens, provider subscription IDs, and score fields.
- [x] Structured logging recursively redacts token, secret, authorization, cookie, password, verifier, and subscription ID fields.
- [x] Disconnect deletes the complete local session graph even when provider revocation fails.

Scan result: **clean**. Test fixtures contain deliberately fake values only; they were also absent from built
client assets and generated reports.
