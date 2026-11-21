# S3-P004-025 — Admin menu readability and one-line labels; card heading gap; short row buttons; readable values and dates

- **Status:** Merged to main and pushed to dev and prod (2026-11-20); prod deploy verified live; reviewed (see Reviewer)
- **Date:** 2026-11-20
- **Sprint:** Sprint 3
- **Owner:** P004 (admin and shared staff UI)
- **Related UC / FR:** Administration; themeguide 5.5, 7.1, 12 and "Typography and readability (mandatory)"
- **Branch / PR:** `feature/admin-ui-polish`; no PR
- **Reviewer:** Automated code review 2026-11-20: no findings

## 1. Plan

A UI/UX review of the admin pages (2026-11-20), done the same way as the coordinator review in S3-P004-021, found 13 issues. The owner asked to fix five of them:

1. **Menu text hard to read.** Inactive admin links used the student pink `#b88b96` on the slate gradient. Contrast fell to about 3.5:1 near the bottom of the menu and on hover (`#334155`), below WCAG AA (4.5:1). The "Academic setup" heading was 12px in the same pink.
2. **Two menu labels wrapped.** "Coordinator Assignments" and "Curriculum & Prerequisites" broke onto two lines at 1440px. At 1024px "Academic Semesters" wrapped as well.
4. **Gap above card headings.** `.admin-card > h2 { margin-top: 28px }` also applied when the heading opens the card. Examples: Overview "Academic setup" sat 28px lower than "Assigned roles" beside it; Account details had the same gap on its section cards.
7. **Row buttons repeated the code.** Setup tables showed "Edit TEST", "Department TEST", "Deactivate TEST 2026". The buttons wrapped onto two lines and the Actions column was the widest.
9. **Database codes and mixed date formats.** Semesters showed `NORMAL` / `SHORT`, "— to —" and `2027-09-01`. Coordinator Assignments showed "01/11/2026, 08:00:00". The access history showed `ROLE_DOMAIN`.

Not in scope (left for later): same icon on five menu items, the Overview tile links and "MEMBERSHIPS" label, tiny save notices, Coordinator Assignments showing "Account 2", Users & Access wrapping, the Current pill, and the mobile tables and top bar.

## 2. Implementation

- `apps/web/src/features/admin/admin.css`:
  - admin menu colours: `--staff-nav-muted` is `#d4b5be` (about 5.5:1 on `#334155`) and the new `--staff-nav-link` is `#ebe0e3` (about 8:1). The coordinator colours do not change;
  - the group heading ("Academic setup") uses `--font-size-label` (13px);
  - grouped links lose their 8px indent, the icon gap is 10px, and all menu items share 10px side padding, so every icon lines up;
  - at tablet width (761–1050px) the sidebar is 240px instead of 218px;
  - `.admin-card > h2` keeps its 28px top margin only when it is not the card's first child;
  - new `.admin-setup-actions` row (same rules as `.admin-semester-actions`): buttons sit on one line.
- `AdminShell.tsx`: the menu label "Curriculum & Prerequisites" becomes "Subjects & Prerequisites". That is shorter and matches the page heading ("Subjects and prerequisites").
- `ProgrammesPage.tsx`, `DepartmentsPage.tsx`, `ReferenceSetupPage.tsx`: buttons show "Edit", "Department", "Deactivate" or "Reactivate". The code stays in the `aria-label` ("Edit TEST", "Deactivate TEST 2026"), so screen readers and tests get the same names as before.
- `academic-ui.tsx`: new `formatDateTime` ("28 Oct 2026, 18:00", as on the other admin pages) and `formatDate` (a `YYYY-MM-DD` day read as a local date, so it never moves by a day).
- `SemestersPage.tsx`: type shows "Regular" or "Short"; dates show "1 Sept 2027 to 31 Dec 2027" or "Not set"; the form help text no longer mentions NORMAL and SHORT.
- `CoordinatorAssignmentsPage.tsx`: Started and Ended use `formatDateTime` (no seconds).
- `AdminPages.tsx`: the "Previous → New" column shows "Role eligibility policy", "Protected owner exception", "Active" or "Suspended". Any other code still shows as it is.
- Tests:
  - `tools/admin/test-ui.mjs`: the menu link is renamed. New checks: every menu label is on one line at 1440 and 1024px; menu colours and heading size; no top gap on the first card heading (Overview, Account details); audit values in words;
  - `tools/admin/academic-ui-checks.mjs`: new checks for semester types and dates in words, short row buttons, and row actions on one line.

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:ui:admin` | 50 PASS (readability guard included; new assertions run inside existing checks) |
| `npm run test:ui:coordinator` | 57 PASS (shares the menu CSS) |

Screenshots with the TEST-ONLY fixtures (not committed): Overview, Programmes and Semesters at 1440px, and the menu at 1024px. Every menu label is on one line, and all menu icons line up.

Known effect: at 1024px the wider sidebar leaves the content 22px narrower. The Semesters, Programmes, Coordinator Assignments and Users tables already scrolled sideways at this width before the change (by 40px); they now scroll by 62px. The page itself still does not scroll sideways.

Not run: integration and P001 suites (no changes to their screens).

Execution note: the coordinating agent made this change directly. An independent review is still pending.

## 4. Changelog

- The admin menu text is easier to read, and every menu label fits on one line.
- "Curriculum & Prerequisites" in the admin menu is now "Subjects & Prerequisites", matching its page.
- Card headings no longer have an extra gap at the top.
- Setup tables show short "Edit", "Department" and "Deactivate" buttons on one line.
- Semester types, dates, coordinator assignment times and access history values are shown in plain words and one date format.
