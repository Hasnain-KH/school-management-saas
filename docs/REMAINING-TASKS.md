# Remaining manual tasks

These are the steps that require decisions, accounts, or access outside the repository. Nothing here is a code gap; each item is an operational action an owner must perform. Ordered roughly by priority.

## Before any production traffic

1. **Provision the platform super admin.** There is no public endpoint for the `platform_super_admin` role (by design). Create it through a trusted operational process against the production database.
2. **Set production environment variables** in Vercel (encrypted): `NODE_ENV=production`, `MONGO_URI`, two distinct 32+ character `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, `RATE_LIMIT_REDIS_URL`, and `CORS_ORIGINS` (exact frontend origin, no wildcard). Do **not** set `PORT` or `ENABLE_DEV_SCHEDULER`. See [`DEPLOYMENT-VERCEL.md`](./DEPLOYMENT-VERCEL.md) and [`backend/docs/ENVIRONMENT.md`](../backend/docs/ENVIRONMENT.md).
3. **Create a MongoDB Atlas cluster** (replica set — required for transactions) with a least-privilege database user, and restrict Network Access to the deployment's egress. Do not open the cluster to `0.0.0.0/0`.
4. **Provision a Redis-compatible service** (Upstash, Redis Cloud, self-hosted) and set `RATE_LIMIT_REDIS_URL`. Production fails closed with `503` without it.
5. **Run the one-time database setup** after the first deploy, against the production database:
   - `npm run db:indexes` (from `backend/`) — additive, never drops collections. This also creates the manual receiving-account indexes.
   - `npm run db:seed-plans` (or `SEED_DEFAULT_PLANS=true` for one deploy) — creates the default-trial plan that registration requires.
6. **Configure manual receiving accounts** through the Super Admin UI (**Platform → Revenue → Receiving accounts**) with real bank/mobile-wallet details and instructions. Keep only verified accounts active. See [`MANUAL-PAYMENTS.md`](./MANUAL-PAYMENTS.md). No gateway, webhook, or automated payment step may be added.
7. **Confirm Vercel plan and commercial eligibility** with the account owner/provider, including expected traffic, concurrency, and required compliance features. This cannot be verified from the repository.
8. **Smoke-test the deployment** using the checklist in [`DEPLOYMENT-VERCEL.md`](./DEPLOYMENT-VERCEL.md#8-smoke-test-checklist): cookies, health, per-role dashboards, SPA deep links, persistence, rate limiting, receiving-account visibility, and upload limits.

## Recommended before scale

9. **Configure an external scheduler** for the idempotent jobs endpoint. Vercel Cron cannot call it (it sends `GET` + `Authorization: Bearer`, but the endpoint is `POST` + `x-jobs-secret`). Use GitHub Actions, Google Cloud Scheduler, cron-job.org, EasyCron, or a small adapter route. Set `JOBS_RUNNER_SECRET`.
10. **Add monitoring/alerting** (e.g. Sentry or a log drain) and alert on repeated `5xx`, `503` rate-limit failures, and `JobRun` rows with `status: "failed"`. Define an on-call owner and incident runbook.
11. **Enable and rehearse backups/PITR.** Configure MongoDB Atlas backups/PITR and private object-storage versioning, then rehearse a restore into an isolated `schoolflow_test*` database/bucket prefix. Verify indexes, tenant relationships, storage keys, and private media access. Record RPO/RTO and the responsible operator. Treat backup/restore as BLOCKED until this is evidenced.
12. **Verify on a live replica set** by setting `MONGO_TEST_URI` and `SCHOOLFLOW_REDIS_INTEGRATION=true` and running the backend suite, so the 3 skipped integration tests actually execute.
13. **Review Atlas tier/limits** for the expected load (100–300 students per school) and confirm the Vercel plan permits commercial use and expected bandwidth.

## Optional integrations (only if the school needs them)

14. **Email delivery** — set `EMAIL_API_KEY`, `EMAIL_FROM` (and optionally `EMAIL_API_URL`, `EMAIL_REPLY_TO`, `APP_BASE_URL`) to enable password reset, verification, reminders, and notifications. Until then those endpoints return `503`. See [`EXTERNAL-SERVICES.md`](./EXTERNAL-SERVICES.md#3-email-delivery-optional).
15. **Document storage** — keep `STORAGE_PROVIDER=s3` (default) with `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` (and optionally region/path-style), or set `STORAGE_PROVIDER=cloudinary` with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` to enable uploads/downloads. See [`EXTERNAL-SERVICES.md`](./EXTERNAL-SERVICES.md#4-document-storage-optional). Enable direct-to-storage for large media and add exact upload origins to CSP/CORS.

**Payments are not an optional integration:** the gateway is intentionally excluded. Only the manual receiving-account workflow in [`MANUAL-PAYMENTS.md`](./MANUAL-PAYMENTS.md) is permitted.

## Optional code work (not required for launch)

16. **Split `WorkspacePage.jsx`** into feature modules. Deliberately deferred to avoid regressing working screens; do it as a dedicated, well-tested refactor if desired.
17. **Server-side PDF generation** for reports. Currently the frontend exports CSV/Excel and uses browser print-to-PDF.
18. **Vercel Cron adapter route** if Vercel-managed scheduling is preferred over an external scheduler.
19. **Commit the work.** Changes from this audit task are uncommitted by instruction. Review the diff, then commit with separate approval (and never commit a real `.env`).

## Secret-handling reminders

- Never commit credentials, connection strings, or tokens; keep `.env` ignored.
- Never place secrets in `VITE_*` variables (they are embedded in the client bundle).
- Keep storage buckets private and scopes least-privilege.
- Rotate `JOBS_RUNNER_SECRET` and provider keys periodically.
