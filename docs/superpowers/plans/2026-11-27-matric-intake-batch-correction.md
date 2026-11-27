# Matric intake, matric lock and batch correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fill the intake year from the matric number, lock the matric number after its first save, and let a System Administrator correct the programme and/or intake year of up to 500 students by matric number, all at once.

**Architecture:**
- **Shared rule:** a pure matric reader in `packages/shared`.
- **Profile API and page:** extend them with the lock and the in-use check.
- **Admin user routes:** extend them with a single matric change plus a batch preview and apply. The batch reuses the single-change SQL (the `db_change_student_programme` function and the `student_intake` audit insert) inside one `run` transaction.
- **New admin page:** `/admin/users/batch`.

**Tech Stack:** TypeScript, Cloudflare Worker, React, Neon Postgres, Vitest, Playwright UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-27-matric-intake-batch-correction-design.md`

## Global Constraints

- **Access:** System Administrator only for every admin endpoint here, and a reason is required for every change, using the existing reason rules (`ADMIN_REASON_MAX_LENGTH` 500).
- **No database change.**
  - No migration.
  - Audit goes to `academic_setup_audit_log` with entity types `student_matric` (`CHANGE_MATRIC_NO`, before/after `{ matricNo }`), `student_intake` (as in S3-P004-037), and the programme audit written by `db_change_student_programme`.
- **Normalising:** `normaliseMatric(v) = v.replace(/\s+/g, '').toUpperCase()` is used everywhere before storing or comparing.
- **Reading:** `^SX(\d{2})` gives intake `2000 + yy`. The programme code is the first 4-letter run after the leading digits.
- **Batch limit:** 500 numbers.
- **Batch apply** is all or nothing:
  - Refusals: `BATCH_HAS_PROBLEMS`, `BATCH_STALE`, `CURRICULUM_UNAVAILABLE` (409), and `UNCHANGED` (409).
  - Nothing to change at all returns 400.
- **Copy** (verbatim from the spec):
  - "Your matric number is set. Contact the admin to change it."
  - "This matric number is already used by another student. Check it, or contact the admin."
  - "Filled in from your matric number. Change it if it is wrong."
  - "Some students changed since you checked. Check again."
  - "The chosen programme is no longer available. Choose another."
  - "Paste at most 500 matric numbers."
  - "Intake year cannot be read from this matric number"
- **Examples:** the profile examples become `SX232315ECJHF04`.
- **UI rules:** follow `docs/themeguide.md` readability (text of at least 12px, with the readability guard run in the UI tests). No table toolbar: the batch table has no filter, search or sort.
- **Commits:** no AI co-author trailer, explicit paths only, and never stage `docs/System Documents/`.

## Review Focus

1. **A pasted Excel column with CRLF, tabs and blank lines** splits into clean numbers with no empty entries. Covered by a test in Task 4.
2. **Lowercase or spaced saved matric numbers** (`sx2203…`) must not trip the lock when the student saves an unchanged profile. Covered by a test in Task 2.
3. **A batch with "From each student's matric number"** where some students are already correct: those are skipped with no audit row, and the count says so. Covered by a test in Task 4.
4. **Two-digit-serial numbers** (`SX2302ECRHF04`) read as 2023 with programme `ECRH`. Covered by a test in Task 1.
5. **A stale preview:** the apply's `expected` doesn't match the locked rows, so it returns `BATCH_STALE` with nothing written. Covered by a test in Task 4.

---

### Task 1: Shared matric reader

**Files:**
- Create: `packages/shared/src/profile/matric.ts`
- Test: `packages/shared/src/profile/matric.test.ts`

**Interfaces:**
- Produces:
  - `normaliseMatric(value: string): string`
  - `readMatric(matricNo: string): { intakeYear: number; programmeCode: string | null } | null`
  - `splitMatricList(text: string): { matricNos: string[]; repeated: number }`, which splits on `[\s,;]+`, normalises, drops empties and de-duplicates in order.
  - `MATRIC_BATCH_MAX = 500`

- [ ] **Step 1: Failing tests**

```ts
expect(normaliseMatric(' sx23 2315ecjhf04 ')).toBe('SX232315ECJHF04');
expect(readMatric('SX232315ECJHF04')).toEqual({ intakeYear: 2023, programmeCode: 'ECJH' });
expect(readMatric('SX2302ECRHF04')).toEqual({ intakeYear: 2023, programmeCode: 'ECRH' });
expect(readMatric('sx220312ecrhs04')).toEqual({ intakeYear: 2022, programmeCode: 'ECRH' });
expect(readMatric('SX23')).toEqual({ intakeYear: 2023, programmeCode: null });
for (const bad of ['DUMMY-20261101-01', 'A22EC0001', 'SXAB1234', '']) expect(readMatric(bad)).toBeNull();
expect(splitMatricList('SX1\r\n\tSX2, sx1;\n\nSX3 ')).toEqual({ matricNos: ['SX1', 'SX2', 'SX3'], repeated: 1 });
```

- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run packages/shared/src/profile/matric.test.ts --config vitest.auth.config.ts`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit as `feat(profile): read intake year and programme code from the matric number (S3-P004-039)`.

### Task 2: Profile matric lock, in-use check, and intake auto-fill

**Files:**
- Modify:
  - `apps/api/src/modules/profile/repository.ts`, the `save` function.
  - `apps/web/src/features/profile/ProfilePage.tsx`, the matric field, intake select and help text.
  - `tools/p001/test-ui.mjs` and `tools/integration/test-ui.mjs` fixtures, only where the lock changes behaviour.
- Test:
  - `apps/api/src/modules/profile/repository.test.ts`
  - `tools/p001/test-ui.mjs`

**Interfaces:**
- **Consumes:** `normaliseMatric` and `readMatric` from Task 1, and the existing `intakeYearRange`.
- **Produces:**
  - 409 `PROFILE_MATRIC_LOCKED`.
  - 409 `PROFILE_MATRIC_TAKEN`.

- [ ] **Step 1: Failing repository tests** (in the existing mock-query style):
  - **Locked:** a saved profile with `matricNo 'SX232315ECJHF04'` and input `'SX232316ECJHF04'` rejects with `PROFILE_MATRIC_LOCKED` and the exact message.
  - **Lowercase saved number:** a saved `'sx2203ecrhs04'` with input `'SX2203ECRHS04'` saves (no lock).
  - **Empty saved number:** a saved `null` matric with input `'SX2302ECRHF04'` saves.
  - **New profile, number in use:** the in-use query finds another student, so it rejects with `PROFILE_MATRIC_TAKEN` and the exact message. The in-use query compares `upper(regexp_replace(matric_no,'\s','','g'))` with the normalised input, excluding the user's own `clerk_user_id`.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run apps/api/src/modules/profile/repository.test.ts --config vitest.auth.config.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement it in `save`.**
  - Select `matric_no` with the existing row.
  - Lock check after the programme and intake checks.
  - The in-use check runs before the upsert.
- [ ] **Step 4:** Run the repository tests. Expected: PASS.
- [ ] **Step 5: Failing UI checks** in `tools/p001/test-ui.mjs`:
  - **"setup fills the intake year from an SX matric number; a manual pick wins":**
    - Typing `SX232315ECJHF04` sets Intake year to `2023` and shows the hint text.
    - Choosing `2022` by hand and then retyping the number leaves it at `2022`.
    - Typing `A22EC0002` fills nothing.
  - **"a saved matric number is read-only":**
    - A profile fixture with `matricNo` has no `Matric number` textbox, shows the number as text with "Contact the admin to change it", and the save sends the saved number.
  - **"a saved number with no intake fills the intake on open":**
    - A profile with `intakeYear: null` and `matricNo 'SX2302ECRHF04'` opens with Intake year `2023`.
- [ ] **Step 6:** Run `node tools/p001/test-ui.mjs`. Expected: the new checks FAIL.
- [ ] **Step 7: Implement it in `ProfilePage.tsx`.**
  - A `intakeTouched` flag is set when the select is changed by hand.
  - The fill runs on matric change and on load, only when the intake is editable and the year is in `intakeYears(new Date())`.
  - The help text and `title` use `SX232315ECJHF04`.
  - The saved matric shows as read-only.
- [ ] **Step 8:** Run `node tools/p001/test-ui.mjs` and `npm run test:ui:integration`. Expected: all PASS. Update the fixtures only where a saved matric is now read-only.
- [ ] **Step 9:** Commit as `feat(profile): fill intake from matric number; lock the matric number after saving (S3-P004-039)`.

### Task 3: Admin "Change matric number"

**Files:**
- Modify:
  - `packages/shared/src/admin/admin.ts`
  - `apps/api/src/modules/admin/routes.ts` (next to `intakeRoute`)
  - `apps/api/src/modules/admin/repository.ts` (next to `changeStudentIntakeYear`)
  - The repository interface in `apps/api/src/modules/admin/contracts.ts`
  - `apps/web/src/features/admin/client.ts`
  - `apps/web/src/features/admin/StudentProgrammeCard.tsx`
  - `tools/admin/fixtures.mjs`
  - `tools/admin/test-ui.mjs`
- Test:
  - `apps/api/src/modules/admin/routes.mutations.test.ts`
  - `apps/api/src/modules/admin/mutations.test.ts` (repository statements)
  - `tools/admin/test-ui.mjs`

**Interfaces:**
- **Produces:**
  - `AdminChangeMatricRequest { matricNo: string; reason: string }`
  - `validateChangeMatricRequest(body): AdminValidation<AdminChangeMatricRequest>`, which normalises the number, requires 4–30 `[A-Z0-9]`, and otherwise returns the error "Enter a matric number of 4 to 30 letters or digits."
  - Repository `changeStudentMatric(accountId: number, matricNo: string, actor: string, reason: string): Promise<AdminStudentProgramme>`
  - Client `changeMatric(id: number, input: AdminChangeMatricRequest): Promise<AdminStudentProgramme>`
  - `'MATRIC_TAKEN'` added to `ADMIN_MUTATION_ERROR_CODES`, with the message "Another student already uses this matric number."
  - `PATCH /api/admin/users/{id}/matric`

- [ ] **Step 1: Failing route and repository tests.**
  - **Route:** the PATCH calls the repository with the normalised number. A body with a bad number returns 400. A non-PATCH method returns 405.
  - **Repository:** it mirrors the `changeStudentIntakeYear` tests:
    - Guards: `NOT_FOUND`, `STUDENT_PROFILE_NOT_FOUND`, `UNCHANGED` (normalised comparison), and `MATRIC_TAKEN` (another profile with the normalised number).
    - The update and the `student_matric`/`CHANGE_MATRIC_NO` audit insert happen in one statement.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run apps/api/src/modules/admin --config vitest.auth.config.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the shared types, the route, the repository and the client.
- [ ] **Step 4:** Run the same tests again. Expected: PASS.
- [ ] **Step 5: Failing UI check** in `tools/admin/test-ui.mjs`: "student matric number: shown on the card, changed with a reason, taken rejected in the dialog (S3-P004-039)".
  - The card shows the Matric number fact.
  - The **Change matric number** dialog has the label `New matric number`.
  - The fixture's 409 `MATRIC_TAKEN` shows its message in the dialog.
  - On success the notice "Matric number changed to SX232316ECJHF04." appears.
- [ ] **Step 6:** Implement `ChangeMatricDialog` in `StudentProgrammeCard.tsx` (it uses `ReasonDialog`) and the fixture route. Run `ADMIN_CHECK="student matric" npm run test:ui:admin`. Expected: PASS.
- [ ] **Step 7:** Commit as `feat(admin): change a student's matric number with a reason (S3-P004-039)`.

### Task 4: Batch correction API

**Files:**
- Modify:
  - `packages/shared/src/admin/admin.ts`
  - `apps/api/src/modules/admin/routes.ts`
  - `apps/api/src/modules/admin/repository.ts`
  - `apps/api/src/modules/admin/contracts.ts`
  - `apps/web/src/features/admin/client.ts`
- Create: `packages/shared/src/admin/batch.ts`, holding the pure planning used by both the page and the API.
- Test:
  - `packages/shared/src/admin/batch.test.ts`
  - `apps/api/src/modules/admin/routes.mutations.test.ts`
  - `apps/api/src/modules/admin/mutations.test.ts`

**Interfaces:**
- **Produces (shared `batch.ts`):**
  - `BatchMatch { matricNo; accountId; studentId; studentName; programmeCode; curriculumId; curriculumVersion; intakeYear: number | null; accountStatus: AdminStatus; isStudent: boolean }`
  - `BatchProblem { matricNo; kind: 'NOT_FOUND' | 'DUPLICATE' | 'NO_ACCOUNT' }`
  - `BatchPreview { matches: BatchMatch[]; problems: BatchProblem[] }`
  - `BatchIntake = { mode: 'keep' } | { mode: 'set'; year: number } | { mode: 'matric' }`
  - `BatchApplyRequest { matricNos: string[]; curriculumId: number | null; intake: BatchIntake; reason: string; expected: { matricNo: string; studentId: number; curriculumId: number; intakeYear: number | null }[] }`
  - `BatchResult { corrected: number; intakeChanges: number; programmeChanges: number; removedPicks: number }`
  - `planBatch(matches: BatchMatch[], curriculumId: number | null, intake: BatchIntake): { rows: { match: BatchMatch; after: { curriculumId: number; intakeYear: number | null }; changes: boolean; problem?: 'INTAKE_UNREADABLE' }[]; intakeChanges: number; programmeChanges: number; unchanged: number }`
    - With `matric` mode, a year from `readMatric` outside 1990–2200, or unreadable, is `INTAKE_UNREADABLE`.
  - `programmeWarning(matricNo: string, programmeCode: string): string | null`, which applies `'S' + code` and the alias `SECJH → SECJ` and gives "Matric says ECRH, programme is SECJ".
    - **Ruling:** the alias map is copied into shared code, because `apps/api/src/config/import-aliases.ts` is API-only. The cost if this is wrong is a missing warning, not a wrong write.
  - `validateBatchPreviewRequest` and `validateBatchApplyRequest`:
    - 1–500 numbers after `normaliseMatric`; above 500 the error is "Paste at most 500 matric numbers."
    - Keep plus keep returns 400 "Choose a programme or an intake year to change."
- **Produces (API):**
  - `POST /api/admin/students/batch/preview` returns `{ data: BatchPreview }`.
  - `POST /api/admin/students/batch` returns `{ data: BatchResult }`.
  - Repository `previewBatch(matricNos: string[]): Promise<BatchPreview>`.
  - Repository `applyBatch(input: BatchApplyRequest, actor: string): Promise<BatchResult>`.
  - New error codes `BATCH_HAS_PROBLEMS`, `BATCH_STALE` and `CURRICULUM_UNAVAILABLE` in `ADMIN_MUTATION_ERROR_CODES`, with the spec's messages. `BATCH_HAS_PROBLEMS` says "Remove the problem numbers, then check again."
  - Client `batchPreview(matricNos)` and `applyBatch(input)`.

**Apply algorithm** (in one `run`):
1. Lock the profiles `FOR UPDATE` by normalised matric.
2. Re-run the preview against the locked rows. Any problem, or `planBatch` with `INTAKE_UNREADABLE`, returns `BATCH_HAS_PROBLEMS`.
3. Compare the locked rows with `expected` (the same number set, and the same studentId, curriculumId and intakeYear for each number). Any difference returns `BATCH_STALE`.
4. A chosen curriculum that is not active, or whose programme is not active, returns `CURRICULUM_UNAVAILABLE`.
5. No rows with changes returns `UNCHANGED`.
6. Write:
   - For each programme change, `SELECT public.db_change_student_programme(student_id, curriculum_id)` over `unnest`, summing the removed picks.
   - For each intake change, a set-based update over `unnest(student_ids, years)` plus the `student_intake` audit insert, the same as `changeStudentIntakeYear`.

Guards use the existing `guard(...)` pattern, so they run inside the transaction before any write.

- [ ] **Step 1: Failing shared tests** (`batch.test.ts`):
  - **matric mode:** `planBatch` on three matches (SX23… at 2020, SX23… already at 2023, DUMMY-… at 2020) marks the first as changed to 2023, counts the second as unchanged, and gives the third `INTAKE_UNREADABLE`.
  - **set mode:** `{mode:'set',year:2024}` changes all three.
  - **Programme change:** a chosen curriculum changes `after.curriculumId`, and `programmeChanges` counts only students whose curriculum differs.
  - **Programme warning:** `programmeWarning('SX2302ECRHF04','SECJ')` gives "Matric says ECRH, programme is SECJ", while `('SX232315ECJHF04','SECJ')`, `('SX232315ECJHF04','SECJH')` and `('DUMMY-1','SECJ')` give `null`.
  - **Validators:**
    - 501 numbers is rejected with the exact message.
    - Keep plus keep is rejected.
    - Lowercase input is normalised.
- [ ] **Step 2: Failing route and repository tests.**
  - **Routes:** both routes call the repository with validated input, and only POST is allowed.
  - **Repository:**
    - The preview query maps not-found, duplicate (two profiles with one normalised number) and no-account rows.
    - The apply statement list starts with the lock, then the problem, stale, curriculum and unchanged guards in that order, and the write statements come after every guard.
    - A stale `expected` raises `BATCH_STALE`.
- [ ] **Step 3:** Run `node node_modules/vitest/vitest.mjs run packages/shared/src/admin apps/api/src/modules/admin --config vitest.auth.config.ts`. Expected: the new tests FAIL.
- [ ] **Step 4:** Implement the shared module, validators, routes, repository and client.
- [ ] **Step 5:** Run the same tests again. Expected: PASS.
- [ ] **Step 6:** Commit as `feat(admin): batch preview and all-or-nothing batch correction API (S3-P004-039)`.

### Task 5: Batch correction page

**Files:**
- Create:
  - `apps/web/src/features/admin/BatchCorrectionPage.tsx`
  - `tools/admin/batch-ui-checks.mjs`, imported by `tools/admin/test-ui.mjs` the way `academic-ui-checks.mjs` is.
- Modify:
  - `apps/web/src/features/admin/AdminRoutes.tsx`: the route `/admin/users/batch` with the title "Batch correction".
  - `AdminUserManagement.tsx`: the **Batch correction** link button on the Users & Access page.
  - `admin.css`
  - `tools/admin/fixtures.mjs`: the batch routes.

**Interfaces:**
- **Consumes:**
  - From Task 1: `splitMatricList`, `MATRIC_BATCH_MAX`.
  - From Task 4: `planBatch`, `programmeWarning`, the client's `batchPreview` and `applyBatch`, and the existing `curriculumOptions`.

**Page structure:**
- **Step 1:** a textarea labelled `Matric numbers`, the line "N numbers · M repeated numbers ignored", and **Check**, which is disabled when there are 0 or more than 500 numbers and then shows "Paste at most 500 matric numbers."
- **Preview:** a table with the accessible name `Students to correct` and the columns Matric number, Student, Programme, Intake year and After.
  - Problem rows come first, with text such as "Not found".
  - **Remove problem numbers** rewrites the textarea and re-checks.
  - Warnings show inside the Student cell.
- **What to change:** a `Programme` select ("Keep each student's programme" plus the active curricula) and an `Intake year` radio group ("Keep each student's intake year", "Set all to" with a number input, "From each student's matric number").
  - The summary line "Applies to N students: X intake years change, Y programmes change, Z already correct."
  - A programme-change note: "Saved subject picks for semesters whose selection has not closed are removed."
  - A `Reason` field and **Apply correction**, disabled while there are problems, no changes, or no reason.
- **Result:** "Corrected N students: X intake years, Y programmes; P subject picks removed." with **Start another batch**.
- **Errors:** API errors show in an `alert`. `BATCH_STALE` also shows **Check again**.

- [ ] **Step 1: Failing UI checks** in `batch-ui-checks.mjs`:
  - **"batch correction: paste, check, remove problems, from matric, apply (S3-P004-039)":**
    - Paste 3 numbers, one of them unknown, using a CRLF and tab mix.
    - The problem row says "Not found".
    - **Remove problem numbers** leaves 2.
    - Choose "From each student's matric number": the After column shows 2023, and the summary says "Applies to 2 students: 1 intake year changes, 0 programmes change, 1 already correct."
    - Enter a reason and apply. The fixture records the body (`intake.mode==='matric'`, `expected` length 2), and the result text appears.
  - **"batch correction: stale preview asks to check again":**
    - The fixture returns 409 `BATCH_STALE`. The alert shows the spec message and a **Check again** button.
  - **"batch correction: more than 500 numbers disables Check":**
    - Paste 501 numbers.
  - **Layout:**
    - Add `/admin/users/batch` to the responsive path list (320, 375 and 768px) and to the readability guard.
- [ ] **Step 2:** Run `ADMIN_CHECK="batch correction" npm run test:ui:admin`. Expected: FAIL, because the route doesn't exist yet.
- [ ] **Step 3:** Implement the page, the route, the link button, the CSS and the fixtures. The summary pluralises with the existing `countLabel` style ("1 intake year changes" / "2 intake years change").
- [ ] **Step 4:** Run `npm run test:ui:admin`. Expected: all PASS.
- [ ] **Step 5:** Commit as `feat(admin): Batch correction page (S3-P004-039)`.

### Task 6: Docs, full suites

**Files:**
- Create: `docs/changes/S3-P004-039-matric-batch-correction.md`
- Modify:
  - `README.md` (change row)
  - `docs/api/admin-users.openapi.json`: the matric PATCH, the two batch POSTs and the new codes.
  - `docs/api/` profile OpenAPI, if one exists for `PUT /api/profile`: the two new 409s.
  - `docs/requirements/srs-amendment-2026-11-24-access-control-list.md`: the A5 batch row becomes In force, and a matric row is added.
  - `docs/database/data-contracts.md`: the `student_matric` audit entity.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ui:admin`, `npm run test:ui:integration` and `node tools/p001/test-ui.mjs`. Expected: all PASS.
- [ ] **Step 3:** Commit as `docs: S3-P004-039 change record, API docs, ACL rows`.
