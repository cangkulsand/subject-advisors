# S1-INT-014 — Required current semester in academic profile

- **Status:** IMPLEMENTED — coordinator final review pending
- **Date:** 2026-10-28
- **Sprint:** Sprint 1 integration
- **Owner:** P001 / P002 / P004 integration
- **Related UC / FR:** Student academic profile setup and semester-scoped offerings
- **Branch / PR:** Current shared worktree / not created
- **Reviewer:** Coordinator final review PASS

## Objective and behavior

Academic year and semester are now separate required controls in the student academic profile. The year determines the configured semester options; neither control has an automatic default. Existing profiles without a selected semester remain stored and are directed through setup before profile-gated academic features can be used. Offerings uses the saved profile semester and no longer has period selectors. Selecting another semester changes the active view and leaves the saved offerings for other semesters intact.

No student profiles were backfilled or modified. No provider/auth configuration or production database was changed.

## Schema change and application

Added `db/migrations/0003_profile_current_semester.sql` and registered it in `db/migrations/manifest.json`. The migration adds nullable integer `student_profile.current_semester_id`, a foreign key to `academic_semester.semester_id`, and `ON DELETE RESTRICT`. It has no default or backfill. Migrations 0000–0002 and the frozen baseline schema contract remain unchanged. `db/checks/004_profile_current_semester.sql` verifies the registered extension separately from the frozen baseline assertions.

The canonical runner's static review and tooling tests passed. Its read-only status probe could not connect from this sandbox (`pg.Client.connect` returned `EACCES` before a database operation). Following coordinator review, the exact canonical migration bytes and checksums were submitted through the Neon transaction tool to the verified development target: project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`. The transaction used an advisory lock, 5s lock timeout, 20s statement timeout, `IS DISTINCT FROM` target guards, and required the preexisting migration ledger to match canonical 0000–0002 before applying 0003 and recording its SHA-256. No ad hoc DDL or other data change was performed.

Applied migration checksum: `f2a3d704c3d6f9bfc3e721086a1a787c54cd3e88704036e5f737a65739407589`.

Independent post-commit readback confirmed the exact target and ledger rows 0000–0003, including that 0003 checksum. Metadata confirmed `current_semester_id` is nullable `integer`, has no default, and has a validated FK to `academic_semester.semester_id` with RESTRICT delete behavior. The complete read-only `001_schema_verification.sql` baseline plus `004_profile_current_semester.sql` extension checks also passed against this target. No student data was selected or changed. The optional live database fixture suite was not run.

## Implementation

- Profile contracts, input validation, repository and routes now require a positive configured `currentSemesterId` for profile completion. Profile and options remain accessible while setup is incomplete. Saving joins the configured semester in the same upsert; invalid IDs receive a clear error.
- The profile page requires both academic year and semester. Changing year clears an invalid prior semester; no period is auto-selected.
- Account cache v2 and narrow profile/options/P002 context version markers invalidate stale `COMPLETE` and period snapshots while preserving identity scoping and unrelated academic-record snapshots.
- Offerings context and route default to the saved semester and reject mismatched reads/writes. The save transaction locks and rechecks the current profile semester before changing rows. Changing the profile period does not migrate or delete the prior period's offerings.
- The Offerings page displays the saved period and a link to edit the profile. Prior user layout edits, filters, history, degree progress display, shared toast, and other existing work were preserved.
- The optional database fixture includes the new profile field and a regression that switches periods while retaining the previous offering rows.

## Verification

Completed with mocked/local fixtures only, except the reviewed additive migration and read-only metadata/schema checks above:

- `npm.cmd test` — exit 0; 24 files / 327 tests passed, 2 files / 13 tests skipped.
- `npm.cmd run typecheck` — exit 0.
- `npm.cmd run lint` — exit 0.
- `npm.cmd run build` — exit 0.
- `npm.cmd run typecheck:offerings` — exit 0.
- `npm.cmd run lint:offerings` — exit 0.
- `npm.cmd run test:offerings` — exit 0; 124 passed, 8 skipped (12 files, 1 skipped).
- `npm.cmd run test:integration` — exit 0; 6 passed.
- `npm.cmd run test:ui:integration` — exit 0; 20 browser checks passed.
- `node tools/p001/test-ui.mjs` — exit 0; 39 mocked browser checks passed, including required choice, legacy setup, profile save, desktop/mobile overflow, and keyboard behavior. Toast timing was frozen in the test harness so browser execution time cannot expire notifications during the stack assertion; toast production code was not changed.
- `npm.cmd run test:ui:offerings` — exit 0; 36 mocked browser checks passed, including profile-pinned period, saving/reloading, switching away and back without losing the prior period's selection, and responsive layout.
- `npm.cmd run build:local` — exit 0.
- `npm.cmd run db:review` and `npm.cmd run test:db-tooling` — exit 0; canonical migration review and 12 tooling tests passed.
- Read-only Neon baseline 001 + extension 004 verification — exit success on the exact development target.

Fresh browser screenshots (ignored artifacts):

- Profile desktop, 1280px: `.wrangler/p001-review/profile-semester-desktop.png`.
- Profile mobile, 375px: `.wrangler/p001-review/profile-semester-375.png`.
- Offerings desktop: `dist-offerings/review/desktop-guided.png`.
- Offerings mobile, 375px: `dist-offerings/review/mobile-guided-375.png`.

Real-account Clerk acceptance was not available in the mocked browser harness. No live provider queries were made.

## Review and follow-up

- **Plan/schema pre-write review:** Coordinator PASS.
- **Migration payload pre-write review:** Coordinator PASS after target-guard and timeout corrections.
- **Post-write database/schema readback:** Coordinator PASS; independent exact-target ledger and FK verification succeeded.
- **Implementation review:** Coordinator reviewed the actual schema, profile/API/cache/test changes and desktop/mobile screens; PASS. The Offerings period line contains only the Edit academic profile link; the period itself remains in the existing summary.
- **Human approval:** Pending.
- **Outstanding follow-up:** Authenticated real-account Clerk acceptance.
- **Final status:** IMPLEMENTED — coordinator review PASS; real-account acceptance remains pending.

## Changelog

- **Date:** 2026-10-28
- **Type:** Required profile setup and offerings period integration
- **Added / Changed / Fixed:** Added a persisted, required current academic period to Profile; made Offerings consume that period and preserve period-specific lists; invalidated stale profile/context snapshots.
- **Affected routes / tables / consumers:** `student_profile.current_semester_id`; `/api/profile`, `/api/profile/options`, `/api/me`, `/api/semester-offerings`; profile setup, auth/cache gates and Offerings page.
- **Breaking changes / migration steps:** Additive migration 0003 applied to the reviewed Neon development target. Existing profiles with null semester remain unchanged and must choose a configured year/semester before accessing gated academic features.
- **Verification summary:** All listed local tests/builds and exact-target read-only schema checks passed; no student data was modified.
- **Remaining limitation:** Real-account Clerk acceptance is pending.
