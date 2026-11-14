# S2-P003-006 - UC24 action workspace layout

- Status: MERGED to `main` (2026-11-14); human peer review pending. Before merge: READY_FOR_REVIEW (PASS SELF-REVIEW; latest state is the 2026-11-12 horizontal tab reversal incl. mobile tab-fit fix — earlier vertical layout superseded; lead review complete, human approval pending)
- Date: 2026-11-12
- Owner: Harraz / P003, Sprint 2 (UC24/UC06 presentation)
- Branch: feature/uc24-create-subject; merged into `main` on 2026-11-14 (merge commit 3fcc9fe), no PR
- Human peer review: Pending
- Follow-up to: S2-P003-005 (create subject with initial prerequisites)

## 1. Plan

### Problem

On `/admin/curriculum` the create-subject form and relationship editor sit
below the curriculum subject list and saved-relationship list, so both
actions require scrolling through potentially long catalogues — bad UX.

### Approach

- Replace the stacked layout with two labelled top-level action tabs directly
  after the curriculum selector and compact chosen-curriculum context:
  `Create Subject` (default) and `Manage Prerequisites`. Both actions are
  reachable without scrolling through any list at any list size.
- Create Subject panel: creation/edit-subject form first, curriculum-subject
  list after. Manage Prerequisites panel: add/edit-relationship form first,
  saved relationships after. Only the active panel renders accessible
  content; the review panel stays above the forms near the tabs.
- Accessible tabs (`tablist`/`tab`/`tabpanel`, `aria-selected`,
  `aria-controls`, `aria-labelledby`), roving tabIndex, Arrow/Home/End keys,
  disabled while busy or while a review is open.
- Switching tabs with a dirty draft (including an outstanding prerequisite
  search) uses the existing `window.confirm` discard convention; declining
  keeps the current tab and values, accepting resets then switches. No
  invisible drafts are silently erased. Curriculum switch resets to
  Create Subject; successful saves and cancels stay on the current tab.
- Edit-subject / edit-relationship list actions populate the correct form,
  activate the matching tab and bring the workspace heading into
  view/focus (respecting prefers-reduced-motion).
- Preserve the burgundy/admin visual language, typography tokens, 44px
  controls and the mobile stacked-picks fix. Scoped `.s2-tabs` styles: active
  burgundy indicator, visible focus, wraps to fit 320px. No new route, UI kit
  or filterable table.

### Out of scope

Backend/API/data/migration changes, subject policy changes, deployment, and
unrelated UI. Rollback is the reversal of this follow-up diff only,
preserving the settled UC24 implementation (S2-P003-005).

### Acceptance

Keyboard-operable tabs; mobile and desktop layouts without overflow; actions
available without scrolling through catalogue rows; no silent draft loss;
assertReadable clean; previous UC24 validation, review and role guards
unchanged.

## 1b. Follow-up plan (2026-11-12): vertical workspace sections

### Problem

Subject list and forms still share panes, and the two horizontal actions
prevent direct jumps to Subject List / Create Subject / Prerequisite List /
Manage Prerequisites.

### Approach

- Four independent destination panes selected by a single `action` union
  (`subjects`, `create`, `relationships`, `prerequisites`; default and
  curriculum-switch default `subjects`): Subject List pane, Create Subject
  form pane, Prerequisite List pane, Manage Prerequisites form pane. Lists
  are no longer appended below forms. Review/status stay above the
  workspace near the selector.
- Desktop (≥768px): scoped two-column `.s2-workspace` grid (sidebar
  ~12rem + content), vertical `tablist` (`aria-orientation=vertical`,
  roving tabIndex, ArrowUp/Down wrap from the focused tab, Home/End,
  Enter/Space activation) with a burgundy left accent, sticky at top 1rem.
- Mobile (<768px): native `Workspace section` select (same four labels),
  desktop nav `display:none` so its tabs are unreachable; the select is
  `display:none` on desktop. Panels are referenced via
  `aria-labelledby`/`aria-label`.
- Same dirty-draft `window.confirm` discard guard (including outstanding
  prerequisite search), no-op same-section clicks, disabled during
  busy/review. Edit-subject → create pane populated; edit-relationship →
  manage pane; remove-relationship review stays on the list pane.
- No API/data/dependency/env changes, no pathway changes, no new docs
  file. Rollback is only this follow-up delta, preserving UC24.

### Acceptance

Direct switching to each destination; dirty confirmation decline/accept;
edit redirects with workspace focus/scroll; vertical keyboard navigation;
responsive readability and 44px controls at 320/390/1440.

## 2. Implementation

- `apps/web/src/features/p001-sprint2/CurriculumPage.tsx`
  - New `action` state (`create` | `prerequisites`, default `create`) driving
    an accessible tab workspace directly after the curriculum selector:
    `role=tablist` (`aria-label="Curriculum actions"`), two `role=tab`
    buttons with `aria-selected`/`aria-controls` and roving `tabIndex`, and
    two `role=tabpanel` regions (`hidden` when inactive) labelled by their
    tabs. ArrowLeft/Right move focus between tabs with wraparound and
    Home/End jump to first/last — all computed from the focused tab, with
    manual activation via Enter/Space (selection unchanged on arrows).
    Tabs are disabled while busy or while a review is open.
  - Create Subject panel: subject create/edit form first, curriculum
    subject list after. Manage Prerequisites panel: relationship add/edit
    form first, saved relationships after. Review panel remains above the
    forms.
  - `selectAction` guards dirty drafts (subject draft, relationship draft,
    editing state, selected prerequisites **and** outstanding prerequisite
    search) with the existing `window.confirm` convention; declining keeps
    the current tab and values, accepting resets then switches. Clicking
    the active tab is a no-op; curriculum switch resets to Create Subject;
    saves/cancels stay on the current tab.
  - `editSubject`/`editLink` activate the matching tab and call
    `focusWorkspace` (heading `tabIndex=-1`, `scrollIntoView` honouring
    `prefers-reduced-motion`, `focus({preventScroll:true})`).
- `apps/web/src/features/p001-sprint2/sprint2.css`
  - Scoped `.s2-tabs` styles: burgundy active indicator/background, visible
    focus ring, 44px minimum height, `flex-wrap` so tabs fit 320px.
- `tools/p001-sprint2/test-uc24-ui.mjs`
  - Fixture enlarged to ~60 fictional catalogue/curriculum subjects and
    many relationships (base link ids 30–53; newly mocked prerequisite
    edges use ids 1000+ to avoid PK overlap). New checks for tab geometry
    above all list content, form-before-list ordering, keyboard navigation
    (double Right/Left wraparound and Home/End without altering selection
    until Enter) and `aria-selected`, hidden-panel control isolation,
    dirty-switch decline/accept, edit focus/scroll, tabs disabled during
    review, manage-panel save in place, 1440/320/390 tab height ≥44px and
    viewport fit, and manage-pane reachability without scrolling.
    `assertReadable` runs in every check and on each pane. Draft codes
    moved to `DEMO9xx` to avoid colliding with the enlarged fixture.
- `tools/p001-sprint2/test-ui.mjs` (legacy dedicated harness)
  - Relationship-specific paths now click the `Manage Prerequisites` tab;
    a list assertion updated for name-first list markup. No other changes.

## 3. Review

Status: READY_FOR_REVIEW — PASS SELF-REVIEW; lead diff review complete,
human peer approval pending.

Verification evidence (logs and screenshots under
`.wrangler/uc24-layout-review/`; pre-change copies in
`.wrangler/uc24-layout-review/before/`):

- `test-uc24-ui-final.log` — integrated Edge harness
  (`PLAYWRIGHT_CHANNEL=msedge`), **10/10 PASS**. Two implementation bugs
  were caught and fixed during this work: `tabKeys` derived a wrong id
  (`s2-tab-prerequisites`), and a rework made arrows compute the target
  from the selected tab instead of the focused tab (wraparound stall);
  both fixed and re-verified. Earlier `test-uc24-ui.log` runs are
  superseded.
- `verify-final.log` — `npm run typecheck` exit 0; targeted
  `eslint CurriculumPage.tsx tools/p001-sprint2/test-uc24-ui.mjs
  --max-warnings 0` exit 0; `git diff --check` exit 0.
- `lint-typecheck.log` — earlier full `npm run lint` exit 0 and
  `eslint tools/p001-sprint2` exit 0 (supersedes the first `typecheck.log`
  run, which had caught a TS indexing error since fixed).
- `build-local.log` — `npm run build:local` exit 0 (only the pre-existing
  chunk-size warning; packaging unaffected by the final handler-only
  change).
- Screenshots: `create-viewport-1440.png`, `manage-viewport-1440.png`,
  `create-viewport-320.png`, `manage-viewport-320.png`,
  `create-viewport-390.png`, `manage-viewport-390.png` (viewport captures
  of the top action workspace); long full-page shots kept as
  `create-desktop.png`, `manage-desktop.png`, `mobile-320.png`,
  `mobile-390.png`.
- Not rerun per brief (previous results frozen): full `npm test` suite,
  PGlite DB checks, Cloudflare build, admin UI suite. Mock Clerk/API only —
  no live Clerk/Neon claims.

## 4. Changelog

- Added top-level `Create Subject` / `Manage Prerequisites` action tabs to
  `/admin/curriculum`; each panel shows its form before its saved list so
  both actions are reachable without scrolling at any list size.
- Tab switching confirms before discarding dirty drafts; edits from list
  rows focus and scroll to the workspace heading.
- No API, schema, dependency or validation changes.

## 5. Follow-up (2026-11-12): vertical workspace sections — results

### Implementation

- `CurriculumPage.tsx`
  - `ACTIONS` descriptor array (`subjects` → Subject List, `create` →
    Create Subject, `relationships` → Prerequisite List,
    `prerequisites` → Manage Prerequisites) drives a single `Action`
    union; default and curriculum-switch default is `subjects`.
  - `.s2-workspace` wraps a mobile `Workspace section` select (the same
    four labels, controlled, disabled while busy/reviewing), a desktop
    vertical `tablist` (`aria-orientation=vertical`, roving `tabIndex`),
    and four independent `role=tabpanel` panes labelled via
    `aria-labelledby`. Subject list, subject form, saved-relationship
    list and relationship form each live in their own pane — lists are
    no longer appended below forms.
  - `tabKeys` computes the target from the focused tab id against the
    `ACTIONS` order (ArrowDown/Up wrap, Home/End jump, Enter/Space
    manual activation). `selectAction` is a no-op on the same section,
    refuses while busy/in review, and keeps the existing dirty-draft
    `window.confirm` discard guard (decline retains pane, draft and
    controlled selection; accept resets then switches).
  - `editSubject` switches to `create`; `editLink` switches to
    `prerequisites`; both keep `focusWorkspace`. Remove-relationship
    review happens from the Prerequisite List pane; saves/cancels keep
    their pane. Validation, API semantics, prerequisite search and
    error handling are unchanged.
- `sprint2.css`
  - `.s2-tabs` replaced with scoped `.s2-workspace`/`.s2-nav`/
    `.s2-section-select`/`.s2-panes`: ≥768px grid (12rem sticky sidebar +
    `minmax(0,1fr)`), burgundy left active indicator, visible focus
    ring, 44px controls; <768px the nav is `display:none` and the
    full-width select is shown (and vice-versa on desktop).
- `tools/p001-sprint2/test-uc24-ui.mjs`
  - `chooseSection`/`open(page, action)` helpers; assertions for
    Subject-List default and curriculum-switch default, four-pane
    isolation, vertical tab geometry (same x, increasing y, ≥44px),
    `aria-orientation`, sticky sidebar at the bottom of the 60-subject
    list, ArrowDown/Up wrap + Home/End with manual activation, dirty
    decline/accept on tabs and on the mobile select (controlled value
    restored), same-section no-op, edit redirects to the correct pane,
    all four tabs + select disabled during review, mobile select ≥44px
    and in-viewport at 320/390, manage pane reachable without
    scrolling. `assertReadable` per pane. Viewport screenshots under
    `.wrangler/uc24-vertical-review/`.
- `tools/p001-sprint2/test-ui.mjs` (legacy harness)
  - `section(page, action)` responsive chooser; create-pane callsites
    and the relationship/remove paths updated only.

### Review

Status: READY_FOR_REVIEW — PASS SELF-REVIEW; lead diff review and human
peer approval pending.

Evidence (`.wrangler/uc24-vertical-review/`; pre-change copies in
`before/`):
- `test-uc24-ui.log` — integrated Edge harness 10/10 PASS (mock
  Clerk/API only; no live Clerk/Neon/DB).
- `typecheck.log` — exit 0. `lint.log` — exit 0.
- `eslint-tools.log` — targeted ESLint on `CurriculumPage.tsx`,
  `test-uc24-ui.mjs`, `test-ui.mjs` (`--max-warnings 0`) exit 0.
- `build-local.log` — `npm run build:local` exit 0.
- `diff-check.log` — `git diff --check` exit 0. Pathway tree clean vs
  HEAD; stash `c68c30b…` preserved.
- Screenshots: `subjects-viewport-1440.png`, `create-viewport-1440.png`,
  `relationships-viewport-1440.png`, `manage-viewport-1440.png`,
  `create/manage-viewport-320/390.png`, `uc24-mobile-320/390.png`,
  `uc24-created.png`.

### Changelog

- `/admin/curriculum` now offers four direct destinations — Subject
  List, Create Subject, Prerequisite List, Manage Prerequisites — via
  vertical tabs on desktop and a `Workspace section` select on mobile;
  lists and forms no longer share panes.
- No API, schema, dependency or validation changes; dirty-draft
  confirmation unchanged.

## 6. Follow-up acceptance fixes (2026-11-12)

### Implementation additions

- `selectAction` sets a `pendingScroll` flag; a `[action]` effect
  scrolls the workspace heading into view (`block:'start'`,
  `behavior:'auto'`) **after** the new pane commits — a single
  `requestAnimationFrame` raced the React render and landed mid-page.
  Reproduction confirmed: without it, switching from the bottom of the
  60-subject list left the workspace heading above the viewport
  (`y≈-42`, assertion captured before the fix).
- `sprint2.css`
  - The two-column workspace grid is gated by `@container (min-width:720px)`
    on `.s2` (`container-type:inline-size`), not a viewport media query —
    at 200% CSS zoom the effective layout width halves while media
    queries still see the real viewport, so a fixed 12rem sidebar
    squeezed the pane to zero width (verified overflow). The container
    collapses to single-column instead; tab/select visibility keeps the
    exact 768px media query. `.s2-grid>*{min-width:0}` lets form columns
    shrink below content min-width.
- `tools/p001-sprint2/test-uc24-ui.mjs`
  - Scroll regression assertions: from the bottom of the subject and
    relationship lists, a sticky-tab switch lands with the workspace
    heading and the new pane heading in the viewport, focus on the
    activated tab, no test scrolling. Same-section/declined/busy paths
    do not scroll.
  - New checks: Prerequisite List → Remove → review (no write, all four
    tabs disabled) → Confirm issues exactly one DELETE and the saved
    list updates in place; stale-create failure keeps `create` selected
    and the draft; an outstanding prerequisite search alone counts as
    dirty (decline retains, accept clears). 768px breakpoint check over
    all four panes; 200%-zoom-at-1024 usability check.
  - Extra screenshots: `subjects-top-1440.png` (default landing),
    `subjects-viewport-1440.png` (sticky sidebar at list bottom).

### Review

Status: READY_FOR_REVIEW — PASS SELF-REVIEW on the full delta; lead
review complete, human approval pending. Earlier evidence is historical
and frozen.

Evidence: `.wrangler/uc24-vertical-review/test-uc24-ui-acceptance.log`
(integrated Edge harness **14/14 PASS**),
`verify-acceptance.log` (typecheck 0, targeted ESLint 0,
`git diff --check` 0, pathway diff clean, stash
`c68c30b6cb86f447bfed4cb4c06f4ddd418247c3` intact). Frozen:
`typecheck.log`, `lint.log`, `build-local.log`. No live
Clerk/Neon/database access.

## 7. Follow-up plan (2026-11-12): horizontal tab strip reversal

### Problem

User prefers the horizontal appearance: the vertical sidebar looks ugly.

### Approach

- Keep the four `ACTIONS` destinations and independent panes, default
  `subjects`, dirty guards, post-commit scroll, edit redirects and
  review disabling — presentation only.
- Replace the vertical sidebar and the mobile `Workspace section`
  select with a single horizontal tab strip above the full-width pane:
  `aria-orientation=horizontal`, ArrowLeft/Right cycle the focused tab,
  Home/End, Enter/Space activation. Tabs sticky at top with an opaque
  surface background; at ≤600px the strip becomes two equal columns.
- UI only — no API/data/env/dependency changes, no pathway changes.

### Acceptance

All four views directly reachable; draft guards; mobile tabs ≥44px and
no overflow at 320/390/768/zoom; no pathway diff.

## 8. Follow-up (2026-11-12): horizontal tab strip reversal — results

### Implementation

- `CurriculumPage.tsx`: `Workspace section` select removed; tablist is
  `aria-orientation=horizontal`, ArrowLeft/Right wrap the focused tab
  (id-derived index over `ACTIONS`), Home/End, Enter/Space. All four
  panes, guards, post-commit scroll and edit redirects unchanged.
- `sprint2.css`: vertical grid/container-query rules, `.s2` container
  containment and the mobile-select rules removed; `.s2-nav` is a
  horizontal sticky strip (top 1rem, z-index 1, opaque `--s2-surface`,
  bottom border + burgundy active indicator, 44px tabs); at ≤600px it
  becomes two equal grid columns. `.s2-grid>*{min-width:0}` zoom fix
  retained.
- `test-uc24-ui.mjs`: `chooseSection` is a plain tab click;
  `currentSection` reads the `aria-selected` tab id; geometry asserts
  shared-y/increasing-x + `horizontal` orientation; Right/Left wrap +
  Home/End + manual activation; mobile asserts the two-column wrap,
  ≥44px, no overflow, dirty decline/accept on tabs; 768/zoom checks
  unchanged. All 14 checks pass (`assertReadable` per pane).
- `test-ui.mjs`: `section()` helper simplified to the tab chooser only.

### Review

Status: READY_FOR_REVIEW — PASS SELF-REVIEW; lead review complete,
human approval pending. Prior vertical evidence in `.wrangler/uc24-vertical-review/`
is historical and preserved.

Evidence (`.wrangler/uc24-horizontal-review/`):
- `test-uc24-ui-final.log` — integrated Edge harness **14/14 PASS**
  incl. per-tab longest-word fit at 320/390 (earlier `test-uc24-ui.log`
  predates the mobile tab-fit fix and is superseded).
- `verify.log` — explicit exits: typecheck 0, targeted ESLint
  (`CurriculumPage.tsx`, `test-uc24-ui.mjs`, `test-ui.mjs`) 0,
  `build:local` 0, `git diff --check` 0, pathway diff 0, stash
  `c68c30b6cb86f447bfed4cb4c06f4ddd418247c3` intact.
- Screenshots: `subjects-top/viewport-1440`, `create/relationships/
  manage-viewport-1440`, `create/manage-viewport-320/390`,
  `uc24-mobile-320/390`, `uc24-created`.
- Pre-change copies: `before/`.

### Changelog

- `/admin/curriculum` actions are back to a horizontal tab strip —
  Subject List / Create Subject / Prerequisite List / Manage
  Prerequisites — sticky at the top of the pane, two equal columns on
  narrow screens. The four independent panes, draft guards and
  keyboard navigation are unchanged.

- 2026-11-14 - Merged into `main` by P004 (merge commit 3fcc9fe). One conflict in `apps/web/src/features/admin/AdminRoutes.tsx` resolved by keeping the Departments page (S2-P004-025) and adding `/admin/curriculum`. Checks after merge: typecheck, lint, unit tests (1519 passed, 63 skipped), integration (11 passed), build, admin browser checks (48 passed, system Chrome via `PLAYWRIGHT_CHANNEL=chrome`). Status: MERGED; human peer review pending.
