# S3-P004-023 — Hide "Academic progress" and "Recommendations" from the student menu

- **Status:** Merged to main and pushed to dev and prod (2026-11-20); independent review pending
- **Date:** 2026-11-20
- **Sprint:** Sprint 3
- **Owner:** P004 (shared student shell)
- **Related UC / FR:** Student workspace navigation
- **Branch / PR:** `feature/hide-student-menu-items`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner asked to hide two items from the student menu:

- **Recommendations**, hidden for now;
- **Academic progress**, which the owner thinks repeats what other student pages already show.

They are only hidden. The pages, routes, APIs and setup guard stay as they are, so typing `/student/progress` or `/student/recommendations` still opens them. Bringing an item back means adding its line to the `links` list again.

## 2. Implementation

- `apps/web/src/app/StudentShell.tsx`: the two entries are removed from `links`. That list drives both the sidebar and the header "Search pages" results, so both stop showing them.
- `tools/integration/test-ui.mjs`:
  - the menu check no longer expects the two links;
  - the progress test now checks that neither link is in the menu and opens the page by URL;
  - the recommendations test opens the page by URL;
  - the "queued save is discarded on unmount" test now leaves through "Graduation check".

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:ui:integration` | 75 PASS, 0 FAIL (Clerk and API mocked) |

Execution note: the coordinating agent made this change directly. An independent review is still pending.

## 4. Changelog

- The student menu no longer shows "Academic progress" or "Recommendations". Both pages still open from their direct links.
