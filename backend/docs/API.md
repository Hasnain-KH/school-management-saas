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
| GET | `/auth/me` | Access token | — |

School registration atomically creates the school, its first school-admin account, a 14-day trial, an initial main branch, an audit event, and a persisted token session. MongoDB transactions are required. The registration/login response contains an access token and a refresh token; store tokens securely and use HTTPS.

Refresh tokens rotate on use. Both access and refresh tokens are backed by a persisted session, so logout or rotation invalidates the corresponding access token immediately. Refresh tokens are stored only as SHA-256 digests. Access tokens expire after 15 minutes by default; refresh tokens expire after 7 days.

## School profile

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/schools/me` | Authenticated school member | — |
| PATCH | `/schools/me` | School admin | At least one of `name`, `phone`, `address`, `settings.attendanceLateGraceMinutes`, `settings.attendanceStartTime` |

Profile writes use the authenticated user's school ID in the database filter. Client-provided tenant IDs are rejected by strict validation. Administrative profile updates are recorded in the audit collection.

## Academic setup

All routes below require an authenticated school user and a matching server-derived tenant. School admins and principals can manage academics; teachers can read academic data. IDs and query filters are always constrained to the authenticated school.

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

These routes require authentication and a school tenant. School admins can create/update staff and parent user accounts; only school admins can manage user accounts. Account creation requires a password supplied by the administrator; no email invitation/reset workflow exists yet. School admins and principals can manage student admissions, placement, guardian links, and status. Teachers and parents do not currently have student-record access because class-scoped teacher/guardian authorization is not yet implemented.

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

## Limits and status codes

The API has a global rate limit of 300 requests per IP per 15 minutes; authentication routes allow 10 per IP per 15 minutes. Common statuses: `200` success, `201` created, `400` invalid input, `401` missing/invalid credentials, `403` forbidden or inactive tenant, `404` unknown resource/route, `409` duplicate school slug, `413` body too large, and `429` rate limit exceeded.

Finance, exams/results, notifications, calendar, inventory, library, analytics, platform subscription management, and document uploads are not implemented yet.
