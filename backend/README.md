# SchoolFlow SaaS API

SchoolFlow is a JavaScript ES module backend. Implemented workflows include school onboarding and tenant-bound authentication, academic and student records, attendance, fee structures and manual collections, exams and report cards, calendar/inventory/library operations, in-app announcements, database-derived operational reports, platform-managed subscription plans, configurable plan features and limits, and school subscription lifecycle management. Password recovery and email verification use expiring, hashed, single-use action tokens behind an email-provider interface; actual email delivery remains unavailable until a real provider is selected and configured. Online payment processing, external email/SMS delivery, document storage, fixed-asset assignment/depreciation, and advanced export/report builders are not implemented.

## Requirements and setup

- Node.js 20.19 or later
- A MongoDB Atlas deployment (transactions require a replica set, as provided by Atlas)

From `backend/`:

```powershell
npm install
Copy-Item .env.example .env
```

Set `MONGO_URI` and generate two independent random secrets of at least 32 characters for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Never commit `.env`. Configure `CORS_ORIGINS` as a comma-separated list of exact frontend origins. In production, set `NODE_ENV=production` and configure origins explicitly. If deployed behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to its exact hop count.

## Run and test

```powershell
npm run dev
npm start
npm test
```

The current test suite contains 70 request-level and mocked service/model tests; it does not exercise real database persistence. School registration, academic writes, student admission/placement, attendance, finance collections, exam workflows, inventory movements, library loans, platform subscription changes, recovery tokens, and profile/audit transactions require MongoDB replica-set integration tests before production deployment. Email-provider tests use a mocked provider and do not demonstrate delivery.

Rate limiting currently uses Express's in-memory store. It is suitable for a single process; use a shared store before running multiple API instances so limits are consistent across replicas. Production startup disables automatic index creation; deploy declared indexes through a reviewed database migration before enabling tenant traffic.

Before deploying a release that adds or changes indexes, back up the database, review existing duplicate data against new unique constraints, then run `npm run db:indexes` with the target `MONGO_URI` supplied through the deployment environment. This additive command calls Mongoose `createIndexes()` for declared models; it never drops collections or indexes. Stop and resolve any index build errors before deploying application traffic. Coordinate large index builds with the database operator.

## API and data model

See [API reference](./docs/API.md) and [data model and authorization](./docs/DATA-MODELS.md). JSON responses use `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "errors": [...] }` where validation details apply.

Platform super-admin accounts cannot be created through the public API. Provision them through a trusted, access-controlled operational process; they sign in without a `schoolSlug`. Public endpoints never grant a platform role.

Before accepting public school registration, a platform super admin must create and activate a subscription plan marked `isDefaultTrial: true`. Plan limits and included feature flags are stored in MongoDB and managed through `/api/v1/platform`; the application does not define tier limits. Capacity checks serialize school-scoped admissions/user/branch additions in MongoDB transactions. Existing schools must be assigned a plan before feature-gated routes are available.

No email provider is configured. Recovery and verification delivery requests therefore return an explicit `503`; no tokens are returned to clients or persisted when delivery is unavailable. To enable these workflows, integrate and configure a real provider through the provider interface in `src/services/email-delivery.provider.js`. No credentials are required or stored by the current implementation.
