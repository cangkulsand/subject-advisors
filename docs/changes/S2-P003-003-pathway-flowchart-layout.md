# S2-P003-003 - Pathway flowchart layout and view controls

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 2, existing UC17 presentation fixes
- **Owner:** P003 / Interactive Academic Pathway
- **Related UC / FR:** UC17 / FR-G1, FR-G2
- **Branch / PR:** feature/p003-s2-uc13-uc14 / not created
- **Reviewer:** Human peer review pending

## 1. Plan

### Objective / problem
Follow the supplied `../pathway_layout.jpeg` where supported by configured data.
The current graph is unnecessarily wide for disconnected subjects, long edges
detour around the entire graph, and Fit to view resets zoom without fitting.

### Scope and requirements
- In scope: compact top-down prerequisite flowchart without category grouping,
  clearer relationship legend, real fit/zoom/panning,
  keyboard selection and prerequisite details, responsive graph/list views.
- Preserve existing uncommitted pathway/API/scheduler/graduation work.
- Out of scope: academic policy changes, inferred prerequisites or semester
  allocations from the image, scheduling/graduation changes, database writes,
  authentication changes, dependency upgrades and other owners' features.

### Proposed implementation
- Expected files: pathway `layout.ts`, `routing.ts`, `TalentTree.tsx`,
  `PathwayPage.tsx`, `pathway.css`, `pathway.test.ts`; focused browser test under
  `tools/pathway/` if needed.
- APIs / database / interfaces: no response, endpoint, migration or data changes.
- Dependencies / shared-file impact: no new dependencies or shared-file edits.
- Keep the existing SVG renderer and application palette rather than replacing
  working infrastructure.
- User refinement: remove core/elective/category frames and group headings,
  keep disconnected subjects in an ungrouped compact grid, avoid shared arrow
  segments, and visually separate unavoidable crossing points.
- Highlight the complete prerequisite chain, with matching burgundy line and
  arrowhead colours for highlighted mandatory links. Preserve green completed
  paths and add an explicit green completed-path legend entry.

### Acceptance criteria
- [x] Valid prerequisites render downward without crossing subject boxes.
- [x] Disconnected subjects remain compact, with no category frames or grouping.
- [x] Fit responds to viewport size; zoom, drag and keyboard controls work.
- [x] Mandatory, recommended and corequisite links are distinguishable.
- [x] Selection shows configured prerequisite details and full subject names.
- [x] Desktop/mobile graph and accessible list remain usable without page overflow.
- [x] Existing pathway tests plus targeted regressions pass.
- [x] Routed arrows do not share collinear segments in regression fixtures;
  unavoidable crossing points are visually separated.
- [x] Highlighted mandatory lines and arrowheads match the node highlight colour.
- [x] Completed links remain green and have a matching legend entry.

### Verification plan
- Baseline: 43 existing pathway frontend/API tests pass before changes.
- Focused Vitest regression tests, project typecheck/lint/build and full unit suite.
- Playwright checks against labelled fixtures, desktop/mobile, including view
  controls, keyboard inspection, ungrouped graph, computed arrow colours,
  completed-path legend, list/empty/error states.
- Inspect actual diff and update this record with outcomes, not assumptions.

### Risk / assumptions / rollback
- Risks: dense graphs need zooming; malformed cycles must not crash layout.
- Assumptions / blockers: the image is a presentation reference, not authoritative
  curriculum data. Semester suggestions are not available in the graph contract.
- Luna delegation is unavailable in the exposed tools; direct execution uses the
  repository rule's fallback. Human review remains required.
- Rollback: reverse only this change's edits, preserving pre-existing work.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** Pathway layout, routing, tree/page components, CSS,
  regression tests, `tools/pathway/test-ui.mjs`, and this record.
- **Summary:** Compact top-down flowchart with an ungrouped grid for disconnected
  subjects; viewport-aware fit, zoom, mouse/keyboard panning and accessible list.
  Departure/arrival ports reserve separate positions per level gap, and long or
  reverse routes avoid occupied vertical legs. Edge casings distinguish crossings.
  Selection highlights the full prerequisite chain and paints it above dimmed
  links. Shared colour tokens keep selected node borders, mandatory arrow lines
  and arrowheads consistent. Completed links retain green, including when selected,
  with completed/highlighted path entries in the relationship legend.
  Subject details show full names and configured prerequisite statuses.
  API errors allow explicitly labelled demo preview and retry.
- **Decisions / deviations from plan:** Category panels removed from the plan at
  the user's request. Existing API/scheduler/graduation edits remain untouched.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** Scope, plan/diff compatibility, unchanged API/auth/data,
  empty/error states, keyboard interaction, responsive layout, tests, security,
  documentation and preservation of existing work reviewed.
- **Test evidence:** Baseline focused pathway tests: 43 passed across 4 files.
  Before user refinements: 537 unit tests passed, 13 skipped; typecheck/lint/build
  passed; 7 dedicated pathway and 30 shared-app browser checks passed using
  installed Edge. Final verification:
  - `npm run typecheck`: PASS.
  - `npm test`: 538 passed, 13 skipped across 41 files. The two database suites
    require explicit `AUTH_TEST_DATABASE_URL` / `OFFERINGS_TEST_DATABASE_URL`;
    no live database access was attempted.
  - `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/web/src/features/pathway`:
    15 passed, including opposing ports and dense-curriculum non-overlap checks.
  - `npm run lint`: PASS.
  - `node node_modules/eslint/bin/eslint.js tools/pathway/test-ui.mjs --max-warnings 0`:
    PASS.
  - `git diff --check`: PASS.
  - Vite production build using `vite.auth.config.ts` and the absolute
    repository `dist-auth/pathway-check` output directory: PASS (143 modules).
  - `PLAYWRIGHT_CHANNEL=msedge node tools/pathway/test-ui.mjs`: 8 passed.
    Computed-style assertions verify matching line/arrowhead/node highlight
    colours, preserved green completed links and matching legend swatch.
  - Shared `tools/integration/test-ui.mjs`, with a runtime-only Playwright launch
    override selecting installed Edge: 30 passed. No shared test file was edited.
- **Manual checks:** Inspected generated desktop, mobile and highlighted-path
  screenshots in ignored `dist-auth/pathway-ui/`. Browser fixtures are explicitly
  fictional; live Clerk/Neon integration and physical touch devices were not tested.
- **Defects found and fixes:** Opposing arrival/departure legs could share an x
  position in one gap; target port reservation prevents that merge. Long routes
  now also avoid all reserved ports. Only immediately connected edges were
  highlighted; the whole selected prerequisite chain now receives matching
  line/head colour, while completed paths remain green. Category frames removed.
- **Review outcome:** PASS - SELF-REVIEW
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-01.
- **Type:** Fixed / Changed / Tests.
- **Added / Changed / Fixed / Removed:** Improved flowchart layout, actual
  fit/zoom/pan controls, prerequisite details and keyboard/list access; fixed
  shared arrow segments and incomplete highlighting; added completed-path and
  highlighted-path legends and regression/browser coverage; removed category
  grouping at the user's request.
- **Affected routes / tables / consumers:** `/student/pathway` presentation only.
- **Breaking changes / migration steps:** None; no API, schema, environment,
  dependency, shared-file or academic policy changes.
- **Verification summary:** 538 unit tests and 38 fixture-based browser checks pass;
  13 explicit-test-database checks skipped. Typecheck, lint, production build
  and diff whitespace validation pass.
- **Outstanding blockers / follow-up:** Human peer review pending. Dense maps can
  still have perpendicular crossings; edge casings keep them visually distinct.
  Semester suggestions from the image are not inferred without configured data.
- **Final status:** READY_FOR_REVIEW
