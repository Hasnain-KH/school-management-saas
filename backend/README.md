# SchoolFlow SaaS API

SchoolFlow is a JavaScript ES module backend. The current implementation provides school onboarding, tenant-bound authentication/session revocation, school and branch profile management, academic sessions/classes/sections/subjects, teacher assignments, timetable operations, school user accounts, student admissions/placement history, guardian records, leaving-certificate records, student and staff attendance, role/permission middleware, subscription/trial access checks, audit events, and health checks. Finance, examinations, calendar, inventory, library, parent portal/document storage, notifications, billing, password recovery/email verification, and business reporting workflows are not yet implemented.

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

The current test suite contains request-level and mocked service/model tests; it does not exercise real database persistence. School registration, academic writes, student admission/placement, and profile/audit transactions require MongoDB replica-set integration tests before production deployment.

Rate limiting currently uses Express's in-memory store. It is suitable for a single process; use a shared store before running multiple API instances so limits are consistent across replicas. Production startup disables automatic index creation; deploy declared indexes through a reviewed database migration before enabling tenant traffic.

Before deploying a release that adds or changes indexes, back up the database, review existing duplicate data against new unique constraints, then run `npm run db:indexes` with the target `MONGO_URI` supplied through the deployment environment. This additive command calls Mongoose `createIndexes()` for declared models; it never drops collections or indexes. Stop and resolve any index build errors before deploying application traffic. Coordinate large index builds with the database operator.

## API and data model

See [API reference](./docs/API.md) and [data model and authorization](./docs/DATA-MODELS.md). JSON responses use `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "errors": [...] }` where validation details apply.

Platform super-admin accounts cannot be created through the public API. Provision them through a trusted, access-controlled operational process; they sign in without a `schoolSlug`. Public endpoints never grant a platform role.
