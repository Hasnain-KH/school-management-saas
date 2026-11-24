# SchoolFlow SaaS

SchoolFlow is a multi-tenant school management application with a React and Tailwind CSS frontend and a Node.js/Express/MongoDB API.

**Status: PARTIAL — code-complete for the agreed scope, but not Production Ready.** No live deployment, provider verification, backup/restore rehearsal, monitoring, or authorised smoke test has been performed. See the [final A–I production verdict](./docs/PRODUCTION-VERDICT.md).

## Run locally

Requirements: Node.js 20.19+, npm, and MongoDB Atlas (replica set) for transactional workflows.

1. Configure the backend environment in `backend/` from the [environment reference](./backend/docs/ENVIRONMENT.md). Never commit `.env`.
2. Start the API:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

3. In a separate terminal, install the frontend workspace dependencies and run Vite from the repository root:

   ```powershell
   npm install
   npm run dev
   ```

The frontend defaults to `http://localhost:5000/api/v1`; set `VITE_API_URL` at build time to use another API origin. The API CORS allowlist must include the frontend origin. Authentication uses HttpOnly cookies and CSRF tokens; do not store session tokens in browser storage.

## Verification commands

From the repository root:

```powershell
npm test --workspace backend
npm test --workspace frontend
npm run build --workspace frontend
npm run check:icons --workspace frontend
```

From `frontend/`, after `npx playwright install chromium`:

```powershell
npx playwright test --reporter=line --timeout=20000
```

Final observed results: backend 291 tests (288 pass, 0 fail, 3 skipped), frontend 83/83, Playwright 45/45, production build success, icon scan 54 files / 0 violations, `git diff --check` exit 0. Lint and type-check are not configured.

## Payments

**SchoolFlow has no payment gateway by design.** There is no checkout, webhook, receipt upload, payment submission, automated collection/verification, or automatic subscription activation. Super Admins manage platform receiving accounts; School Owners view active account details and pay externally. Super Admins verify payments outside SchoolFlow and manually record/activate using the existing workflow. See the [manual payments SOP](./docs/MANUAL-PAYMENTS.md).

## Vercel deployment

The Vercel configuration deploys the frontend and API together as a single project from the repository root (`outputDirectory: frontend/dist`, an SPA fallback rewrite, and `api/index.mjs` as the Express function). Configure backend environment variables — including a Redis-compatible shared rate-limit URL — in Vercel. See the [Vercel deployment guide](./docs/DEPLOYMENT-VERCEL.md). No live Vercel deployment has been verified from this repository, and plan/commercial eligibility is unverified.

## Workspaces and documentation

- `frontend/` — React application, role-specific dashboards, API client, report downloads, and responsive design system.
- `backend/` — tenant-scoped API and MongoDB models.
- [Backend setup and verification](./backend/README.md)
- [Vercel deployment guide](./docs/DEPLOYMENT-VERCEL.md)
- [External services setup](./docs/EXTERNAL-SERVICES.md) — email, document storage, scheduled jobs, Redis, Atlas
- [Manual payments](./docs/MANUAL-PAYMENTS.md) — receiving accounts and the external verification workflow
- [Environment-variable reference](./backend/docs/ENVIRONMENT.md)
- [API reference](./backend/docs/API.md)
- [Data model and authorization](./backend/docs/DATA-MODELS.md)
- [Project completion record](./PROJECT_COMPLETION.md)
- [Phase completion report](./docs/PHASE-COMPLETION.md)
- [Testing report](./docs/TESTING.md)
- [Remaining manual tasks](./docs/REMAINING-TASKS.md)
- [Production verdict and final A–I report](./docs/PRODUCTION-VERDICT.md)

Email delivery and document storage are optional and behind provider abstractions that return an explicit `503` until configured; see the [external services guide](./docs/EXTERNAL-SERVICES.md). MongoDB Atlas (replica set) and, in production, a Redis-compatible rate-limit store are required. Payment checkout is intentionally unavailable. See the completion record for test evidence and remaining external-service limitations.
