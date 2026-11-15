# S3-INT-002 — Fix flaky admin browser checks

- **Status:** DONE (2026-11-15)
- **Date:** 2026-11-15
- **Sprint:** Sprint 3
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** `main`; no PR
- **Reviewer:** Pending

## 1. Plan

`npm run test:ui:admin` failed intermittently (most runs on 2026-11-15). Three timing races in the test harness, none in
the app. Test-only change.

## 2. Implementation

- `tools/admin/academic-ui-checks.mjs` (semesters check): saving refreshes the list, which briefly unmounts the table
  (`useSetupRead` resets `data` on refresh); the check counted buttons with `.count()` (no waiting) during the reload.
  It now waits for the reloaded rows first.
- `tools/admin/test-ui.mjs` "signed-out staff routes redirect to sign in": the readability scan could run while the
  redirect was still navigating ("Execution context was destroyed"). It now waits for `networkidle` after the redirect.
- `tools/admin/test-ui.mjs` "responsive navigation and local table scrolling" (320/375): closing the menu returns focus
  to its toggle, sometimes a moment after Escape, which took focus back from the table so ArrowRight did not scroll it.
  The check now refocuses the table on each of up to five attempts.

## 3. Review

- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:admin`: 12 of 12 consecutive runs passed (50 checks each); before the
  fix, 3 of 12 runs passed. Diagnosis was confirmed with temporary logging (focus on `BUTTON.admin-menu-button`
  instead of the table) that was removed afterwards. `npm run lint` passes.

## 4. Changelog

- 2026-11-15 - Type: Fixed. Three timing races in the admin browser checks; test tooling only.
