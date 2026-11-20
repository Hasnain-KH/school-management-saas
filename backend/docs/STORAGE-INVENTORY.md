# Read-only storage inventory

`scripts/storage-inventory.js` counts legacy-provider records without reading or printing any document content. It performs `countDocuments()` only: no writes, migrations, uploads, downloads, deletions, or index creation (`autoIndex: false`).

## Safety gates

The script refuses to connect unless **both** are true:

1. `STORAGE_INVENTORY_READONLY=true` (literal, case-sensitive).
2. `STORAGE_INVENTORY_MONGO_URI` is set in the shell/secret manager. The script deliberately does **not** import `dotenv`, so it never reads `.env` or `MONGO_URI`.

The URI is passed through the existing `validateMongoTestUri()` guard: the database name must begin with `schoolflow_test`, and non-loopback hosts require the project's existing `MONGO_TEST_ALLOW_REMOTE=true` acknowledgement. A production database name is rejected before any connection is attempted. Use a dedicated non-production database with credentials scoped to that database only.

## Command (from `backend/`)

```powershell
$env:STORAGE_INVENTORY_READONLY="true"
$env:STORAGE_INVENTORY_MONGO_URI="<test-only-readonly-uri>"
npm run inventory:storage
```

Supply the URI privately; do not put it in source control, command history, logs, or shared output.

## Output

Counts only:

```
inventory: OK
documents_missing_storageProvider: N
documents_s3: N
logos_missing_storageProvider: N
logos_s3: N
documents_cloudinary: N
logos_cloudinary: N
cloudinary_total: N
```

With the gate disabled or no safe URI, the script exits with `inventory: DISABLED` or `inventory: NO_SAFE_READONLY_DATABASE` without connecting.

If `documents_missing_storageProvider`, `documents_s3`, `logos_missing_storageProvider`, or `logos_s3` is nonzero, those records resolve through the S3 adapter; keep the S3 `STORAGE_*` variables configured. Do not migrate or delete objects as part of the smoke test.
