# Vercel deployment guide

This guide describes how to deploy SchoolFlow to Vercel as a **single project** (React frontend + Express API in one deployment). It is written to be followed step by step and does not assume any deployment has already been verified.

> Status: the repository is configured for this deployment shape, but no live Vercel deployment has been verified. Treat the steps below as the intended procedure and validate each one against your own project.

## 1. What gets deployed

| Piece | Location | How it runs |
|---|---|---|
| Frontend (React + Vite) | `frontend/` | Built by `npm run build` (root script) to `frontend/dist`, served as static files. |
| API (Express) | `backend/src/` | Exposed through the serverless function `api/index.mjs`, which imports `backend/src/serverless-handler.js`. |
| SPA routing | `vercel.json` | `rewrites` sends unmatched paths to `/index.html` so client-side routes (e.g. `/students`) load. Static assets and the `/api` function take precedence over the rewrite. |
| Security headers | `vercel.json` | A Content-Security-Policy and related headers are applied to all responses. |

`vercel.json` sets `buildCommand` to `npm run build` and `outputDirectory` to `frontend/dist`. The API function includes `backend/src/**` so its source is bundled.

## 2. Prerequisites

- A Vercel account and the repository connected (Git integration or `vercel` CLI).
- **MongoDB Atlas** cluster. Transactions require a replica set; Atlas clusters are replica sets by default. Use a dedicated database per environment.
- A **Redis-compatible** service (for example Upstash) for shared rate limiting. Production configuration fails closed without it.
- Two independent, long (32+ character) JWT secrets.

## 3. Create the project

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to the repository root (not `frontend/` or `backend/`). The root `vercel.json`, the `api/` folder, and the npm workspaces all live here.
3. Leave **Framework Preset** as detected / **Other**. The explicit `buildCommand` and `outputDirectory` in `vercel.json` are used.
4. Do not add a separate `frontend/vercel.json` or a second project; the frontend and API ship together.

## 4. Configure environment variables

Set these in **Project → Settings → Environment Variables** (encrypted). Never commit real values.

Required:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Atlas connection string for the production database (replica set). |
| `JWT_ACCESS_SECRET` | Random string, at least 32 characters. |
| `JWT_REFRESH_SECRET` | Different random string, at least 32 characters. |
| `RATE_LIMIT_REDIS_URL` | `redis://` or `rediss://` URL for the shared limiter. |
| `CORS_ORIGINS` | The exact frontend origin(s), comma-separated (e.g. `https://school.example.com`). No wildcard. |

Recommended:

| Variable | Value |
|---|---|
| `TRUST_PROXY_HOPS` | `1` for Vercel's proxy path. |
| `APP_BASE_URL` | The deployed frontend origin, so emailed links resolve. |
| `SEED_DEFAULT_PLANS` | `true` once, to create the default subscription plans on first start. |
| `JOBS_RUNNER_SECRET` | A shared secret, if you enable scheduled jobs (see below). |

Do **not** set `PORT` or `ENABLE_DEV_SCHEDULER` in production. `VITE_API_URL` is only needed if the API is split onto another origin; leave it unset for the single-project setup. See [`backend/docs/ENVIRONMENT.md`](../backend/docs/ENVIRONMENT.md) for the full reference.

## 5. Deploy

Trigger a deployment (push to the tracked branch, or run `vercel --prod`). During the build Vercel installs both workspaces and builds the frontend.

## 6. Post-deploy tasks (manual, one-time)

1. **Create indexes.** Production disables automatic index creation. With the production `MONGO_URI` supplied through the deployment environment, run `npm run db:indexes` from `backend/` once against the target database. Review duplicate data against unique constraints first. The command is additive and never drops collections.
2. **Create the default plans.** Either set `SEED_DEFAULT_PLANS=true` for one deployment, or run `npm run db:seed-plans` from `backend/`. Public school registration requires an active default-trial plan.
3. **Provision a platform super admin.** There is no public endpoint for this role; create it through a trusted operational process.
4. **Configure the Atlas network access** so the deployed functions can reach the cluster, using an approved/restricted configuration. Do not expose a production cluster broadly.
5. **Add manual receiving accounts.** Sign in as the Super Admin and open **Platform → Revenue → Receiving accounts**. Add the bank/JazzCash/Easypaisa/other details that schools should pay, keep them active, and publish the instructions. Do not store passwords, PINs, OTPs, or other credentials. See [`docs/MANUAL-PAYMENTS.md`](./MANUAL-PAYMENTS.md).
6. **Optional providers.** To enable email, document storage, and scheduled reminders, see [`docs/EXTERNAL-SERVICES.md`](./EXTERNAL-SERVICES.md).

## 7. Scheduled jobs

Serverless instances are ephemeral, so there is no in-process scheduler in production. An external scheduler calls `POST /api/v1/jobs/run` with the header `x-jobs-secret: <JOBS_RUNNER_SECRET>`. The endpoint is idempotent per job per day, so repeated triggers do not double-send. Omit the secret to leave the endpoint disabled (`503`).

**Vercel Cron cannot call this endpoint directly:** Vercel Cron issues a `GET` with `Authorization: Bearer <CRON_SECRET>`, while the endpoint is `POST`-only and expects `x-jobs-secret`. Use an external scheduler that can send a `POST` with a custom header (GitHub Actions scheduled workflow, Google Cloud Scheduler, cron-job.org, EasyCron, or your own cron host), or add a small adapter route. See [`docs/EXTERNAL-SERVICES.md`](./EXTERNAL-SERVICES.md#5-scheduled-jobs-optional) for options.

## 8. Smoke test checklist

After deploying, verify:

- [ ] The login page loads and the browser receives `schoolflow` HttpOnly cookies (not tokens in JSON).
- [ ] `GET /api/v1/health` (or the configured health route) responds successfully.
- [ ] Signing in with each role lands on the correct dashboard.
- [ ] A deep link such as `https://<your-domain>/students` loads the app (SPA rewrite works).
- [ ] Creating a record persists after a refresh (Atlas connection and transactions work).
- [ ] Rate limiting returns `429` under repeated attempts and does not return `503` (Redis is reachable).
- [ ] If email is configured, a password-reset request sends mail; otherwise it returns an explicit `503`.
- [ ] A Super Admin can create, edit, deactivate, and delete a receiving account; a School Owner sees only active accounts and can copy references.
- [ ] Upload a 5 MiB document. For a 25 MiB student video, verify whether the platform returns `413 FUNCTION_PAYLOAD_TOO_LARGE` before the application sees the request; use the direct-to-storage flow for large media (see the body-size limitation below and §11).

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Deployment has no output / 404 on all routes | `outputDirectory` not pointing at the built frontend, or Root Directory set to `frontend`. |
| API returns `503` "service temporarily unavailable" | Missing/invalid `MONGO_URI`, or the function failed during cold start. Check function logs. |
| Requests return `503` for rate limiting | `RATE_LIMIT_REDIS_URL` missing or unreachable; production fails closed by design. |
| Login works but write requests fail with CSRF errors | Frontend and API are on different sites; cookie auth requires same-site deployment. |
| Transactions fail | MongoDB deployment is not a replica set. |
| Registration rejected | No active default-trial plan exists yet. |

## 10. Known limitations

- No live Vercel deployment has been verified from this repository.
- **Vercel plan/commercial eligibility is unverified.** Confirm with Vercel and your legal/account owner that the intended plan permits commercial SaaS use, expected bandwidth, function concurrency, and any required security/compliance features before launch. Do not assume eligibility from this repository.
- Vercel's default function request-body limit (4.5 MB) is smaller than the application's document (8 MB) and student-media (38 MB) JSON limits. Large base64 uploads may be rejected by the platform before Express can return its safe 413 response. The direct-to-storage workflow in §11 is the **preferred** path for large student media; the legacy base64 endpoint is a compatibility fallback and is not Vercel-compatible for large files.
- Cross-site (different registrable domain) frontend/API deployment is not supported by the current cookie settings; keep them same-site. The static CSP also needs exact storage upload origins added before enabling browser direct uploads with non-Cloudinary providers.
- Payment checkout is intentionally unavailable. Manual receiving accounts, external payment, independent Super Admin verification, and manual subscription activation are the only supported path.
- MongoDB backups/PITR, restore rehearsal, monitoring, alerting, and automated scheduling are external operator responsibilities and are not provided by this repository.
- An external monitoring/alerting integration should be added before production traffic.

## 11. Direct student-media uploads (CSP and storage origins)

The shipped CSP in `vercel.json` allows Cloudinary upload endpoints in `connect-src` (`https://api.cloudinary.com https://*.cloudinary.com`). If the configured storage provider returns S3, R2, B2, or Spaces upload URLs instead, add each **exact** origin (`https://<host>`, no `https:` wildcard) to that `connect-src` list before deploying. Also set the build-time variable `STORAGE_UPLOAD_ORIGINS` to the same comma-separated list so the frontend receives `VITE_STORAGE_UPLOAD_ORIGINS` (see `frontend/src/config/storage-upload-origins.js`); an explicit `VITE_STORAGE_UPLOAD_ORIGINS` value takes precedence. Rebuild after changing either. Authorize/finalize calls still go to `/api/v1` with the app session cookie and CSRF header; the provider request itself is sent with `credentials: "omit"` and no app credentials, so never add cookies or CSRF headers to it.
