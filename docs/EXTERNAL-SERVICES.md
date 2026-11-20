# External services setup guide

SchoolFlow runs without any third-party service other than MongoDB. Email delivery, document storage, and scheduled reminders are **optional**: each is behind a provider abstraction that returns an explicit `503` until it is configured. This guide explains what each integration does, which environment variables enable it, and how to verify it works. It does not invent credentials — every value below must come from your own accounts.

See [`backend/docs/ENVIRONMENT.md`](../backend/docs/ENVIRONMENT.md) for the complete variable reference and [`docs/DEPLOYMENT-VERCEL.md`](./DEPLOYMENT-VERCEL.md) for the deployment procedure.

## Summary

| Service | Required? | Enables | Env vars | Fails safe with |
|---|---|---|---|---|
| MongoDB Atlas | **Yes** | All persistence; transactions need a replica set | `MONGO_URI` | — (startup fails) |
| Redis-compatible store | **Yes in production** | Shared rate limiting across serverless instances | `RATE_LIMIT_REDIS_URL` | `503` (fails closed) |
| Email provider | Optional | Password reset, email verification, overdue fee reminders, welcome/notification mail | `EMAIL_API_KEY`, `EMAIL_FROM` (+ optional `EMAIL_API_URL`, `EMAIL_REPLY_TO`, `REQUIRE_EMAIL_VERIFICATION`) | `503` |
| Object storage (S3-compatible or Cloudinary) | Optional | Document upload/download | `STORAGE_PROVIDER` plus `STORAGE_*` or `CLOUDINARY_*` | `503` |
| External scheduler | Optional | Runs overdue-reminder and subscription-expiry jobs | `JOBS_RUNNER_SECRET` | `503` (endpoint disabled) |
| Payment gateway | Optional (adapter not implemented) | Online subscription checkout; manual payment recording and revenue reporting work without it | — | `503` on checkout |
| Monitoring/alerting | Recommended | Alerting on errors and failed jobs | — (platform-native) | Vercel runtime logs only |

## 1. MongoDB Atlas (required)

- Create a cluster. Transactions require a **replica set**; Atlas clusters are replica sets by default. A shared/`M0` tier works for evaluation but review limits before production.
- Create a dedicated database and a least-privilege database user. Put the connection string in `MONGO_URI` (never in source control).
- Restrict **Network Access** to the deployment's egress. Do not open a production cluster to `0.0.0.0/0`.
- **Indexes are not created automatically in production.** After the first deploy, run `npm run db:indexes` from `backend/` against the target database. The command is additive and never drops collections or indexes. Review duplicate data against unique constraints first.
- **Plan seeding:** public school registration requires an active plan marked `isDefaultTrial`. Create the defaults by setting `SEED_DEFAULT_PLANS=true` for one deploy, or by running `npm run db:seed-plans`.

## 2. Redis-compatible rate limiting (required in production)

Production startup refuses to run without `RATE_LIMIT_REDIS_URL`, because serverless instances cannot share in-memory counters. Use any Redis-protocol service (`redis://` or `rediss://`), for example Upstash, Redis Cloud, or a self-hosted Redis.

- Set `RATE_LIMIT_REDIS_URL` in the deployment environment.
- The API and authentication limiters use separate namespaces and atomic counters.
- If Redis is unreachable, the limiters **fail closed** with `503` rather than silently allowing traffic.
- Local development and tests may omit it and use the process-local store.

**Verify:** issue many rapid requests and confirm `429` responses (not `503`) once the limit is exceeded.

## 3. Email delivery (optional)

SchoolFlow ships a **Resend-compatible JSON-over-HTTP** sender (no SDK dependency). It posts `{ from, to, subject, html, text, reply_to }` with `Authorization: Bearer <EMAIL_API_KEY>` and an optional `Idempotency-Key`. Any provider that accepts this shape works by overriding `EMAIL_API_URL` and, if needed, adapting the request.

### What it enables

| Workflow | Endpoint/trigger |
|---|---|
| Password reset | `POST /api/v1/auth/password-recovery` (request) and `POST /api/v1/auth/password-reset` (complete) |
| Email verification | Registration/staff creation (when mandatory verification is on), or `POST /api/v1/auth/email-verification` (resend); completed at `POST /api/v1/auth/email-verification/confirm` |
| Overdue fee reminders | `POST /api/v1/finance/reminders/overdue/dispatch`, or the `fee_reminders` job |
| Welcome and generic notifications | Sent on relevant events |

When email is **not** configured, these return an explicit `503` and no tokens are returned to clients or persisted.

### Verification policy

Configuring a provider only enables **delivery**. It never locks out existing accounts. Mandatory email verification is a separate, opt-in flag:

- `REQUIRE_EMAIL_VERIFICATION=true` — newly created accounts (school registration, staff, and parent accounts) must verify before they receive an authenticated session; they are emailed a link on creation.
- Default (unset/`false`) — registration and login behave exactly as before, and enabling email delivery does not force anyone to verify.
- Accounts that already exist are never marked and never blocked retroactively; they can still verify voluntarily.
- Enabling the flag without `EMAIL_API_KEY` and `EMAIL_FROM` fails configuration validation at startup with a clear error, so the platform cannot create accounts that are unable to verify.

Safe rollout: configure and test delivery first, then set `REQUIRE_EMAIL_VERIFICATION=true` so only new signups are affected. See [`backend/docs/ENVIRONMENT.md`](../backend/docs/ENVIRONMENT.md) for the full policy and rollout notes.

### Configure

1. Create a sending domain and verify it with your provider; note the API key and a verified `from` address.
2. Set:
   - `EMAIL_API_KEY` — provider secret.
   - `EMAIL_FROM` — a verified sender, e.g. `SchoolFlow <no-reply@yourdomain.com>`.
   - `EMAIL_API_URL` — optional; defaults to `https://api.resend.com/emails`.
   - `EMAIL_REPLY_TO` — optional.
3. Set `APP_BASE_URL` to the deployed frontend origin so links inside emails resolve (defaults to `http://localhost:5173`).

### Verify

- Request a password reset for a test account and confirm the email arrives and the link opens the frontend.
- If it returns `503`, the provider is not configured (or a required variable is missing).

## 4. Document storage (optional)

Uploads are sent as base64 JSON to `POST /api/v1/documents` (this is why the app needs no multipart parser and works unchanged on serverless). Files are stored in either **S3-compatible** object storage — AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO, and similar — or in **Cloudinary**. `STORAGE_PROVIDER` selects the default adapter (`s3` or `cloudinary`); Cloudinary is never selected implicitly.

Downloads are served through short-lived signed URLs (15-minute default). School logos are streamed through the authenticated same-origin proxy at `GET /api/v1/schools/me/logo`; the browser never sees a bucket URL or a Cloudinary host.

- Limits: **5 MB** per file; allowed types are PDF, JPEG, PNG, WebP, and Word/Excel documents.
- The API stores metadata, `storageKey`, a `storageProvider` marker, and a `sha256` checksum; bytes live in the configured provider. Deleting a document soft-deletes metadata and removes the object.
- Cloudinary assets are uploaded as authenticated `raw` files with deterministic, school-prefixed public IDs such as `schoolflow/<schoolId>/<category>/...` and `schoolflow/logos/<schoolId>/...`. Original bytes are preserved; no Cloudinary transformations are applied.
- Parents can only list/download documents tied to their explicitly linked children.
- Existing S3-backed records continue to resolve through the S3 adapter after a provider switch. Phase 1 does not migrate existing objects.

### Configure

| Variable | Notes |
|---|---|
| `STORAGE_PROVIDER` | `s3` (default) or `cloudinary`. An unsupported value fails configuration. |

S3-compatible adapter (used when `STORAGE_PROVIDER=s3`):

| Variable | Notes |
|---|---|
| `STORAGE_ENDPOINT` | S3-compatible endpoint URL. |
| `STORAGE_BUCKET` | Target bucket. |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Credentials with put/get/delete on the bucket. |
| `STORAGE_REGION` | Optional; default `us-east-1`. |
| `STORAGE_FORCE_PATH_STYLE` | Optional; `true` unless set to the literal `false`. Set `false` for virtual-hosted-style endpoints. |

Cloudinary adapter (used when `STORAGE_PROVIDER=cloudinary`):

| Variable | Notes |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud identifier. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Backend-only credentials; never expose them in `VITE_*` variables. |
| `CLOUDINARY_FOLDER` | Optional; default `schoolflow`. Public-ID prefix only, not an authorization boundary. |
| `CLOUDINARY_SIGNED_URL_TTL` | Optional; default `900` seconds. |
| `CLOUDINARY_SECURE` | Optional; `true` unless set to the literal `false`. |

Keep the S3 bucket private and Cloudinary assets authenticated — access is granted only through signed URLs.

### Verify

- Upload a small PDF from the **Documents** screen, confirm it appears, then download it.
- Confirm the signed URL works and expires; confirm delete removes the object.
- With Cloudinary, confirm authenticated `raw` delivery and a school-prefixed public ID.
- If upload returns `503`, the selected provider is not configured.
- Before any real-account check, follow the opt-in, disposable-asset procedure in [`CLOUDINARY-SMOKE-TEST.md`](../backend/docs/CLOUDINARY-SMOKE-TEST.md). Keep the S3 `STORAGE_*` variables configured: existing S3-backed records continue to resolve through S3 after Cloudinary is selected for new uploads.

## 5. Scheduled jobs (optional)

Serverless instances are ephemeral, so there is no in-process scheduler in production. Instead, an external scheduler calls a secured endpoint:

```
POST /api/v1/jobs/run
x-jobs-secret: <JOBS_RUNNER_SECRET>
Content-Type: application/json

{ "job": "fee_reminders" }        // optional; omit to run all jobs
```

Jobs:

| Job | What it does |
|---|---|
| `fee_reminders` | Sends overdue fee reminders for active/trial schools. **Skips (no-op) when email is not configured.** |
| `subscription_expiry` | Expires ended trials/subscriptions and revokes their sessions. |

- Set `JOBS_RUNNER_SECRET` to enable the endpoint; without it the route returns `503`. The secret is compared in constant time.
- Runs are **idempotent per job per UTC day** (`JobRun` with a daily key and a lease), so repeated triggers do not double-send. Pass `{ "force": true }` only to deliberately re-run.
- `GET /api/v1/jobs` lists available jobs (requires a platform-owner session).

### Scheduler options

**Important compatibility note:** **Vercel Cron** invokes the configured path with an HTTP **`GET`** and authenticates with `Authorization: Bearer <CRON_SECRET>`. The SchoolFlow endpoint is **`POST`-only** and expects the **`x-jobs-secret`** header, so Vercel Cron cannot call it directly. Choose one of:

- **Recommended:** an external scheduler that can send a `POST` with a custom header — GitHub Actions (scheduled workflow), Google Cloud Scheduler, cron-job.org, EasyCron, or your own cron host. Point it at `https://<your-domain>/api/v1/jobs/run` with `x-jobs-secret`.
- **Vercel Cron:** requires a small adapter route that maps a `GET` + `Authorization` header onto the job runner. This is not implemented in the repository; add it only if you specifically want Vercel-managed scheduling.

### Local development

Set `ENABLE_DEV_SCHEDULER=true` to run an in-process scheduler (interval `DEV_SCHEDULER_INTERVAL_MS`, default 24h). **Never enable this in production.**

## 6. Payments

**Payment recording and revenue reporting are implemented and work without any gateway.** `src/services/payment.service.js` records subscription payments per school (`manual` or `gateway`), and the platform revenue report aggregates them by currency, month, and plan. Manual (offline) payments — bank transfer, cash, JazzCash/Easypaisa receipt entered by an operator — are recorded by a platform super admin via `POST /api/v1/platform/schools/:schoolId/payments`, optionally activating or extending the school's subscription in the same transaction. This is the realistic default for Pakistani private schools and requires no third-party account.

**The online gateway adapter is not implemented.** `src/services/payment-gateway.provider.js` is a provider **interface with no adapter**. Gateway checkout (`POST /api/v1/platform/schools/:schoolId/checkout`) and the webhook (`POST /api/v1/payments/webhook`) are wired end to end — a pending payment is created, and the webhook applies a verified event idempotently and extends the subscription — but both return `503` until an adapter is registered. To add one (for example Stripe or a local processor such as JazzCash/Easypaisa):

1. Implement `createCheckoutSession` and `verifyWebhook` and register the adapter in the startup path (`configurePaymentGatewayProvider`).
2. In `verifyWebhook`, enforce provider-specific **signature** verification against the raw body, and reject unverified events. The service already performs idempotency (a paid reference is never reprocessed) and ownership checks (the reference must match a recorded payment).
3. Store only non-sensitive references (`providerReference`); never log card/credential data.

Until an adapter exists, checkout-dependent screens must report the feature as unavailable rather than faking a payment.

**Verify (manual path):** record a manual payment with `applySubscription: true` for a test school, confirm the payment appears in `GET /api/v1/schools/billing` and `GET /api/v1/platform/payments`, and confirm the revenue report totals reflect it. Checkout returns `503` until a gateway is configured.

## 7. Monitoring and alerting (recommended)

- Vercel captures sanitized runtime logs; use the **Logs** view and failed `JobRun` records to diagnose issues.
- Before production traffic, add an external error/alerting integration (for example Sentry or a log drain) and alert on: repeated `5xx`, `503` rate-limit failures, and `JobRun` rows with `status: "failed"`.
- No monitoring provider is wired in by default.

## Security rules for all of the above

- Store every credential in the platform's encrypted environment settings or an ignored local `.env`; **never** commit them or place secrets in `VITE_*` variables.
- Never log secrets, tokens, connection strings, or file contents.
- Keep buckets private and scopes least-privilege.
- Rotate `JOBS_RUNNER_SECRET` and provider keys periodically.
