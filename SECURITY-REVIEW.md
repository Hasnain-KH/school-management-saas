# SchoolFlow Security Review

Last updated: 2026-11-24

## Scope and method

Reviewed the authentication and session flow, cookie and CSRF controls, refresh-token rotation, rate-limit configuration, CORS/CSP headers, frontend token handling, platform receiving-account authorization, student-media consent/tenant scoping, and the confirmed frontend defects fixed during the final audit. The review was source-based and supplemented with automated request-level, mocked-adapter, and browser tests. No `.env` file, secret value, provider account, or production data was accessed.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|---|----------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | [rate-limit.middleware.js](./backend/src/middleware/rate-limit.middleware.js) | 4-17 | **Resolved.** Process-local counters could be bypassed by distributing requests across Vercel instances. Both API and authentication limiters now use separate Redis-compatible shared-store namespaces; production configuration requires the provider and store failures return `503` without a memory fallback. | 9/10 |
| 2 | 🟡 MEDIUM | [student-media.service.js](./backend/src/services/student-media.service.js) and related test mocks | consent paths | **Resolved during final audit.** Consent invalidation now writes an audit event and blocks URL issuance; media update, upload-reservation, and uploader lookups are tenant-scoped. Two tests initially failed with Mongoose buffering timeouts because they omitted the existing `AuditLog.prototype.save` mock; the test mocks were corrected. No production code was weakened. | 9/10 |

No additional actionable findings were identified in the scoped source review. The frontend source search found no `dangerouslySetInnerHTML`, direct `innerHTML` assignment, or `eval` use. This does not establish that the application is free of XSS or other vulnerabilities.

## Controls verified in this audit

- **Receiving accounts are platform-scoped** (`schoolId: null`). Only `platform_super_admin` can create, edit, activate/deactivate, or delete them. Delete requires explicit `?confirm=true`. All mutations write platform audit logs with `schoolId: null`.
- **School Owners have one read-only route**, `GET /api/v1/schools/receiving-accounts`, returning active accounts only in a safe projection. Teacher, parent, student, and principal roles have no receiving-account route. Client-side UI exposes copy buttons only; no payment submission, receipt upload, or mutation is possible.
- **Strict validation** rejects unknown fields and credential markers (`password`, `passwd`, `pin`, `otp`, `cvv`, `secret`) in receiving-account fields. Wallet types require a mobile wallet number.
- **Student media remains private**: consent is rechecked at access time, withdrawal unpublishes media and blocks new signed URLs, access denials are logged, and no public URL or silent base64 fallback on direct upload failure was introduced.
- **Parent portal fixes**: linked-child endpoint corrected to `/portal/parent/students`, child-load errors surfaced, and result rows use exam/class/subject display names rather than raw IDs.
- **Dialog/menu accessibility fixes**: unique modal title IDs, account-menu keyboard handling/focus return, explicit button types, and correct ARIA roles/labels. No formal WCAG audit was performed.
- **No gateway surface was added**: checkout/webhook remain fail-closed placeholders returning `503`; no adapter, card data, payment submission, or automated activation exists.

## Verification evidence

- Backend suite: **291 tests, 288 pass, 0 fail, 3 skipped** (exit 0). The 3 skipped cases are opt-in MongoDB (2) and Redis (1) integration tests; no live infrastructure was supplied.
- Frontend suite: **83 tests, 83 pass, 0 fail** (exit 0).
- Playwright: **45 passed** across 7 specs (exit 0). All API responses are mocked; this is UI journey coverage, not live browser-to-API validation.
- Production build: passed; 2255 modules transformed.
- Icon check: passed; 54 source files scanned, 3 documented manual-review image candidates, 0 application icon violations.
- `git diff --check`: exit 0; LF→CRLF working-copy warnings only, no whitespace errors.
- Auth regression tests verify cookie-only authentication for all five roles, no auth tokens in login/refresh JSON, cookie attributes, CSRF validation, refresh rotation and replay revocation, and logout when the access cookie has expired.
- A production-mode subprocess test verifies Secure, HttpOnly, SameSite, and cookie paths without connecting to MongoDB or Redis.
- Shared-rate-limit tests verify namespace separation and controlled `503` behavior when storage is missing or unavailable. They use mocked Redis clients; no live Redis service was configured.
- Full backend suite green after the consent-audit test mock fix; receiving-account tests cover authorization, validation, audit, deletion confirmation, and active-only visibility.

## Remaining security and deployment limitations

- Configure a real Redis-protocol `RATE_LIMIT_REDIS_URL` before production. Live Redis connectivity, persistence, independent-instance consistency, and rate-limit behavior under load were not verified.
- Configure and run the isolated MongoDB replica-set test before claiming database persistence or transaction behavior; no live MongoDB integration was performed.
- Vercel CSP/security headers and cookie settings are prepared in configuration but were not verified in a deployed Vercel environment. The static CSP also lacks some exact storage upload origins needed for direct browser uploads with non-Cloudinary providers.
- Vercel plan/commercial eligibility and function request-body limits were not verified. Large base64 student media can be rejected by the platform before Express returns a safe error; direct-to-storage is the preferred path.
- No penetration test, load test, cross-browser test, formal accessibility conformance audit, or backup/restore rehearsal was performed. HttpOnly cookies reduce token exposure to JavaScript but do not prevent XSS; the CSRF cookie is intentionally readable by the frontend and is not an authentication credential.
- Cross-tab refresh uses the browser Web Locks API when available. Older browsers without that API may reject a concurrent refresh and require the user to sign in again; replay handling remains fail-closed.
- Manual payment verification is an external human control. There is no in-app proof of transfer, automated verification, or automatic subscription activation; this is intentional, not an unimplemented "nice to have".

No commit, deployment, provider call, or production-data operation was performed.
