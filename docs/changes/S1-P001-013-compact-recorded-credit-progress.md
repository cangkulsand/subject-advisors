# S1-P001-013 - Compact recorded credit progress card

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 follow-up
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC04 / FR-A4; presentation-only follow-up to S1-P001-012
- **Branch / PR:** `feature-offerings-prerequisites` / not created
- **Reviewer:** Coordinator AI code, visual, and evidence review PASS; human peer review pending

## 1. Plan

### Objective / problem
The Degree Progress card on Subject Records uses substantial vertical space. Compact its layout while preserving the user-requested percentage bubble, accurate recorded/configured total, earned/exempted/remaining credit breakdown and subject counts, accessibility, and every existing uncertainty/edge-state message.

### Scope and requirements
- In scope: P001 UC04 visual presentation of the existing recorded-credit summary card; compare the same fictional harness state at desktop and mobile before/after.
- Out of scope: changing calculations, data/API/cache/state, record saves, table filters, eligibility or graduation policy, and unrelated P001/P002 changes. Do not restore the removed graduation disclaimer.

### Current and intended behavior
The card currently stacks a heading, large recorded-credit result, a generously spaced meter/bubble, and a separated metrics grid inside 24px padding. Reduce its typical rendered height materially while keeping all information readable and responsive, including at 320px.

### Proposed implementation
- Expected files: `apps/web/src/features/records/subject-records-table.css`; if necessary, a small accessible markup adjustment in `RecordedCreditProgress.tsx`; `tools/p001/test-ui.mjs` for same-state height measurements and new screenshots; this change record.
- Prefer scoped CSS using current component classes. Retain the floating percentage bubble if layout permits. Preserve the existing `role=progressbar`, values/text, available/ambiguous/over-total notices, metrics, and message semantics.
- Capture same fictional nonzero-progress state before/after at 1440px and 375px; screenshot paths: `.wrangler/p001-review/progress-compact-desktop.png` and `progress-compact-mobile.png`. Capture useful existing edge states only if existing harness fixtures support them without policy/data changes.

### API/data/cross-programmer impact
No API, DB, shared contract, calculations, cache, dependencies, save semantics, or P002 impact. Existing mocked browser fixtures only; no real DB/auth use.

### Acceptance criteria
- [x] Typical nonzero-progress card height is reduced by approximately 40% at desktop and mobile where readable, measured with the same fixture before/after.
- [x] Percentage bubble/bar, recorded/configured total, earned/exempted/remaining credits, and Taken/Exempted counts remain visible and semantically accessible.
- [x] Unavailable, ambiguous mapping, and over-total notices remain intact; zero/100% endpoints and mobile wrapping remain usable.
- [x] No page-level horizontal overflow at 320px or 375px; no calculations or records behavior change.
- [x] New desktop/mobile screenshots show the same meaningful fictional data.

### Verification plan
Run the existing P001 browser harness (`node tools/p001/test-ui.mjs`), focused credit summary tests where practical, `npm.cmd run typecheck`, targeted ESLint for changed source/harness files, `npm.cmd run build:local`, and `git diff --check`. Unset `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` in check environments. Do not invoke Wrangler.

### Risks / assumptions / rollback
- Risks: a denser layout could impair readability, hide edge-state notices, or crowd the percentage bubble on narrow screens.
- Assumptions: existing card data and fixed harness scenarios are the source for all displayed values and messages; no new academic policy is introduced.
- Rollback: revert only this record, card CSS/markup, harness measurement/assertion and screenshots; retain the S1-P001-012 card and its calculations.

## 2. Implementation

- **Status:** COMPLETE; ready for review
- **Files actually changed:** `apps/web/src/features/records/subject-records-table.css`, `tools/p001/test-ui.mjs`, and this record. The progress card component/calculations were unchanged.
- **Summary:** Reworked the existing card into a compact two-column heading/result row, shallow bubble/meter row, and reduced-spacing breakdown. Preserved all displayed data/messages and accessible progressbar semantics. Added same-fixture measurements and desktop/mobile plus edge-state captures. Added a targeted toast-dismissal wait in the existing progress-save browser scenario and made the failed-save checkbox attempt a click rather than Playwright check; all original save, rollback, and total assertions remain.

## 3. Review

- **Self-review checklist:** PASS - presentation-only CSS; no component, calculation, data, API, cache, state, or record-write changes. Bubble and accessible progressbar remain; uncertainty, over-total and breakdown content are unchanged. Verified 320px edge layout and inspected screenshots.
- **Test evidence:** `node tools/p001/test-ui.mjs` exit 0; 42 mocked browser checks passed, including compact card screenshots and zero/full/unavailable/over-total states. `node node_modules/vitest/vitest.mjs run apps/web/src/features/records/recorded-credit-summary.test.ts --config vitest.auth.config.ts` exit 0; 4 tests passed. `node node_modules/eslint/bin/eslint.js tools/p001/test-ui.mjs --max-warnings 0`, `npm.cmd run typecheck`, and `npm.cmd run build:local` exited 0. Database URL variables were unset for test/check child environments; no DB/auth/provider calls occurred. `git diff --check` clean.
- **Measured height:** Same fictional fixture (7 of 131 recorded): 1440px desktop reduced from 341.83px to 171.38px (50%); 375px mobile reduced from 321.67px to 159.78px (about 50%). At 320px, a 44-subject fictional fixture with 131 recorded/configured credits displayed 131 / 131 and the 100% bubble; the heading wrapped and all three text/bubble bounding boxes stayed inside the card, with no page overflow.
- **Manual checks / artifacts:** Inspected `.wrangler/p001-review/progress-compact-desktop.png`, `progress-compact-mobile.png`, and `progress-compact-full-mobile.png`. Also captured and checked `progress-compact-zero.png`, `progress-compact-full.png`, `progress-compact-unavailable.png`, and `progress-compact-over-total.png`. Fictional UI harness only.
- **Harness note:** The first UI run failed when a success toast intercepted the next checkbox click; the progress-save scenario now waits for its own success toast to hide, preserving all save/failure/summary assertions. A later run intermittently failed in the failed-Exempted-save test because Playwright `.check()` waits for the checked state to persist even though the expected failed save rolls it back. That test now uses `.click()` and retains the awaited failure alert plus unchecked, no-write, and no-modal assertions. The final full run passed all 42 checks. The final full run passed all 42 checks.
- **Review outcome:** PASS - SELF-REVIEW and coordinator code, visual, and verification evidence review passed; human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Changed / Tests / Docs
- **Added / Changed / Fixed / Removed:** Compact UC04 recorded-credit card spacing and grouping; instrumented P001 mock-browser screenshot capture and height measurements; stabilized the progress-save browser interaction against its own transient toast.
- **Affected routes / tables / consumers:** `/student/records` card presentation only. No route, table, API, calculation, or data change.
- **Breaking changes / migration steps:** None.
- **Verification summary:** P001 browser harness 42 checks passed; credit summary unit tests 4/4 passed; targeted ESLint, full typecheck, local build, and `git diff --check` passed. Same-fixture height fell by approximately 50% at 1440px and 375px. Screenshots use fictional data under `.wrangler/p001-review/`.
- **Outstanding blockers / follow-up:** Human peer review pending.
- **Final status:** READY_FOR_REVIEW