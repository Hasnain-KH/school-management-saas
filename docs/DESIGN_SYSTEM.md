# SchoolFlow Design System

**Status:** Phase 4 module presentation complete (Phases 1–3 retained)  
**Source of truth:** `frontend/src/styles.css`  
**Theme selection:** automatic via `@media (prefers-color-scheme: dark)`  
**Theme UI:** none; do not add a toggle or persist a theme in application state

This document defines the tokens and rules introduced in Phase 1. Phase 1 changes presentation only: no component, route, authentication, permission, state, handler, validation, or business-logic behavior was changed. Existing class names, SchoolFlow branding, tenant school names/logos, the Tailwind import, and Tailwind Preflight are preserved.

---

## 1. Core principles

1. **One accent, restrained use.** Muted blue is the only interaction accent. Use it for primary actions, links, active/selected states, focus, and informational surfaces. Do not use it as broad decoration.
2. **Neutral-first surfaces.** Cards, tables, modals, and page backgrounds use neutral surfaces and borders. Color is reserved for meaning and state.
3. **Token-only color.** Components must not introduce raw hex/rgba color literals. Add a token and update this document if a new color role is genuinely needed.
4. **Automatic dark mode.** Light and dark values share the same token names. Dark overrides live in the `prefers-color-scheme: dark` block; no JavaScript theme state is introduced.
5. **Calm motion.** Interaction transitions are 150–200ms. `prefers-reduced-motion: reduce` removes animation, transition, and active-state movement.
6. **Visible, non-destructive focus.** Keyboard focus uses an outline and offset. Focus styles must never change an element’s border radius or layout.
7. **Brand preservation.** SchoolFlow wordmark, tenant names, tenant logos, and the existing class-name contract are unchanged.

---

## 2. Typography

No font dependency was added. The system UI stack is intentional and replaces the previous unloaded `Inter` declaration.

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | All UI text |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace` | Code/identifiers where needed |
| `--fs-2xs` | `11px` | Metadata, uppercase labels |
| `--fs-xs` | `12px` | Secondary metadata, hints |
| `--fs-sm` | `13px` | Dense UI, table cells, controls |
| `--fs-md` | `14px` | Body text, form labels |
| `--fs-lg` | `16px` | Section headings, confirmations |
| `--fs-xl` | `20px` | Page-level subheadings |
| `--fs-2xl` | `24px` | Auth headings, large values |
| `--fs-3xl` | `30px` | Reserved display size |
| `--fw-regular` | `400` | Body copy, hints |
| `--fw-medium` | `500` | Quiet labels, secondary text |
| `--fw-semibold` | `600` | Controls, tables, form labels |
| `--fw-bold` | `700` | Headings, strong values, emphasis |
| `--lh-tight` | `1.2` | Large headings |
| `--lh-snug` | `1.4` | Compact headings/labels |
| `--lh-normal` | `1.55` | Body copy and wrapped text |

**Rules**

- Use only the four defined weights. Nonstandard weights such as `640`, `660`, or `750` were removed because `font-synthesis: none` makes them platform-dependent.
- Use `var(--lh-normal)` for wrapped paragraphs. Reserve tight line heights for large headings.
- Do not add `Inter` or another webfont without an explicit dependency decision.

---

## 3. Spacing

Use the 4px-based scale for all new layout work. Existing component literals will migrate in later phases; the scale is now available and documented.

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-7` | `32px` |
| `--space-8` | `40px` |
| `--space-9` | `48px` |
| `--space-10` | `64px` |

**Rules**

- Prefer these tokens for `gap`, `padding`, and `margin` in new presentation work.
- Keep dense table/control spacing intentional; do not increase spacing in a way that reduces information density without approval.

---

## 4. Color tokens

### 4.1 Neutral surfaces and text

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--bg` | `#f4f6f9` | `#111827` | Page background |
| `--surface` | `#ffffff` | `#1b2432` | Cards, modals, menus, primary surfaces |
| `--surface-2` | `#eef2f6` | `#222e3d` | Table headers, quiet fills, hover backgrounds |
| `--surface-3` | `#e7ecf2` | `#293648` | Neutral badges, skeletons, icon wells |
| `--line` | `#e1e6ed` | `#303d4e` | Default borders and dividers |
| `--line-strong` | `#d2dae4` | `#3c4a5d` | Input and control borders |
| `--ink-strong` | `#192536` | `#e8edf4` | Page titles, primary metric values |
| `--ink` | `#26364a` | `#d5dfec` | Section headings, emphasized labels |
| `--text` | `#556374` | `#bbc6d3` | Body text, table cells |
| `--muted` | `#586676` | `#a9b6c7` | Secondary text |
| `--faint` | `#5c6a7a` | `#96a3b4` | Tertiary text/metadata |

The light muted/faint values are intentionally darker than the initial direction so 11–13px text still meets WCAG AA on `--surface-3`, the darkest neutral surface.

### 4.2 Primary accent

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--brand` | `#2f5d8c` | `#93b9e8` | Primary fills, focus, active indicators |
| `--brand-dark` | `#284f79` | `#a9caf0` | Legacy dark accent alias |
| `--brand-strong` | `#244a70` | `#bdd7f4` | Active nav/link text |
| `--brand-hover` | `#284f79` | `#a9caf0` | Primary button hover |
| `--brand-soft` | `#edf3f9` | `#1e3348` | Tinted selection/info surface |
| `--brand-soft-2` | `#dce8f3` | `#29445e` | Stronger tint/border companion |
| `--brand-ink` | `#244a70` | `#bdd7f4` | Text on tinted surfaces |
| `--brand-line` | `#b9ccdf` | `#4e7398` | Tinted borders and control hovers |
| `--brand-ring` | `rgba(47, 93, 140, 0.18)` | `rgba(147, 185, 232, 0.28)` | Focus halo |
| `--brand-glow` | `rgba(47, 93, 140, 0.16)` | `rgba(147, 185, 232, 0.14)` | Subtle accent shadow |
| `--on-brand` | `#ffffff` | `#111827` | Foreground on `--brand` fill |

### 4.3 Semantic status

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--success` | `#176b52` | `#7fd1b2` | Success text/icons |
| `--success-soft` | `#e9f4ef` | `#17382f` | Success surface |
| `--success-line` | `#c8e2d6` | `#2b5a4b` | Success border |
| `--warning` | `#8a5a12` | `#e2b36a` | Warning/pending text/icons |
| `--warning-soft` | `#fbf3e5` | `#392e1d` | Warning surface |
| `--warning-line` | `#ead9b8` | `#5c492c` | Warning border |
| `--danger` | `#a4313c` | `#f28e96` | Error/destructive text/icons |
| `--danger-soft` | `#fbeced` | `#3d2429` | Error surface |
| `--danger-line` | `#ebcdd1` | `#65353d` | Error border |
| `--danger-hover` | `#8f2731` | `#f7a9af` | Destructive button hover |
| `--on-danger` | `#ffffff` | `#111827` | Foreground on `--danger` fill |
| `--info` | `#2f5d8c` | `#93b9e8` | Informational text/icons |
| `--info-soft` | `#edf3f9` | `#1e3348` | Informational surface |
| `--info-line` | `#cfddea` | `#355573` | Informational border |

### 4.4 Neutral legacy role

`--violet`, `--violet-soft`, and `--violet-line` are retained as neutral aliases so existing `.badge-graduated` and `.tone-violet` class contracts keep working. Do not use them for new work.

| Token | Light | Dark |
|---|---|---|
| `--violet` | `#5d6c7e` | `#9eacc0` |
| `--violet-soft` | `#eef2f6` | `#273340` |
| `--violet-line` | `#e1e6ed` | `#38495e` |

### 4.5 Shell tokens

The navigation frame uses a premium deep slate/navy palette. These roles are intentionally identical in light and dark themes so the shell stays visually stable when the automatic theme switches.

| Token | Value | Purpose |
|---|---|---|
| `--sidebar-bg` | `#17243a` | Sidebar background |
| `--sidebar-surface` | `#1d2c45` | School card, status card, sign-out, tooltip surface |
| `--sidebar-line` | `#2a3b56` | Sidebar dividers and quiet borders |
| `--sidebar-line-strong` | `#37506f` | Sidebar control borders and hover borders |
| `--sidebar-ink` | `#eef3f9` | Wordmark, school name, active labels, primary sidebar text |
| `--sidebar-text` | `#c6d2e0` | Navigation labels and secondary sidebar text |
| `--sidebar-muted` | `#9fb0c5` | Icons, group labels, metadata |
| `--sidebar-faint` | `#8fa2ba` | Uppercase group titles |
| `--sidebar-hover` | `#22334d` | Navigation and control hover fill |
| `--sidebar-active` | `#243d5a` | Active navigation fill |
| `--sidebar-active-ink` | `#f4f8fc` | Active navigation label |
| `--sidebar-accent` | `#93b9e8` | Muted blue accent for marks, icons, indicators, avatars |
| `--sidebar-accent-ink` | `#111827` | Foreground on `--sidebar-accent` |
| `--sidebar-focus` | `#bdd7f4` | Keyboard focus outline inside the navy shell |

Tenant-provided logo images keep the documented white asset backdrop. Fallback marks and avatars use the shell accent roles above.

### 4.6 Theme-aware literals

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--topbar-bg` | `#ffffff` | `#1b2432` | Solid sticky topbar fill |
| `--overlay-bg` | `rgba(15, 27, 51, 0.5)` | `rgba(0, 0, 0, 0.62)` | Modal/mobile-scrim backdrop |
| `--tooltip-bg` | `#1b2432` | `#e8edf4` | Collapsed-nav tooltip |
| `--tooltip-fg` | `#ffffff` | `#111827` | Collapsed-nav tooltip text |
| `--scrollbar-thumb` | `#c8d1e0` | `#405066` | Scrollbar thumb |
| `--scrollbar-thumb-hover` | `#afbcca` | `#51637b` | Scrollbar thumb hover |
| `--selection-bg` | `#dce8f3` | `#29445e` | Text selection background |
| `--selection-fg` | `#244a70` | `#e8edf4` | Text selection foreground |
| Native `select` affordance | browser default | browser default | Chevron is supplied by the browser; no encoded SVG token is used |

**Exceptions**

- `.school-logo--image` keeps a white backdrop so tenant-provided logos remain legible. This is a brand-asset exception, not a general surface token.
- The authentication story panel reuses the shell navy tokens with a solid fill and no decorative rings or gradients. The form card uses the standard neutral surface tokens.

---

## 5. Radius, elevation, and stacking

### Radii

| Token | Value |
|---|---|
| `--r-xs` / `--radius-xs` | `6px` |
| `--r-sm` / `--radius-sm` | `8px` |
| `--r-md` / `--radius-md` | `10px` |
| `--r-lg` / `--radius-lg` | `14px` |
| `--r-xl` / `--radius-xl` | `18px` |
| `--r-pill` / `--radius-pill` | `999px` |

**Rules**

- Controls and table affordances: `--r-xs` or `--r-sm`.
- Cards, menus, and forms: `--r-md` or `--r-lg`.
- Modals: `--r-xl`.
- Status dots/avatars: `--r-pill`.
- Do not introduce new corner radii in components.

### Elevation

| Token | Light | Dark |
|---|---|---|
| `--shadow-color` | `rgba(18, 32, 52, 0.06)` | `rgba(0, 0, 0, 0.28)` |
| `--sh-xs` / `--shadow-xs` | `0 1px 2px rgba(18, 32, 52, 0.05)` | `0 1px 2px rgba(0, 0, 0, 0.24)` |
| `--sh-sm` / `--shadow-sm` | `0 1px 3px rgba(18, 32, 52, 0.06), 0 1px 2px rgba(18, 32, 52, 0.04)` | `0 1px 3px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.2)` |
| `--sh-md` / `--shadow-md` | `0 6px 18px rgba(18, 32, 52, 0.08), 0 2px 6px rgba(18, 32, 52, 0.05)` | `0 6px 18px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.22)` |
| `--sh-lg` / `--shadow-lg` | `0 18px 44px rgba(18, 32, 52, 0.12), 0 4px 12px rgba(18, 32, 52, 0.06)` | `0 18px 44px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.26)` |
| `--sh-xl` / `--shadow-xl` | `0 28px 70px rgba(18, 32, 52, 0.18)` | `0 28px 70px rgba(0, 0, 0, 0.5)` |
| `--sh-focus` | `0 0 0 3px var(--brand-ring)` | inherited token, resolves via dark `--brand-ring` |

**Rules**

- `--sh-xs` for subtle control lift, `--sh-sm` for cards, `--sh-md` for hover elevation, `--sh-lg` for menus/popovers, `--sh-xl` for modals and the mobile sidebar.
- Do not stack multiple heavy shadows. `--sh-focus` is for input focus rings, not decoration.

### Stacking

| Token | Value | Use |
|---|---|---|
| `--z-raised` | `1` | Sticky table headers, auth-panel content |
| `--z-topbar` | `30` | Sticky topbar |
| `--z-mobile-scrim` | `35` | Mobile sidebar scrim |
| `--z-sidebar` | `40` | Fixed sidebar |
| `--z-row-menu` | `45` | Row action menu |
| `--z-popover` | `60` | Tooltips, account menu, modal backdrop |

---

## 6. Motion and accessibility

| Token | Value |
|---|---|
| `--duration-fast` | `150ms` |
| `--duration-base` | `180ms` |
| `--duration-slow` | `200ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| `--t-fast` | `var(--duration-fast) var(--ease-standard)` |
| `--t-base` | `var(--duration-base) var(--ease-standard)` |
| `--t-slow` | `var(--duration-slow) var(--ease-standard)` |
| `--ease-out` | `var(--ease-standard)` |
| `--focus-ring` | `var(--brand)` |
| `--focus-halo` | `var(--brand-ring)` |

**Rules**

- Interaction transitions must stay within `150–200ms`; no `320ms` hover/state transitions in new work.
- Use `--t-fast` for color/border changes, `--t-base` for menus/feedback, and `--t-slow` only for entrances or layout-width changes.
- Keyboard focus is a `2px` outline with `2px` offset using `--focus-ring`. Never set `border-radius` in a focus rule.
- `.modal-card:focus:not(:focus-visible)` suppresses programmatic focus rings; `.modal-card:focus-visible` restores a visible outline.
- Under `prefers-reduced-motion: reduce`, all animation/transition durations become `0.01ms`, iteration counts become `1`, card hover lifts and active transforms are disabled, and collapsed-nav tooltips stop sliding while remaining vertically centered.

---

## 7. Layout

| Token | Value |
|---|---|
| `--sidebar-w` | `264px` |
| `--sidebar-w-collapsed` | `78px` |
| `--topbar-h` | `64px` |

These preserve the existing shell geometry. Sidebar color and density changes are Phase 2.

---

## 8. Contrast verification

Computed WCAG 2.1 contrast for the defined foreground/background token pairs:

| Theme | Pairs checked | Minimum ratio | Result |
|---|---:|---:|---|
| Light | 32 | `4.65` (`--faint` on `--surface-3`) | All pass AA (≥ 4.5:1) |
| Dark | 32 | `4.78` (`--faint` on `--surface-3`) | All pass AA (≥ 4.5:1) |

Checked pairs include all text roles on every neutral surface, brand-ink on tinted surfaces, each semantic status color on its soft surface and on page surfaces, and filled-button/tooltip/selection foreground-background pairs.

Phase 2 added a separate shell audit: 22 navy-shell/topbar pairs were checked in each theme. The minimum ratio is `5.02:1` in both themes, so the deep slate/navigation and solid-header presentation also meets AA.

When adding or changing a color token, re-run the contrast check before merging.

---

## 9. Usage checklist

- [ ] Color comes from a token, not a raw literal.
- [ ] The token has a light and dark role where it is theme-sensitive.
- [ ] Text meets at least 4.5:1 against every surface it appears on.
- [ ] Semantic colors are used only for real status/meaning.
- [ ] Accent color is used sparingly.
- [ ] Spacing uses the 4px scale.
- [ ] Radius, shadow, and z-index come from tokens.
- [ ] Transitions are 150–200ms.
- [ ] Focus remains visible and does not alter geometry.
- [ ] Reduced-motion behavior still works.
- [ ] Existing class names, branding, tenant logos, and functional attributes are unchanged.

---

## 10. Dashboard presentation layer (Phase 3)

All five role dashboards use the same token-only presentation layer in `frontend/src/styles.css`:

- `.dashboard-page` provides a consistent vertical rhythm; role wrappers (`.layout-platform`, `.layout-school--admin`, `.layout-school--principal`, `.layout-teacher`, `.layout-parent`) provide distinct content arrangements.
- `.metric-grid--dashboard` and `.metric-card--dashboard` define KPI cards. `.metric-card--feature` highlights the single role-relevant KPI using `--brand-soft`/`--brand-soft-2`; no new colors were introduced.
- `.panel-card`, `.chart-area--panel`, `.summary-list--panel`, `.quick-grid--panel`, and `.quick-action--panel` are the shared content-panel vocabulary. `.quick-grid--rail` is the compact action variant used by platform and principal dashboards.
- Recharts output is themed through CSS rather than JavaScript theme state: grid lines use `--line`, axis ticks use `--muted`, bars use `--brand`, the hover cursor uses `--brand-soft`, and the tooltip uses `--surface`/`--line`/`--sh-md`. Chart props pass the same `var()` tokens as a fallback.
- Dashboard panels collapse to one column at 1080px, tighten at 760px, and drop the header icon/action chevrons at 420px. Reduced-motion rules already cover the inherited card hover and entrance animations.

Contrast for new token pairs was verified: the lowest new pair is `--muted` on `--brand-soft` at `5.25:1` (light) and `6.29:1` (dark), both above AA.

---

## 11. Module and page presentation layer (Phase 4)

All non-dashboard modules use one shared presentation vocabulary in `frontend/src/styles.css`. It is intentionally anchored to `.module-header` so the approved Phase 2 guest/auth surfaces and Phase 3 dashboards are not restyled.

### 11.1 Shared module header

- `frontend/src/components/ModuleHeader.jsx` replaces duplicated local headers without changing the `.page-intro`, `.page-kicker`, `h1`, `p`, or `.intro-action` contract relied on by E2E tests and assistive technology.
- A decorative Lucide icon appears in a 44px tinted well (`--brand-soft`, `--brand-soft-2`, `--brand-ink`) and is `aria-hidden`; it never becomes a control or a new navigation destination.
- `PAGE_ICONS` in `WorkspacePage.jsx` supplies the appropriate restrained icon for every generic directory and specialized view. Platform and plans reuse one component with dynamic icons.
- The header stacks at 760px, uses full-width actions on small screens, and drops the icon well at 420px; the `h1` and description remain visible at every supported width.

### 11.2 Refined module surfaces

The token-only Phase 4 layer refines the presentation of:

- content cards and section headings;
- table toolbars, search fields, filter toolbars, sticky table headers, row hover, cells, and pagination;
- tabs for academic setup, finance, library, platform, parent records, and reports;
- form stacks/grids, dialog headers and bodies, and workflow panels;
- report filters/results, profile and plan cards, asset history, notifications, documents, parent tables, and the embedded logo manager subpanel;
- responsive padding and reflow at 760px and 420px.

Class names that carry behavior, test selectors, or accessibility semantics are preserved. Modal focus trapping, row menus, confirm dialogs, feedback states, role guards, tablist keyboard behavior, form names/IDs/bindings, request payloads, and routes are unchanged.

### 11.3 Token and accessibility rules

- No new color role was introduced. Every value in the Phase 4 block comes from an existing token in sections 2–7; the block contains no raw hex or `rgba()` color literal.
- The accent remains restrained: it is used for the decorative icon well, kicker mark, focus, and existing active/primary states only.
- Automatic light/dark theme selection remains unchanged; no theme toggle or persisted theme state was added.
- Text/background combinations continue to use the AA-verified token pairs from section 8. The icon well uses the already-verified `--brand-ink` on `--brand-soft` pair.
- Focus styles and `prefers-reduced-motion: reduce` rules are inherited unchanged from Phases 1–2.

Coverage of every route, workspace view, form, table, modal, detail view, and workflow is recorded in `docs/PROGRESS.md` under Phase 4.

---

## 6B. Icons, Motion and Alerts

**Status:** Phase A audit complete; implementation record in Section 6C  
**Governing rule:** UI-only. No route, handler, API, state, permission, validation, database, or workflow change is authorized in this mission.  
**Theme:** automatic `@media (prefers-reduced-motion: reduce)` and `@media (prefers-color-scheme: dark)` behavior remains unchanged; no theme toggle or animation toggle is added.

### 6B.1 Phase A findings

The complete frontend was audited across all five portals (Platform Super Admin, School Admin, Principal, Teacher, Parent), authentication, and shared components.

| Area | Baseline finding |
|---|---|
| Emoji / pictographic UI icons | 0 |
| Unicode glyphs used as icons | 4: `✓` and `×` in `WorkspacePage.jsx:942`, `×` in `feedback.jsx:24`, `⏻` in `styles.css:400` |
| Icon sources | 105 `lucide-react` import entries across 18 files; 52 unique component names; no other icon library, icon font, inline `<svg>`, or `<i>` icon class |
| Image/stored icons | 2 `<img>` UI uses: stored school logo in `SchoolLogo.jsx:26` and object-URL preview in `SchoolLogoManager.jsx:112`; stored endpoint `/schools/me/logo?v=...` in `SchoolLogo.jsx:8-10` |
| CSS image icons | 2 `data:image/svg+xml` select chevrons at `styles.css:142,252`, applied at `styles.css:717`; manual-review items for Phase C |
| Native browser dialogs | 0 `window.alert`, `window.confirm`, `window.prompt`, bare equivalents, `<dialog>`, or `showModal` |
| Confirmations | 6 `ConfirmDialog` usages; shared `ConfirmDialog.jsx` wraps `Modal.jsx` |
| Modals | 15 `<Modal>` occurrences/usage sites including `ConfirmDialog.jsx` |
| Feedback primitives | `Notice` 14, `ErrorState` 19, `LoadingState` 8, `EmptyState` 23, `SkeletonRows` 17 |
| Inline live regions | 17 static/dynamic `role="alert"` / `role="status"` sites |
| Toasts / browser notifications | 0 toast systems and 0 browser Notification API usage |
| In-app notifications | `schoolflow:notifications-changed` in `NotificationBell.jsx` and `NotificationsPage.jsx`; 60-second unread-count poll; `schoolflow:session-expired` in `api/client.js` handled by `AuthProvider.jsx` |
| Motion | 23 CSS transitions, 16 CSS animations, 5 animation delays, 9 `@keyframes` blocks, one reduced-motion block at `styles.css:1201-1212`; no animation library and no JS `matchMedia` |
| Motion cleanup item | `sf-slide-in-right` is defined at `styles.css:961` but unused |

### 6B.2 Icon system decisions for Phase B/C

- Phase B will create the central JSX registry under `frontend/src/components/ui/icon/` using `icons.jsx`, `Icon.jsx`, `IconBadge.jsx`, and `IconButton.jsx`.
- Lucide is the only application UI icon source. After Phase C migration, direct `lucide-react` imports outside the central registry are not allowed.
- Global icon stroke width: **1.75**. Icon sizes: `sm=16`, `md=18`, `nav=20`, `lg=24`, `xl=32`, `2xl=40`, all using `currentColor` and `flex-shrink: 0`.
- Decorative icons remain `aria-hidden="true"`; meaningful icon-only controls require an accessible label.
- `IconBadge` tones are limited to existing semantic token roles: `primary`, `teal`, `amber`, `success`, `danger`, `info`, `neutral`; sizes 32/40/48px.
- `IconButton` uses the existing 36/40px control convention, a 44px mobile target, required label, and existing action handlers. It must not create a competing button system.
- Protected from icon migration: SchoolFlow wordmark, school logos, logo upload/remove behavior, tenant initials/names, user-generated text, document names, notices, comments, remarks, and stored records.
- `npm run check:icons --workspace frontend` will be added in Phase B as a dependency-free Node.js checker. It must inspect application-controlled UI files only and exclude user content, uploads, fixtures, seed data, `dist/`, `node_modules/`, and stored records.

Checker whitelist/manual-review categories:

- Legitimate typography: `·`, `—`, `–`, `…`, `’`, and `©` footer copy.
- SchoolFlow wordmark and tenant/school name text.
- Stored school logo and object-URL logo preview assets.
- Recharts chart graphics and existing decorative auth illustration.
- `<img>` and CSS `background-image` occurrences are reported for manual review, not automatically deleted.

### 6B.3 Motion decisions for Phase B/E

- Define motion tokens once in `frontend/src/styles.css` using existing CSS variables.
- Durations: instant 100ms, fast 150ms, base 200ms, slow 300ms, data animation 600–800ms only where already useful.
- Easings: standard `cubic-bezier(0.2, 0, 0, 1)`, out `cubic-bezier(0.16, 1, 0.3, 1)`, in `cubic-bezier(0.4, 0, 1, 1)`, pop `cubic-bezier(0.34, 1.4, 0.64, 1)`. Pop is limited to status icon entry and notification badge appearance.
- Distances: entrances 8px, toasts 12px, inline messages 4px.
- Useful utilities only: `.motion-fade-up`, `.motion-stagger`, `.motion-pop`, `.motion-shake`, `.motion-draw`, `.motion-pulse-once`, `.motion-shimmer`.
- Preserve and do not duplicate the approved global reduced-motion block; reduce durations to approximately 0.01ms, disable loops/drawing/count-up motion, and keep all information available without animation.
- Z-index hierarchy remains `dropdown < drawer < modal < toast` using existing tokens; no competing z-index system.
- No count-up hook, polling, new timers, listeners, hooks, API requests, or state solely for animation.

### 6B.4 Feedback decisions for Phase D/E

- Extend the existing `Modal.jsx`, `ConfirmDialog.jsx`, `feedback.jsx`, and notification components; do not replace working focus management with a new unproven system.
- Dialog roles: `role="alertdialog"` for confirmations, `role="dialog"` for status dialogs, with `aria-modal`, `aria-labelledby`, `aria-describedby`, focus trap, focus restoration, and background scroll protection.
- Only one modal dialog may be active; queue later dialogs if needed. Toasts render above dialogs.
- Confirmation must execute the original handler with the same arguments and order; cancel executes nothing; disable duplicate submissions during in-flight work.
- Preserve all existing meaningful success/error messages and prevent duplicate feedback for the same action.
- Toast anatomy: semantic Lucide icon, title, optional description, close control, and optional progress indicator. Desktop top-end; mobile bottom-center. Maximum three visible. Durations: success 4s, info 5s, warning 6s, error 8s; actionable errors do not auto-dismiss.
- Inline alert variants are `success`, `warning`, `error`, and `info`, with restrained 4px entrance movement and smooth dismissal that does not shift surrounding content.
- Phase A found no native browser dialogs to convert and no existing toast library to theme.

### 6B.5 Protected functional contracts

The following remain unchanged unless explicitly approved: routes and role guards; auth/session handling; notification events and polling; all form names, bindings, and validation; all CRUD, upload, download, export, publish, suspend, approve, dispose, mark-read, and navigation handlers; focus/live-region contracts; test selectors; and all user-generated or stored content.

---

## 6C. Implementation record (v3.2 B–F)

**Status:** Complete — full Icon, Motion, Micro-interaction, and Alert System implementation  
**Date:** 2026-11-21  
**Baseline:** `a2ec9df feat: complete SchoolFlow development updates` plus uncommitted Phase 1–4 work (preserved)  
**Application source changes:** frontend UI only; no backend, database, API, auth, permissions, routes, validation, workflows, polling, `.env`, dependency, or git-state changes.

### 6C.1 Central icon system

Created under `frontend/src/components/ui/icon/`:

| File | Purpose |
|---|---|
| `registry.js` | Single Lucide import boundary and 100+ semantic icon mappings |
| `icons.jsx` | `<Icon>` plus migration-compatible named wrappers (existing JSX and handlers untouched) |
| `IconBadge.jsx` | Semantic status badge primitive using existing tone tokens |
| `IconButton.jsx` | Accessible icon-only control using the existing 36/40px button conventions |

The global stroke width is `1.75`; sizes are `sm=16`, `md=18`, `nav=20`, `lg=24`, `xl=32`, `2xl=40`, all using `currentColor` and `flex-shrink: 0`. Meaningful icon-only controls require an accessible label; decorative icons are `aria-hidden`.

All 18 files that previously imported `lucide-react` directly were migrated. After migration, `registry.js` is the only application file importing `lucide-react`. Existing named component imports (`<Bell>`, `<Search>`, `<Plus>`, etc.) were preserved through wrappers, so no event handler, prop, or import call site had to change.

### 6C.2 Unicode / CSS icon sweep

Replaced application-controlled Unicode glyphs and CSS image icons with Lucide components:

- `feedback.jsx` notice dismiss `×` → `<X>`
- `WorkspacePage.jsx` subscription feature chips `✓`/`×` → `<Check>` / `<X>`
- `PortalShell.jsx` collapsed sign-out `⏻` → `<LogOut>`
- `styles.css` two `data:image/svg+xml` select chevrons removed; native `select` affordance retained

Protected exceptions remain unchanged: the stored school logo `<img>` and object-URL preview `<img>` in the school branding / logo-management surfaces. The checker reports them as manual-review candidates.

### 6C.3 Icon checker

Added `frontend/scripts/check-icons.mjs` and `npm run check:icons --workspace frontend`. The checker is dependency-free, scans application-controlled UI files, excludes stored/user content and generated output, and enforces:

- no direct `lucide-react` imports outside `registry.js`
- no emoji or pictographic icon text in application UI
- no Unicode glyphs used as icons in UI-rendered strings
- no CSS `data:image/svg+xml` icon backgrounds
- no native browser dialogs

Final run: scanned 44 files, passed with 2 documented school-logo manual-review candidates.

### 6C.4 Motion and z-index

Added motion tokens and utilities to `frontend/src/styles.css`:

- durations: `instant=100ms`, `fast=150ms`, `base=200ms`, `slow=300ms`, `data=600–800ms`
- easings: standard / out / in / pop; pop limited to status badges and notification badge entry
- distances: entrances 8px, toasts 12px, inline messages 4px
- utilities: `.motion-fade-up`, `.motion-stagger`, `.motion-pop`, `.motion-shake`, `.motion-draw`, `.motion-pulse-once`, `.motion-shimmer`
- first-mount stagger capped at 8 items
- unified z-index: `dropdown < drawer < modal < toast`
- extended reduced-motion behavior near the existing authoritative global block; print suppresses motion
- Recharts bar animations in both dashboard chart surfaces now honor `usePrefersReducedMotion` without changing data or state

No animation library, count-up hook, polling loop, extra timer, or animation-only state was added.

### 6C.5 Dialog, alert, and feedback system

Extended the existing primitives rather than replacing them:

- `Modal.jsx`: optional `className`, `role`, `ariaDescribedBy`, `hideHeader`, `closeLabel`; focus trap, scroll lock, focus restoration, and backdrop close preserved
- `ConfirmDialog.jsx`: semantic `IconBadge`, premium layout, busy spinner, duplicate-confirm guard, `aria-describedby`; original handlers, arguments, order, and cancel behavior preserved; `role="dialog"` retained to preserve the existing E2E selector contract
- `feedback.jsx`: unified `Notice` variants (`success/warning/error/info`) with semantic icons and Lucide dismiss control; existing `role`, live-region, and persistent inline behavior preserved
- new `appFeedback` API: queued status/confirm dialogs and toasts
- new components: `feedbackStore.js`, `FeedbackHost.jsx`, `StatusDialog.jsx`, `ToastViewport.jsx`, `feedbackHelpers.js`; host mounted once in `App.jsx`
- toasts: top-end desktop / bottom-center mobile, max three visible, semantic icons, close control, optional progress, and status-specific durations; actionable errors do not auto-dismiss
- dialogs: one at a time, queued, `aria-modal`, labelled, described, trapped, scroll-locked, and focus-restored; toasts render above dialogs

No existing inline feedback was converted to auto-dismiss. No business action result text was changed.

### 6C.6 Portal rollout

All five portals and shared surfaces were updated:

| Portal | Status | Notes |
|---|---|---|
| Platform Super Admin | Complete | Dashboard icons/eyebrow, platform admin header, revenue header, workspace module icons, shared feedback |
| School Admin | Complete | Dashboard panel layout, all module headers, finance/exams/library/workspace icons, notices and dialogs |
| Principal | Complete | Principal-specific dashboard layout and feature emphasis, shared school module icons and feedback |
| Teacher | Complete | Teaching dashboard, attendance/exams marks icons, documents, notifications, shared feedback |
| Parent | Complete | Family dashboard, linked-student/children icons, documents, notifications, shared feedback |
| Authentication / shared shell | Complete | Auth page icons, nav icons, collapsed sign-out icon, notification badge, modal/confirm/toast system |

New `ModuleHeader.jsx` centralizes module page headings without changing titles, descriptions, actions, permission conditions, or test selectors.

### 6C.7 Verification

| Check | Command | Result |
|---|---|---|
| Icon checker | `npm run check:icons --workspace frontend` | Pass — 44 files scanned, 2 documented school-logo manual-review candidates |
| Unit tests | `npm test --workspace frontend` | Pass — 47/47 |
| Temporary production build | `npx vite build --outDir "$env:TEMP\opencode\schoolflow-icons-final-build" --emptyOutDir` | Pass — 2,246 modules transformed |
| E2E | `npm run test:e2e --workspace frontend` | Pass — 25/25 |

Two transient E2E failures during iteration were traced to a stale dev server/HMR state; after restarting the server they passed. One deterministic failure was caused by changing the existing `ConfirmDialog` role from `dialog` to `alertdialog`; restoring `role="dialog"` preserved the existing E2E contract and all 25 tests pass.

### 6C.8 Exceptions and non-goals

- Stored school logo and object-URL preview `<img>` elements remain and are intentional protected assets.
- `ConfirmDialog` uses `role="dialog"` (not `alertdialog`) for backward compatibility with the existing E2E contract; the new `appFeedback` confirm surface uses `alertdialog`.
- Native `select` affordance is used after removing CSS data-URI chevrons.
- Existing automatic `prefers-color-scheme` theme and global reduced-motion behavior remain authoritative; no theme toggle was added.
- No new icon, animation, toast, or UI framework dependency was installed.
- No dedicated responsive/theme/RTL/reduced-motion matrix beyond the existing E2E mobile, focus, and role coverage was added in this assignment.

### 6C.9 Phase 5 final QA verification (2026-11-21)

The final QA pass was read-only except `docs/PROGRESS.md` and this document. No localhost/browser/auth/API run, production database access, `.env` change, deployment, dependency install, backend change, commit, or push occurred.

| Check actually run | Result |
|---|---|
| `npm run check:icons --workspace frontend` | Pass — 44 source files scanned; 2 documented school-logo image review candidates; no application icon violations |
| `npm test --workspace frontend` | Pass — 47/47, 0 failed, 0 skipped |
| `npx --no-install vite build --outDir "$env:TEMP\opencode\schoolflow-phase5-build" --emptyOutDir` | Pass — 2,246 modules transformed; output outside the repository |
| `git diff --check` | One cosmetic blank line at EOF in `frontend/src/styles.css:1322`; no other whitespace error |
| Token contrast calculation | All 11 sampled light and dark foreground/background pairs meet 4.5:1; light minimum 5.36:1, dark minimum 6.09:1 |
| Static five-portal/CSS/a11y/feedback/functional diff audit | No FAIL; non-blocking concerns below |

All five portals continue to use the shared token-driven shell, typography, spacing, cards, tables, forms, dialogs, notices and responsive/reduced-motion rules. Inline `Notice` and `ConfirmDialog` remain live; `appFeedback` is mounted once but dormant. Existing routes, guards, API calls, payloads, validation, permissions, calculations, workflows, tenant logo handling and data were unchanged. The only functional addition in the changed JSX set is the `ConfirmDialog` in-flight duplicate-submit guard; all six call sites remain byte-identical to HEAD.

Responsive inspection found no exact 360px or 768px CSS rule: 360px is covered by the 420/520/640/760/900/1080 cascades, 768px by the 900/1080/1280 rules, and 1280px has a dedicated rule. Existing E2E files cover 390px login/overflow, dialog focus behavior and a 360–1440 overflow matrix, but none of those tests were run in Phase 5. The historical 25/25 E2E result in §6C.7 is not re-asserted here.

Non-blocking concerns: unused icon aliases are retained as migration-compatible wrappers; two feedback systems coexist; duplicate default strings remain in the dormant feedback layer; a few hardcoded color exceptions remain; tab semantics are mixed; input focus uses `box-shadow`; a narrow-width collapsed-sidebar edge remains; `.layout-platform` and `.layout-school--admin` have no dedicated CSS rules; and the EOF blank line in `styles.css` is cosmetic. The stale `--select-arrow` documentation row was corrected in §4.6 because the implementation uses the native select affordance.
