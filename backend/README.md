# SchoolFlow SaaS API

SchoolFlow is a JavaScript ES module backend. Implemented workflows include school onboarding and tenant-bound authentication, academic and student records, attendance, fee structures and manual collections, exams and report cards, calendar/inventory/library operations, in-app announcements, database-derived reports, fixed assets and straight-line depreciation, parent self-service, audit-log queries, platform-managed subscription plans, plan limits/features, and school subscription lifecycle management. Password recovery, email verification, and overdue reminder delivery require a real email provider. Online payment processing and document uploads require configured adapters and are not enabled.

## Requirements and setup

- Node.js 20.19 or later
- A MongoDB Atlas deployment (transactions require a replica set, as provided by Atlas)

Install the frontend workspace from the repository root and the backend from `backend/`:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Set `MONGO_URI` and two distinct secret values of at least 32 characters for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in the ignored local `.env` file; the example file intentionally contains no credential values. Never commit `.env`. Configure `CORS_ORIGINS` as a comma-separated list of exact frontend origins in production. Set `NODE_ENV=production` explicitly and configure the trusted proxy hop count when deploying; startup rejects missing or unrecognized environment modes. `npm run dev` defaults to development mode only for local use. See the [complete environment-variable reference](./docs/ENVIRONMENT.md) for all backend, frontend, Vercel, and test-only variables and defaults.

## Run and test

```powershell
cd backend
npm run dev
npm start
npm test
```

From the repository root, `npm run dev` starts the frontend and `npm run build` creates its production bundle. The frontend defaults to `http://localhost:5000/api/v1`; configure `VITE_API_URL` to change it.

## Vercel deployment (not yet production-verified)

Deploy one Vercel project with the repository root as its Root Directory. Root `vercel.json` builds the Vite frontend to `frontend/dist`, serves client-side routes, and configures `api/[...path].mjs` as the Express API function. The frontend defaults to the same-origin `/api/v1` in production; leave `VITE_API_URL` unset for this single-deployment configuration. If the API is later split onto another origin, set frontend `VITE_API_URL` to that origin plus `/api/v1` and configure the backend `CORS_ORIGINS` with the exact frontend origins.

Required backend Vercel environment variables: `NODE_ENV=production`, `MONGO_URI`, distinct 32+ character `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, `RATE_LIMIT_REDIS_URL` (Redis protocol `redis://` or `rediss://`), and `CORS_ORIGINS` containing the exact frontend deployment origin(s). Configure `TRUST_PROXY_HOPS` for Vercel's trusted proxy path (the current deployment recommendation is `1`). `ACCESS_TOKEN_TTL` and `REFRESH_TOKEN_TTL` are optional overrides. No frontend variable is required for the same-origin deployment; `VITE_API_URL` is only needed if the API is split to a same-site origin, in which case add the API origin to `connect-src` in `vercel.json` as well. Set secrets in Vercel's encrypted environment settings; do not commit them. Vercel's function runtime retains the Mongoose connection promise on warm instances, uses production `autoIndex=false`, and requires replica-set MongoDB for transactions. Confirm the Atlas cluster's network-access rules allow the deployed function's egress through an approved secure configuration; do not broadly expose a production cluster to the public internet. Apply the documented additive index script through an approved migration process before launch. The integration harness remains opt-in and only targets a database explicitly named with the `schoolflow_test` prefix.

Vercel function instances are ephemeral and independently scaled. API and authentication rate limits use a shared Redis-compatible store with separate namespaces and atomic counters. Production configuration requires `RATE_LIMIT_REDIS_URL`; missing or unavailable shared storage fails closed with `503`, without falling back to instance memory. Local development and tests may use the process-local store. The reminder-dispatch endpoint is not a scheduler: use a configured external scheduler to invoke it, and configure a real delivery provider first. Vercel logs capture sanitized function errors; add an approved external monitoring/alerting integration before production. Serverless cold starts, function duration limits, MongoDB network access, CORS, and the complete deployment configuration have not been verified against a deployed Vercel project.

Authentication tokens are delivered only in host-only HttpOnly cookies, never JSON or browser storage. Cookie-authenticated unsafe requests require a signed CSRF token and an exact allowlisted `Origin`; production cookies are Secure and SameSite=Lax. The default Vercel deployment is same-origin. A separate frontend/API deployment must remain same-site for these cookie settings; cross-site cookie deployment is not supported by the current configuration.

The suite includes request-level and mocked model/service tests. `test/mongo.integration.test.js` is an opt-in real MongoDB test; it skips unless `MONGO_TEST_URI` names a dedicated test database whose path starts with `schoolflow_test`. It refuses `NODE_ENV=production`; non-loopback hosts also require `MONGO_TEST_ALLOW_REMOTE=true` as an explicit acknowledgement. Use only a dedicated non-production replica-set cluster and test-only credentials scoped to that database. The test uses only the database named in `MONGO_TEST_URI` and creates randomized collections to verify persisted create/read/update/delete, two-school isolation, school-scoped uniqueness/index creation, committed and aborted multi-collection transactions, and cleanup. It drops only those exact collections it created; it does not drop the database, read `.env`, or use `MONGO_URI`. Run with `MONGO_TEST_URI` set privately in the test shell using `npm test --workspace backend`; never put the URI in source control, command history, logs, or shared output. No actual Atlas integration run is claimed unless this test completes against an explicitly supplied test-only URI.

`test/redis.integration.test.js` is an opt-in smoke test of the actual API and authentication rate-limit middleware through independently created SchoolFlow app instances. It skips during ordinary `npm test` unless `SCHOOLFLOW_REDIS_INTEGRATION=true` is explicitly set. Supply `RATE_LIMIT_REDIS_TEST_URL` from a private shell or secret manager; this must be a dedicated non-production staging/test Redis database and must not share the production Redis endpoint. The test refuses the same host and port as `RATE_LIMIT_REDIS_URL` and requires TLS for remote Redis endpoints. Run only with `npm run test:redis:integration`. It checks shared counters at the existing API (300) and authentication (10) limits, verifies a 503 against an unavailable local Redis endpoint, and deletes only keys beneath a unique per-run namespace. The test does not load `.env` and ordinary backend tests do not require a live Redis connection. Do not put credentials in command history, source control, logs, or shared output.

The frontend includes Playwright browser journeys for mocked sign-in/navigation across all five roles, registration error feedback, login rejection, and generic recovery feedback. These validate the frontend's API contract and interaction states only; their intercepted API responses do not verify server authentication, database persistence, or role authorization. Install Chromium with `npx playwright install chromium` from the frontend workspace before running `npm run test:e2e`.

Mocked provider tests do not demonstrate external email delivery, payment processing, or file storage.

Production startup disables automatic index creation; deploy declared indexes through a reviewed database migration before enabling tenant traffic.

Before deploying a release that adds or changes indexes, back up the database, review existing duplicate data against new unique constraints, then run `npm run db:indexes` with the target `MONGO_URI` supplied through the deployment environment. This additive command calls Mongoose `createIndexes()` for declared models; it never drops collections or indexes. Stop and resolve any index build errors before deploying application traffic. Coordinate large index builds with the database operator.

## API and data model

See [API reference](./docs/API.md) and [data model and authorization](./docs/DATA-MODELS.md). JSON responses use `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "errors": [...] }` where validation details apply.

Platform super-admin accounts cannot be created through the public API. Provision them through a trusted, access-controlled operational process; they sign in without a `schoolSlug`. Public endpoints never grant a platform role.

Before accepting public school registration, a platform super admin must create and activate a subscription plan marked `isDefaultTrial: true`. Plan limits and included feature flags are stored in MongoDB and managed through `/api/v1/platform`; the application does not define tier limits. Capacity checks serialize school-scoped admissions/user/branch additions in MongoDB transactions. Existing schools must be assigned a plan before feature-gated routes are available.

No email provider is configured. Recovery and verification delivery requests therefore return an explicit `503`; no tokens are returned to clients or persisted when delivery is unavailable. To enable these workflows, integrate and configure a real provider through the provider interface in `src/services/email-delivery.provider.js`. No credentials are required or stored by the current implementation.

Fixed assets are available under `/api/v1/operations/assets` and use the `inventory` plan feature. Assignment and release are append-only events; straight-line depreciation entries are monthly, sequential, and immutable. Overdue fee reminders can be invoked through `/api/v1/finance/reminders/overdue/dispatch`; the endpoint returns `503` unless a real email provider implements reminder delivery. Invoke it with an approved external scheduler after configuring a provider; there is no built-in scheduler.

Provider interfaces are available in `src/services/payment-gateway.provider.js` and `src/services/document-storage.provider.js`. They deliberately return `503` until configured. No online checkout, payment webhook, or file-upload endpoint is enabled without an adapter that can enforce provider-specific signature, ownership, and retention requirements. Report downloads are generated in the browser from live API responses: CSV/Excel files are downloadable, while PDF output is provided by the browser's print-to-PDF flow.
