# Manual subscription payments and receiving accounts

SchoolFlow deliberately has **no payment gateway**. It never collects money, submits a payment, verifies a bank transfer, or activates a subscription automatically. The only supported payment path is the manual workflow below, using the existing platform subscription and payment-recording APIs.

## Business rules (unchanged)

1. No payment gateway, checkout page, provider SDK, webhook, receipt upload, or payment submission form.
2. No automated collection, automated verification, or automatic subscription activation based on payment details.
3. Receiving accounts are **platform-scoped** records (`schoolId: null`). They are not school-owned bank accounts.
4. Only `platform_super_admin` can create, edit, activate/deactivate, or delete receiving accounts.
5. Only `school_admin` (School Owner) can read active receiving account details. Teachers, parents, students, and principals have no access route.
6. One school uses one configured base currency; historical financial values are never silently converted.
7. The existing `POST /api/v1/platform/schools/:schoolId/payments` workflow is the **only** way a payment is recorded and a subscription is activated/renewed.

## Data model

`PlatformReceivingAccount` (`backend/src/models/platform-receiving-account.model.js`) stores:

- `accountType`: `bank_account`, `jazzcash`, `easypaisa`, or `other`
- `providerName`, `accountTitle`, `accountNumber`
- `iban` (optional), `mobileWalletNumber` (required for wallet types), `instructions` (optional)
- `isActive`
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`

**Never store** bank passwords, PINs, OTPs, CVVs, or login credentials. Server validation rejects these markers in any text field and rejects unknown fields with strict schemas. Wallet types require a mobile wallet number.

## Super Admin operational guide

Open **Platform → Revenue → Receiving accounts**.

- **Add** an account: type, bank/provider name, account title, account number, optional IBAN, optional mobile wallet number, optional instructions, and active status.
- **View** all accounts with active/inactive status.
- **Edit** any field. Changes are visible to school owners immediately if the account is active.
- **Deactivate** an account to hide it from school owners without deleting history. Reactivation is a separate explicit action.
- **Delete** an account only after a confirmation dialog. The API also requires `?confirm=true`.

Every create, update, status change, and delete writes a platform audit log with `schoolId: null`, the actor's user ID, and a resource type of `platform_receiving_account`.

API:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/platform/receiving-accounts?page=1&limit=25&search=&isActive=true` | List all accounts (Super Admin) |
| POST | `/api/v1/platform/receiving-accounts` | Create an account |
| PATCH | `/api/v1/platform/receiving-accounts/:accountId` | Edit an account |
| PATCH | `/api/v1/platform/receiving-accounts/:accountId/status` | Activate/deactivate (`{ "isActive": true\|false }`) |
| DELETE | `/api/v1/platform/receiving-accounts/:accountId?confirm=true` | Delete after explicit confirmation |

## School Owner operational guide

Open **Subscription → Billing history → Where to send a manual payment** (or **Subscription** in the sidebar, then the billing section).

The page shows **active** receiving accounts only, with copy buttons for account numbers, IBANs, and mobile wallet numbers, plus the Super Admin's payment instructions. School owners have no create, edit, delete, status, upload, or payment-submission control. The API used by this screen is read-only:

| Method | Path | Visibility |
|---|---|---|
| GET | `/api/v1/schools/receiving-accounts` | `school_admin` only; active accounts, explicit safe projection |

The response intentionally omits internal audit fields and never includes inactive accounts, credentials, or a payment link.

## End-to-end manual workflow

1. **Super Admin** creates and activates the receiving account(s) and tells schools where to pay.
2. **School Owner** opens the billing section, views the active account details, and copies the reference as needed.
3. **School Owner** sends the payment **outside SchoolFlow** (for example a bank transfer or an over-the-counter mobile-wallet deposit). SchoolFlow has no record of this step yet.
4. **School Owner** may contact the Super Admin out of band, but there is no in-app receipt upload or payment submission.
5. **Super Admin** independently verifies the payment using the external provider's statement or advice.
6. **Super Admin** records the payment and, only after verification, uses the existing subscription-management action (`applySubscription: true` or the subscription-assignment endpoint) to activate or renew the school.

Nothing in steps 2–5 changes subscription state automatically. If verification fails, no payment is recorded and no subscription is changed.

## Audit and reconciliation

- Receiving-account mutations: platform audit log with `schoolId: null`.
- Payment recording and subscription changes: existing transactional audit records with the school's `schoolId`.
- Revenue reports aggregate recorded payments only; a school sending money externally is invisible until a Super Admin records it.
- The revenue summary's "Outstanding" section represents recorded `pending` gateway-era records only; with the gateway intentionally unavailable, treat it as a legacy/unverified bucket rather than an amount owed. Manual payments should be recorded as `paid` only after independent verification.

## Testing

- Backend: `npm test --workspace backend -- test/receiving-account.test.js`
- Frontend helpers: `npm test --workspace frontend` (includes `receiving-accounts.test.js`)
- Browser flows: `npx playwright test e2e/receiving-accounts.spec.js` from `frontend/`

These tests use mocks/isolated fixtures; they do not contact a bank, payment provider, or production database.
