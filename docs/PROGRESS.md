# SchoolFlow UI/UX Redesign Progress

## Phase 0 — UI/UX Audit

**Status:** Complete  
**Date:** 2026-11-21  
**Repository state at start:** clean working tree on `main` at `a2ec9df feat: complete SchoolFlow development updates`  
**Application source changes in Phase 0:** none  
**Only file created/changed:** `docs/PROGRESS.md`

Line references below refer to the audited commit `a2ec9df` and may shift during implementation.

---

## 1. Scope and method

Phase 0 was a read-only audit of the complete frontend:

- Entry points, routing, guards, auth context, and API client.
- Shared components, global stylesheet, build/dev configuration, and test configuration.
- Every page under `frontend/src/pages/`, including the large multi-module `WorkspacePage.jsx`.
- Frontend unit tests and Playwright specs used to identify protected behavior.
- Root, frontend, and backend package manifests for exact commands and dependencies.
- No backend source, API, database, auth, role, route, state, validation, or business-logic file was modified.

Runtime verification was performed without changing the repository:

- Frontend unit tests: run.
- Backend unit/integration suite: run.
- Production build: run with output redirected to a temporary directory outside the repository so `frontend/dist/` was not touched.
- Browser-level visual QA at 360/768/1280/1920px: not performed in Phase 0; planned for Phase 5.

---

## 2. Frontend inventory

### 2.1 Structure

| Area | Files |
|---|---|
| Bootstrap/routing | `frontend/src/main.jsx`, `frontend/src/App.jsx` |
| Auth/session | `frontend/src/auth/AuthProvider.jsx`, `frontend/src/api/client.js`, `frontend/src/utils/email-verification.js` |
| Shared components | `frontend/src/components/ConfirmDialog.jsx`, `ErrorBoundary.jsx`, `feedback.jsx`, `Modal.jsx`, `NotificationBell.jsx`, `PortalShell.jsx`, `RowMenu.jsx`, `SchoolLogo.jsx` |
| Pages | `AcademicSetupPage.jsx`, `AuthPage.jsx`, `BillingPage.jsx`, `DashboardPage.jsx`, `DocumentsPage.jsx`, `FixedAssetsPage.jsx`, `NotificationsPage.jsx`, `PlatformRevenuePage.jsx`, `SchoolLogoManager.jsx`, `VerifyEmailPage.jsx`, `WorkspacePage.jsx` |
| Pure helpers | `frontend/src/utils/academic-setup.js`, `attendance-roster.js`, `exam-payload.js`, `export.js`, `finance-workflows.js`, `school-logo.js` |
| Styling | `frontend/src/styles.css` |
| Tests | `frontend/test/*.test.js`, `frontend/e2e/*.spec.js`, `frontend/e2e-real/real-workflow.spec.js` |

### 2.2 Routes

Guest routes (`App.jsx:43–48`):

- `/login` — `AuthPage mode="login"`
- `/register` — `AuthPage mode="register"`
- `/forgot-password` — `AuthPage mode="recovery"`
- `/reset-password` — `AuthPage mode="reset"`
- `/verify-email` — `VerifyEmailPage`
- `/resend-verification` — `AuthPage mode="resend"`

Protected routes under `PortalShell` (`App.jsx:49–74`):

| Path | Page/module |
|---|---|
| `/` | `DashboardPage` |
| `/students` | `WorkspacePage page="students"` |
| `/staff` | `WorkspacePage page="staff"` |
| `/academics` | `WorkspacePage page="academics"` |
| `/attendance` | `WorkspacePage page="attendance"` |
| `/finance` | `WorkspacePage page="finance"` |
| `/exams` | `WorkspacePage page="exams"` |
| `/inventory` | `WorkspacePage page="inventory"` |
| `/assets` | `FixedAssetsPage` |
| `/library` | `WorkspacePage page="library"` |
| `/calendar` | `WorkspacePage page="calendar"` |
| `/announcements` | `WorkspacePage page="announcements"` |
| `/notifications` | `NotificationsPage` |
| `/documents` | `DocumentsPage` |
| `/reports` | `WorkspacePage page="reports"` |
| `/audit` | `WorkspacePage page="audit"` |
| `/subscriptions` | `WorkspacePage page="subscriptions"` |
| `/billing` | `BillingPage` |
| `/school` | `WorkspacePage page="school"` |
| `/my-children` | `WorkspacePage page="my-children"` |
| `/platform` | `WorkspacePage page="platform"` |
| `/platform/plans` | `WorkspacePage page="platform/plans"` |
| `/platform/revenue` | `PlatformRevenuePage` |
| `/platform/audit` | `WorkspacePage page="platform/audit"` |

Unknown paths redirect to `/` (`App.jsx:75`).

### 2.3 Roles

Canonical role strings:

- `platform_super_admin`
- `school_admin`
- `principal`
- `teacher`
- `parent`

Role sets (`App.jsx:32–35`):

- `adminRoles`: `school_admin`, `principal`
- `staffRoles`: `school_admin`
- `classRoles`: `school_admin`, `principal`, `teacher`
- `allSchoolRoles`: `school_admin`, `principal`, `teacher`, `parent`
- Inline single-role gates: `school_admin` for billing, `parent` for my-children, `platform_super_admin` for platform routes.

Role navigation groups are defined in `PortalShell.jsx:12–31`:

| Role | Navigation groups and destinations |
|---|---|
| Platform admin | Platform: Overview, Plans, Revenue, Audit log |
| School administrator | Workspace: Overview, Students, People, Academics, Attendance; School operations: Fees & finance, Exams & results, Inventory, Fixed assets, Library, Calendar, Announcements, Notifications, Documents, Reports; Administration: Subscription, Billing history, School profile, Audit log |
| Principal | Workspace: Overview, Students, Academics, Attendance; School operations: Fees & finance, Exams & results, Inventory, Fixed assets, Library, Calendar, Announcements, Notifications, Documents, Reports |
| Teacher | My classroom: Overview, Attendance, Timetable, Exams & results, Calendar, Announcements, Notifications, Documents |
| Parent | Family: Overview, My children, School calendar, Announcements, Notifications, Documents |

All destinations, labels, and role visibility are protected behavior and must remain unchanged.

### 2.4 Page responsibilities

- `DashboardPage.jsx`: role-specific overview for parent, teacher, school, and platform roles; KPI cards, charts, timetable/school summary, quick actions.
- `WorkspacePage.jsx`: the largest module; generic CRUD directories plus embedded attendance, finance, exams, reports, subscriptions, school profile/logo, and parent-record workflows.
- `AcademicSetupPage.jsx`: sessions, classes, sections, subjects, class-subject assignments, and timetable.
- `AuthPage.jsx`: login, registration, recovery, reset, and resend modes.
- `VerifyEmailPage.jsx`: single-use email verification confirmation.
- `BillingPage.jsx`: school payment history.
- `PlatformRevenuePage.jsx`: platform revenue reporting and manual payment recording.
- `FixedAssetsPage.jsx`: asset register, assignment/release, depreciation, disposal, and history.
- `NotificationsPage.jsx`: notification list and mark-read actions.
- `DocumentsPage.jsx`: document upload/list/download/delete.
- `SchoolLogoManager.jsx`: school logo upload/remove panel mounted from `/school`.

---

## 3. Current design system

### 3.1 Color and theme

`frontend/src/styles.css:12–96` is the single token block. Current direction:

- Brand: `--brand #4c6ef5`, with darker/stronger/soft variants and blue glow.
- Neutrals: `--ink #17233c`, `--text #38455e`, `--muted #64728a`, `--line #e7ebf2`, `--surface #ffffff`, `--surface-2 #f8fafd`, `--bg #f5f7fb`.
- Semantics: success `#12855f`, warning `#b1731d`, danger `#c8444f`, info `#2f6fbd`, violet `#7c5cd6`, each with soft/line variants.
- Layout: sidebar `264px`, collapsed sidebar `78px`, topbar `64px`.
- Theme: `color-scheme: light` only (`styles.css:18`). No `[data-theme]`, `.dark`, or `prefers-color-scheme` styles exist.

This is already token-driven in many places, but it does not match the requested restrained neutral palette and deep slate/navy sidebar. It also contains many off-token hardcoded colors, for example:

- Brand gradient and glow: `#6b86f8`, `#4353c5` (`styles.css:130`, `:367`).
- Non-token green: `#22b07d` (`:182–183`).
- Non-token purple profile avatar: `#7a4fc4` (`:185`).
- Non-token danger variants: `#e0626e`, `#a53b45`, `#a97077`, `#e0454f`, `#b23a45` (`:296`, `:462`, `:508–509`, `:669`).
- Auth story palette: multiple hardcoded navy/lavender values (`:531–547`).
- Recharts colors: `#edf0f5`, `#8290a5`, `#f6f8fc`, `#4c6ef5` (`DashboardPage.jsx:141`, `:174`).

### 3.2 Typography

- Font stack declares `Inter` first (`styles.css:13`) but `Inter` is never loaded; `index.html:1–14` has no font link or `@font-face`.
- `font-synthesis: none` (`:14`) combined with many nonstandard weights (`450`, `540`, `560`, `620`, `640`, `660`, `680`, `720`, `750`, `760`) makes rendering platform-dependent.
- Fluid headline sizes exist for page titles, metrics, and auth story (`:275`, `:349`, `:539`).
- Broad `text-transform: capitalize` is used on labels, badges, tabs, raw keys, and data values (`:153`, `:245`, `:315`, `:475`, `:496`, `:588`, `:606`, `:639`, `:643`, `:647`), which can distort identifiers and snake_case values.

### 3.3 Spacing, radii, shadows, motion

- No spacing scale tokens; spacing is literal px across 6–32px.
- Radii are partly tokenized (`--r-xs` through `--r-pill`) with a few hardcoded values.
- Six shadow tokens plus many literal glows/rings; modal and auth visuals are comparatively heavy.
- Motion tokens exist: `--t-fast .13s`, `--t-base .2s`, `--t-slow .32s`.
- Keyframes include rise, fade, scale, pop, slide-down, pulse, spin, and shimmer; several cards use staggered delays.
- `prefers-reduced-motion` is present and broad (`styles.css:801–809`), but some instant active-state transforms remain.
- Tailwind is imported in `styles.css:1` and configured in `vite.config.js:3,6`, but no Tailwind utility classes were found in `frontend/src`; its preflight coexists with the hand-written reset.

### 3.4 Icons and feedback

- `lucide-react@^0.468.0` is installed (`frontend/package.json:14`) and used broadly. It is suitable as the single icon system.
- Competing icon techniques remain: CSS data-URI select arrow (`styles.css:451`), Unicode power glyph for collapsed sign-out (`:219`), `×` notice dismiss (`feedback.jsx:24`), and text `✓`/`×` feature chips (`WorkspacePage.jsx:920`).
- Shared feedback primitives (`LoadingState`, `ErrorState`, `EmptyState`, `Notice`, `SkeletonRows`) provide roles/live regions and consistent class names.

---

## 4. Top 15 visual/UX problems

Severity is based on visual impact across roles/modules. “Scope” indicates whether a fix should be CSS-only, presentation JSX/CSS, or requires behavior/approval.

| # | Problem | Evidence | Impact | Scope |
|---|---|---|---|---|
| 1 | Current palette is too bright/saturated and the sidebar is white rather than deep slate/navy. Blue/violet/green/amber tiles compete for attention. | `styles.css:21–58`, `:119–122`, `:341–347`; `DashboardPage.jsx:194–195` | Product does not read as calm premium B2B SaaS. | CSS-only |
| 2 | Decorative gradients, translucent blur, and heavy shadows are used in core surfaces. | Brand mark `:128–131`, topbar `:236–239`, welcome panel `:366–367`, auth story `:528–533`, modal backdrop `:483–490` | Visual noise; conflicts with restrained direction. | CSS-only |
| 3 | Typography is unreliable: `Inter` declared but not loaded, `font-synthesis: none`, and many nonstandard weights. | `styles.css:13–14`; `index.html:1–14` | Inconsistent hierarchy and weight across platforms. | CSS-only |
| 4 | No spacing scale; card, page, form, table, and modal spacing are all literal and inconsistent. | `styles.css:272`, `:353`, `:404`, `:417`, `:456–458`, `:495–498`, responsive `:701–790` | Uneven rhythm and density between modules. | CSS-only |
| 5 | No dark theme support, and many hardcoded light surfaces/overlays would not adapt. | `styles.css:18`, `:238–239`, `:485`, `:531`, `:728` | Cannot satisfy dark/light requirement by token swap alone. | CSS token refactor |
| 6 | Token leakage: many off-palette duplicates and raw status/data colors. | `styles.css:130`, `:182–185`, `:296`, `:462`, `:508–509`, `:669`; `DashboardPage.jsx:141`, `:174` | Inconsistent semantics and hard-to-maintain styling. | CSS + presentational chart props |
| 7 | Sidebar is dense and visually flat: 19 school-admin links across three groups in a narrow white rail; active state relies on a thin bar and soft tint. | `PortalShell.jsx:12–31`, `:104–109`; `styles.css:156–174` | Navigation scannability is weak for high-privilege roles. | CSS-only; preserve links/visibility |
| 8 | Collapsed-sidebar mobile reset uses `display: revert`, which can break authored flex/grid layouts when a collapsed preference persists. | `styles.css:714–723`; `PortalShell.jsx:54–56`, `:72–74` | Broken sidebar layout at 768px/360px for some users. | CSS-only |
| 9 | Dashboard presentation is templated: four similarly shaped tone-colored KPIs, repeated chart configuration, and quick actions that duplicate sidebar links. | `DashboardPage.jsx:21–27`, `:107–112`, `:132–137`, `:165–170`, `:206–212` | Low visual hierarchy and weak role-specific differentiation. | CSS + presentation JSX; no invented data |
| 10 | Data tables are dense and horizontally constrained: `white-space: nowrap`, 13px cells, 8–9 column tables, sticky header only, narrow scroll affordance. | `styles.css:413–426`; `WorkspacePage.jsx:155`, `:314`, `:928–935` | Poor scanning and tablet/mobile readability; horizontal scrolling. | CSS-only for layout; raw-ID formatting needs approval |
| 11 | Forms and modals are cramped: 2-column grids inside a 560px modal, nested scroll on small screens, mixed 40/44px field heights, native file input. | `styles.css:441–458`, `:487–498`, `:731–770`; `DocumentsPage.jsx:92` | Multi-step workflows feel dense and error-prone on mobile. | CSS/presentation only |
| 12 | Feedback/empty states are visually heavy and inconsistent; some notices use undefined variants; unread state relies mainly on color. | `styles.css:503–525`, `:520–524`, `:674–677`; `feedback.jsx:18–25` | Weak state communication and inconsistent whitespace. | CSS/presentation only |
| 13 | The icon system is mixed: Lucide plus CSS chevron, Unicode power mark, `×`, `✓`/`×`, and an incorrect money icon on “Save attendance.” | `styles.css:219`, `:451`; `feedback.jsx:24`; `WorkspacePage.jsx:280`, `:920`, `:1101` | Ambiguous affordances and inconsistent visual language. | CSS + presentation JSX |
| 14 | Motion is too varied: 130/200/320ms transitions, staggered entrances, hover lifts, pulse, shimmer, and instant active transforms. | `styles.css:79–95`, `:329–392`, `:504–520`, `:686–698`, `:801–809` | Less calm than target; reduced-motion coverage incomplete. | CSS-only |
| 15 | Accessibility polish is inconsistent: focus-visible changes border radius globally, modal focus outline is removed, menu keyboard semantics are incomplete, and some icon-only buttons lack discoverability labels. | `styles.css:793–798`; `Modal.jsx:53–55`; `PortalShell.jsx:97–98`, `:116`, `:119`, `:125–130`; `RowMenu.jsx:44–46` | Keyboard/AT experience is not uniformly premium. | CSS + optional presentation attributes; arrow-key behavior needs approval |

---

## 5. Protected functional code

The following areas are behavior-bearing and must not be changed during the redesign.

### 5.1 Routing, auth, and API

- `App.jsx:17–39`: `Protected`, `Guest`, role allow-lists, and `WorkspaceRoute`.
- `App.jsx:42–76`: route table, lazy loading, and redirect behavior.
- `AuthProvider.jsx:7–64`: `user`/`school`/`loading` state, session-expired event, CSRF bootstrap, sign-in/register/sign-out, context value.
- `api/client.js:1–109`: API base URL, token cleanup, CSRF handling, cookie credentials, single-flight refresh, 401 retry, error envelope parsing, verb helpers, query construction.
- `main.jsx:8–15`: router/provider nesting and StrictMode.

### 5.2 Shell and shared components

- `PortalShell.jsx:61–90`: role group derivation, breadcrumb computation, collapse persistence, menu dismissal, logout navigation.
- `PortalShell.jsx:104–130`: navigation destinations, `NavLink` behavior, notification-bell condition, account links, and logout action.
- `Modal.jsx:10–51`: focus trap, Escape handling, body scroll lock, focus restoration.
- `RowMenu.jsx:14–41`: click-outside/Escape handling and fixed positioning used to escape table clipping.
- `NotificationBell.jsx:11–29`: unread-count endpoint, polling, and custom event handling.
- `SchoolLogo.jsx:8–10`: versioned tenant logo URL and cache busting.
- `feedback.jsx:3–31`: existing role/live-region attributes and loading/error/empty behavior.

### 5.3 Page and module logic

- `DashboardPage.jsx:21–27` and `:38–77`: role-specific quick actions, data sources, and dashboard dispatch.
- `WorkspacePage.jsx:20–30`, `:143–226`: page config, role permissions, role-specific fetches, and module dispatch.
- Attendance roster/status/check-in payload rules (`attendance-roster.js`).
- Fee payment idempotency, minor-unit conversion, assignment/voucher workflows (`finance-workflows.js`, `WorkspacePage.jsx`).
- Exam validation, publish rules, teacher marks scope (`exam-payload.js`, `WorkspacePage.jsx`).
- Report type/endpoint/filter/column maps and export behavior (`WorkspacePage.jsx`, `export.js`).
- Platform plan/suspension/subscription rules and default-trial protections.
- `RowActionModal` hidden `isActive` input workaround (`WorkspacePage.jsx:1086–1096`).
- `AcademicSetupPage.jsx`: session activation, class-subject upsert, timetable reference rules.
- `DocumentsPage.jsx`: MIME/size validation, base64 upload, signed URL download, tenant-scoped endpoints.
- `FixedAssetsPage.jsx`: straight-line depreciation payload, active-status action guards, disposal confirmation.
- `NotificationsPage.jsx`: mark-read idempotency and `schoolflow:notifications-changed` event.
- `SchoolLogoManager.jsx`: magic-byte validation, object URL revocation, `refreshIdentity()` after mutation.
- Pure helper contracts covered by `frontend/test/*.test.js`.

No backend source, service, controller, route, model, migration, validator, or test was inspected with the intent to modify, and none was modified.

---

## 6. Issues that require approval before any change

These are genuine UX/functional issues found during the audit. They are **not** included in the visual redesign plan because fixing them would alter render conditions, state, handlers, or data behavior.

1. `ParentChildren` renders nothing when a parent has zero linked children (`WorkspacePage.jsx:1007–1021`). Adding an empty state changes a render condition.
2. Attendance defaults every roster row to `present` and has no unsaved-changes warning (`WorkspacePage.jsx:277–280`). Changing defaults or adding warnings alters workflow behavior.
3. “Mark all read” is disabled when unread notifications exist only on other pages (`NotificationsPage.jsx:77`, `:87`). Fixing this changes state/handler behavior.
4. Academic setup performs duplicate timetable requests (`AcademicSetupPage.jsx:78–81`, `:102–112`). Fixing this changes data fetching.
5. Fee workflow “Retry” can call the wrong loader (`WorkspacePage.jsx:448`). Fixing this changes an event handler.
6. Report filters can remain stale when switching report types (`WorkspacePage.jsx:702–707`). Fixing this changes state handling.
7. Finance table headers and cells use different visibility predicates (`WorkspacePage.jsx:314`). Aligning them changes table render logic.
8. Several pages expose raw IDs/references (parent results, revenue school IDs, asset history, audit tables). Friendly labels would require data mapping or API changes.
9. `monthKey()` uses UTC (`DashboardPage.jsx:18`), so month boundaries can differ from the user’s local date. Fixing this changes data semantics.
10. Dashboard totals can mix currencies in detail text while displaying one currency value (`DashboardPage.jsx:160–169`); platform revenue shows only `totals[0]` (`:102–111`). Fixing this changes aggregation/presentation logic.
11. Signed document download uses `window.open()` after `await` (`DocumentsPage.jsx:145–146`). Changing to an anchor-based flow changes handler behavior.
12. Popup menus use `role="menu"` without full arrow-key/Home/End semantics (`PortalShell.jsx:126–130`, `RowMenu.jsx:44–46`). Full compliance requires interaction behavior changes.
13. Several button attributes and ARIA details could be improved, but the mission requires preserving existing accessibility attributes; additions should be explicitly approved.

---

## 7. Exact commands

### Root (`package.json`)

- Dev: `npm run dev`
- Build: `npm run build` → frontend Vite build
- Test: `npm test` → backend `node --test`

### Frontend (`frontend/package.json`)

- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Unit tests: `npm test`
- E2E: `npm run test:e2e`

### Backend (`backend/package.json`)

- Dev: `npm run dev`
- Start: `npm start`
- Build: `npm run build` (no build step)
- Test: `npm test`
- Redis integration: `npm run test:redis:integration`
- Mongo integration: `npm run test:mongo:integration`
- Cloudinary smoke: `npm run smoke:cloudinary`
- Storage inventory: `npm run inventory:storage`

### Lint/typecheck

- No lint script or config found (`eslint`, `biome`, etc.).
- No TypeScript config or typecheck script found.
- The project is JavaScript/JSX only.

---

## 8. Baseline verification results

Commands executed during Phase 0:

| Command | Result |
|---|---|
| `npm test --workspace frontend` | **PASS** — 28 tests, 28 passed, 0 failed, 0 skipped |
| `npm test --workspace backend` | **PASS** — 180 tests, 177 passed, 0 failed, 3 skipped |
| `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase0-build" --emptyOutDir` from `frontend/` | **PASS** — 2,236 modules transformed, build completed successfully |

Notes:

- The backend suite emits expected diagnostic logs for unconfigured email/rate-limit providers; these tests still pass and no secrets were displayed.
- The canonical `npm run build` was not used because it writes `frontend/dist/`; the temporary-output build verified the same Vite compilation without modifying build output.
- E2E tests were not run in Phase 0 because they require browser/server setup and belong to Phase 5 QA.

---

## 9. Controlled implementation plan

### Phase 1 — Design system

- Replace the current token block with the approved neutral light/dark palette and one muted accent.
- Add spacing, typography, elevation, radius, and z-index tokens.
- Normalize typography to the existing system font stack; do not add a font dependency without approval.
- Remove or neutralize unused Tailwind import only after verifying the custom reset covers all base styles.
- Standardize component primitives in `styles.css`: buttons, inputs, badges, cards, tables, modals, tabs, notices, skeletons, empty states.
- Keep every existing class name used by JSX unless a coordinated presentation-only rename is proven safe.
- Add `@media (prefers-color-scheme: dark)` support using tokens only; do not add a theme setting.

### Phase 2 — Shell and authentication

- Restyle sidebar as deep slate/navy with restrained active/hover states; preserve every role destination and label.
- Fix the collapsed-sidebar mobile reset in CSS.
- Simplify topbar: solid surface, improved breadcrumb/action hierarchy, no glass blur.
- Restyle account menu, notification bell, and status presentation without changing their handlers/events.
- Simplify auth story to a calm neutral editorial panel; preserve all form names, validation attributes, links, messages, and submit logic.
- Preserve SchoolFlow wordmark and school logo rendering.

### Phase 3 — Dashboards

- Establish one calm KPI pattern with neutral surfaces and semantic color only for status.
- Normalize chart colors through tokens and keep chart data unchanged.
- Improve chart/summary/timetable hierarchy without inventing statistics.
- Keep role-specific dashboard data sources and quick-action destinations unchanged.

### Phase 4 — Existing modules

Controlled batches of 3–4 pages:

1. Students, staff, academics, attendance.
2. Finance, exams, reports, fixed assets.
3. Inventory, library, calendar, announcements.
4. Notifications, documents, subscriptions, billing.
5. School profile/logo, platform overview, platform plans, platform revenue/audit, parent children.

For each batch:

- Restyle existing tables, filters, forms, modals, and action menus only.
- Preserve columns, fields, IDs, names, labels, callbacks, endpoints, and validation.
- Do not fix the approval-required issues in section 6 without explicit instruction.

### Phase 5 — Final QA

- Visual review at 360px, 768px, 1280px, and 1920px.
- Check horizontal overflow and keyboard focus across all roles.
- Run frontend unit tests, backend tests, production build, and available E2E specs.
- Review the final diff specifically for accidental business-logic changes.
- Confirm light/dark presentation and reduced-motion behavior.

---

## 10. Functional risk assessment

**Current Phase 0 risk:** none to functionality; no application source was changed.

**Implementation risk:** medium if global CSS changes are made without class-by-class verification, because a single stylesheet drives every role and module. Controls:

- Change tokens and component rules first; avoid structural JSX changes where CSS can achieve the result.
- Where presentation JSX is needed, change only icons, wrappers, class names, or static copy—never handlers, state, props, form bindings, or ARIA attributes that tests and users rely on.
- Run the frontend/backend suites and temporary production build after each batch.
- Stop and report if a desired visual result requires any item from section 6.

---

## 11. Approvals needed before implementation

1. Confirm the final muted blue accent value and exact slate/navy sidebar treatment for light/dark themes.
2. Confirm dark mode should follow the OS `prefers-color-scheme` automatically, with no new theme-setting UI.
3. Confirm whether to remove the unused Tailwind import/preflight during Phase 1.
4. Confirm whether the approval-required functional/UX issues in section 6 should remain out of scope.

---

## 12. Phase 0 report summary

1. **Files inspected:** all frontend entry/routing/auth/API files, all shared components, all pages, all utilities, the global stylesheet, all frontend test specs, and root/frontend/backend manifests/configs.
2. **Files changed:** `docs/PROGRESS.md` only.
3. **Completed:** full route/role/component/page inventory; current design-system audit; top 15 visual/UX problems; protected-code map; exact commands; baseline test/build verification; controlled implementation plan.
4. **Tests/build:** frontend 28/28 pass; backend 177 pass, 0 fail, 3 skipped; temporary production build pass.
5. **Functional risks:** none in Phase 0; implementation risks and controls documented above.
6. **Approvals needed:** accent/theme details, OS-driven dark mode, unused Tailwind removal, and scope decision for section 6.
7. **Backend/business logic confirmation:** no backend source or business logic was modified; no API, DB, auth, role, route, state, validation, handler, or workflow behavior was changed.
8. **Next recommended phase:** Phase 1 — Design System, after approval to proceed.

---

## Phase 1 — Design System Foundation

**Status:** Complete  
**Date:** 2026-11-21  
**Source changes:** `frontend/src/styles.css` only  
**Documentation created/updated:** `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md`  
**Git action:** none; no commit, push, reset, branch switch, or destructive command was used

### 1. Approved decisions applied

1. Muted blue is the single primary accent: light `--brand #2f5d8c`, dark `--brand #93b9e8`.
2. Dark mode is automatic through `@media (prefers-color-scheme: dark)`; no toggle, setting, or persisted theme state was added.
3. `@import "tailwindcss";` remains the first line of `frontend/src/styles.css`, and Tailwind Preflight remains active.
4. All functional/business-logic issues in Phase 0 section 6 remain out of scope and untouched.

### 2. Work completed

- Replaced the token block with final light tokens and a complete dark override block.
- Established neutral surfaces, borders, text roles, semantic status colors, one accent, and theme-aware overlay/tooltip/scrollbar/selection/select-arrow tokens.
- Added typography tokens (`--font-sans`, `--font-mono`, size/weight/line-height scales) and normalized all numeric `font-weight` values in the stylesheet to the four defined weights.
- Added a 4px-based spacing scale, radius aliases, elevation aliases, layout tokens, and z-index tokens.
- Reduced motion tokens to `150ms`, `180ms`, and `200ms` durations with one easing curve.
- Replaced remaining theme-breaking literals for buttons, inputs, focus borders, required markers, error panels, skeletons, modals, notification badges, report errors, mobile scrim, welcome symbol, school avatars, nav icons, and status dots with tokens.
- Fixed global `:focus-visible` so it no longer mutates border radius; modal focus now uses `:focus-visible` and keeps a visible outline.
- Extended `prefers-reduced-motion: reduce` to active-state transforms and collapsed tooltip movement.
- Kept every existing class name, SchoolFlow wordmark, tenant school name/logo rendering, and protected behavior intact.

### 3. Token coverage

| Check | Result |
|---|---:|
| Root tokens defined | 118 |
| Dark-mode overrides defined | 56 |
| Undefined `var()` references | 0 |
| Theme-sensitive root tokens missing a dark override | 0 |

Non-overridden root tokens are intentionally structural: typography, spacing, radii, layout, stacking, and motion tokens.

### 4. Contrast verification

WCAG 2.1 contrast was computed from the final CSS token values using a local Node script.

| Theme | Pairs checked | Minimum ratio | Result |
|---|---:|---:|---|
| Light | 32 | `4.65` (`--faint` on `--surface-3`) | All pass AA (≥ 4.5:1) |
| Dark | 32 | `4.78` (`--faint` on `--surface-3`) | All pass AA (≥ 4.5:1) |

Checked pairs cover text roles on every neutral surface, brand text on tinted surfaces, all semantic status colors on their soft/page surfaces, and filled-button/tooltip/selection foreground-background pairs.

### 5. Reduced-motion verification

The `prefers-reduced-motion: reduce` block was verified in `frontend/src/styles.css`:

- All animations and transitions are forced to `0.01ms` with one iteration.
- Scroll behavior is set to `auto`.
- Card hover lifts, button/nav/icon active transforms are reset to `none`.
- Collapsed-navigation tooltips keep vertical centering without sliding.

### 6. Phase 1 verification results

| Command / check | Result |
|---|---|
| `npm test --workspace frontend` | **PASS** — 28 tests, 28 passed, 0 failed, 0 skipped |
| `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase1-build" --emptyOutDir` from `frontend/` | **PASS** — 2,236 modules transformed; CSS emitted at 60.31 kB |
| Light/dark token coverage | **PASS** — 0 undefined variables; no theme-sensitive token missing an override |
| Contrast | **PASS** — 64/64 checked pairs meet AA |
| Reduced motion | **PASS** — animation, transition, and active-transform rules present |
| Diff review | **PASS** — only `frontend/src/styles.css` plus documentation changed; no API, route, auth, permission, state, handler, validation, workflow, test, or backend file changed |
| Tailwind preservation | **PASS** — `@import "tailwindcss";` remains first line; Preflight untouched |

### 7. Functional risk assessment

**Phase 1 functional risk:** none observed. The application source diff is CSS-only. No component was removed, no feature was added, no dependency was introduced, and no existing class contract was broken.

### 8. Remaining issues / deliberate deferrals

1. The sidebar still uses a light neutral surface. The approved deep slate/navy direction is deliberately deferred to Phase 2 — Shell and Authentication.
2. The authentication story panel keeps its self-contained navy editorial palette until Phase 2.
3. Component-level spacing literals remain in place; the 4px scale is now available for later phase migration.
4. Dashboard, sidebar, authentication, and module layouts were not redesigned.
5. E2E/browser visual QA remains scheduled for Phase 5.
6. Approval-required functional/UX issues in Phase 0 section 6 remain untouched.

### 9. Phase 1 report summary

1. **Changed files:** `frontend/src/styles.css`, `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md`.
2. **Application source changed:** one stylesheet; presentation only.
3. **Tests/build:** frontend 28/28 pass; temporary-output Vite build pass.
4. **Design foundation:** light/dark tokens, typography, spacing, radii, elevation, stacking, motion, focus, and reduced-motion rules documented and implemented.
5. **Branding:** SchoolFlow identity and tenant school branding preserved.
6. **Next phase:** Phase 2 — Shell and Authentication. STOP after this Phase 1 report.

---

## Phase 2 — Application Shell and Authentication Redesign

**Status:** Complete — Phase 2 verification passed  
**Date:** 2026-11-21  
**Functional scope:** presentation only. No route, permission, role map, auth workflow, validation rule, field name/ID/binding, data fetch, state, event handler, tenant value, or test selector was changed.

### Batch 1 — Sidebar and navigation

- Added shell-specific slate/navy tokens in `frontend/src/styles.css` and documented them in `docs/DESIGN_SYSTEM.md`.
- Restyled the sidebar, wordmark, tenant card, navigation groups, active/hover states, collapsed rail, tooltip, and footer presentation using those tokens.
- Replaced the mobile collapsed-state `display: revert` overrides with explicit display values so a persisted collapsed state cannot hide labels or controls in the drawer. No collapse state or persistence logic changed.
- Kept every navigation item, label, `NavLink` destination, `aria-label`, `aria-pressed`, `data-label`, and collapse/sign-out handler intact.
- Replaced the brand mark gradient with a solid muted-blue accent tile; tenant logo images and their versioned URLs are untouched.
- Verified the proposed shell text/accent pairs against the navy surfaces; the lowest checked text contrast is `5.02:1` (`--sidebar-muted` on `--sidebar-active`), above WCAG AA.

### Batch 2 — Topbar, profile, breadcrumbs, and page headers

- Changed `--topbar-bg` to a solid surface in both themes and removed the backdrop blur; the sticky header now reads as a calm, stable frame.
- Refined breadcrumb truncation and hierarchy, status pill, account avatar, and account menu presentation without changing menu items, navigation calls, or open/close handlers.
- Refined shared `.page-intro`, `.page-kicker`, `.as-of`, and action spacing with the approved typography and spacing tokens. These rules affect existing page headers only; no module content or page markup changed.
- Added narrow-viewport breadcrumb rules so the school name truncates before the current page label at 360px.
- Preserved `aria-haspopup`, `aria-expanded`, `aria-label`, `role="menu"`, `role="menuitem"`, sign-out behavior, and the notification bell component.

### Batch 3 — School identity and shared logo presentation

- Kept `SchoolLogo.jsx` unchanged: the versioned tenant logo URL, fallback initial/icon, `onError` behavior, labels, and auth context lookup are untouched.
- Refined the shared logo frame so tenant images keep their documented white backdrop while gaining consistent sidebar rings in the brand mark and school avatar.
- Standardized image padding on the 4px spacing scale.
- School name and plan/subtitle remain sourced from the existing auth context; no tenant value, cache-busting version, or identity data was altered.

### Batch 4 — Authentication pages

- Replaced the self-contained purple-navy gradient, radial glow, and decorative concentric rings with a solid slate/navy editorial panel using the shell tokens.
- Refined typographic scale, line height, eyebrow rule, proof block, and footer presentation for login, registration, recovery, reset, resend, and verification pages.
- Placed the form in a neutral surface card with a quiet border and `--sh-sm`, while keeping all existing form markup unchanged.
- Standardized auth spacing on the 4px scale and kept link, alert/status, and button presentation token-driven.
- Preserved every field name, ID, `required`/`minLength`/`maxLength`/`autoComplete` rule, label, placeholder, error/success message, `role="alert"`/`role="status"`, link destination, and submit handler in `AuthPage.jsx` and `VerifyEmailPage.jsx`.

### Verification (2026-11-21)

| Check | Command / method | Result |
|---|---|---|
| Frontend unit tests | `npm test --workspace frontend` | 28/28 pass |
| Production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase2-build" --emptyOutDir` | Pass — 2,236 modules transformed |
| Role + logo E2E | `npx playwright test e2e/auth-and-roles.spec.js e2e/school-logo.spec.js` | 21/21 pass, including all five role navigation checks |
| Responsive / theme | Temporary Playwright suite at 360, 768, and 1280px in light and dark | 12/12 viewport-theme checks pass; no horizontal overflow, no page errors |
| Theme presentation | Computed styles | Solid navy auth panel and sidebar (`rgb(23, 36, 58)`), no gradient/decorative ring, solid topbar, correct active-nav and surface fills in both themes |
| Keyboard focus | Computed styles after `Tab` in sidebar | Visible solid 2px `--sidebar-focus` outline |
| Collapse persistence | Collapse, reload, re-check in temporary suite | `aria-pressed="true"` and `localStorage` value preserved across reload |
| Token audit | Local script over `frontend/src/styles.css` | 132 root tokens, 70 dark overrides, 0 undefined `var()` references, 0 shell tokens missing a dark override |
| Contrast | Local script, shell + topbar pairs | 22 pairs per theme, minimum `5.02:1` in both light and dark — all AA |
| Diff review | `git diff --check`, `git diff --name-only` | Clean (CRLF normalization warning only). Only `frontend/src/styles.css` is modified among tracked files; no JSX, route, auth, or backend file changed |

Temporary verification scripts and Playwright artifacts were removed after the run. The untracked files are the Phase 1/2 documentation (`docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md`); the only tracked modification is the stylesheet. Nothing was committed or pushed.

### 10. Phase 2 report summary

1. **Changed files:** `frontend/src/styles.css` (tracked), `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md`.
2. **Application source changed:** one stylesheet; presentation only.
3. **Scope delivered:** deep slate/navy sidebar and auth panel, restrained active/hover/focus states, solid topbar, refined profile/account menu, calmer breadcrumbs and page headers, consistent tenant logo presentation.
4. **Preserved:** all navigation destinations and role visibility, collapse state/persistence, auth/register/verify workflows, validation, field names/IDs/bindings, API/state/handlers, tenant data, test selectors, and accessibility attributes.
5. **Verification:** frontend tests, temporary build, five-role navigation E2E, 360/768/1280px in light/dark, keyboard focus, contrast, and diff review all pass.
6. **Status:** Phase 2 complete. STOP — no dashboard/module redesign, no commit, no push.

---

## Phase 3 — Complete Dashboard Redesign

**Status:** Complete — Phase 3 verification passed  
**Date:** 2026-11-21  
**Functional scope:** presentation only. No KPI calculation, API request, endpoint, data-fetch, state, event handler, permission, role check, section, action, or business logic was changed. No statistics or activity data were invented.

### Batch 1 — Dashboard presentation foundation + Platform Super Admin

- Added a token-only dashboard presentation layer in `frontend/src/styles.css`: shared frame, KPI cards, content panels, chart styling, quick-action tiles, role layouts, and responsive refinements.
- Charts now inherit theme tokens through CSS (`--line`, `--muted`, `--brand`, `--brand-soft`, `--surface`) instead of fixed hex values, so they stay readable in light and dark themes.
- Enhanced shared `PageIntro`, `Metric`, `SectionHeading`, and `QuickActions` presentation helpers in `DashboardPage.jsx` with optional eyebrow/icon/feature/rail props. Existing headings, labels, values, details, buttons, and handlers are unchanged.
- Platform dashboard now has a distinct control-center layout: role eyebrow and icon, revenue KPI featured, customer-schools table as the primary panel, and platform quick actions in a compact rail. All four KPI values and their derivations, the table (first six schools), both navigation buttons, and every badge are unchanged.
- Kept all schema contracts: `.metric-card`, `.metric-icon`, `.metric-value`, `.metric-detail`, `.quick-action`, `.table-card`, `.badge-*`, and all button classes remain in the DOM.

### Batch 2 — School Admin and Principal dashboards

- Both roles still use the same `/reports/dashboard` data and the same four KPI derivations, attendance chart, "School at a glance" rows, role-specific quick actions, and live-data header chip. No calculation or fetch changed.
- Differentiated presentation by role: School Admin uses an admin-focused frame with the collections KPI featured, chart beside the operations summary, and a full-width quick-action strip. Principal uses a principal-focused frame with the students KPI featured, the operations summary beside a compact quick-action rail, and a full-width attendance chart.
- Only presentation JSX was reorganized (content moved into reusable local constants): every section and action remains exactly once in both role outputs.
- Attendance chart colors now resolve through CSS tokens for automatic light/dark readability; chart data, axes, dimensions, and empty-state behavior are unchanged.
- Added role eyebrows and dedicated icons in the shared page header without changing the existing greeting/subtitle text asserted by the E2E suite.

### Batch 3 — Teacher dashboard

- Reorganized the teacher dashboard around the teaching day: the timetable is now the primary wide panel and the staff-attendance chart is the secondary panel. Both sections, their headings, empty states, and the `TimetableTable` remain unchanged.
- Scheduled-periods KPI is featured; all four KPI values and their existing derivations from `schedule`, `summary`, and `session` are untouched.
- Added a teaching-workspace eyebrow and icon; the greeting text asserted by E2E is unchanged.
- Attendance chart colors now resolve through theme tokens. Chart data filtering, order, labels, axis settings, bar size, and tooltip behavior are unchanged.

### Batch 4 — Parent dashboard

- Kept the family-focused information architecture: linked-student and school KPIs, the linked children cards with existing status badges, and the parent quick actions.
- Linked-students KPI is featured; both existing values/details and the `children.length === 1` wording are unchanged.
- Child cards use a larger avatar and calmer panel treatment; each card is still a button with the same `key` and the same `navigate("/my-children")` handler.
- Added a family-workspace eyebrow and icon; the `Welcome, {firstName}` heading asserted by E2E is unchanged.

### Verification (2026-11-21)

| Check | Command / method | Result |
|---|---|---|
| Frontend unit tests | `npm test --workspace frontend` | 28/28 pass |
| Production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase3-build" --emptyOutDir` | Pass — 2,236 modules transformed |
| Five-role responsive/theme QA | Temporary Playwright suite: 5 roles × (1280, 768, 360px) × (light, dark) | 30/30 pass; correct layout wrapper, role eyebrow, greeting, all KPI values from mocked API data, four quick actions, no horizontal overflow, no page errors |
| Chart readability | Computed SVG styles in school admin, principal, and teacher dashboards | Bars `--brand`, ticks `--muted`, grid `--line` in both themes; all matched expected token RGB values |
| Quick-action behavior | Click first action for each role; then keyboard-focus a quick action | 5/5 navigated to the original routes; 5/5 show a visible 2px focus outline |
| Reduced motion | Emulated `prefers-reduced-motion: reduce` | Card transition duration effectively zero and hover transform `none` |
| Contrast | Local token calculation for new dashboard pairs | Minimum `5.25:1` light / `6.29:1` dark — all AA |
| Functional protection | Token-count diff of `DashboardPage.jsx` against `HEAD` | Every fetch call, endpoint URL, state setter, handler, KPI derivation, and section count unchanged; only change is one intentional decorative `aria-hidden` on the new header icon |
| Diff review | `git diff --check`, `git diff --name-only` | Clean (CRLF normalization warnings only). Only `DashboardPage.jsx` and `styles.css` are modified among tracked files; no backend or config file changed |

Temporary Playwright specs, screenshots, and artifacts were removed after verification. Nothing was committed or pushed.

### 11. Phase 3 report summary

1. **Changed files:** `frontend/src/pages/DashboardPage.jsx`, `frontend/src/styles.css` (tracked); `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md` (untracked documentation).
2. **Dashboards delivered:**
   - **Platform Super Admin** — control-center frame, featured gross-revenue KPI, customer-schools table primary, quick actions in a rail.
   - **School Admin** — administration frame, featured collections KPI, attendance chart beside operations summary, full-width quick-action strip.
   - **Principal** — principal frame, featured students KPI, operations summary beside a compact action rail, full-width attendance chart.
   - **Teacher** — teaching frame, featured scheduled-periods KPI, timetable as primary panel with attendance chart beside it.
   - **Parent** — family frame, featured linked-students KPI, prominent child cards with existing status badges.
3. **Preserved:** all KPI calculations, API requests, data-fetch/state logic, event handlers, quick-action routes, permissions, role checks, sections, labels, empty/error/loading states, tenant data, and test selectors.
4. **Verification:** unit tests, temporary build, 30 role/viewport/theme checks, chart token checks, quick-action navigation, keyboard focus, reduced motion, contrast, and functional-token diff all pass.
5. **Remaining issue:** the current dashboard API payloads contain no timestamped activity feed, so no "recent activity" list was invented. Existing state panels (customer schools, school-at-a-glance, timetable, linked children) are presented as clean information panels instead.
6. **Status:** Phase 3 complete. STOP — no Phase 4 work, no commit, no push.

---

## Phase 4 — Complete Module and Page Redesign

**Status:** Complete — all six presentation batches and final verification finished  
**Date:** 2026-11-21  
**Functional scope:** presentation only. Routes, guards, navigation, auth, permissions, API calls, state, handlers, validation, form bindings, workflows, business logic, and test selectors remain unchanged.

### Step 1 — Complete role-to-page-to-module inventory

This inventory is derived from `frontend/src/App.jsx`, `frontend/src/components/PortalShell.jsx`, all files under `frontend/src/pages/`, all files under `frontend/src/components/`, and the complete `frontend/src/styles.css`. It lists actual rendered features, not intended or hypothetical modules. Phase 2 shell/auth and Phase 3 dashboards are included for completeness and are marked already complete.

#### 1.1 Access constants and shell navigation

Source: `App.jsx` and `PortalShell.jsx`.

| Constant / role set | Members | Used by |
|---|---|---|
| `adminRoles` | `school_admin`, `principal` | students, finance, inventory, library, reports, subscriptions, school, assets |
| `staffRoles` | `school_admin` | staff, audit |
| `classRoles` | `school_admin`, `principal`, `teacher` | academics, attendance, exams |
| `allSchoolRoles` | `school_admin`, `principal`, `teacher`, `parent` | calendar, announcements, notifications, documents |
| Platform-only | `platform_super_admin` | platform, platform/plans, platform/revenue, platform/audit |
| Parent-only | `parent` | my-children |
| Billing-only | `school_admin` | billing |

Navigation must remain exactly as currently rendered:

| Role | Navigation groups and links |
|---|---|
| `platform_super_admin` | **Platform (4):** Overview `/`, Plans `/platform/plans`, Revenue `/platform/revenue`, Audit log `/platform/audit` |
| `school_admin` | **Workspace (5):** Overview `/`, Students, People, Academics, Attendance · **School operations (10):** Fees & finance, Exams & results, Inventory, Fixed assets, Library, Calendar, Announcements, Notifications, Documents, Reports · **Administration (4):** Subscription, Billing history, School profile, Audit log |
| `principal` | **Workspace (4):** Overview, Students, Academics, Attendance · **School operations (10):** Fees & finance, Exams & results, Inventory, Fixed assets, Library, Calendar, Announcements, Notifications, Documents, Reports |
| `teacher` | **My classroom (8):** Overview, Attendance, Timetable `/academics`, Exams & results, Calendar, Announcements, Notifications, Documents |
| `parent` | **Family (6):** Overview, My children, School calendar, Announcements, Notifications, Documents |

Role names, account-menu links, sign-out behavior, collapse state, `NavLink` destinations, `aria-label`/`aria-pressed` attributes, `data-label` tooltips, and the notification bell are Phase 2 shell contracts and remain unchanged.

#### 1.2 Guest pages

| Route | Guard | Page component | Modules / workflows | Phase 4 status |
|---|---|---|---|---|
| `/login` | `Guest` | `AuthPage` | Sign-in form, verification-required feedback, password recovery/resend links | Phase 2 complete |
| `/register` | `Guest` | `AuthPage` | Registration form, role/school fields, verification flow | Phase 2 complete |
| `/forgot-password` | `Guest` | `AuthPage` | Recovery request form | Phase 2 complete |
| `/reset-password` | `Guest` | `AuthPage` | Password reset form, token from query string, validation | Phase 2 complete |
| `/resend-verification` | `Guest` | `AuthPage` | Resend verification form/result states | Phase 2 complete |
| `/verify-email` | `Guest` | `VerifyEmailPage` | Single-use token confirmation, loading/success/error/already-verified outcomes | Phase 2 complete |

#### 1.3 Authenticated dashboard

| Route | Guard | Page component | Role-specific modules | Phase 4 status |
|---|---|---|---|---|
| `/` | any authenticated user | `DashboardPage` | Platform: revenue KPI, customer-schools panel, quick actions. School admin/principal: four live KPIs, attendance chart, school-at-a-glance, role actions. Teacher: schedule KPIs, timetable, attendance chart, actions. Parent: linked-student/school KPIs, child cards, family actions. | Phase 3 complete |

#### 1.4 School workspace routes rendered by `WorkspacePage.jsx`

`WorkspacePage` dispatches first to specialized components, then renders a shared generic directory for the remaining configured pages.

| Route | Route roles | Actual page/module | Features and workflows present | Phase 4 status |
|---|---|---|---|---|
| `/students` | `school_admin`, `principal` | Generic student directory | Search, pagination, enrolled-status query, create student (branch/session/class/section dependent selects), row menu with edit details and change status | Complete |
| `/staff` | `school_admin` | Generic people directory | Search, pagination, create user (name/email/phone/job title/role/temporary password), row edit | Complete |
| `/academics` | `school_admin`, `principal` | `AcademicSetupPage` | Six tabs: Classes, Sessions, Sections, Subjects, Class subjects, Timetable; create/edit/activate/remove workflows, session-scoped timetable, teacher selector degradation, keyboard tablist arrows | Complete |
| `/academics` | `teacher` | Teacher timetable directory inside `WorkspacePage` | Active-session lookup, timetable plus class/section/subject/class-subject lookups, eight timetable columns, pagination; create/actions hidden | Complete |
| `/attendance` | `school_admin`, `principal`, `teacher` | `AttendancePage` | Section and date filters, roster fetch/normalization, per-student status and late check-in inputs, save payload workflow, validation notice | Complete |
| `/finance` | `school_admin`, `principal` | `FinancePage` | Tabs: Outstanding vouchers, Fee structures, Categories, Student assignments (admin only); collect payment; add category/structure; assign fees; generate vouchers; line items and eligible-student pickers | Complete |
| `/exams` | `school_admin`, `principal`, `teacher` | `ExamsPage` | Exam selector/status, results table, create exam with grading bands and subject schedule, publish results, teacher marks roster and save marks | Complete |
| `/inventory` | `school_admin`, `principal` | Generic inventory directory | Search, pagination, create item, receive/issue stock icon actions and movement modal | Complete |
| `/library` | `school_admin`, `principal` | Generic library directory | Books/Loans tabs, catalogue create, issued-loan table, issue-book modal, return-book action with busy state | Complete |
| `/calendar` | `school_admin`, `principal` | Generic calendar directory | Date-range query, search, create event (holiday/event/meeting/exam), pagination | Complete |
| `/calendar` | `teacher`, `parent` | Generic calendar directory using `/portal/calendar` | Same read-only event table/search/pagination; create/actions hidden | Complete |
| `/announcements` | all four school roles | Generic announcements directory | Search, pagination, create announcement with audience roles and expiry; creation available only to `school_admin`/`principal` | Complete |
| `/audit` | `school_admin` | Generic audit directory | Search, pagination, audit columns: action/resource type/actor/resource/created | Complete |
| `/platform/audit` | `platform_super_admin` | Generic platform audit directory | Same audit presentation using `/platform/audit` | Complete |
| `/reports` | `school_admin`, `principal` | `ReportsPage` | Six report types (students, attendance, collections, dues, class/session summary, results); filters, run, pagination, CSV/Excel/PDF export, partial-options warning | Complete |
| `/subscriptions` | `school_admin`, `principal` | `SubscriptionPage` school view | Current plan card, status badge, usage limits, feature chips, empty/error/loading states | Complete |
| `/school` | `school_admin`, `principal` | `SchoolProfile` + `SchoolLogoManager` | School identity details, subscription details, logo preview/upload/save/cancel/remove with validation, confirmation, identity refresh | Complete |
| `/my-children` | `parent` | `ParentChildren` | Linked-student selector, attendance/fees/results tablist with arrow-key support, fee voucher and recent-payment tables, per-tab empty states | Complete |
| `/platform` | `platform_super_admin` | `SubscriptionPage` platform view | Schools tab: school list, manage-plan modal, suspend/reactivate with confirmation. Plans tab: plan table, limits, active/default badges, activate/deactivate, create-plan modal with limits/features | Complete |
| `/platform/plans` | `platform_super_admin` | `SubscriptionPage` platform view | Same component, initialized to Plans tab | Complete |

#### 1.5 Standalone authenticated pages

| Route | Route roles | Page component | Features and workflows present | Phase 4 status |
|---|---|---|---|---|
| `/assets` | `school_admin`, `principal` | `FixedAssetsPage` | Asset register, CSV export, create asset, assign/release/depreciate/dispose, history modal, pagination | Complete |
| `/notifications` | all four school roles | `NotificationsPage` | Notification list, unread-only toggle, mark individual read, mark all read, pagination, type badges | Complete |
| `/documents` | all four school roles | `DocumentsPage` | Category filter, document table, upload modal with file validation/student link, download, delete confirmation, pagination; manage actions limited to `school_admin`/`principal` | Complete |
| `/billing` | `school_admin` | `BillingPage` | School subscription payment history table, status/method/period display, pagination | Complete |
| `/platform/revenue` | `platform_super_admin` | `PlatformRevenuePage` | Summary tab with gross revenue KPIs plus by-month/by-plan/outstanding tables; Payments tab with status filter and table; record-payment modal with custom amount or plan and optional subscription activation | Complete |

#### 1.6 Shared presentation surfaces used by every module

Source: `frontend/src/components/`.

| Component / classes | Present behavior and Phase 4 constraint |
|---|---|
| `PortalShell.jsx` | Sidebar, mobile drawer, topbar, breadcrumbs, status pill, notification bell, account menu, page frame. Phase 2 complete; only shared module-width/spacing refinements may be added without changing behavior. |
| `Modal.jsx` / `.modal-card`, `.modal-header`, `.modal-form`, `.modal-actions` | Focus trap, restore focus, Escape/backdrop close, body scroll lock, `size` support (`lg`/`xl`). Must remain unchanged. Every create/edit/workflow dialog uses it. |
| `ConfirmDialog.jsx` / `.confirm-dialog` | Destructive confirmations with Cancel/Confirm and busy state. Must remain unchanged. |
| `RowMenu.jsx` / `.row-menu`, `.row-menu-panel` | Fixed-position row action menu used by students, academics, assets, and platform administration. Label, icons, danger items, and handlers must remain unchanged. |
| `feedback.jsx` | `LoadingState`, `ErrorState`, `EmptyState`, `Notice`, `SkeletonRows`; all role/alert/live contracts must remain unchanged. |
| `NotificationBell.jsx` | Silent unread-count fetch, custom event refresh, 60-second refresh, topbar badge. No behavior change. |
| `SchoolLogo.jsx` | Versioned tenant logo URL, fallback initial/icon, `onError`, decorative/label behavior. No change. |
| `ErrorBoundary.jsx` | Catches render errors and offers retry/reload. No change. |
| Table/toolbar vocabulary | `.content-card`, `.table-card`, `.table-toolbar`, `.tabs`, `.filter-toolbar`, `.table-scroll`, `table`, `th`, `td`, `.pagination`, `.badge-*`, `.row-actions`, `.empty-state`, `.error-panel`, `.skeleton-row`, `.notice`, `.form-stack`, `.form-grid`, `.field-hint`, `.form-error`. Class names are functional/test contracts; Phase 4 may refine their presentation only. |

#### 1.7 Visual-surface coverage checklist

Every remaining Phase 4 surface is accounted for in the route tables above:

- Generic CRUD directory: students, staff, teacher timetable, inventory, library, calendar, announcements, school audit, platform audit.
- Specialized workspace views: academic setup, attendance, finance, exams, reports, subscriptions, school profile, parent children, platform administration.
- Standalone list/detail views: fixed assets, notifications, documents, billing, platform revenue.
- Embedded workflows: student status/change/edit, inventory receive/issue, library issue/return, attendance roster save, finance category/structure/assignment/voucher/payment, exam create/publish/marks, report build/export, platform school suspension/plan assignment/plan creation, school logo upload/remove, parent attendance/fees/results.
- Shared components: modal, confirm dialog, row menu, feedback states, notification bell, school logo, error boundary, shell.
- Completed surfaces excluded from Phase 4 edits: guest auth pages (Phase 2) and all five dashboards (Phase 3), except shared token refinements that do not alter their approved presentation.

### Step 2 — Planned presentation batches

Batches are grouped by shared visual vocabulary and workflow density. No batch edits functionality.

1. **Batch 1 — Student and academic operations:** generic student/people directories, academic setup, teacher timetable, attendance roster.
2. **Batch 2 — Operations and enrichment:** inventory, library, calendar, announcements.
3. **Batch 3 — Finance and assessment:** finance workflows, exams/marks, reports, fixed assets.
4. **Batch 4 — School administration and records:** notifications, documents, billing, school profile/logo manager.
5. **Batch 5 — Platform and family views:** platform schools/plans/audit, platform revenue, subscriptions, parent children.
6. **Batch 6 — Shared surfaces and final verification:** modal/confirm/row-menu/feedback polish where required, responsive and light/dark checks, complete diff review, documentation updates.

### Step 3 — Batch 1 record: student and academic operations

**Status:** Complete  
**Date:** 2026-11-21

- Added `frontend/src/components/ModuleHeader.jsx`, a presentation-only header that preserves the existing `.page-intro`, `.page-kicker`, `h1`, `p`, and `.intro-action` contract while adding a restrained decorative Lucide icon (`aria-hidden`) and consistent module rhythm.
- `WorkspacePage.jsx` now supplies a `PAGE_ICONS` map and passes the appropriate icon for every generic directory and specialized view: students, people, academic setup, teacher timetable, attendance, finance, exams, inventory, library, calendar, announcements, school/platform audit, reports, subscriptions, school profile, platform administration, and parent children.
- `AcademicSetupPage.jsx` uses the shared header without changing its six-tab structure, `data-academic-tab` selectors, keyboard tablist behavior, form fields, or payload builder.
- Added a token-only Phase 4 presentation layer to `frontend/src/styles.css`, anchored to `.module-header` so Phase 2 auth and Phase 3 dashboards are not restyled. It refines module headers, content cards, table toolbars, tables, sticky headers, tabs, filters, forms, modals, report/profile/plan surfaces, and responsive behavior.
- No API endpoint, request body, response handling, state, handler, validation, form name/id/binding, route, navigation item, permission check, workflow, or test selector changed.

**Batch 1 verification**

| Check | Command | Result |
|---|---|---|
| Frontend unit tests | `npm test --workspace frontend` | 28/28 pass |
| Temporary production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase4-build" --emptyOutDir` | Pass — 2,237 modules transformed |

No functional or business-logic issue from Phase 0 was addressed in this batch. Nothing was committed or pushed.

### Step 3 — Batch 2 record: operations and enrichment

**Status:** Complete  
**Date:** 2026-11-21

- Applied the shared module header and `PAGE_ICONS` entries to the generic inventory, library, calendar, and announcement directories.
- Refined their existing table toolbars, search field, tabs (Books/Loans), date filters, row actions, pagination, and empty states through the token-only `.module-header`-anchored layer.
- Preserved stock-movement buttons, issue/return workflows, busy states, date-range queries, audience/expiry fields, search handlers, and all class names used as test or accessibility contracts.
- No endpoint, payload, response handling, state transition, validation, form binding, permission check, or route changed.

### Step 3 — Batch 3 record: finance and assessment

**Status:** Complete  
**Date:** 2026-11-21

- Applied the shared header to Fees & finance, Exams & results, Reports & insights, and Fixed assets.
- Refined finance tabs, fee line-item and eligible-student pickers, payment collection, report filters/results/export actions, exam status and marks surfaces, and the asset register/history panels using existing tokens.
- Protected payload logic remains untouched: `buildFeeAssignmentPayload`, `buildVoucherGenerationPayload`, `buildExamPayload`, attendance/finance request shapes, report endpoints, export handlers, and asset depreciation requests are unchanged.
- The existing fixed-asset modal focus contract and all table headings/action labels remain intact.

### Step 3 — Batch 4 record: school administration and records

**Status:** Complete  
**Date:** 2026-11-21

- Converted Notifications, Documents, Billing history, and the School Profile header to `ModuleHeader`; the embedded `SchoolLogoManager` gained the shared `module-subpanel` treatment.
- Refined notification rows and type badges, document category filters/upload modal/file states, billing history tables, profile cards, plan cards, and logo preview/validation panels.
- Preserved unread-only filtering, individual/mark-all-read handlers, document validation/download/delete confirmation, school identity refresh, logo upload/remove flows, and all role-limited manage actions.
- No tenant data, logo URL behavior, subscription status logic, or form field name/id/binding was changed.

### Step 3 — Batch 5 record: platform and family views

**Status:** Complete  
**Date:** 2026-11-21

- Applied the shared header to platform administration (schools/plans/audit), platform revenue, school subscription, and parent children views.
- Used dynamic muted-blue icons where a single component serves two views: `LayoutDashboard` for platform schools, `Receipt` for plans, and the appropriate icon for each specialized header.
- Refined plan cards/limits/feature chips, platform tables and modals, revenue KPI/report surfaces, parent student selector and tabbed attendance/fees/results tables.
- Preserved platform-only and parent-only route guards, school suspension/plan assignment/plan creation workflows, revenue reporting tabs, parent tablist arrow-key behavior, and all existing empty/error states.

### Step 3 — Batch 6 record: shared surfaces and final verification

**Status:** Complete  
**Date:** 2026-11-21

- Confirmed the Phase 4 layer is anchored to `.module-header`, so the Phase 2 guest/auth surfaces and Phase 3 dashboards keep their approved presentation.
- Verified the Phase 4 CSS block contains no raw hex or `rgba()` colors; every color role resolves through the documented design-system tokens.
- Verified that `App.jsx`, `PortalShell.jsx`, the API client, auth provider, pure business-logic utilities, shared behavior components, and all Playwright/unit test files are unchanged in Phase 4.
- Ran unit tests, a temporary production build, the existing Playwright suite, and a temporary 30-check role/viewport/theme visual suite. Removed the temporary spec and all generated QA artifacts afterward.
- Updated `docs/DESIGN_SYSTEM.md` with the Phase 4 module presentation layer and this document with final statuses and results. Nothing was committed or pushed.

### Phase 4 final verification

| Check | Command / method | Result |
|---|---|---|
| Frontend unit tests | `npm test --workspace frontend` | 28/28 pass |
| Temporary production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase4-build" --emptyOutDir` | Pass — 2,237 modules transformed |
| Existing protected E2E suite | `npm run test:e2e` | 25/25 pass — academic payloads, attendance payloads, five-role nav, full school-admin workspace walk, principal permission boundaries, dialog focus trap, logo workflows, mobile overflow |
| Temporary Phase 4 visual QA | `npx playwright test e2e/phase4-visual.spec.js --reporter=list` | 30/30 pass — 5 roles × (360, 768, 1280px) × (light, dark); every module route has a visible `.module-header h1`, correct heading text, a decorative icon, no client errors, and no horizontal overflow |
| Role/navigation contract | Temporary visual QA plus existing E2E role checks | Unchanged: platform admin 4, school admin 19, principal 14, teacher 8, parent 6 links |
| Responsive/theme presentation | Temporary visual QA at 360/768/1280px in both automatic themes | Pass; module header reflows at 760px and icon hides at 420px without losing DOM semantics |
| Token-only color audit | Static inspection of the Phase 4 CSS block | Pass — no raw hex/rgba colors; all color roles use documented light/dark tokens |
| Accessibility contracts | Existing E2E dialog focus test plus unchanged markup contracts | Pass — decorative icons are `aria-hidden`; headings, tablists, labels, focus behavior, and reduced-motion rules retained |
| Full diff review | `git diff -- frontend/src` and new-file review | Pass — changes are limited to presentation shells, icons, the token-driven stylesheet, and documentation |
| Artifact cleanup | Temporary spec/test-result removal | Pass — no temporary QA files remain |

### Phase 4 completion status

Phase 4 is complete. Every route and module listed in the Step 1 inventory is now marked complete, including generic directories, specialized workspace views, standalone pages, embedded workflows, and shared presentation surfaces. The approved SchoolFlow identity, muted-blue accent, deep slate/navy shell, automatic light/dark themes, WCAG AA token pairs, routes, permissions, API contracts, business logic, and test selectors are preserved.

The Phase 0 approval-required functional/business-logic issues remain explicitly out of scope. Phase 5 was not started. No commit was created and nothing was pushed.

---

## Phase A — Icons, Motion and Alerts audit (v3.2)

**Status:** Complete — audit only, awaiting Phase B approval  
**Date:** 2026-11-21  
**Repository baseline:** `a2ec9df feat: complete SchoolFlow development updates`; uncommitted Phase 1–4 work preserved  
**Application source changes:** none  
**Files changed:** `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md` — documentation only  
**Backend, dependencies, `.env`, git state:** unchanged

### A.1 Scope completed

- Re-read `docs/DESIGN_SYSTEM.md`, `docs/PROGRESS.md`, latest Git history, working-tree status, and frontend package configuration.
- Audited every file under `frontend/src`, plus `frontend/index.html`, frontend configs, and relevant tests for protected contracts.
- Excluded `frontend/dist/` as ignored build output.
- Categorized findings by Platform Super Admin, School Admin, Principal, Teacher, Parent, and Authentication/shared components.
- Appended the Section 6B design summary to `docs/DESIGN_SYSTEM.md`.

### A.2 Categorized findings

Counts are literal file-level counts in role-mapped files. Shared multi-module files such as `WorkspacePage.jsx` and `DashboardPage.jsx` appear in more than one portal; portal counts must not be summed into the global total.

| Portal | Primary role-mapped files | Icon findings | Feedback findings | Motion notes |
|---|---|---:|---|---|
| Platform Super Admin | `DashboardPage.jsx`, `WorkspacePage.jsx`, `PlatformRevenuePage.jsx` | ~41 Lucide import entries | 0 native dialogs; 1 confirm; 3 modal sites; notices/errors/skeleton/empty states in platform views | Global CSS; Recharts dashboard bars; platform modal animations |
| School Admin | `DashboardPage.jsx`, `WorkspacePage.jsx`, `AcademicSetupPage.jsx`, `FixedAssetsPage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx`, `BillingPage.jsx`, `SchoolLogoManager.jsx` | ~60 | 0 native; 5 confirms; ~9 modal sites; full feedback set including logo/profile workflows | Global CSS plus finance, asset, academic, logo, and workspace modal/skeleton motion |
| Principal | `DashboardPage.jsx`, `WorkspacePage.jsx`, `AcademicSetupPage.jsx`, `FixedAssetsPage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx`, `SchoolLogoManager.jsx` | ~59 | 0 native; 5 confirms; ~7 modal sites; no billing route | Same shared school-operation surfaces; no school-admin-only billing |
| Teacher | `DashboardPage.jsx`, `WorkspacePage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx` | ~45 | 0 native; 1 confirm; 2 modal sites (document upload, marks entry) | Attendance/exam/marks, documents, notifications, global CSS |
| Parent | `DashboardPage.jsx`, `WorkspacePage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx` | ~45 | 0 native; 1 confirm; 1 modal site (document upload) | Parent children tabs/records, documents, notifications, global CSS |
| Authentication/shared | `App.jsx`, `AuthProvider.jsx`, `api/client.js`, `PortalShell.jsx`, `Modal.jsx`, `ConfirmDialog.jsx`, `feedback.jsx`, `NotificationBell.jsx`, `ErrorBoundary.jsx`, `RowMenu.jsx`, `SchoolLogo.jsx`, `AuthPage.jsx`, `VerifyEmailPage.jsx`, `styles.css`, utils | ~43 | 0 native; shared modal/confirm/feedback primitives; custom notification/session events; no toast library | 23 transitions, 16 animations, 9 keyframes, one reduced-motion block at `styles.css:1201-1212` |

Global totals: 0 emoji; 4 Unicode icon glyphs; 105 Lucide imports across 18 files; 52 unique Lucide names; 0 other icon libraries/fonts/inline `<svg>`; 2 CSS data-URI chevrons; 2 logo `<img>` uses; 0 native dialogs; 6 confirm usages; 15 modal occurrences; 0 toast systems.

### A.3 Verification and checks

- `check:icons`: **not available yet**; the dependency-free checker is a Phase B deliverable. Phase A did not create or run it.
- Frontend unit tests: **not run during audit-only Phase A**. Last known approved Phase 4 baseline: `npm test --workspace frontend` → 28/28 pass.
- Temporary production build: **not run during audit-only Phase A**. Last known approved Phase 4 baseline: `npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase4-build" --emptyOutDir` → pass, 2,237 modules.
- E2E/visual checks: **not run during audit-only Phase A**. Last known approved Phase 4 baseline: 25/25 protected E2E and 30/30 temporary role/viewport/theme checks.
- No lint/typecheck commands invented; the repo has no ESLint/Biome/TypeScript setup.

Exact available commands for later phases:

```powershell
npm run check:icons --workspace frontend   # added in Phase B
npm test --workspace frontend
npm run build --workspace frontend
npm run test:e2e --workspace frontend
npx vite build --outDir "$env:TEMP\opencode\schoolflow-phase4-build" --emptyOutDir
```

### A.4 Decisions recorded

- Existing `lucide-react` remains the single icon source; no dependency installation or removal.
- Central registry and checker are Phase B deliverables; full icon replacement is Phase C.
- Existing `Modal.jsx`, `ConfirmDialog.jsx`, and `feedback.jsx` are extended rather than replaced.
- No native browser dialogs or toast libraries were found to migrate/theme.
- Automatic light/dark theme and the existing global reduced-motion block remain authoritative.
- SchoolFlow branding, school logos, tenant names/initials, and all user-generated content are protected.

### A.5 Proposed controlled batches

1. **Phase B — Foundation:** icon registry, `Icon`/`IconBadge`/`IconButton`, `check:icons`, motion tokens/utilities, z-index verification, docs.
2. **Phase C — Icon sweep:** shared shell/auth; dashboards; modules in groups of 3–4; remaining shared UI.
3. **Phase D — Alert core:** feedback API, dialog variants, focus/scroll contracts, toast primitives, inline variants.
4. **Phase E — Roll-out:** confirmation/feedback call sites and approved micro-interactions in controlled groups.
5. **Phase F — Final QA:** full Section 8 checklist, all five portals, themes, responsive widths, reduced motion, keyboard operation, and complete exception report.

### A.6 Approval required

Phase B implementation was subsequently authorized and completed; the implementation record is in Section 12 below. No application source, dependency, API, route, permission, validation, database, workflow, or git-state change was made in Phase A itself.

---

## Phase B — Foundation: icon system, checker, and motion tokens

**Status:** Complete  
**Date:** 2026-11-21  
**Application source changes:** frontend UI foundation files only; no route, handler, API, state, permission, validation, workflow, dependency, `.env`, or git-state changes.

### B.1 Files created

- `frontend/src/components/ui/icon/registry.js` — single Lucide import boundary; 100+ semantic mappings; `getNoticeIconName`, `getConfirmPresentation` helpers
- `frontend/src/components/ui/icon/icons.jsx` — `<Icon>` component plus migration-compatible named wrappers for every existing Lucide component
- `frontend/src/components/ui/icon/IconBadge.jsx` — semantic status badge primitive
- `frontend/src/components/ui/icon/IconButton.jsx` — accessible icon-only control primitive
- `frontend/scripts/check-icons.mjs` — dependency-free enforcement checker
- `frontend/src/utils/usePrefersReducedMotion.js` — `matchMedia` hook used only to disable Recharts bar animation under reduced motion

### B.2 Files modified

- `frontend/package.json` — added `check:icons` script
- `frontend/src/styles.css` — motion tokens, `.motion-*` utilities, keyframes, reduced-motion extensions, print suppression, z-index tokens
- `frontend/test/icon-registry.test.js`, `frontend/test/icon-checker.test.js` — focused foundation tests

### B.3 Verification

- `npm run check:icons --workspace frontend` — passed at each checkpoint
- `npm test --workspace frontend` — unit tests passed through each phase

---

## Phase C — Icon sweep across all five portals

**Status:** Complete  
**Date:** 2026-11-21  
**Application source changes:** import sources and icon markup only; no handler, payload, condition, or selector changes.

### C.1 Direct-import migration

All 18 files with direct `lucide-react` imports were migrated to the central registry. The only remaining application import of `lucide-react` is `frontend/src/components/ui/icon/registry.js`. Named wrapper exports preserved every existing JSX tag and handler signature.

Migrated files:

`App.jsx`, `ErrorBoundary.jsx`, `Modal.jsx`, `NotificationBell.jsx`, `PortalShell.jsx`, `RowMenu.jsx`, `SchoolLogo.jsx`, `feedback.jsx`, `AcademicSetupPage.jsx`, `AuthPage.jsx`, `BillingPage.jsx`, `DashboardPage.jsx`, `DocumentsPage.jsx`, `FixedAssetsPage.jsx`, `NotificationsPage.jsx`, `PlatformRevenuePage.jsx`, `SchoolLogoManager.jsx`, `VerifyEmailPage.jsx`, `WorkspacePage.jsx`.

### C.2 Unicode and CSS image icons

- `feedback.jsx` — dismiss `×` → `<X>`
- `WorkspacePage.jsx` — subscription feature `✓`/`×` → `<Check>` / `<X>`
- `PortalShell.jsx` — collapsed sidebar sign-out glyph → `<LogOut>` icon plus visible label in expanded nav
- `styles.css` — removed both `data:image/svg+xml` select chevrons; native `select` affordance retained

### C.3 Manual-review exceptions

The checker reports 2 stored school-logo `<img>` candidates (branding renderer and object-URL upload preview). These are tenant-provided assets and are intentionally preserved.

---

## Phase D — Alert core and feedback system

**Status:** Complete  
**Date:** 2026-11-21  
**Application source changes:** shared feedback primitives and new feedback host; no business flow changes.

### D.1 Files created

- `frontend/src/components/feedback/feedbackStore.js` — dialog/toast queues, dedupe, timers, pause/resume, public API
- `frontend/src/components/feedback/FeedbackHost.jsx` — single root host rendering dialogs and toasts
- `frontend/src/components/feedback/StatusDialog.jsx` — status/confirm dialog surface using `alertdialog`
- `frontend/src/components/feedback/ToastViewport.jsx` — accessible toast viewport/queue rendering
- `frontend/src/components/feedback/feedbackHelpers.js` — shared submit guard
- `frontend/test/feedback-store.test.js` — focused queue/timer/dedupe tests

### D.2 Extended primitives

- `Modal.jsx` — added optional `className`, `role`, `ariaDescribedBy`, `hideHeader`, `closeLabel`; focus trap, scroll lock, focus restoration, backdrop close preserved. Existing `role="dialog"` default unchanged.
- `ConfirmDialog.jsx` — semantic `IconBadge`, premium layout, busy spinner, duplicate-confirm guard, `aria-describedby`, preserved handler/argument order and cancel behavior. `role="dialog"` deliberately retained for E2E compatibility.
- `feedback.jsx` — `Notice` variants `success/warning/error/info` with semantic icons and Lucide dismiss; existing `role`, live-region, and persistent inline behavior preserved.
- `App.jsx` — mounts `<FeedbackHost />` once inside the existing `ErrorBoundary`; no route or guard changes.

---

## Phase E — Rollout and micro-interactions

**Status:** Complete  
**Date:** 2026-11-21  
**Application source changes:** presentation-only rollout across every portal.

### E.1 Portal-by-portal rollout

| Portal | Files updated | Outcome |
|---|---|---|
| Platform Super Admin | `DashboardPage.jsx`, `WorkspacePage.jsx`, `PlatformRevenuePage.jsx` | Platform dashboard icon/eyebrow and rail quick actions, admin header, revenue header, all module icons |
| School Admin | `DashboardPage.jsx`, `WorkspacePage.jsx`, `AcademicSetupPage.jsx`, `FixedAssetsPage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx`, `BillingPage.jsx`, `SchoolLogoManager.jsx` | Admin-specific dashboard, all module headers, finance/exams/library icons, notices and dialogs |
| Principal | `DashboardPage.jsx` plus shared school files | Principal-specific dashboard order and featured KPI; shared school module feedback |
| Teacher | `DashboardPage.jsx`, `WorkspacePage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx` | Teaching dashboard, attendance/exam icon marks, documents and notification surfaces |
| Parent | `DashboardPage.jsx`, `WorkspacePage.jsx`, `DocumentsPage.jsx`, `NotificationsPage.jsx` | Family dashboard, linked-student/children icons, documents and notification surfaces |
| Auth / shared shell | `AuthPage.jsx`, `PortalShell.jsx`, `Modal.jsx`, `ConfirmDialog.jsx`, `feedback.jsx`, `NotificationBell.jsx`, `App.jsx` | Auth icons, collapsed sign-out icon, animated unread badge, premium dialogs and toasts |

### E.2 New shared presentation component

`frontend/src/components/ModuleHeader.jsx` centralizes the page heading markup used across module pages. Titles, descriptions, action buttons, permission checks, and test selectors are unchanged.

### E.3 Micro-interactions

- `.motion-pop` on status badges and the notification unread badge
- `.motion-inline` on inline notices and error panels
- entrance/stagger utilities on stacked cards, capped at 8 first-mount items
- Recharts `<Bar isAnimationActive={!reduceMotion}>` on both dashboard chart surfaces; data and state untouched
- reduced-motion rules and print suppression in `styles.css`

---

## Phase F — Final verification and functional-preservation audit

**Status:** Complete  
**Date:** 2026-11-21  
**Git state:** uncommitted; no commit, push, reset, branch switch, or destructive command.

### F.1 Verification results

| Check | Command | Result |
|---|---|---|
| Icon checker | `npm run check:icons --workspace frontend` | Pass — 44 files scanned, 2 documented school-logo manual-review candidates |
| Unit tests | `npm test --workspace frontend` | Pass — 47/47 |
| Temporary production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-icons-final-build" --emptyOutDir` | Pass — 2,246 modules transformed |
| E2E | `npm run test:e2e --workspace frontend` | Pass — 25/25 |

### F.2 E2E regression resolution

- Two transient failures in navigation/role tests were reproduced as single-test passes and traced to a stale Vite dev server/HMR state. After stopping and restarting the dev server, the full suite passed.
- One deterministic failure in the school-logo E2E test was caused by changing the existing `ConfirmDialog` role from `dialog` to `alertdialog`, which broke the test's `getByRole("dialog")` selector. Restoring `role="dialog"` fixed the failure. The new `appFeedback` confirm surface still uses `alertdialog`.

### F.3 Functional-preservation diff audit

Reviewed all modified tracked files against the Phase 4 baseline:

- `DashboardPage.jsx` — data loading, derived values, `navigate()` calls, QuickActions role wiring, chart data and formatting are unchanged; only wrapper markup, class names, eyebrow/icon props, and reduced-motion chart prop were added.
- `WorkspacePage.jsx` — all loaders, form state, submit handlers, POST payloads, validation, permission gates, tab behavior, modal workflows, and test selectors are unchanged; only icon imports, `PAGE_ICONS`, and `ModuleHeader` wrapper were added.
- `Modal.jsx` — focus trap, focus restoration, scroll lock, backdrop close, and `onClose` invocation order unchanged; new props are optional with backward-compatible defaults.
- `ConfirmDialog.jsx` — `onConfirm()` still called exactly once with the same arguments; cancel still only closes; `busy` and duplicate guard only add in-flight protection; role kept as `dialog`.
- `feedback.jsx` — `role`, `aria-live`, message text, and dismiss behavior unchanged; `EmptyState`'s icon prop renamed internally only, no call-site change.
- `App.jsx` — only `<FeedbackHost />` added; routes, guards, lazy imports, and Suspense/ErrorBoundary structure unchanged.
- `PortalShell.jsx`, `NotificationBell.jsx`, `RowMenu.jsx`, `SchoolLogo.jsx`, `ErrorBoundary.jsx`, `AuthPage.jsx`, `VerifyEmailPage.jsx`, and module pages — icon import source and presentational markup only; no handler, payload, or selector changes.
- `styles.css` — presentation-only tokens, primitives, motion, z-index, responsive and reduced-motion rules. No behavior-bearing selector or class name removed. Decorative auth ring pseudo-element and CSS select chevrons were intentionally removed as part of the approved visual refresh; native select behavior retained.

No backend, database, API contract, authentication, permission, route, validation, polling, KPI, chart data, upload/download, logo handling, tenant data, or user-content change was made.

### F.4 Cleanup

- Removed `frontend/test-results/` artifacts from the failed E2E run.
- Stopped the background Vite dev server used for E2E verification.
- No temporary build output was written inside the repository.

### F.5 Final status

The SchoolFlow Icon, Motion, Micro-interaction, and Alert System is complete across all five portals and shared UI. All documented checks pass. Previous Phase 1–4 uncommitted work remains preserved. Nothing was committed or pushed.

---

## Phase 5 — Final Quality Assurance & Release Readiness

**Status:** Complete with documented non-blocking concerns  
**Date:** 2026-11-21  
**Method:** read-only audit except the two documentation files updated for this record. No localhost connection, no authentication/API request, no browser test, no backend/`.env`/dependency change, no deployment, and no commit or push.

### G.1 Verification actually run

| Check | Command / method | Actual result |
|---|---|---|
| Icon checker | `npm run check:icons --workspace frontend` | Pass — 44 source files scanned; 2 documented school-logo manual-review candidates; no application violations |
| Unit tests | `npm test --workspace frontend` | Pass — 47/47, 0 failed, 0 skipped |
| Temporary production build | `npx --no-install vite build --outDir "$env:TEMP\opencode\schoolflow-phase5-build" --emptyOutDir` | Pass — 2,246 modules transformed, built in 7.83s, output outside the repository |
| Whitespace check | `git diff --check` | One cosmetic blank line at EOF in `frontend/src/styles.css:1322`; no other whitespace error |
| WCAG token contrast | PowerShell WCAG relative-luminance formula applied to token pairs in both themes | All 11 sampled pairs ≥ 4.5:1 in light and dark; light minimum 5.36:1 (`warning` on `warning-soft`), dark minimum 6.09:1 (`faint` on `surface`) |
| Static design/CSS/a11y/icon/feedback audit | Read-only source inspection | No FAIL; concerns listed in G.5 |

**Not run in Phase 5:** Playwright/E2E, browser rendering, localhost/API/auth tests, backend tests, and production database access. The historical 25/25 E2E result recorded in Phase F is not re-asserted for Phase 5 because Playwright starts a localhost server and some specs submit login requests, both explicitly out of scope here.

### G.2 Five-portal design QA

| Portal | Evidence | Assessment |
|---|---|---|
| Platform Super Admin | `DashboardPage.jsx` platform wrapper/icon/eyebrow and rail quick actions; `WorkspacePage.jsx` platform headers and icons; `PlatformRevenuePage.jsx` header | Consistent with shared tokens and shell; PASS with note that `.layout-platform` has no dedicated CSS rule and uses the cascade |
| School Admin | `DashboardPage.jsx` admin wrapper, icon and featured KPI; module headers across workspace, academics, documents, fixed assets, notifications, billing, logo manager | Consistent; PASS with note that `.layout-school--admin` has no dedicated CSS rule and uses the cascade |
| Principal | `DashboardPage.jsx` principal wrapper/eyebrow, featured students KPI, school-at-a-glance before chart, rail quick actions | Consistent and role-distinct without data changes; PASS |
| Teacher | `DashboardPage.jsx` teaching wrapper, clipboard icon, timetable-first layout, reduced-motion chart; shared workspace modules | Consistent; PASS |
| Parent | `DashboardPage.jsx` family wrapper, heart icon, linked-student cards; `WorkspacePage.jsx` children icon and shared documents/notifications | Consistent; PASS |

Shared typography, spacing, cards, tables, forms, modal layout, icon alignment, light/dark tokens, focus styles, reduced-motion rules, inline notices and dialogs use the same token-driven system across all five portals. Inline `Notice`/`ConfirmDialog` remain the live feedback path; the new global `appFeedback` host is mounted once and remains dormant.

### G.3 Responsive and accessibility findings

- Breakpoints present in `styles.css`: 640, 520, 1280, 1080, 900, 760, 560, 420, plus reduced-motion and print blocks. There is no exact 360px or 768px rule.
- 360px is covered by the 420/520/640/760/900/1080 cascades; 768px is covered by the 900/1080/1280 rules; 1280px has a dedicated rule.
- Overflow guards inspected: `body { min-width: 320px }`, `.table-scroll { overflow-x: auto }`, scrollable navigation and modal bodies, wrapping toast descriptions.
- Existing E2E coverage inspected but not run: 390px login and workspace overflow checks plus dialog focus trap/restore in `e2e/auth-and-roles.spec.js`; `e2e-real/real-workflow.spec.js` includes 360/390/768/1280/1440 overflow checks but is outside the default Playwright `testDir` and requires real login.
- Accessibility evidence: global `:focus-visible` ring, sidebar focus override, modal focus trap/Escape/scroll lock/focus restoration, semantic live regions on notices/toasts, labelled icon-only controls, `prefers-reduced-motion` CSS, and `isAnimationActive={!reduceMotion}` on dashboard charts.
- Concerns: input focus is expressed with `box-shadow` rather than `outline`; tab semantics are mixed (`tablist` in academics vs `role="group"`/`aria-pressed` elsewhere); a previously documented collapsed-sidebar `display: revert` edge remains at narrow widths.

### G.4 Functional diff audit — every modified JSX file

| File | Functional change |
|---|---|
| `App.jsx` | None — one `FeedbackHost` import and mount only; routes, guards, lazy imports, Suspense and ErrorBoundary unchanged |
| `ConfirmDialog.jsx` | Added in-flight duplicate-submit guard; `onConfirm()` still called exactly once with the same arguments; cancel still only closes; role remains `dialog`. All 6 call sites are byte-identical to HEAD |
| `ErrorBoundary.jsx` | None — icon import source only |
| `Modal.jsx` | New optional presentational/ARIA props with backward-compatible defaults; focus trap, restoration, scroll lock, Escape and backdrop close unchanged |
| `NotificationBell.jsx` | None — icon source and `motion-pop` class only |
| `PortalShell.jsx` | None — icon source and sign-out icon only; `logout` handler unchanged |
| `RowMenu.jsx` | None — icon import source only |
| `SchoolLogo.jsx` | None — icon import source only; logo URLs/tenant data untouched |
| `feedback.jsx` | None — roles, live regions, messages and dismiss behavior unchanged; `EmptyState` icon prop renamed internally only |
| `AcademicSetupPage.jsx` | Header markup replaced by `ModuleHeader`; title, description, action handler and selectors unchanged |
| `AuthPage.jsx` | None — icon import source only; login/validation/error flow unchanged |
| `BillingPage.jsx` | Header markup only; data loading and billing actions unchanged |
| `DashboardPage.jsx` | Presentation wrappers, icons/eyebrows, featured KPI emphasis, class names and reduced-motion chart prop only; API loads, derived values, formatting, navigation and chart data unchanged |
| `DocumentsPage.jsx` | Header markup only; upload/delete/download workflows unchanged |
| `FixedAssetsPage.jsx` | Header markup only; CSV export, asset creation/disposal and validation unchanged |
| `NotificationsPage.jsx` | Header markup only; mark-read behavior unchanged |
| `PlatformRevenuePage.jsx` | Header markup/kicker only; payment recording unchanged |
| `SchoolLogoManager.jsx` | One presentation class added; upload/remove validation and handlers unchanged |
| `VerifyEmailPage.jsx` | None — icon import source only |
| `WorkspacePage.jsx` | Added `PAGE_ICONS` and `ModuleHeader` wrapper; all loaders, form state, submit handlers, payloads, permission gates, tabs, modals and selectors unchanged |

Protection checks: API call/handler/state-setter multisets are identical to HEAD in every changed JSX file except the intentional `ConfirmDialog` guard; all original human-readable strings remain present; package.json has exactly one added script (`check:icons`); no backend, database, migration, `.env`, lockfile, authentication, permission, route, validation, calculation, polling, upload/download or tenant-data file changed.

### G.5 Code quality and cleanup

- Only `registry.js` imports `lucide-react` in application source.
- No truly undefined CSS variables: `--i`, `--icon-button-size` and `--toast-duration` use fallbacks and/or inline runtime setters.
- Unused icon aliases and registry names remain intentionally as migration-compatible wrappers; they were not removed without proof of non-use.
- Duplicate strings exist between dormant `appFeedback` defaults and existing inline feedback (`Working…`, `Please try again.`, `Update complete`, `Close`), but no business action was migrated to the new system.
- Hardcoded colors remain only in documented exceptions (tenant logo white backdrop, notice hover, export/print palette) plus a minor module-layer literal; no broad color-system regression found.
- No temporary build output, Playwright report or test-results directory was added to the repository. `frontend/dist/` is ignored. The Phase 5 build was written to `%TEMP%\opencode\schoolflow-phase5-build`.
- The stale `--select-arrow` documentation row was corrected: the implementation uses the native select affordance and no such token exists.

### G.6 Remaining issues

1. Prior local connectivity diagnosis established that the frontend correctly targets `http://localhost:5000/api/v1` but the backend process was not listening on port 5000; this environment issue was not touched in Phase 5.
2. `appFeedback` remains dormant infrastructure; two feedback systems coexist.
3. Unused icon aliases/registry mappings remain by design and can be pruned in a separate proven-cleanup pass.
4. No dedicated 360px/768px CSS rules and no fresh browser matrix; responsive behavior relies on breakpoint cascades and historical tests only.
5. Minor accessibility consistency items: input focus via box-shadow, mixed tab semantics, collapsed-sidebar narrow-width edge.
6. `git diff --check` reports one cosmetic blank line at EOF in `styles.css`.

### G.7 Files modified during QA

Only `docs/PROGRESS.md` and `docs/DESIGN_SYSTEM.md`. No source, backend, configuration, dependency, `.env` or production data was modified. No commit or push was made.
