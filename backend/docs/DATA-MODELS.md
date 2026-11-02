# Data model and authorization

## Collections

- **School** — tenant root with unique slug, status, a reference to its configured subscription plan, trial/subscription dates, branches, contact/address details, attendance start time, and bounded attendance grace-period settings.
- **SubscriptionPlan** — platform-managed pricing, billing interval, optional trial duration, nullable/unlimited resource caps, feature flags, activation status, and a uniquely designated default trial plan.
- **User** — school-scoped account, normalized email, bcrypt password hash, email verification timestamp, role, and enabled/disabled status. A compound unique index enforces one email per school. Platform super admins have no school and are never created by public routes.
- **AccountActionToken** — tenant-linked (or platform-account) single-use password-reset/email-verification token digest, user/type, expiration, and consumption timestamp; raw tokens are never persisted or returned by API responses.
- **FeeReminderDelivery** — tenant/voucher/guardian/date delivery state with retry attempts and a unique daily idempotency key; recipient addresses are resolved from same-school guardian records at delivery time.
- **RefreshSession** — user/school references, unique refresh/access token IDs, refresh-token digest, expiration, and revocation timestamp. MongoDB TTL removes expired sessions; API checks enforce expiry and revocation even before TTL cleanup.
- **AuditLog** — school/actor references, action, resource, and deliberately limited metadata. Compound indexes support tenant/date and actor/date access.
- **AcademicSession** — school-owned date interval with upcoming/active/completed lifecycle and a partial unique index allowing one active session per school.
- **AcademicClass** — reusable school-owned class/grade definitions with a unique school/code index.
- **Section** — class/session/embedded-branch references, capacity, and a tenant/session/class/name unique index.
- **Subject** — reusable school-owned subject definitions with a unique school/code index.
- **ClassSubject** — tenant/session/class/subject mapping and optional teacher, uniquely assigned per class/session.
- **ClassTeacherAssignment** — tenant/session/section/teacher mapping, with one class teacher per section/session.
- **TimetableEntry** — tenant/session/section/class-subject/teacher and weekly period; unique tenant-scoped indexes prevent section, teacher, and room conflicts for the same period slot.
- **Student** — school-unique admission number, profile/status, and current session/class/section/branch placement.
- **Guardian** — school-owned guardian contact record.
- **StudentGuardian** — tenant-scoped student/guardian association and one primary guardian per student.
- **StudentAcademicHistory** — append-only admissions, promotions, internal transfers, withdrawals, and graduation events with placement snapshots.
- **StudentLeavingCertificate** — one tenant-scoped leaving-certificate snapshot per terminal student, with unique school-level certificate numbers and issuer attribution.
- **StudentAttendance** — tenant-scoped student/day status, wall-clock check-in/out, and section/session references; unique per student per day.
- **StaffAttendance** — tenant-scoped staff/day status and wall-clock check-in/out; unique per staff member per day.
- **FeeCategory** — tenant-unique category codes for school fee line items.
- **FeeStructure** — tenant/session/class fee definitions, frequencies, due rules, currency, and category line items.
- **StudentFeeAssignment** — one tenant-scoped structure assignment per student with fixed or basis-point scholarship discount and covered periods.
- **FeeVoucher** — immutable line-item/discount snapshot per assignment and billing period, with paid/balance totals and a unique period constraint.
- **FeePayment** — append-only manual payment transaction with immutable fields, unique receipt number, tenant idempotency key, collector attribution, and voucher/student references.
- **Exam** — tenant/session/class exam schedule, per-class-subject maximum/pass marks, lifecycle status, and a grading scale covering 0–100%.
- **ExamMark** — tenant/exam/student/class-subject marks and entered-by attribution; unique per student and scheduled subject.
- **CalendarEvent** — tenant/branch-targeted dated school event with audience roles and creator attribution.
- **InventoryItem** — tenant-unique SKU with stock count, reorder threshold, and storage location.
- **InventoryTransaction** — immutable tenant-scoped received/issued stock ledger entries.
- **FixedAsset** — school-unique asset tag, acquisition cost/currency, salvage value, straight-line useful life, status, and assignment revision for concurrent assignment/disposal serialization.
- **FixedAssetAssignment** — immutable assigned/released event log for same-school users or enrolled students; current assignment is derived from the latest event.
- **FixedAssetDepreciation** — immutable monthly depreciation entry, accumulated depreciation, actor, and unique tenant/asset/period key.
- **LibraryBook** — tenant library catalog item with total and available copy counts.
- **LibraryLoan** — tenant-scoped student issue/return record, unique active loan per student/book, and due-date index.
- **Announcement** — tenant-scoped in-app announcement with audience roles, publication/expiry window, and creator.

Branches remain embedded subdocuments in `School` rather than duplicated in a separate collection. Academic branch references use the embedded branch `_id`, and services verify the branch belongs to the authenticated school's document. `Section.enrolledCount` is adjusted atomically with student admissions, placements, and status changes; before enabling these workflows in an existing database, backfill it from enrolled student records.

Every school-owned operational collection must include a required `schoolId` reference and a compound index beginning with `schoolId` for tenant-specific lookups and uniqueness. Child records must validate that referenced parent records belong to the same school. Do not accept a school ID as an authorization source from a request.

## Authentication and tenant boundaries

Access tokens identify a user and persisted session, not an authoritative tenant. Authentication reloads the user, checks account status and the persisted session, resolves the school from the user record, and enforces trial/subscription status. A school's `subscription.planId` resolves the current plan; the plan's feature flags are checked at each feature-gated route, and resource caps are checked transactionally against tenant records. School routes require a matching tenant context. Query filters are constructed from that authenticated context (`tenantFilter`), with the trusted `schoolId` taking precedence over caller-supplied filter keys.

Roles: `platform_super_admin`, `school_admin`, `principal`, `teacher`, and `parent`. The permission middleware maps school roles to explicit capabilities; only a school admin can currently update the school profile. Platform actions require the explicit `platform:manage` permission and are not exposed as public school routes. Super-admin provisioning and every future platform operation require a controlled, audited operator workflow.

The implemented admin audit events are school registration, school-profile updates, successful platform super-admin sign-in, academic/branch create, update, transition, assignment, archive, and delete operations, and student/user/guardian admission, placement, status, profile, and relationship changes. These are persisted with the corresponding transaction. Add audit events in the same transaction as future sensitive writes.

## Operational requirements

Use a MongoDB Atlas replica set for transactional onboarding, school-profile/audit, attendance, finance voucher/payment, and exam scheduling/marks/publication writes. Production index creation is an explicit deployment responsibility (`autoIndex` is disabled in production). Back up and review duplicate data, then run `npm run db:indexes` with the target `MONGO_URI`; it only creates declared indexes and does not drop collections or indexes. Resolve failed unique-index builds before application deployment.

Finance amounts are integer minor units (for example cents), never floating-point currency values. Payment collection is offline/manual only; the transaction record and voucher balance update commit atomically. Payment documents are immutable through the application and idempotency keys prevent duplicate collection retries. Overdue reminder delivery requires an email adapter and an external scheduler; neither is configured.

Fixed-asset depreciation records use straight-line allocation in integer minor units and must be posted sequentially from the acquisition month. Asset assignment/release and depreciation records are append-only. A production financial policy should additionally confirm capitalization thresholds, useful-life accounting rules, disposal accounting, and fiscal-period close controls.

Parent self-service resolves same-school guardian records by the authenticated parent's normalized email and then traverses `StudentGuardian` links. Parent portal endpoints query the resulting student IDs and still constrain every child read by school ID. They do not accept guardian or school identifiers as authorization input.

Password recovery and email verification action tokens are random, hashed before persistence, expire after 30 minutes, and are consumed together with the corresponding account update in a MongoDB transaction. Password reset revokes outstanding refresh sessions. Email delivery is an explicit provider interface; no provider or delivery credentials are configured. Recovery/verification requests do not create or expose tokens when delivery is unavailable.
