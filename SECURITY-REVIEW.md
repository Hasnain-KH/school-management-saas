# SchoolFlow Security Review

## Scope and method

Reviewed the authentication and session flow, cookie and CSRF controls, refresh-token rotation, rate-limit configuration, CORS/CSP headers, and frontend token handling. The review was source-based and supplemented with automated request-level and mocked-adapter tests. No `.env` file or secret value was inspected.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | [rate-limit.middleware.js](./backend/src/middleware/rate-limit.middleware.js) | 4-17 | **Resolved.** Process-local counters could be bypassed by distributing requests across Vercel instances. Both API and authentication limiters now use separate Redis-compatible shared-store namespaces; production configuration requires the provider and store failures return `503` without a memory fallback. | 9/10 |

No additional actionable findings were identified in the scoped source review. The frontend source search found no `dangerouslySetInnerHTML`, direct `innerHTML` assignment, or `eval` use. This does not establish that the application is free of XSS or other vulnerabilities.

## Verification evidence

- Backend suite: 85 passed, 0 failed, 1 skipped (86 total). The skipped test is the opt-in MongoDB integration test; `MONGO_TEST_URI` was not supplied.
- Auth regression tests verify cookie-only authentication for all five roles, no auth tokens in login/refresh JSON, cookie attributes, CSRF validation, refresh rotation and replay revocation, and logout when the access cookie has expired.
- A production-mode subprocess test verifies Secure, HttpOnly, SameSite, and cookie paths without connecting to MongoDB or Redis.
- Shared-rate-limit tests verify namespace separation and controlled `503` behavior when storage is missing or unavailable. They use mocked Redis clients; no live Redis service was configured.
- Chromium Playwright tests: 10 passed. They intercept/mock API responses and do not verify live browser-to-API authentication.
- Frontend production build passed; `npm audit` reported zero vulnerabilities.

## Remaining security and deployment limitations

- Configure a real Redis-protocol `RATE_LIMIT_REDIS_URL` before production. Live Redis connectivity, persistence, independent-instance consistency, and rate-limit behavior under load were not verified.
- Configure and run the isolated MongoDB replica-set test before claiming database persistence or transaction behavior; no live MongoDB integration was performed.
- Vercel CSP/security headers and cookie settings are prepared in configuration but were not verified in a deployed Vercel environment.
- No penetration test, load test, cross-browser test, or accessibility/security assessment was performed. HttpOnly cookies reduce token exposure to JavaScript but do not prevent XSS; the CSRF cookie is intentionally readable by the frontend and is not an authentication credential.
- Cross-tab refresh uses the browser Web Locks API when available. Older browsers without that API may reject a concurrent refresh and require the user to sign in again; replay handling remains fail-closed.

No commit, deployment, or production-data operation was performed.
