# Project completion record

Last updated: 2026-11-24

This record summarizes what SchoolFlow includes and how it was verified in the final audit working tree. It is a **code-completion and local-verification record**, not a production deployment claim.

- [Phase completion report](./docs/PHASE-COMPLETION.md)
- [Testing report](./docs/TESTING.md)
- [Remaining manual tasks](./docs/REMAINING-TASKS.md)
- [Production verdict and final A–I report](./docs/PRODUCTION-VERDICT.md)
- [Manual payments SOP](./docs/MANUAL-PAYMENTS.md)

## Implemented

- Backend school onboarding, tenant authentication, role permissions, academic records, student admissions/placements and leaving certificates, attendance, finance, exams/results, calendar, inventory, library, announcements, reports, plans, and subscription lifecycle workflows.
- React + Tailwind CSS frontend with login, registration/onboarding, password recovery/reset, role-specific navigation and overview screens, responsive school workspaces, loading/error/empty states, and API error feedback.
- API-backed student/staff records, attendance capture, finance collection, exams/results, inventory, library, calendar, announcements, reports, school profile/subscription details, and platform school controls.
- Platform admin interfaces for creating/configuring plans, activating/deactivating plans, assigning school plans, suspending/reactivating schools, recording payments, and viewing revenue.
- **Manual receiving accounts**: platform-scoped records managed exclusively by `platform_super_admin` (create/edit/activate/deactivate/delete with `?confirm=true`), with school-owner read-only access to active accounts and copyable references. All mutations write platform audit logs (`schoolId: null`). Credential markers are rejected; wallet accounts require a mobile wallet number.
- **Manual subscription payments only**: school owners pay outside SchoolFlow, Super Admins verify externally, and the existing `POST /api/v1/platform/schools/:schoolId/payments` workflow is the only path that records payment and can activate/renew a subscription. No gateway, checkout, webhook, receipt upload, automated collection/verification, automatic activation, or duplicate subscription system was added.
- Parent-only linked-student, attendance, fee, and published-result APIs. Parent visibility is resolved through a **Guardian account link** (`Guardian.userId`), created via `PUT /api/v1/students/guardians/:guardianId/account`, not by email string matching. Parent results show exam/class/subject display names, not raw database identifiers.
- Fixed-asset register with immutable assignment/release history, monthly straight-line depreciation entries, and disposal; school and assignee references are tenant-scoped.
- School and platform audit-log read APIs.
- Per-user notifications (`/api/v1/notifications`) created on announcements and published results, with an unread-count badge and idempotent fan-out.
- Private student media with consent checks at access time, short-lived signed URLs, direct-to-storage upload authorisation, tenant-scoped updates/reservations/lookups, fail-closed base64 uploads, and audit/access logs. Consent withdrawal unpublishes affected media and blocks new URLs. There is no public URL or silent base64 fallback after a direct upload failure.
- Document storage behind an S3-compatible/Cloudinary provider abstraction with presigned downloads and parent-scoped visibility.
- Email delivery behind a Resend-compatible HTTP adapter for password reset, verification, welcome, notifications, and reminders.
- Idempotent scheduled jobs (`POST /api/v1/jobs/run`, `x-jobs-secret` guarded) for `fee_reminders` and `subscription_expiry`, plus an optional local-only dev scheduler. A real production scheduler is an external operator task.
- HttpOnly, host-only access/refresh cookies with cookie-path scoping, Secure production flags, CSRF token signing and Origin validation, session refresh rotation/replay-family revocation, and cookie-based logout.
- Redis-compatible shared rate limiting with separate atomic API/auth counters and fail-closed `503` handling; production requires `RATE_LIMIT_REDIS_URL`, while local/test environments can use process-local limits.
- Explicit Content-Security-Policy, credentialed CORS restricted to configured exact origins, and browser API requests using cookies/CSRF headers without JavaScript-readable session-token storage.
- CSV and Excel downloads for loaded reports; printable report output can be saved as PDF through the browser print dialog. Spreadsheet exports use inline strings and CSV formula-prefix protection. Dashboard and revenue statistics are aggregated from real records, not fabricated.
- Opt-in MongoDB replica-set and Redis integration harnesses with isolated test-only naming/acknowledgement guards. They never use the application's `MONGO_URI`, read `.env`, or drop a database.
- Root npm workspaces include the frontend and backend; root `npm test` invokes the backend suite.
- Vercel single-project configuration builds the frontend to `frontend/dist`, serves an SPA fallback rewrite, and mounts a serverless Express function with cached MongoDB connections. Production auto-index creation remains disabled.
- Plan seeding (`npm run db:seed-plans` or `SEED_DEFAULT_PLANS=true`) creates the default-trial plan that registration requires.
- Playwright browser tests cover mocked sign-in/navigation for all roles, workspace mounts, notifications/dialogs, attendance, timetable payloads, password reset, school logo, and manual receiving-account workflows.

## Verification record

| Check | Result |
|---|---|
| Backend automated tests | `npm test --workspace backend` → **291 tests, 288 pass, 0 fail, 3 skipped**, exit 0 |
| Frontend unit tests | `npm test --workspace frontend` → **83 tests, 83 pass, 0 fail**, exit 0 |
| Playwright E2E | `npx playwright test --reporter=line --timeout=20000` from `frontend/` → **45 passed**, exit 0 |
| Production build | `npm run build --workspace frontend` → success, 2255 modules |
| Icon check | `npm run check:icons --workspace frontend` → 54 files scanned, 3 documented manual-review image candidates, 0 violations |
| Whitespace | `git diff --check` → exit 0; LF→CRLF warnings only, no errors |
| Lint | Not configured |
| Type check | Not configured |

Baseline comparison: backend was 282 total / 279 pass / 3 skipped and is now 291 / 288 / 3 (+9 receiving-account tests); frontend was 80 pass and is now 83 (+3 helper tests); E2E was 43 passed and is now 45 (+2 browser flows). A full-suite run exposed two student-media tests missing the existing audit-save mock; those test mocks were corrected and the final full backend suite is green.

Security/regression tests cover cookie-only auth, token omission from login/refresh JSON, cookie scope/HttpOnly flags, CSRF requirements, refresh rotation/replay-family revocation, expired-access logout, exact-origin CORS, CSP headers, rate-limit fail-closed behaviour, tenant-scoped media filters, and receiving-account authorization.

## Final status

**PARTIAL — not Production Ready.** See the [A–I final readiness report](./docs/PRODUCTION-VERDICT.md). No audited code category is FAIL, but deployment/operations are BLOCKED and several categories are PARTIAL. There is no live deployment, no live provider verification, no backup/restore rehearsal, no monitoring/alerting, no incident runbook, and no automated production scheduler.

## External configuration and known limits

- MongoDB test credentials and a replica-set test database are not available here; actual persistence, index builds, two-school isolation, transaction behaviour, and server-side cleanup remain unverified. Run the opt-in test only against a dedicated non-production cluster with database-scoped test credentials; see [MongoDB test setup](./backend/docs/ENVIRONMENT.md#testtooling-only-variables).
- Email and document storage require configuration; until then their endpoints return explicit `503`. Storage direct-upload origins must be added exactly to CSP/CORS for browser uploads. Large base64 student media may exceed Vercel function body limits; the direct-to-storage flow is preferred.
- **Payment checkout is intentionally absent.** The gateway provider is a fail-closed interface, not an integration. Only the manual receiving-account workflow in [`docs/MANUAL-PAYMENTS.md`](./docs/MANUAL-PAYMENTS.md) is permitted.
- Overdue reminder dispatch is an idempotent job entry point; an operator must configure `JOBS_RUNNER_SECRET` and invoke it from an approved scheduler. No background scheduler runs in production by default.
- Vercel Cron cannot call the jobs endpoint directly (Cron uses `GET` + `Authorization: Bearer`; the endpoint is `POST` + `x-jobs-secret`). Use an external scheduler or a small adapter. Vercel plan/commercial eligibility is unverified.
- Asset depreciation supports straight-line schedules only. It requires monthly sequential posting and stores amounts in integer minor currency units.
- PDF creation uses browser print-to-PDF, not a server-generated PDF. Excel/CSV downloads use currently loaded report records.
- Shared rate limiting requires a configured reachable Redis-compatible provider in production. Provider availability and cross-instance behaviour are covered with mocked adapter tests, not with a live Redis service.
- Playwright tests mock API responses and only use Chromium desktop/mobile viewports; no cross-browser, accessibility conformance, or load test was run.
- Authentication uses HttpOnly cookies; no browser-readable access or refresh token is returned or stored. CSRF is enforced for cookie-authenticated mutations and auth session endpoints. This reduces token exfiltration risk but does not prevent XSS; the CSP has not been verified in a deployed browser configuration or subjected to penetration testing.
- Environment variables were audited against runtime/test source, Vercel config, examples, and documentation without accessing `backend/.env`. Backend examples use blank required values rather than fabricated URI/secret placeholders.
- No live Vercel deployment, live provider integration, or production-data operation was performed. All work after HEAD `ff710da` is uncommitted by instruction; no staging, commit, push, or deploy occurred.
