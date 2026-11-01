# S2-P004-003 — UC20 coordinator screen preview

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related use case / requirements:** UC20, Provide Academic Data and Generate Class Offering Forecast; FR-H1–H9
- **Copy follow-up:** The user asked to remove the word "fictional" from the screen. The UI will use
  neutral option and sample labels while preserving one concise demo/no-upload notice and the
  clear statement that displayed preview results are fixed examples, not calculated from an upload.
- **Branch / PR:** `feature/p004-s2-uc20-contracts`; no PR
- **Reviewer:** Root plan and actual code/visual review passed; human peer review pending

## 1. Plan

### Objective / problem

Replace the current `/coordinator/forecasts` placeholder with a usable frontend-only UC20
preview. Make `/coordinator/imports` open the same import-to-forecast workflow. Preserve the
existing signed-in Coordinator role gate in the application.

### Scope and requirements

- **In scope:** A responsive degree/programme → configured centre → one-file CSV screen;
  source date/label metadata; accessible file chooser/drop target, local template download,
  selected filename/removal/reset; explicit loading of a demo cohort;
  sample advisory forecast, coverage and exclusions; an isolated local browser preview and
  smoke harness; a minimal update to the existing staff UI harness for the two active routes.
- **Out of scope:** API calls for catalogue, upload, validation, parsing, forecasting, audit or
  persistence; any CSV parser or forecasting logic; real catalogue/cohort data; changes to
  `AuthGate`, server authorization, other Coordinator placeholders, production routes, DB,
  migrations, dependencies, environment, deployment or commit/push.
- **Product boundary:** The screen itself is local state only. In the real application,
  `AuthGate` continues its existing account/role check; this task adds no forecast API call.
  The standalone preview mounts the screen component directly, without Clerk or API fixtures
  and without changing or bypassing the application auth route.
- **Data honesty:** All selectors, cohort counts, subjects, capacities and results are fixed
  demo content, clearly identified as preview data and not represented as database catalogue
  values. Selecting a CSV only shows its filename; it is not read, parsed, validated, uploaded
  or used to calculate results. Only the explicit demo-cohort action reveals the fixed sample
  advisory table/coverage/exclusion summary.

### Proposed implementation

- `apps/web/src/features/coordinator/CoordinatorRoutes.tsx` — route `/coordinator/imports` and
  `/coordinator/forecasts` to the same screen while retaining the existing `AuthGate`, shell,
  navigation and role boundary; leave other coordinator pages planned.
- `apps/web/src/features/coordinator/ForecastingPreview.tsx` — self-contained screen and
  deterministic in-memory demo options/results; local file metadata and reset behavior.
- `apps/web/src/features/coordinator/forecasting-preview.css` — scoped responsive styling in
  the theme guide's light appearance, using the existing `--color-*` semantic tokens from
  `apps/web/src/app/student-shell.css` (cream/burgundy plus semantic information/success/warning/
  danger colors). No Tailwind, font, asset or external network dependency is added.
- `tools/uc20-preview/main.tsx` and `tools/uc20-preview/test-ui.mjs` — build/mount the screen
  directly using existing esbuild and Playwright tooling. Test mode serves a local-only page,
  exercises the interactions and asserts no `/api/` or external network requests. `--serve`
  opens a localhost preview without Clerk/API setup.
- `tools/admin/test-ui.mjs` — update its coordinator route regression from seven planned pages
  to two working workflow destinations and five remaining planned pages; retain the existing
  mocked `/api/me` role check and assert there are no added forecast/API requests.
- This change record. No package manifest or dependency changes.

### Acceptance criteria

- Both `/coordinator/imports` and `/coordinator/forecasts` show the same import/forecast
  workflow, with route-appropriate accessible headings; existing Coordinator `AuthGate` and
  incompatible-role denial remain intact.
- The screen offers demo programme, centre and semester selectors, source date/label,
  one CSV attachment with browse/drop, local template download, selected filename/remove, and
  reset. No source student account/profile or per-centre assignment is requested.
- Missing required preview metadata and non-CSV/oversized attachments produce a clear local
  validation message. A selected CSV is never read, parsed or sent; without the explicit
  demo action, no forecast results are shown.
- Changing programme, centre or semester, or attaching a user CSV, clears demo results. Loading
  the demo cohort clears any selected user attachment before showing its results.
  A concise visible notice distinguishes the local attachment from the demo output.
- The explicit demo action shows stable advisory sample results, coverage
  and exclusions. Reset clears the file, messages and demo result.
- The direct localhost preview needs no Clerk credentials or service fixture. Its browser
  smoke verifies the primary interaction, validation/error/removal/reset, mobile layout and
  zero API/external requests. The existing staff harness verifies auth boundaries and both
  Coordinator route destinations without forecast API requests.
- Only the planned UI, preview harness, existing staff UI harness and this record change; no
  API, data, auth behavior, dependency, environment, migration or production behavior changes.

### Verification plan

- `npm.cmd run typecheck`
- `npm.cmd run build:local` (static frontend build only; no deploy)
- `node tools/admin/test-ui.mjs` (existing staff navigation and authorization regression)
- `node tools/uc20-preview/test-ui.mjs` (standalone browser interaction and zero-network smoke)
- `node node_modules/eslint/bin/eslint.js apps/web/src/features/coordinator/CoordinatorRoutes.tsx apps/web/src/features/coordinator/ForecastingPreview.tsx tools/uc20-preview --max-warnings 0`
- Before frontend edits, read the full `docs/themeguide.md`; inspect and use the existing semantic
  tokens/shared components and the relevant current UC20 plan. No theme/config/shared-shell
  changes are planned.
- Manual preview command: `node tools/uc20-preview/test-ui.mjs --serve`; inspect desktop and
  narrow/mobile layout in the local browser. The preview is planned to bind only to
  `127.0.0.1:5176` and use static demo content. Check at 320, 375, 720, 768, 1024 and 1440px,
  keyboard-only operation, visible focus/labels/error association, and usable reflow at a
  720px half-width viewport as a 200% equivalent. The preview also checks 200% root text scaling.
  The review includes the full theme guide and static frontend
  build (`npm.cmd run build:local`; no deployment).
- `git diff --check`; confirm existing Package 1 changes remain untouched and the only new
  task scope is the files listed above.

### Risks / assumptions / rollback

- **Assumptions:** Existing Node, esbuild, Playwright, React and TypeScript tooling is sufficient.
  No actual programme/centre/subject catalogue data is shown; sample values are marked as demo
  data.
- **Risks:** Users could mistake the preview for a connected forecasting tool. Keep the no-API
  and unparsed-upload notice visible; do not call the demo output an official
  forecast or use the selected upload to drive it. Follow the theme guide's light semantic tokens,
  clear status labels, mobile-first forms/table and visible keyboard focus.
- **Rollback:** Revert this change record, route wiring, screen/CSS and isolated preview tooling;
  restore the coordinator harness's seven-placeholder assertion. No data rollback is needed.

## 2. Implementation

- **Status:** Implemented; verification passed; root code and visual review passed.
- **Files actually changed:** `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`,
  `apps/web/src/features/coordinator/ForecastingPreview.tsx`,
  `apps/web/src/features/coordinator/forecasting-preview.css`, `tools/uc20-preview/main.tsx`,
  `tools/uc20-preview/test-ui.mjs`, `tools/admin/test-ui.mjs`, and this record. Earlier Package 1
  changes remain separate and untouched.
- **Summary:** Routed imports and forecasts to one local-state screen, retaining the existing
  Coordinator auth gate. Added demo options/results, one-file metadata-only attachment,
  template download, validation, reset and scoped responsive styling. Added a standalone local
  preview that mounts the component directly without the application shell, auth, or API.
  Updated the coordinator navigation regression for two preview destinations and five planned
  routes.
- **Decisions / deviations from plan:** The standalone preview defines only the existing semantic
  palette tokens it needs inline, rather than importing the shared student stylesheet (which has
  a remote font import). The preview uses system fonts. This keeps the isolated preview offline
  without altering shared theme behavior. The demo result is fixed sample data, never derived
  from the attached file.
- **API / database / environment / dependencies:** None changed.

## 3. Review

- **Self-review:** Passed implementation scope, interaction and screenshot review. Demo selectors
  use short labels so semester terms remain distinguishable at narrow widths.
- **Test evidence:** `npm.cmd run typecheck` passed; `npm.cmd run build:local` passed (static
  frontend build only); `node tools/admin/test-ui.mjs` passed all 24 browser checks;
  including a real `/coordinator/forecasts` check that the primary action is burgundy with white
  text. `node tools/uc20-preview/test-ui.mjs` passed the disconnected interaction, file metadata,
  demo reset, rejected/multiple drop recovery, keyboard focus, 320/375/720/768/1024/1440px reflow
  and 200% root text-scaling checks with zero external/API requests; direct ESLint command in the
  verification plan passed with zero warnings; `git diff --check` passed.
- **Manual checks:** Standalone desktop/mobile screenshots `.wrangler/uc20-preview/desktop.png`
  and `.wrangler/uc20-preview/mobile-375.png` captured and visually reviewed. Integrated
  `/coordinator/forecasts` desktop screenshot `.wrangler/staff-menu-review/coordinator-forecast-desktop.png`
  confirms the shell-compatible file control and primary action styling. The disconnected
  localhost-only preview is served at `http://127.0.0.1:5176/`.
- **Review outcome:** PASS - SELF-REVIEW; root code and visual review passed; human peer review pending.
- **Human reviewer / approval:** Pending human peer review; no human approval claimed.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Added
- **Actual changes:** Replaced the forecast placeholder and connected imports navigation to the
  frontend-only screen; added isolated preview and smoke harness; updated the existing coordinator
  route regression for the two active destinations.
- **Compatibility / impact:** Existing `AuthGate`, staff shell and role boundary remain in place.
  Screen adds no API call, persistent state, parser, forecast engine, dependency or server change.
- **Verification:** Full `docs/themeguide.md` and token source were reviewed before UI edits.
  Typecheck, static build, 24 staff UI checks, isolated local browser smoke, direct ESLint and
  diff whitespace checks all passed. Screenshots are available at the paths in Review.
- **Outstanding:** Human peer review.
- **Final status:** READY_FOR_REVIEW
