# Testing report

This report records the **actual** commands and counts observed in the final audit working tree on 2026-11-24 (Windows, Node 24). No deployment, provider call, staging operation, commit, push, or production-data operation was performed. Counts are for the uncommitted working tree at HEAD `ff710da`.

## Final commands and results

| Check | Command | Result |
|---|---|---|
| Backend suite | `npm test --workspace backend` | **291 tests, 288 pass, 0 fail, 3 skipped**, exit 0 |
| Frontend unit tests | `npm test --workspace frontend` | **83 tests, 83 pass, 0 fail**, exit 0 |
| Browser E2E | `npx playwright test --reporter=line --timeout=20000` from `frontend/` | **45 passed**, exit 0 |
| Production build | `npm run build --workspace frontend` | ✅ success, 2255 modules transformed, built in 1m 2s |
| Icon check | `npm run check:icons --workspace frontend` | ✅ passed; 54 source files scanned, 3 documented manual-review image candidates, 0 application icon violations |
| Whitespace check | `git diff --check` | ✅ exit 0; only LF→CRLF working-copy warnings, no whitespace errors |
| Lint | — | **Not configured** (no lint script/config) |
| Type check | — | **Not configured** (no TypeScript/type-check script in this JavaScript project) |

A full-suite run initially exposed two student-media consent-invalidation tests that lacked the existing `AuditLog.prototype.save` mock. The test mocks were corrected; the final full backend suite is green. No production code was weakened to hide the failure.

## Baseline comparison

| Suite | Earlier baseline | Final | Delta |
|---|---|---:|---:|
| Backend | 282 total / 279 pass / 3 skipped | 291 / 288 / 3 | +9 tests, +9 pass |
| Frontend | 80 pass | 83 pass | +3 tests |
| Browser E2E | 43 passed | 45 passed | +2 tests |
| Icon scan | 53 files / 0 violations | 54 files / 0 violations | +1 file |

The backend delta is the new receiving-account test file. The frontend delta is the receiving-account helper tests. The E2E delta is the Super Admin / School Owner receiving-account browser flows.

## Backend coverage

The backend suite now includes 11 test files:

| File | Focus |
|---|---|
| `api.test.js` | Auth, RBAC, tenant isolation, fees, attendance, exams, academic setup, finance workflows, pagination |
| `extended-workflows.test.js` | Parent portal, guardian account linking, fixed assets, audit |
| `platform.test.js` | Plan management, school status/subscription, platform audit, session revocation |
| `reports.test.js` | Report queries and dashboard aggregation |
| `security.test.js` | CSRF, cookie flags, header hardening, rate limiting |
| `production-cookie.test.js` | Production cookie attributes and CSRF enforcement |
| `phase2-services.test.js` | Notification fan-out/dedupe, document listing/ownership, job idempotency, email-provider failure paths |
| `phase5-payments.test.js` | Billing periods, fail-closed checkout placeholder, tenant-scoped billing history, revenue aggregation, manual payment recording |
| `student-media.service.test.js` | Private media, consent withdrawal, fail-closed URL issuance, tenant-scoped filters/queries, direct-upload authorisation and quota cleanup |
| `receiving-account.test.js` | Platform-only CRUD authorization, strict validation/credential rejection, explicit delete confirmation, platform audit log, active-only safe school-owner projection |
| `mongo.integration.test.js` / `redis.integration.test.js` | Opt-in live-infrastructure checks (skipped here) |

### The 3 skipped tests

- `mongo.integration.test.js` — **2 tests**. Require `MONGO_TEST_URI` pointing at an isolated MongoDB replica set. The guard rejects database names that do not start with `schoolflow_test`, so it cannot run against a real database by accident.
- `redis.integration.test.js` — **1 test**. Requires `SCHOOLFLOW_REDIS_INTEGRATION=true` and a dedicated test Redis URL.

They skip by design. See [`backend/docs/ENVIRONMENT.md`](../backend/docs/ENVIRONMENT.md#testtooling-only-variables) before enabling them.

## Frontend coverage

`npm test --workspace frontend` covers 83 assertions across payload construction, currency handling, export escaping, feedback state, unsaved-change guards, student-media upload/direct-authorize contracts, branding/logo validation, and the new receiving-account presentation helpers. The helper tests explicitly assert that manual-payment copy never mentions a gateway, checkout, or automatic activation.

## Browser coverage

Seven Playwright specs, all mocked against a local Vite dev server (no live API or provider):

- `academics-timetable.spec.js`
- `attendance.spec.js`
- `auth-and-roles.spec.js`
- `notifications.spec.js`
- `password-reset-flow.spec.js`
- `receiving-accounts.spec.js`
- `school-logo.spec.js`

The receiving-account spec verifies Super Admin create/edit/deactivate/delete with `?confirm=true` on delete, and verifies that a School Owner sees only active accounts, can copy a reference, and issues no mutating requests.

## What the tests demonstrate

- Multi-tenant isolation: school-scoped queries include the authenticated school id; cross-tenant access is denied.
- Authorization: role/permission gates for platform, school admin, teacher, and parent routes, including platform-only receiving-account mutations.
- Provider failure paths: email, storage, jobs, and the payment placeholder fail closed with explicit `503`/`403` where appropriate.
- Student media: consent withdrawal blocks signed URLs, unpublishes affected media, writes an audit event, and uses tenant-scoped filters for updates, lookups, and reservations.
- Manual payments: receiving-account CRUD/visibility rules, manual payment recording, subscription activation as an explicit operator action, and revenue aggregation from recorded payments only.
- Frontend behaviour: payload/validation logic, export escaping, accessibility-related dialog/menu fixes, and the manual receiving-account UI.

## What the tests do **not** demonstrate

- **No live deployment test.** No Vercel deployment, Atlas cluster, real cookie/CSP behaviour across a real origin, or browser run against a deployed API.
- **No live provider delivery.** Email/storage tests use mocks; MongoDB and Redis integration tests were skipped.
- **No real payment.** There is no gateway adapter by decision; checkout returns `503`. Manual payments are recorded only after external verification by a Super Admin.
- **No load/performance test**, no cross-browser matrix, no formal accessibility conformance audit, and no penetration test.
- **No live backup/PITR/restore rehearsal**, monitoring, alerting, or scheduler verification.

Passing tests are necessary but not sufficient for a production claim. See [`PRODUCTION-VERDICT.md`](./PRODUCTION-VERDICT.md) for the honest A–I readiness status.
