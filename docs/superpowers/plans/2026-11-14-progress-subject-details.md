# UC05 Progress and UC18 Subject Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put UC05 Academic progress in the student app at `/student/progress` and add a read-only UC18 subject details panel to its subject list.

**Architecture:** The P001 progress API adds the curriculum `links` it already loads → the existing `ProgressPage` is wired into `StudentRoutes`/`StudentShell`, restyled to the student template, and gains a details panel that combines progress outcomes, links and the existing semester-offerings response.

**Tech Stack:** TypeScript, React, Cloudflare Worker API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-progress-subject-details-design.md`

## Global Constraints

- Do NOT edit `docs/System Documents/*`. No database migration.
- Read-only for students: no edit controls in the details panel.
- Met = required subject outcome `COMPLETED` or `EXEMPTED`.
- Exact copy: menu label `Academic progress`; button `Details` (accessible name `Details for <CODE>`); panel headings `Prerequisites`, `Unlocks`, `Next semester`; texts `No mandatory prerequisite is configured`, `Approved for next semester`, `Availability not confirmed`, `advice only`, status words `Completed` / `Exempted` / `Remaining`, `Met` / `Not met`.
- UI: student template classes, typography tokens from `apps/web/src/app/typography.css`, ≥44px controls, `assertReadable` in UI checks. The subject list has a filter select: follow `docs/themeguide.md` "Table toolbar (mandatory)" if the list becomes a table with filtering.
- `sprint2.css` stays (other P001 overlay files may use it); only drop its import from `ProgressPage` if nothing there needs it.

## Review Focus

1. Subject with no links → "No mandatory prerequisite is configured" (Task 2 test).
2. Failed/withdrawn required subject (outcome `REMAINING`) → "Not met" (Task 2 test).
3. Offerings request fails or selection not open → "Availability not confirmed", page still works (Task 2 UI check).
4. Profile not set up → existing `PROFILE_SETUP_REQUIRED` handling still shows (AuthGate `requireProfile`) (Task 2).
5. Mobile 375px: panel readable, no horizontal page scroll (Task 2 UI check).

---

### Task 1: Progress API returns curriculum links

**Files:** Modify `apps/api/src/modules/p001-sprint2/contracts.ts` (`Progress` gains `links: Dependency[]`), `progress.ts` (`calculateProgress` returns `links: source.curriculum.links`). Test: the existing progress unit test file (find it next to `progress.ts`) and any typed fixtures (`tools/p001-sprint2/test-ui.mjs` progress fixture gains `links: []`).

- [ ] Step 1: failing test — `calculateProgress` returns `links` equal to the source links (one MANDATORY, one COREQUISITE fixture link).
- [ ] Step 2: run the focused vitest — FAIL. Step 3: implement. Step 4: `npm run typecheck` + focused test — PASS.
- [ ] Step 5: commit `feat(api): progress response includes curriculum prerequisite links (S2-P001-006)`.

### Task 2: Student route, restyle, subject details panel

**Files:**
- Modify: `apps/web/src/app/StudentRoutes.tsx` (`StudentArea` gains `'progress'`; title `Academic progress`; renders `ProgressPage` with a `createSprint2Client(getToken, apiBase)` client — see how `AdminRoutes.tsx` builds it with `useAccountApiBase()`), `apps/web/src/app/AppRoutes.tsx` (`/student/progress`), `apps/web/src/app/StudentShell.tsx` (menu item after Subject records; pick an existing icon), `AuthGate requireProfile` true for progress.
- Modify: `apps/web/src/features/p001-sprint2/ProgressPage.tsx` (+ a CSS file for the student look, or reuse student/records CSS), Create: `apps/web/src/features/p001-sprint2/SubjectDetailsPanel.tsx` and a pure helper `subject-details.ts` (`describeSubject(subject, progress, approvedSubjectIds: ReadonlySet<number> | null)` → view model) with `subject-details.test.ts`.
- Modify: `tools/p001-sprint2/test-ui.mjs` (it already serves `/student/progress` fixtures; add `/api/semester-offerings` mock) — or the integration UI harness if `/student/progress` must be checked inside the real `StudentShell`; choose the one that renders `AppRoutes`.

- [ ] Step 1: failing unit tests for `describeSubject`: mandatory link to a COMPLETED subject → Met; to REMAINING → Not met; COREQUISITE and RECOMMENDED listed with kind labels (recommended marked advice only); no links → `No mandatory prerequisite is configured`; "Unlocks" lists subjects whose links require this one; `semesterTypes ['SHORT']` → explanation "Offered in Short semester (Semester 3) only"; approved set containing the subjectId → `Approved for next semester`; `null` or missing → `Availability not confirmed`.
- [ ] Step 2: run — FAIL. Step 3: implement helper, panel (dialog or inline expandable region, keyboard accessible, focus returns to the Details button on close), wire the page, route and menu; fetch `GET /api/semester-offerings` once (via the offerings client or a plain authorised fetch) and build the approved set from its `subjects[].subjectId`; on any failure use `null`.
- [ ] Step 4: restyle `ProgressPage` to the student template (look at `RecordsPage`/`OfferingsPage` and their CSS).
- [ ] Step 5: UI checks: menu link reaches `/student/progress`; Details opens the panel with Met/Not met, Unlocks and `Approved for next semester`; offerings failure → `Availability not confirmed`; 1440 and 375 screenshots saved to `C:/Users/Asus/AppData/Local/Temp/claude/4795dd4a0714ec36/2f868daa-f74f-4c8a-8ab8-0db2a4082255/scratchpad/progress/`; `assertReadable`.
- [ ] Step 6: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, UI checks — PASS. Commit `feat(web): Academic progress in the student app with UC18 subject details (S2-P001-006)`.

### Task 3: Change record, README, verification

- Create `docs/changes/S2-P001-006-progress-subject-details.md` (Owner `P001 (UC05) / P003 (UC18); built by P004`, Status `READY_FOR_REVIEW`, states the SDD was not updated).
- README Sprint 2 table: replace the P001 UC05 "not yet in the shared router" wording and add the S2-P001-006 row.
- Full verification: typecheck, lint, test, test:integration, build, check:cloudflare, the UI checks used in Task 2, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`. Commit `docs: S2-P001-006 change record and README`.
