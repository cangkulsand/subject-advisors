# S2-P003-004 - Preserve path colours and regroup disconnected subjects

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 2, UC17 presentation follow-up
- **Owner:** P003 / Interactive Academic Pathway
- **Related UC / FR:** UC17 / FR-G1, FR-G2
- **Branch / PR:** feature/p003-s2-uc13-uc14 / not created
- **Reviewer:** Human peer review pending

## 1. Plan

### Objective / problem
Highlighted mandatory paths currently turn burgundy rather than retaining their
original blue meaning. The user requests legends above the graph and core/elective
grouping only for subjects without graph connections.

### Scope and requirements
- Preserve original line and arrowhead colours during selection: mandatory blue,
  completed green, and unchanged recommended/corequisite dash styles.
- Emphasise selected prerequisite paths using thickness and dimming, not recolouring.
- Place relationship and status legends above the graph.
- Group only disconnected subjects into core/elective panels, with an honest
  other-subjects fallback; retain every connected subject in the prerequisite map.
- Preserve previous arrow routing/non-overlap fixes, view controls and list access.
- Out of scope: API, database, authentication, scheduling/graduation, new
  dependencies and unrelated pre-existing changes.

### Proposed implementation
- Files: pathway `TalentTree.tsx`, `pathway.css`, `layout.ts`,
  `pathway.test.ts`, `tools/pathway/test-ui.mjs` and this record.
- Reuse the existing read-only `records/subject-groups.ts` category classifier
  without modifying P001 files, rather than introducing competing category rules.
- Grouping uses valid incident links of all requirement types, not just incoming
  mandatory prerequisites. Invalid endpoints must not create phantom connections.
- APIs / database / interfaces: unchanged. No shared-file edits.

### Acceptance criteria
- [x] Selected mandatory shafts/arrowheads remain their original blue.
- [x] Completed shafts/arrowheads remain green before and after selection.
- [x] Highlight thickness and relationship dash patterns remain distinguishable.
- [x] Relationship/status legends precede the canvas on desktop and mobile.
- [x] Core/elective groups contain only disconnected subjects; others stay visible.
- [x] Regression fixtures render every subject once without overlapping boxes or
  shared collinear arrow segments; previous crossing casings remain unchanged.
- [x] Existing layout/routing and responsive/browser checks pass.

### Verification plan
- Run targeted layout/grouping regression tests and computed-style browser checks
  for unchanged colours/dashes, thicker paths, top legends and group membership.
- Run full unit suite, typecheck, lint, production build and diff whitespace check.
- Inspect actual diff and desktop/mobile/highlighted fixture screenshots.

### Risk / assumptions / rollback
- Dense maps still require zoom; groups must be included in fit bounds.
- Category grouping is presentation only and does not imply degree requirements.
- Luna selection remains unavailable in the exposed tools; use the previously
  documented direct-execution fallback. Human peer review remains required.
- Rollback only this follow-up's edits, preserving earlier and external work.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** `apps/web/src/features/pathway/TalentTree.tsx`,
  `layout.ts`, `pathway.css`, `pathway.test.ts`, `tools/pathway/test-ui.mjs`,
  and this record.
- **Summary:** Removed the highlight-specific stroke colour and arrowhead marker.
  Selection changes stroke thickness and path emphasis without changing semantic
  colours or dash patterns. Both legends now appear above the controls/canvas.
  Disconnected subjects are classified into core/elective/other panels using the
  existing category classifier; connected roots, dependents and all valid link
  types stay in the main graph. Panel dimensions participate in fit bounds.
- **Decisions / deviations from plan:** None. Existing API, scheduling, graduation,
  routing and other developers' changes remain untouched.
- **Migrations / env / shared contracts:** None.

## 3. Review

- **Self-review checklist:** Scope, plan/diff compatibility, category classifier
  reuse, unchanged contracts/auth/data/routing, keyboard/mobile/list access,
  empty/error states, colour semantics, tests and documentation reviewed.
- **Test evidence:**
  - Targeted Vitest pathway frontend run: 18 passed.
  - `npm run typecheck`: PASS.
  - `npm test`: 541 passed, 13 skipped across 41 files. Database suites remain
    gated by explicit test URLs; no live database access was attempted.
  - `npm run lint`: PASS.
  - `node node_modules/eslint/bin/eslint.js tools/pathway/test-ui.mjs --max-warnings 0`:
    PASS.
  - `git diff --check`: PASS.
  - `PLAYWRIGHT_CHANNEL=msedge node tools/pathway/test-ui.mjs`: 9 passed, using
    installed Edge and fictional Clerk/API fixtures with external HTTPS blocked.
    Assertions compare original and selected line/arrowhead colours, marker
    references, dash patterns and increased widths; verify top legend placement,
    actual panel membership, desktop/320px/390px fit, pan, keyboard and list access.
  - Vite production build using `vite.auth.config.ts` and the absolute
    repository `dist-auth/pathway-check` output directory: PASS, 143 modules.
- **Manual checks:** Inspected generated desktop highlighted-path and mobile
  screenshots in ignored `dist-auth/pathway-ui/`. Blue mandatory paths and green
  completed paths remain visible with legends at the top and isolated groups below.
  Live Clerk/Neon integration and physical touch devices were not tested.
- **Defects found and fixes:** The earlier highlight colour override and marker
  deliberately recoloured selected paths; both are removed. The highlighted
  legend sample now communicates thickness instead of an alternate colour.
  Grouping excludes every valid incident edge, including recommended/corequisite
  links, and ignores dangling links without creating phantom connections.
- **Review outcome:** PASS - SELF-REVIEW
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-01.
- **Type:** Fixed / Changed / Tests.
- **Added / Changed / Fixed / Removed:** Preserved semantic path colours during
  highlighting, moved both legends above the graph, restored core/elective groups
  only for disconnected subjects, retained an other-subjects fallback and extended
  layout/computed-style/group-membership browser regressions.
- **Affected routes / tables / consumers:** `/student/pathway` UI only.
- **Breaking changes / migration steps:** None. Read-only use of P001's existing
  category helper; no P001/shared-file, API, schema, dependency or environment edits.
- **Verification summary:** 541 unit tests and 9 dedicated fixture-based browser
  checks pass; 13 explicit-test-database checks skipped. Typecheck, lint, production
  build and diff whitespace check pass.
- **Outstanding blockers / follow-up:** Human peer review pending. Dense graphs
  may still require zoom; perpendicular crossings remain visually separated by
  existing edge casings. No academic requirements are inferred from grouping.
- **Final status:** READY_FOR_REVIEW
