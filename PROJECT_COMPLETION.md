# Project completion record

Last updated: 2026-11-12

This record summarizes what SchoolFlow includes and how it was verified. Detailed reports from the production-readiness program:

- [Phase completion report](./docs/PHASE-COMPLETION.md)
- [Testing report](./docs/TESTING.md)
- [Remaining manual tasks](./docs/REMAINING-TASKS.md)
- [Production verdict](./docs/PRODUCTION-VERDICT.md)

## Implemented

- Backend school onboarding, tenant authentication, role permissions, academic records, student admissions/placements and leaving certificates, attendance, finance, exams/results, calendar, inventory, library, announcements, reports, plans, and subscription lifecycle workflows.
- React + Tailwind CSS frontend with login, registration/onboarding, password recovery/reset, role-specific navigation and overview screens, responsive school workspaces, loading/error/empty states, and API error feedback.
- API-backed student/staff records, attendance capture, finance collection, exams/results, inventory, library, calendar, announcements, reports, school profile/subscription details, and platform school controls.
- Platform admin interfaces for creating/configuring plans, activating/deactivating plans, assigning school plans, suspending/reactivating schools, recording payments, and viewing revenue.
- Parent-only linked-student, attendance, fee, and published-result APIs. Parent visibility is resolved through a **Guardian account link** (`Guardian.userId`), created via `PUT /api/v1/students/guardians/:guardianId/account`, not by email string matching.
- Fixed-asset register with immutable assignment/release history, monthly straight-line depreciation entries, and disposal; school and assignee references are tenant-scoped.
- School and platform audit-log read APIs.
- Per-user notifications (`/api/v1/notifications`) created on announcements and published results, with an unread-count badge and idempotent fan-out.
- Document storage (`/api/v1/documents`) behind an S3-compatible provider, with base64 uploads (5 MB cap), presigned downloads, and parent-scoped visibility.
- Email delivery behind a Resend-compatible HTTP adapter (`email-delivery.provider.js`) covering password reset, verification, welcome, notifications, and reminders.
- Idempotent scheduled jobs (`POST /api/v1/jobs/run`, `x-jobs-secret` guarded) for `fee_reminders` and `subscription_expiry`, plus an optional local-only dev scheduler.
- Subscription payments: manual/offline recording (`POST /api/v1/platform/schools/:schoolId/payments`) that can activate/extend a subscription, gateway checkout + signature-verified webhook orchestration, and a revenue report (`GET /api/v1/platform/reports/revenue`) aggregated from recorded payments.
- Configurable email, payment gateway, and document-storage provider interfaces. Email and storage adapters are implemented; the gateway is an interface with no adapter. No path claims success when none is configured.
- HttpOnly, host-only access/refresh cookies with cookie-path scoping, Secure production flags, CSRF token signing and Origin validation, session refresh rotation/replay-family revocation, and cookie-based logout.
- Redis-compatible shared rate limiting with separate atomic API/auth counters and fail-closed `503` handling; production requires `RATE_LIMIT_REDIS_URL`, while local/test environments can use process-local limits.
- Explicit Content-Security-Policy, credentialed CORS restricted to configured exact origins, and browser API requests using cookies/CSRF headers without JavaScript-readable session-token storage.
- CSV and Excel downloads for loaded reports; printable report output can be saved as PDF through the browser print dialog. Spreadsheet exports use inline strings and CSV formula-prefix protection.
- Opt-in MongoDB replica-set integration harness validates test-only database names, requires explicit acknowledgement for remote hosts, and uses only the database named in `MONGO_TEST_URI` plus random collections. It never uses the application's `MONGO_URI`, reads `.env`, or drops a database.
- Root npm workspaces include the frontend and backend; root `npm test` invokes the backend suite.
- Vercel single-project configuration builds the frontend to `frontend/dist`, serves an SPA fallback rewrite, and mounts a serverless Express function. MongoDB connections are cached per warm runtime; production auto-index creation remains disabled.
- Plan seeding (`npm run db:seed-plans` or `SEED_DEFAULT_PLANS=true`) to create the default-trial plan that registration requires.
- Playwright browser tests cover mocked sign-in/navigation for all roles, school-admin workspace page mounts, authentication error feedback, and a narrow mobile login viewport.

## Verification record

- Frontend production build: passed with `npm run build`; Vite completed without chunk-size warnings (2230 modules).
- Backend automated tests: `npm test --workspace backend` passed **119 tests, failed 0, skipped 3** (122 total). The 3 skipped cases are the opt-in MongoDB (2) and Redis (1) integration tests, skipped because no `MONGO_TEST_URI` / `SCHOOLFLOW_REDIS_INTEGRATION` was supplied.
- Frontend automated tests: `npm test --workspace frontend` passed **12 tests, failed 0**.
- Authentication/security regression tests cover cookie-only auth, token omission from login/refresh JSON, cookie scope/HttpOnly flags, CSRF requirements, refresh rotation/replay-family revocation, expired-access logout, exact-origin CORS, CSP headers, and rate-limit fail-closed behavior.
- [Security review](./SECURITY-REVIEW.md) records the single medium finding from the focused review, its tested fix, and the remaining external verification limits.
- Browser end-to-end tests mock API responses; this is UI journey coverage, not end-to-end validation of live authentication or database workflows.
- Syntax/config checks: `node --check` passed for backend source/tests and the Vercel API function; `vercel.json` parses successfully.
- Dependency audit: `npm audit` reported 0 vulnerabilities.
- Vercel preparation: production CSP/security headers and cookie-compatible same-origin setup are configured. No Vercel build/deployment was run, so provider routing, environment injection, cold-start behavior, and serverless request handling remain unverified.

## External configuration and known limits

- MongoDB test credentials and a replica-set test database are not available in this workspace; actual persistence, index builds, two-school isolation, transaction behavior, and server-side cleanup remain unverified in this environment. Run the opt-in test only against a dedicated non-production cluster with database-scoped test credentials; see [MongoDB test setup](./backend/docs/ENVIRONMENT.md#testtooling-only-variables).
- Email, document storage, and the jobs runner require configuration; until then their endpoints return an explicit `503`. Email and storage adapters are implemented; the payment gateway adapter is not. See [external services](./docs/EXTERNAL-SERVICES.md).
- Overdue reminder dispatch is an idempotent job entry point; an operator must configure a provider and invoke it from an approved scheduler. No background scheduler runs in production by default.
- Vercel Cron cannot call the jobs endpoint directly (Cron uses `GET` + `Authorization: Bearer`; the endpoint is `POST` + `x-jobs-secret`). Use an external scheduler or a small adapter.
- Asset depreciation supports straight-line schedules only. It requires monthly sequential posting and stores amounts in integer minor currency units.
- PDF creation uses browser print-to-PDF, rather than a server-generated PDF. Excel/CSV downloads use currently loaded report records.
- Shared rate limiting requires a configured reachable Redis-compatible provider in production. Provider availability and cross-instance behavior are covered with mocked adapter tests, not with a live Redis service.
- Playwright tests mock API responses, and only Chromium desktop/mobile viewport behavior was tested; no cross-browser, accessibility conformance, or load test was run.
- Authentication uses HttpOnly cookies; no browser-readable access or refresh token is returned or stored. CSRF is enforced for cookie-authenticated mutations and auth session endpoints. This reduces token exfiltration risk but does not prevent XSS; the CSP has not been verified in a deployed browser configuration or subjected to penetration testing.
- Environment variables were audited against runtime/test source, Vercel config, examples, and documentation without accessing `backend/.env`. Backend examples use blank required values rather than fabricated URI/secret placeholders; the frontend example documents its optional API URL override.
- No live Vercel deployment, live provider integration, or production-data operation was performed. See the [production verdict](./docs/PRODUCTION-VERDICT.md) for the honest bottom line and [remaining tasks](./docs/REMAINING-TASKS.md) for the pre-launch steps.
