# API reference

Base path: `/api/v1`. Send JSON with `Content-Type: application/json`. Authenticated requests use `Authorization: Bearer <accessToken>`. Error responses do not include stack traces or database details.

## Health

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Liveness check |

## SaaS onboarding and authentication

| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/auth/register` | Public; rate limited | `schoolName`, optional `schoolSlug`, `email`, optional `phone`, `adminName`, `password` |
| POST | `/auth/login` | Public; rate limited | `schoolSlug`, `email`, `password` for school accounts; omit `schoolSlug` for a provisioned platform super admin |
| POST | `/auth/refresh` | Public; rate limited | `refreshToken` |
| POST | `/auth/logout` | Access token | `refreshToken` |
| POST | `/auth/password-recovery` | Public; rate limited | `email`; school accounts also require `schoolSlug` |
| POST | `/auth/password-reset` | Public; rate limited | `token`, new `password` |
| POST | `/auth/email-verification` | Public; rate limited | `email`; school accounts also require `schoolSlug`; asks the configured provider to deliver a verification link |
| POST | `/auth/email-verification/confirm` | Public; rate limited | `token` |
| GET | `/auth/me` | Access token | — |

School registration atomically creates the school, its first school-admin account, a trial whose duration comes from the active default trial plan, an initial main branch, an audit event, and a persisted token session. A platform admin must first configure an active default trial plan or registration returns `503`. MongoDB transactions are required. The registration/login response contains an access token and a refresh token when email delivery is not configured; when configured, registration sends a verification email and returns no tokens until the account is verified.

Refresh tokens rotate on use. Both access and refresh tokens are backed by a persisted session, so logout or rotation invalidates the corresponding access token immediately. Refresh tokens are stored only as SHA-256 digests. Access tokens expire after 15 minutes by default; refresh tokens expire after 7 days.

Recovery and verification tokens are cryptographically random, stored only as SHA-256 digests, expire after 30 minutes, and are single-use. Successful password reset revokes the user's persisted sessions. Recovery responses do not disclose whether an account exists. No email provider is configured: delivery-request routes explicitly return `503` and do not persist or expose a token until a real provider is installed. Tests use a mocked provider only. Once configured, school accounts must verify their email before using authenticated school routes.

## Platform administration and subscriptions

These routes require a provisioned `platform_super_admin` and `platform:manage`; they do not accept a school tenant. Plan limits are database-configured, not embedded tier defaults. `null` for a limit means unlimited. Plan fields include `name`, immutable `code`, `priceMinor`, `currency`, `billingInterval`, optional `trialDurationDays`, `limits` (`students`, `staff`, `branches`), and boolean `features`. Feature keys are `academics`, `students`, `staff`, `attendance`, `fees`, `exams`, `calendar`, `inventory`, `library`, `notifications`, and `reports`.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/platform/plans` | Paginated plan catalog, optionally including inactive plans; create configurable pricing, billing interval, limits, features, and a default-trial plan |
| PATCH | `/platform/plans/:planId` | Update plan fields or activate/deactivate it (`code` is immutable) |
| GET | `/platform/schools?status=...&search=...` | Paginated platform-wide school directory |
| PATCH | `/platform/schools/:schoolId/status` | Set school status to `trial`, `active`, `suspended`, or `expired`; active/trial status requires a valid subscription and eligible assigned plan |
| PATCH | `/platform/schools/:schoolId/subscription` | Assign an active plan and update subscription lifecycle dates/status; trial uses the configured default-trial plan |

Plan changes, subscription assignment, school status changes, and their audit records are transactional. Deactivating a plan prevents new assignments but does not silently remove current subscribers' entitlements. Feature flags are checked on school API routes. Student, active staff, and branch caps are checked against tenant records during transactional creation; lowering a plan cap does not delete existing records.

## School profile

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/schools/me` | Authenticated school member | — |
| PATCH | `/schools/me` | School admin | At least one of `name`, `phone`, `address`, `settings.attendanceLateGraceMinutes`, `settings.attendanceStartTime` |

Profile writes use the authenticated user's school ID in the database filter. Client-provided tenant IDs are rejected by strict validation. Administrative profile updates are recorded in the audit collection.

## Academic setup

All routes below require an authenticated school user, a matching server-derived tenant, and the `academics` plan feature. School admins and principals can manage academics; teachers can read academic data. IDs and query filters are always constrained to the authenticated school.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/academics/branches` | List or create school branches |
| PATCH/DELETE | `/academics/branches/:id` | Edit or remove a branch; main branch and branches in use cannot be removed |
| GET/POST | `/academics/sessions` | List or create academic sessions |
| PATCH | `/academics/sessions/:id` | Edit an upcoming or active session's dates/name |
| POST | `/academics/sessions/:id/activate` | Activate a session and complete the previous active session atomically |
| POST | `/academics/sessions/:id/complete` | Complete the active session |
| GET/POST | `/academics/classes` | List or create school classes |
| PATCH/DELETE | `/academics/classes/:id` | Edit or archive an unassigned class |
| GET/POST | `/academics/sections` | List or create sections linked to same-school class, session, and branch |
| PATCH/DELETE | `/academics/sections/:id` | Edit or archive an unassigned section |
| GET/POST | `/academics/subjects` | List or create subjects |
| PATCH/DELETE | `/academics/subjects/:id` | Edit or archive an unassigned subject |
| GET/POST | `/academics/class-subjects` | List or assign a subject to a class/session, optionally assigning a teacher |
| DELETE | `/academics/class-subjects/:id` | Unassign a subject not used by a timetable |
| GET/PUT/DELETE | `/academics/sections/:sectionId/class-teacher` | Read, assign, or remove a same-school class teacher; `academicSessionId` is required |
| GET/POST | `/academics/timetable` | List or create a period for an assigned section subject |
| DELETE | `/academics/timetable/:id` | Delete an entry in the authenticated school |

List routes accept `page`, `limit` (maximum 100), `search`, `sortBy` (allowlisted), and `sortOrder`; academic lists accept relevant session/class/branch/status filters. Session and assignment writes are audited. Compound unique indexes prevent duplicate session names, active sessions, sections, class-subject assignments, and conflicting section/teacher/room periods.

The session transition completes the prior active session as part of the same transaction. Student promotions are handled through the student placement endpoint below.

## School users and students

These routes require authentication, a school tenant, and the `staff` or `students` feature as applicable. Staff and student admissions are checked against the configured plan limits. School admins can create/update staff and parent user accounts; only school admins can manage user accounts. Account creation requires a password supplied by the administrator. School admins and principals can manage student admissions, placement, guardian links, and status. Teachers and parents do not currently have student-record access because class-scoped teacher/guardian authorization is not yet implemented.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/users` | Paginated same-school staff/parent directory; create principal, teacher, or parent account with supplied initial password |
| PATCH | `/users/:id` | Update same-school user's profile or enable/disable account; role changes and self-disable are prohibited |
| GET/POST | `/students` | Paginated student search/filter and transactional admission |
| GET/PATCH | `/students/:id` | Read or edit an enrolled student profile |
| POST | `/students/:id/placement` | Promote to a later session or transfer between placements; body requires `academicSessionId`, `classId`, `sectionId`, and `branchId`, with optional notes |
| POST | `/students/:id/status` | Withdraw, mark transferred out, or graduate an enrolled student |
| GET | `/students/:id/history` | Read same-school academic history |
| POST/GET | `/students/:id/leaving-certificate` | Issue once or retrieve tenant-scoped certificate record for a withdrawn, transferred, or graduated student; POST accepts optional `remarks` |
| GET/POST | `/students/guardians` | Search guardians or create a guardian contact record |
| PATCH/DELETE | `/students/guardians/:guardianId` | Update or archive an unlinked same-school guardian |
| PUT/DELETE | `/students/:studentId/guardians/:guardianId` | Link or unlink a same-school guardian; PUT accepts `isPrimary` |

Admissions validate the section/class/session/branch relationship and reserve a section seat inside a transaction. The database-level conditional seat increment prevents concurrent admissions from exceeding capacity. Tenant-scoped unique indexes prevent duplicate admission numbers and duplicate guardian links. Student document uploads/storage and parent portal access are not included; no storage or email provider has been selected.

Leaving certificates are issued once per student after a terminal enrollment status and snapshot the school, student, last placement, and leaving event. The API returns certificate data for presentation; it does not generate or store a signed PDF.

## Attendance

All attendance routes require an authenticated school user. Every operation derives `schoolId` from the authenticated tenant. School admins and principals can manage student and staff attendance. Teachers can mark and read attendance only for a section where they are assigned as class teacher or have a subject assignment. Teachers can retrieve their own staff attendance; parents have no attendance access until guardian-scoped student authorization is implemented.

| Method | Path | Purpose |
|---|---|---|
| POST | `/attendance/students` | Mark or correct daily attendance for a section; body contains `sectionId`, `date` (`YYYY-MM-DD`), and unique student records with status, optional `checkIn`/`checkOut` (`HH:mm`) and note |
| GET | `/attendance/students?sectionId=...&date=YYYY-MM-DD` | Get a section roster and its attendance for one day |
| GET | `/attendance/students/monthly?sectionId=...&month=YYYY-MM&page=1&limit=25` | Paginated records and full-month status summary |
| POST | `/attendance/staff` | School admin/principal marks or corrects attendance for active same-school staff |
| GET | `/attendance/staff?month=YYYY-MM&page=1&limit=25` | School admin/principal paginated staff attendance report and status summary |
| GET | `/attendance/staff/me?month=YYYY-MM` | Retrieve own staff attendance summary and records |

Database unique indexes enforce one student or staff attendance record per school member per day. Re-submitting a sheet updates records for that day; writes are transactional and audited. Attendance dates must be within the section's academic session. A check-in later than `settings.attendanceStartTime` plus `settings.attendanceLateGraceMinutes` is recorded as late. Defaults are 08:00 and 10 minutes; times are interpreted as school-local wall-clock values, while attendance dates are stored at UTC midnight. Daily roster access is limited to currently enrolled students in the section.

## Fees and finance

Finance routes require an authenticated school tenant with the `fees` plan feature. School admins can manage definitions, assignments, vouchers, and collections. Principals have read-only finance access. Teachers and parents are denied finance access. Amounts are integer minor units (for example cents); no floating-point currency amounts are accepted. Collections are offline/manual records only; no online payment provider is integrated.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/finance/categories` | Paginated fee categories or create a tenant-unique category |
| GET/POST | `/finance/structures` | List or create session/class fee structures with monthly/annual frequency, ISO currency, due day/month, and category line items |
| GET/POST | `/finance/assignments` | List or assign a fee structure to an enrolled same-class/session student with fixed or basis-point discount/scholarship and start/end billing periods |
| POST | `/finance/vouchers/generate` | Generate missing vouchers for selected (1–500) assigned students; body: `feeStructureId`, `period`, `studentIds` |
| GET | `/finance/vouchers` | Paginated voucher search/filter by student, structure, period, status, or `outstandingOnly=true` |
| GET | `/finance/vouchers/:voucherId` | Retrieve a same-tenant voucher |
| POST | `/finance/vouchers/:voucherId/payments` | Record an offline/manual partial or full payment; supply a stable `idempotencyKey`, integer `amountMinor`, method (`cash`, `bank_transfer`, `cheque`, `other`), and optional reference/note |
| GET | `/finance/vouchers/:voucherId/payments?page=1&limit=25` | Paginated immutable transaction history |
| GET | `/finance/receipts/:receiptNumber` | Retrieve the same-tenant payment receipt record |
| GET | `/finance/reports/overdue?asOf=YYYY-MM-DD&page=1&limit=25` | Paginated overdue vouchers and outstanding balances grouped by currency |
| GET | `/finance/reports/collections?from=YYYY-MM-DD&to=YYYY-MM-DD` | Actual collected totals grouped by currency and payment method; optional `classId` |

Voucher creation snapshots fee lines and discount amounts. Generation can be safely retried; existing assignment/period vouchers are skipped, and unique indexes arbitrate concurrent generation. Payment recording atomically decrements the outstanding balance, appends an immutable receipt transaction, and audits the collection. A retry with an identical idempotency key and payload returns the original receipt without collecting twice. Voucher and payment writes require MongoDB transactions. Overdue reporting is implemented, but automatic reminder delivery is not: no email/SMS provider or delivery worker has been selected.

## Exams and results

Exam routes require an authenticated tenant and the `exams` plan feature. School admins and principals can create/publish exams and read results. Teachers can enter marks only for subjects assigned to them; no teacher can create or publish exams. Student/class-subject references are verified against the exam's tenant, class, and academic session.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/exams` | Paginated same-tenant exam listing or schedule a class exam with dates, subjects, max/pass marks, and grading bands |
| POST | `/exams/:examId/marks` | Enter/correct marks for one scheduled subject; body contains `classSubjectId` and unique student records |
| POST | `/exams/:examId/publish` | Publish only after every currently enrolled student in the class/session has marks for every scheduled subject |
| GET | `/exams/:examId/results?page=1&limit=25` | Paginated calculated class results (totals, percentages, grade, completion, pass status) |
| GET | `/exams/:examId/report-cards/:studentId` | Calculate an individual report card from persisted marks after publication |
| GET | `/exams/:examId/reports/subjects` | Per-subject average, highest score, student count, and pass count from actual marks |

Grading bands must be unique, contiguous, non-overlapping, and cover 0–100%. Exam subjects on the same day cannot have overlapping times. Marks are checked against the scheduled maximum, teacher permissions are enforced server-side, and results cannot be edited after publication. Exam, mark, and publication writes are transactional and audited. These workflows have mocked tests only; database persistence and transaction behavior still require a dedicated replica-set integration test run.

## School operations and announcements

These APIs use the authenticated school tenant and require the corresponding active plan feature (`calendar`, `inventory`, `library`, or `notifications`). School admins and principals manage school operations; teachers, parents, principals, and admins only see calendar events/announcements whose audience includes their role. Announcement delivery is an in-app API feed only; it does not send email, SMS, or push notifications.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/operations/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Paginated audience-visible calendar events, or create a school/branch event or holiday |
| GET/POST | `/operations/inventory/items` | Paginated stock item directory or create a tenant-unique SKU |
| POST | `/operations/inventory/items/:itemId/transactions` | Record stock received/issued; issue is atomically rejected if it would make stock negative |
| GET | `/operations/inventory/items/:itemId/transactions?page=1&limit=25` | Paginated append-only stock ledger |
| GET | `/operations/inventory/reports/low-stock?page=1&limit=25` | Actual inventory items at or below reorder level |
| GET/POST | `/operations/library/books` | Search same-school catalog or add book copies |
| POST | `/operations/library/loans` | Issue an available book copy to an enrolled same-school student with a due date |
| GET | `/operations/library/loans?overdueOnly=true&page=1&limit=25` | Paginated active, returned, or overdue loans |
| POST | `/operations/library/loans/:loanId/return` | Return a checked-out book and restore its available copy count atomically |
| GET/POST | `/operations/announcements` | Paginated in-app feed or publish an announcement to selected school roles |

Inventory changes are represented as immutable received/issued transactions. Loan/return workflows and inventory movements use transactions and audit events. Library overdue results are computed from open loans and due dates; no overdue messaging is delivered. Inventory models handle consumable stock rather than assignment/depreciation of fixed assets.

## Reports and dashboard

These read-only reports require `reports:read` (school admins and principals) and the `reports` plan feature, and aggregate records using the authenticated `schoolId`; no dashboard values are hardcoded.

| Method | Path | Purpose |
|---|---|---|
| GET | `/reports/dashboard` | Current school student/staff status counts, today's student/staff attendance, this-month manual collections, overdue fee totals by currency, active academic session, and scheduled exam count |
| GET | `/reports/students` | Student counts by lifecycle status and enrolled count by class/session |
| GET | `/reports/staff` | Staff counts by role and account status |
| GET | `/reports/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` | Student and staff attendance counts by status for a range of up to 366 days |
| GET | `/reports/academics` | Actual academic session, class, section, subject-assignment, and exam counts |
| GET | `/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD` | Actual collections by currency/payment method and outstanding vouchers by currency/status |

Fee collection/overdue reports are under `/finance/reports`; exam performance/report-card data is under `/exams`. These modules provide database-derived operational summaries, not a full export/report builder.

## Limits and status codes

The API has a global rate limit of 300 requests per IP per 15 minutes; authentication routes allow 10 per IP per 15 minutes. Common statuses: `200` success, `201` created, `202` accepted for delivery, `400` invalid input, `401` missing/invalid credentials, `403` forbidden or inactive tenant/feature, `404` unknown resource/route, `409` business conflict or duplicate record, `413` body too large, `429` rate limit exceeded, and `503` unavailable service (including unconfigured email delivery or trial plan).

Email/SMS/push delivery (including actual password-recovery and verification email delivery), online payment processing, automatic overdue reminders, advanced report exports, fixed-asset assignment/depreciation, and document uploads are not implemented. Email action-token workflows are implemented but delivery-request endpoints return `503` until an actual provider is configured; token-confirmation endpoints are available for issued tokens.
