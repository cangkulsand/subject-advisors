# Offering History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only coordinator page `/coordinator/history` showing past semesters' offering decisions and pick counts.

**Architecture:** Frontend only. `OfferingHistoryPage` uses the existing `CoordinatorClient` methods `context()`, `getDecisions(scope)` and the existing `SubjectPickersDialog` (`getPickers`). No API, contract or database change.

**Tech Stack:** TypeScript, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-offering-history-design.md`

## Global Constraints

- Do NOT edit `docs/System Documents/*`. No database access. No API or shared-contract changes.
- Commits carry NO `Co-Authored-By` or any AI attribution line (project owner rule).
- Exact copy: menu label and page title `Offering History`; page description `Look back at past semesters' offering decisions and how many students picked each subject.`; decision labels `Approved` / `Removed`; button `View students` (accessible name `View students for <CODE>`); empty states `No semester has closed subject selection yet.` and `No offering decisions were recorded for this programme, learning centre and semester.`
- Semesters listed = context `semesters` with `selectionClosesAt` non-null and before now, newest first (by `selectionClosesAt`). Default selection: newest closed semester, first assigned scope.
- Only assigned scopes may be chosen (programme/centre options come from `context().assignedScopes`).
- UI: admin/coordinator template classes as used by `ForecastsPage`/coordinator pages, typography tokens (`apps/web/src/app/typography.css`), controls >= 44px, `assertReadable` in UI checks; tables with filtering/sorting must use the shared table toolbar (`docs/themeguide.md`) — the selectors here choose the data scope, they are not a table filter, so the toolbar is not required unless you add filtering.

## Review Focus

1. No closed semester → empty state, no decisions request sent (Task 1 UI check).
2. A coordinator with two assigned scopes switches programme/centre → table reloads for the new scope (Task 1 UI check).
3. Removed subject shows `—` for picks and no `View students` (Task 1 helper test).
4. Decisions request fails → error with retry; page does not crash (Task 1 UI check).
5. Semester with `selectionClosesAt` in the future or null is not listed (Task 1 helper test).

---

### Task 1: Offering History page

**Files:** Create `apps/web/src/features/coordinator/OfferingHistoryPage.tsx`, `apps/web/src/features/coordinator/offering-history.ts` (+ `offering-history.test.ts`); modify `apps/web/src/features/coordinator/CoordinatorRoutes.tsx` (menu link under `Forecast planning` after `Class Offering Forecast`, `pages` entry, route render, overview quick link text if the overview lists all links), `tools/coordinator/test-ui.mjs` (+ `fixtures.mjs` if mocks live there).

**Interfaces (produced):**
- `closedSemesters(semesters: SemesterOption[], now: Date): SemesterOption[]` — filter + newest-first sort as in Global Constraints.
- `historyRows(set: OfferingDecisionSet): Array<{ subjectId: number; code: string; name: string; credits: number; decision: 'Approved' | 'Removed'; picks: number | null }>` — `picks` from `pickCounts` for APPROVED (0 when absent), `null` for REMOVED; sorted by subject code.

- [ ] Step 1: failing tests in `offering-history.test.ts` for both helpers (future/null close dates excluded; newest first; removed → `picks:null`; approved without a pick count → 0; code order).
- [ ] Step 2: run `npx vitest run apps/web/src/features/coordinator/offering-history.test.ts` — FAIL. Step 3: implement helpers and page (loading, error with `Try again`, both empty states, programme / learning centre / semester selects, table, `View students` opening `SubjectPickersDialog` with the selected scope and `targetSemesterId` = chosen semester). Read-only: no decide controls.
- [ ] Step 4: UI checks in `tools/coordinator/test-ui.mjs`: menu link reaches `/coordinator/history`; table shows Approved with count and Removed with `—`; `View students` lists names + matric numbers; switching scope reloads; no closed semester → empty state and no `/offering-decisions` request; decisions 503 → alert + `Try again` works; 1440 and 375 without horizontal overflow; `assertReadable`. Save screenshots `history-1440.png`, `history-375.png` to `C:/Users/Asus/AppData/Local/Temp/claude/4795dd4a0714ec36/2f868daa-f74f-4c8a-8ab8-0db2a4082255/scratchpad/history/`.
- [ ] Step 5: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:coordinator` — PASS. Commit `feat(web): coordinator Offering History page (S3-P004-002)`.

### Task 2: Change record and README

- Create `docs/changes/S3-P004-002-offering-history.md` (format of `docs/changes/S3-P004-001-uc13-graduation-check.md`; Owner `P004 (M6)`; Status `READY_FOR_REVIEW`; frontend only; SDD not updated; non-goals from the spec).
- README Sprint 3 table: add the S3-P004-002 row.
- Verification: typecheck, lint, test, build, check:cloudflare, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:coordinator`, `PLAYWRIGHT_CHANNEL=chrome node tools/integration/test-ui.mjs`. Commit `docs: S3-P004-002 change record and README`.
