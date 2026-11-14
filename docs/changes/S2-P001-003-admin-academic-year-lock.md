# S2-P001-003 — Lock profile to the administrator's current academic semester

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-10 (revised scope)
- **Sprint:** Sprint 2
- **Owner:** P001 / Programmer 1
- **Related UC / FR:** UC03; student profile setup and edit
- **Branch / PR:** `feature/student-profile-admin-academic-year` (handoff, based on `7b4b9af`); merged into `feature/s2-continue` by P004 on 2026-11-11 / no PR
- **Reviewer:** Coordinator review PASS for exact-semester profile and readonly visual treatment; human peer review pending

## 1. Plan

### Objective / problem

Keep the student's profile period locked to the exact academic semester selected as current by the administrator. If the admin selects 2026/2027 Semester 1, the profile must display 2026/2027 Semester 1; the student must not select Semester 2 or 3, including within that same year.

### Scope and requirements

- In scope: expose the complete live current semester object for the `academic_semester` row where `is_current=true`; render both its academic year and semester read-only; use that semester ID for every profile save; safely handle missing or changed current-semester configuration.
- In scope: preserve the complete historical semester catalogue for RecordsPage, existing Redis catalogue caching, and profile ownership/curriculum validation. ProfilePage loads the current marker fresh; the save statement checks it atomically.
- Out of scope: all subject-offerings changes, including `apps/*/modules/offerings`, `features/offerings`, coordinator workflows, offering contracts/fixtures, and picking deadlines. Also out of scope: schema/migration changes, new dependencies, database writes/backfills, deployment, commit and push.

### Proposed implementation

- Expected files: `apps/api/src/modules/profile/{contracts.ts,repository.ts,repository.test.ts,profile.test.ts,index.test.ts}`; `apps/web/src/features/profile/{ProfilePage.tsx,profile.css,client.ts,data-cache.test.ts}`; `apps/web/src/features/records/RecordsPage.tsx` only if the required options shape needs an initial value; `tools/p001/test-ui.mjs`; and minimal `tools/integration/test-ui.mjs` fixture updates if required. Inspect and update only direct type consumers and fixtures.
- API / database / interfaces: add required `currentSemester: SemesterOption | null` to `ProfileOptions`, where `SemesterOption` includes `semesterId`, `academicYear`, `semesterNo`, and `semesterType`. Retain `currentAcademicYear` for compatibility, derived from the same live current-semester row. Each of the three options return paths performs one uncached marker query and returns both fields from it. Keep the complete configured `semesters` list, existing Redis catalogue cache keys/TTLs and data unchanged; never infer current state from cache, the greatest year, or a semester ID. No schema change: reuse `academic_semester.is_current`.
- The existing profile upsert must use one guarded statement with a current-semester CTE selecting the live `semester_id` `FOR SHARE`; require the selected semester row's ID to equal that CTE's ID inside the insert/upsert. Preserve current-semester input validation, active curriculum/programme validation, ownership and current profile behavior. Missing marker returns `503 ACADEMIC_SEMESTER_UNAVAILABLE`; an existing but non-current selected semester returns `409 ACADEMIC_SEMESTER_MISMATCH`; a nonexistent semester remains `400 INVALID_SEMESTER`. No read-then-unguarded-write authorization. Do not expose credentials or student data in errors.
- UI: display both administrator-selected academic year and semester as read-only labeled controls. Semester type is displayed from the current object. Setup uses that semester automatically; remove student period selection from draft state where practical and send `currentSemester.semesterId`, not a student-controlled period value, in the save payload. If no current object exists, explain that an administrator must configure the current semester and disable saving; do not guess. A stored profile with another current-semester ID shows the administrator's live period immediately and remains untouched on GET; only an explicit student save updates it. On `ACADEMIC_SEMESTER_MISMATCH` or `ACADEMIC_SEMESTER_UNAVAILABLE`, refresh options bypassing snapshots, update the read-only period, preserve unsaved name/matric/programme/hour fields, and ask the user to save again. Do not automatically retry or write. Cancel restores personal fields while always displaying the newest administrator period. A failed options refresh offers safe retry.
- Cache / shared-file impact: retain the narrow optional `bypassCache` option. ProfilePage always requests options with `bypassCache: true`; other callers, including RecordsPage, retain private snapshot behavior and historical semester data. Bump the profile-options browser contract marker to `profile-options-admin-current-semester-v3`. Do not cache the admin marker in Redis.
- Dependencies / shared-file impact: ProfileOptions gains required live metadata; update direct TypeScript consumers/fixtures minimally. Existing offerings consumers and behavior remain untouched.

### Acceptance criteria

- [x] All three options return paths include the same uncached current-semester object and its derived current-year metadata, including across warm Redis catalogue responses; full historical semester options remain unchanged.
- [x] If the administrator selects Semester 1, the profile displays only that exact period. Both year and semester are read-only; a same-year Semester 2/3 is not accepted. When admin advances to another semester in the same year, ProfilePage reflects that exact marker on a fresh load.
- [x] The two read-only period fields have a distinct subtle background and decorative lock icons; editable identity fields retain their normal surface. Controls remain readable, focusable/selectable, and at least 44px high.
- [x] A missing current marker returns null metadata, is explained in the form and blocks save. The server returns `503 ACADEMIC_SEMESTER_UNAVAILABLE`; a spoofed other semester returns `409 ACADEMIC_SEMESTER_MISMATCH`; a nonexistent semester remains `400 INVALID_SEMESTER`.
- [x] The upsert enforces exact current semester ID in the same statement, serializes against an admin switch using the current row lock, and retains curriculum, ownership and other existing validation.
- [x] An existing profile outside the admin-selected semester shows the current admin period without a GET write; explicit Save updates it. No automatic save or automatic retry occurs.
- [x] A stale save, including a same-year 1-to-2 advance, refreshes options, preserves unsaved personal/programme/hour fields and requires a deliberate resave. Cancel cannot display an old admin period.
- [x] ProfilePage's options read bypasses its browser snapshot; other callers keep existing private caching/session behavior. No offerings/coordinator, schema, migration, dependency, production or live DB write changes are introduced.

### Verification plan

- Backend tests: all three options branches return a complete fresh marker; a same-year marker advance updates the object with warm catalogue caches while preserving historical semesters; accept only the exact current semester; reject another semester in the same year and one in a different year; missing marker and invalid non-existent semester; preserve curriculum/ownership checks and prove the SQL has a single-statement exact-ID guard.
- Client/cache tests: bypass forces a network options read without replacing other callers' snapshots; contract v3 rejects the old response-key entry; session/error protections remain intact.
- Browser/UI checks through `tools/p001/test-ui.mjs` and integration UI if fixture metadata needs updates: read-only current year and semester, setup uses exact marker, stale stored profile has no GET write, same-year admin advance followed by stale-save refresh, unsaved fields survive, explicit resave and Cancel; missing marker and refresh failure; desktop/mobile and `assertReadable`.
- Run focused Vitest, typecheck, lint, build, P001 and integration UI checks as appropriate, then the authorized final broad checks. No live DB tests/writes or local Docker setup. Report coordinator read-only planner validation separately from runtime behavior.

### Risk / assumptions / rollback

- Risks: administrator current-semester changes while a form is open; fail closed at save and preserve the student's unsaved non-period fields. Additive metadata must stay coherent across every option path and fixture.
- Assumptions / blockers: exact selected current semester means both academic year and semester number/ID. The existing unique current-row marker is authoritative; never pick the next semester on the student's behalf.
- Rollback: revert only this change's profile API/UI/test/documentation diff. No stored profile or database object is changed until the student explicitly saves; no migration or data backfill is planned.

## 2. Implementation

- **Status:** IMPLEMENTATION COMPLETE; coordinator review PASS.
- **Files actually changed:** `apps/api/src/modules/profile/{contracts.ts,repository.ts,repository.test.ts,profile.test.ts,index.test.ts}`; `apps/web/src/features/profile/{ProfilePage.tsx,profile.css,client.ts,data-cache.test.ts}`; `apps/web/src/features/records/RecordsPage.tsx` (required initial metadata only); `tools/p001/test-ui.mjs`; `tools/integration/test-ui.mjs` (fixture metadata and removed student period selection). Existing unrelated dirty/untracked baseline files were preserved.
- **Summary:** Options now expose a fresh full currentSemester object on every branch while retaining currentAcademicYear and historical catalogue. Profile saves use the live current ID and an atomic current-row FOR SHARE exact-ID upsert guard. ProfilePage renders both period controls read-only and handles stale saves by refreshing metadata while preserving unsaved personal fields.
- **Decisions / deviations from plan:** This exact-semester policy supersedes the 2026-11-09 year-only policy. Existing checks were rerun for exact-semester behavior. No schema changes, live DB writes, commits, or pushes.
- **Integration (2026-11-11, merged by P004):** Aisar's handoff was based on commit `7b4b9af`. P004 merged it into the current codebase instead of copying files over it: each changed file was 3-way merged and everything added since is kept (mandatory matric number, selectable learning centre with `PROFILE_CENTRE_LOCKED`, programme lock with `PROFILE_PROGRAMME_LOCKED` and the `DO UPDATE ... WHERE curriculum_id = EXCLUDED.curriculum_id` upsert, profile page refetch-on-open, the `pruneStorage` fix). Adapted: (1) the semester guard was re-derived inside the current upsert statement (a `current_period` CTE with `FOR SHARE` plus `s.semester_id=cp.semester_id` in the insert-select), and the zero-row fallback keeps our order (programme lock, centre, then `INVALID_SEMESTER` / `503 ACADEMIC_SEMESTER_UNAVAILABLE` / `409 ACADEMIC_SEMESTER_MISMATCH`, then `INVALID_CURRICULUM`); (2) `ProfileOptions` keeps `learningCentres` next to `currentSemester` / `currentAcademicYear`, and the live marker is one more uncached read on every options branch (cold 7 queries, warm 3); (3) ProfilePage uses our existing `fresh: true` option instead of his `bypassCache`, so no second client option exists, and `fresh` also stores the new snapshot; the options cache marker is `current-semester-required-v1`, `programme-admin-change-v1` and `profile-options-admin-current-semester-v3`; (4) his client tests were rewritten for `fresh`, the P001 and integration UI fixtures keep our matric number, centre and programme-lock fields; (5) the help text keeps our meaning: "Your current semester, set by the administrator. Offerings always show the next semester." Caching guide: `docs/cachingguide.md` was updated (point 11) because the marker is read live and the options contract marker changed. No schema or migration change.
- **Migrations / env / shared contracts:** No migration/environment change. ProfileOptions adds required currentSemester and retains currentAcademicYear; the generic historical SemesterOption retains its optional semesterType compatibility.

## 3. Review

- **Self-review checklist:** [x] Current marker is uncached and complete across all options branches; [x] exact-ID save guard and differentiated errors; [x] current year/semester readonly; [x] no read-time writes; [x] stale refresh preserves personal draft and Cancel retains latest period; [x] history/cache behavior retained; [x] no offerings, admin-page, schema, or database writes in the P001 profile scope. Coordinator review PASS after source and desktop/mobile screenshot review.
- **Test evidence:** `npm.cmd test -- apps/web/src/features/profile/data-cache.test.ts apps/api/src/modules/profile/repository.test.ts apps/api/src/modules/profile/profile.test.ts apps/api/src/modules/profile/index.test.ts` — 4 files, 110/110 passed. Final `npm.cmd test` — 67 files passed, 5 skipped; 1,374 tests passed, 59 skipped. `npm.cmd run build` — passed. `npm.cmd run build:local` — passed (Vite emitted its existing >500 kB chunk-size advisory). `npm.cmd run typecheck` — passed after profile styling. `npm.cmd run lint -- --no-fix` — passed. `node tools/p001/test-ui.mjs` — 45 checks passed on rerun after styling, including readonly background/lock assertions, desktop/mobile layout and `assertReadable`; updated screenshots: `.wrangler/p001-review/profile-semester-desktop.png` and `.wrangler/p001-review/profile-semester-375.png`. `npm.cmd run test:ui:integration` — 30 passed. Coordinator reviewed exact-profile source and both current-semester screenshots. Historical year-only evidence is superseded.
- **Manual checks:** Coordinator read-only aggregate verification found all 54/54 existing development profiles already aligned with current semester ID 1 (2026/2027 S1), with zero missing or outside-current profiles; no user data update was needed. Coordinator separately ran read-only `EXPLAIN (FORMAT JSON)` (without ANALYZE) for the exact-ID guarded upsert with semester IDs 1 and 2; both plans succeeded and showed the current-row lock and exact-ID predicate. No statement execution or DB writes. Local PostgreSQL runtime testing remains unavailable because Docker daemon is unavailable.
- **Defects found and fixes:** Removed a post-save options GET that could report failure after an already successful PUT. Shared profile period guidance and accessibility description apply to both read-only controls.
- **Review outcome:** Coordinator review PASS for exact-semester implementation and readonly visual treatment after source and desktop/mobile screenshot review. Human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-10; change ID S2-P001-003-admin-academic-year-lock; owner P001; related UC03.
- **Type:** Changed, Docs.
- **Added / Changed / Fixed / Removed:** Implemented exact-current-semester locking for profile options and saves, read-only year and semester fields, stale-save refresh, and focused regression coverage.
- **Affected routes / tables / consumers:** Updated `/api/profile/options` with additive currentSemester metadata and profile save validation using existing `academic_semester.is_current`; ProfilePage and ProfileOptions consumers. No offerings consumer changes.
- **Breaking changes / migration steps:** Additive API metadata; no migration planned.
- **Verification summary:** Full unit suite 1,374 passed / 59 skipped; typecheck, lint, build, build:local, P001 UI 45 checks and integration UI 30 checks passed. Coordinator SQL EXPLAIN and 54-profile alignment were read-only. No live DB writes, commit or push.
- **Outstanding blockers / follow-up:** Admin semester table UI is tracked separately in `S2-P001-004-admin-semester-page-actions.md` (renumbered from his S2-P004-013, which clashed with the existing S2-P004-013). Human peer review remains pending. Keep work on the existing local feature branch; do not commit or push.
- **Final status:** READY_FOR_REVIEW.
