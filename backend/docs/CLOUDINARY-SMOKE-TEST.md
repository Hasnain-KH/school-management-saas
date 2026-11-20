# Cloudinary real-account smoke test (opt-in)

A standalone, disposable check of the Cloudinary adapter against a real account. It is **not** part of `npm test` and never runs automatically. The mocked suite (`test/cloudinary-smoke-test.test.js`) covers the same flow with injected fakes and makes no network request.

## Isolation guarantees

The script `scripts/cloudinary-smoke-run.js` imports only Node built-ins and `src/services/cloudinary-storage.provider.js` (which imports the installed Cloudinary SDK). It does **not** import or initialize Express, Mongoose, MongoDB, school-logo services, document services, or the main app/server. It reads no school records and uses no filesystem asset: the upload bytes are a hardcoded in-memory 1×1 PNG buffer.

The filename deliberately does **not** match Node's `--test` discovery patterns (`*.test.js`, `*-test.js`, `test-*.js`), so `npm test` can never auto-execute the real smoke flow — even if `CLOUDINARY_SMOKE_TEST=true` happens to be set in the environment.

## Hard opt-in gate

Nothing happens unless `CLOUDINARY_SMOKE_TEST` is **exactly** `true` (case-sensitive). With any other value — including unset — the script exits before constructing the provider or making any request.

## Configuration (set locally, never committed)

Put these in `backend/.env` yourself. The script validates presence only; it never prints values.

```
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=<your cloud name>
CLOUDINARY_API_KEY=<your API key>
CLOUDINARY_API_SECRET=<your API secret>
```

Keep the S3 variables (`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, optional `STORAGE_REGION` / `STORAGE_FORCE_PATH_STYLE`) configured as well: existing S3-backed documents and logos resolve through the named S3 adapter even when Cloudinary is the selected provider for new uploads. This test does not migrate any object and does not touch existing records.

`backend/.env` is ignored by `backend/.gitignore` (`.env`, `.env.*`, with `!.env.example`). Never paste credentials into chat, tickets, or `VITE_*` variables.

## Safe execution procedure

Run from `backend/` only after the gate and credentials are in place:

```
npm run smoke:cloudinary
```

The script then:

1. Creates folder `schoolflow-smoketest-<run-id>` with a unique run ID.
2. Uploads one disposable key `smoke/disposable-<run-id>.png` as an authenticated `raw` asset with `overwrite: false`.
3. Saves the returned key/public ID immediately and asserts the public ID is exactly `schoolflow-smoketest-<run-id>/smoke/disposable-<run-id>.png`.
4. Builds a signed HTTPS URL (`type=authenticated`, `sign_url=true`, short expiry) and asserts it is HTTPS, raw/authenticated, signed, and free of the API secret. The URL is never printed.
5. Fetches the signed URL and verifies the bytes by both `Buffer.equals` against the original PNG and SHA-256 equality.
6. Fetches an unsigned URL for the same public ID and requires that it **not** return the asset (private delivery).
7. In a `finally` block, deletes **only** the key returned by the successful upload. No folder or bulk deletion exists or is used. If deletion fails, the output is exactly `cleanup: FAILED publicId=<exact public ID>` — no credentials, URLs, or error bodies.

Output is limited to fixed status lines, counts/booleans, and the exact public ID on cleanup failure. Nothing prints response bodies or environment values.

## Stop conditions

- Any gate/configuration failure: stop; do not retry with guessed values.
- Cleanup `FAILED`: note the exact public ID reported and resolve it manually in the Cloudinary console before doing anything else. Do not repeat the test with a different folder.
- Do not run against production school data, do not deploy, and do not commit, stage, or push the local `.env`.
