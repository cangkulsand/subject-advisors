# S2-P001-006 — Academic progress in the student app with subject details (UC05 / UC18)

- **Status:** MERGED to `main` (2026-11-15); human peer review pending
- **Date:** 2026-11-14
- **Sprint:** Sprint 2
- **Owner:** P001 (UC05) / P003 (UC18); built by P004
- **Related UC / FR:** UC05 academic progress; UC18 subject details; UC24 prerequisite links (P003)
- **Branch / PR:** `feature/s2-progress-subject-details`; merged into `main` on 2026-11-15 (merge commit 0f72f82); no PR
- **Reviewer:** Pending

## 1. Plan

Problem: UC05 progress only existed in the P001 overlay (`node tools/p001-sprint2/dev.mjs`), not in the student app, and there was no way to see a subject's details. Design: `docs/superpowers/specs/2026-11-14-progress-subject-details-design.md`.

Decisions:
- `/student/progress` is a student page with an "Academic progress" menu item after Subject records.
- A read-only Details panel opens per subject. No editing.
- No database change, no migration. Rollback: revert the branch commits.
- The SRS/SDD in `docs/System Documents/` was deliberately NOT updated.

## 2. Implementation

- **API:** `GET /api/p001-sprint2/progress` additively returns `links` (curriculum prerequisite links). Existing fields are unchanged.
- **Web:** `ProgressPage` restyled to the student template (`progress-page.css`, student tokens, 44px controls); route, `StudentArea`, `StudentShell` menu and `AuthGate` (profile required) wired for `progress`.
- **Details panel (`SubjectDetailsPanel`, `subject-details.ts`):** native modal dialog (Escape or Close; focus returns to the Details button). Shows Prerequisites Met / Not met (including co-requisite; recommended links marked "advice only"), Unlocks, permitted semesters (with a note that Short is Short-only), status, and Next semester: "Approved for next semester" or "Availability not confirmed" (from `GET /api/semester-offerings`, once per mount; any failure gives "Availability not confirmed").
- **Tests and harnesses:** 8 unit tests for `describeSubject`/`approvedSubjectIdsFrom`; `tools/integration/test-ui.mjs` gained 6 checks (real AppRoutes/StudentShell); `tools/p001-sprint2/test-ui.mjs` gained an offerings mock and a details check. Both harnesses now honour `PLAYWRIGHT_CHANNEL`.
- **Docs:** `README.md`.

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 72 files passed, 6 skipped; 1625 tests passed, 65 skipped
- `npm run test:integration`: 11 passed, 0 failed
- `npm run build`: pass
- `npm run check:cloudflare`: pass (dry run, 1158.36 KiB upload / 244.84 KiB gzip)
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:integration`: 37 passed
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`: 57 browser checks passed
- `PLAYWRIGHT_CHANNEL=chrome node tools/p001-sprint2/test-uc24-ui.mjs`: 14 passed
- `tools/p001-sprint2/test-ui.mjs`: stops at the stale admin curriculum check (known issue below); the progress details check added by this work passed when run in Task 2

Known pre-existing issue (not caused by this work): the admin curriculum checks in `tools/p001-sprint2/test-ui.mjs` fail identically on main before and after S2-INT-005 (stale overlay checks). `/admin/curriculum` is covered by `tools/p001-sprint2/test-uc24-ui.mjs` (14/14).

Not verified: no database was used; the offerings availability was checked with mocks only.

## 4. Changelog

- 2026-11-14 - Type: Added. Academic progress in the student app (`/student/progress`) with a read-only subject Details panel (UC05 / UC18). `GET /api/p001-sprint2/progress` additively returns `links`. Compatibility: no migration; existing response fields unchanged. Outstanding: human peer review; SRS/SDD not updated.
- 2026-11-15 - Merged: `feature/s2-progress-subject-details` into `main` (merge commit 0f72f82). Checks on merged main: typecheck, lint, unit tests (1625 passed, 65 skipped), integration 11/11, build, check:cloudflare, student app UI (37), offerings UI (57), UC24 UI (14). Status: MERGED; human peer review pending.
