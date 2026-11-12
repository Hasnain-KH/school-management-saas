# SchoolFlow SaaS

SchoolFlow is a multi-tenant school management application with a React and Tailwind CSS frontend and a Node.js/Express/MongoDB API.

## Run locally

Requirements: Node.js 20.19+, npm, and MongoDB Atlas (replica set) for transactional workflows.

1. Configure the backend environment in `backend/` from the backend setup guide. Never commit `.env`.
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

From the repository root, run `npm test` for the backend suite, `npm run build` for the frontend production build, and `npm audit` to audit workspace dependencies. Run browser tests from `frontend/` with `npm run test:e2e` after installing the Playwright Chromium browser (`npx playwright install chromium`).

## Vercel deployment

The Vercel configuration deploys the frontend and API together as a single project from the repository root (`outputDirectory: frontend/dist`, an SPA fallback rewrite, and `api/[...path].mjs` as the Express function). Configure backend environment variables — including a Redis-compatible shared rate-limit URL — in Vercel. See the [Vercel deployment guide](./docs/DEPLOYMENT-VERCEL.md). No live Vercel deployment has been verified from this repository.

## Workspaces and documentation

- `frontend/` — React application, role-specific dashboards, API client, report downloads, and responsive design system.
- `backend/` — tenant-scoped API and MongoDB models.
- [Backend setup and verification](./backend/README.md)
- [Vercel deployment guide](./docs/DEPLOYMENT-VERCEL.md)
- [External services setup](./docs/EXTERNAL-SERVICES.md) — email, document storage, scheduled jobs, Redis, Atlas, payments
- [Environment-variable reference](./backend/docs/ENVIRONMENT.md)
- [API reference](./backend/docs/API.md)
- [Data model and authorization](./backend/docs/DATA-MODELS.md)
- [Project completion record](./PROJECT_COMPLETION.md)
- [Phase completion report](./docs/PHASE-COMPLETION.md)
- [Testing report](./docs/TESTING.md)
- [Remaining manual tasks](./docs/REMAINING-TASKS.md)
- [Production verdict](./docs/PRODUCTION-VERDICT.md)

Email delivery, document storage, and scheduled reminders are optional and behind provider abstractions that return an explicit `503` until configured; see the [external services guide](./docs/EXTERNAL-SERVICES.md). MongoDB Atlas (replica set) and, in production, a Redis-compatible rate-limit store are required. See the completion record for test evidence and remaining external-service limitations.
