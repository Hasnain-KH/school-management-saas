# Testing report

This report records the test commands, the **real** counts observed from a clean run in this repository, what is covered, and what is not. Counts are from the working tree of this session (Node 24, Windows).

## Commands and results

| Suite | Command | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|---|
| Backend | `npm test --workspace backend` | 122 | 119 | 0 | 3 |
| Frontend | `npm test --workspace frontend` | 12 | 12 | 0 | 0 |
| Build | `npm run build --workspace frontend` | — | ✅ success | — | — |

The backend suite is `node --test`; the frontend suite runs its `test/*.test.js` files the same way. The frontend build produced 2230 modules with no errors.

## Backend coverage

Ten test files under `backend/test/`:

| File | Focus |
|---|---|
| `api.test.js` | Auth, RBAC, tenant isolation, fees, attendance, exams, academic setup, finance workflows, pagination |
| `extended-workflows.test.js` | Parent portal, guardian account linking, fixed assets, audit |
| `platform.test.js` | Plan management, school status/subscription, platform audit, session revocation |
| `reports.test.js` | Report queries and dashboard aggregation |
| `security.test.js` | CSRF, cookie flags, header hardening, rate limiting |
| `production-cookie.test.js` | Production cookie attributes and CSRF enforcement |
| `phase2-services.test.js` | Notification fan-out/dedupe, document listing/ownership, job idempotency, email-provider failure paths |
| `phase5-payments.test.js` | Billing period math, checkout `503` when unconfigured, tenant-scoped billing history, revenue aggregation, manual payment recording, idempotent webhook, unknown-reference rejection |
| `mongo.integration.test.js` | Real-MongoDB tenant isolation and transactional behavior (skipped without `MONGO_TEST_URI`) |
| `redis.integration.test.js` | Shared rate-limit store behavior (skipped without `SCHOOLFLOW_REDIS_INTEGRATION=true`) |

### The 3 skipped tests

These skip themselves when the required infrastructure is absent, by design:

- `mongo.integration.test.js` — **2 tests**. Require `MONGO_TEST_URI` pointing at an **isolated** MongoDB replica set. The guard rejects any database whose name does not start with `schoolflow_test`, so it cannot run against a real database by accident.
- `redis.integration.test.js` — **1 test**. Requires `SCHOOLFLOW_REDIS_INTEGRATION=true` and a reachable Redis URL.

To run them:

```powershell
# from backend/
$env:MONGO_TEST_URI="mongodb://localhost:27017/schoolflow_test?replicaSet=rs0"
$env:SCHOOLFLOW_REDIS_INTEGRATION="true"
$env:RATE_LIMIT_REDIS_URL="redis://localhost:6379"
npm test
```

## Frontend coverage

Five test files under `frontend/test/` (12 tests total):

| File | Focus |
|---|---|
| `academic-setup.test.js` | Academic setup payload construction |
| `attendance-roster.test.js` | Attendance roster logic |
| `exam-payload.test.js` | Exam payload building |
| `export.test.js` | CSV/Excel export and print-to-PDF escaping |
| `finance-workflows.test.js` | Fee assignment/voucher payload validation |

## What the tests demonstrate

- Multi-tenant isolation: school-scoped queries include the authenticated school id; cross-tenant access is denied.
- Authorization: role/permission gates for platform, school admin, teacher, and parent routes.
- Provider failure paths: email, storage, jobs, and payments fail closed with explicit `503`/`403` when unconfigured or unauthorized.
- Payment orchestration: manual recording, subscription extension, revenue aggregation, and idempotent webhook handling.
- Frontend payload/validation logic and export escaping.

## What the tests do **not** demonstrate

- **No live end-to-end test against a deployed environment.** No Vercel deployment, no Atlas cluster, no real browser run against the deployed API.
- **No live provider delivery.** Email/storage tests use mocked transports; they do not prove a real provider delivered mail or stored an object.
- **No real gateway payment.** The gateway adapter does not exist, so checkout/webhook behavior is tested only against a mock adapter.
- **No load/performance testing.** Rate-limit behavior is tested functionally, not under real concurrency from multiple serverless instances.
- **No cross-browser or accessibility audit.**
- **The integration tests were skipped in this run** (no live Mongo/Redis available), so transactional isolation was verified structurally and by unit mocks, not against a live replica set in this environment.

Passing tests are necessary but not sufficient for a production claim. See [`PRODUCTION-VERDICT.md`](./PRODUCTION-VERDICT.md).
