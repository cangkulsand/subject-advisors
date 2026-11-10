# UC20 Simplified Offering Flow Implementation Plan

> **Product owner answers, 2026-11-10 (override anything below that disagrees):**
> 1. **Pick limits stay.** Student picks must respect `academic_semester.max_subjects` and `max_credits` of the target semester (S2-P004-006 OP12). Added to Task 6.
> 2. **Students without a learning centre** are left out of "students in the system" snapshots (counted under other centre), as planned. **Migration 0009 also sets every existing `student_profile.learning_centre_id` to the Kuala Lumpur centre** (`centre_code = 'KL'`) in the development database. Added to Task 1.
> 3. **No semester picker.** The coordinator always works on the next semester only (`context.targetSemesterId`). Remove the semester select, the `semester` URL parameter, the "Past semester: read-only" note and its test from Task 4; the API keeps rejecting other semesters (Task 2 `SEMESTER_READ_ONLY`). After admin moves the current semester forward, the previous semester's results are no longer shown on the coordinator screen (accepted).
> 4. **Offering history is next sprint, not this plan.** A read-only "Offering History" coordinator page (past semesters: final status per subject, pick counts, pickers, audit) will replace the "Decision Audit" placeholder later. Nothing in this plan may delete or overwrite past-semester decisions, audit rows, picks or withdrawals; keep the "Decision Audit" nav placeholder (Task 8).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the review → finalize → confirm coordinator flow with one forecast screen where each subject is Pending / Approved / Removed per programme + learning centre + semester, admin-set selection dates that open and close student picking, a student offerings page that shows only approved subjects for the next semester, and a learning centre on the student profile.

**Architecture:** A new per-scope `offering_decision` table (no row = Pending) with an append-only audit replaces `offering_confirmation` / `confirmed_offering` (the 0007 tables stay in place, unused; existing development confirmation data is **reset**, not migrated — nothing is copied, the new flow starts with every subject Pending). The forecast for a snapshot stays a stored `forecast_run` (one per import batch); the coordinator page creates it through the existing idempotent `POST forecast-runs` when a snapshot is chosen, so no extra step is needed. Student picks stay in `semester_offering`; withdrawals are recorded in a new `offering_pick_withdrawal` table so the student page can show the note after the pick row is deleted. The selection phase (`PLANNING` / `OPEN` / `CLOSED`) is computed by one shared pure function from the semester's two admin-set timestamps and the server clock.

**Tech Stack:** Cloudflare Worker API (`apps/api`, Neon `sql.transaction` non-interactive transactions), React 19 / TypeScript / Vite web (`apps/web`), shared contracts (`packages/shared`), Clerk auth, Neon Postgres migrations (`db/migrations`, `manifest.json`), vitest, Playwright browser harnesses under `tools/*/test-ui.mjs` with mocked APIs.

**Spec:** `docs/superpowers/specs/2026-11-10-uc20-simplified-offering-flow-design.md` (approved 2026-11-10; section 9 calls are accepted).

## Global Constraints

- Follow `docs/implementationguide.md`: every task creates/updates its own record in `docs/changes/S2-P004-0NN-<slug>.md` with sections `1. Plan`, `2. Implementation`, `3. Review`, `4. Changelog` **before** editing code. Ids used by this plan: S2-P004-017 … S2-P004-024 (one per task, listed in each task).
- UI follows `docs/themeguide.md` 5.1 (type tokens in `apps/web/src/app/typography.css`; no raw font size below 12px; table body ≥ 14px, headers ≥ 13px, controls ≥ 14px and 44px tall; subject **name first, code second**) and 5.2 (any filtered/searched/sorted table uses `apps/web/src/components/table-toolbar/TableToolbar.tsx`). Every browser check calls `assertReadable(page, name)` from `tools/ui/readability.mjs`.
- `docs/cachingguide.md` rule 9: student lists and picker lists are personal data — server `Cache-Control: no-store`, web keeps them in memory only on the open page.
- Development database only. Migration `0009` is applied by the user with `npm run db:migrate -- --target <target.json>`; implementers do not need DB access (DB tests skip without `FORECASTING_TEST_DATABASE_URL` / `ACADEMIC_TEST_DATABASE_URL`).
- Keep `packages/shared/src/forecasting/engine/**` unchanged (counting rules are frozen).
- Coordinators only see and change assigned scopes (`deps.scopes.isScopeAssigned`), exactly as today.
- Never read `.dev.vars` or `.env.local`.
- **No commits** unless the user asks; commit messages carry no Co-Authored-By / Claude lines. Each task ends with "stop and report for coordinator review" instead of a commit step.
- Verification commands (run the ones named in each task): `npm run typecheck`, `npm run lint`, `npm test`, `node tools/coordinator/test-ui.mjs`, `node tools/p001/test-ui.mjs`, `node tools/integration/test-ui.mjs --installed`, `node tools/offerings/test-ui.mjs`, `node tools/admin/test-ui.mjs`, `node tools/auth/test-ui.mjs`, `node tools/pathway/test-ui.mjs`.
- Exact copy pinned by the spec: toasts "SECJ2154 approved.", "SECD2523 removed.", "SECJ1013 added back.", "SECJ2154 withdrawn. 12 students who picked it will see a note."; planning warning "3 subjects still pending; they won't be shown to students unless approved."; student note "SECJ2154 was withdrawn by the coordinator"; column labels "Not taken yet", "Eligible to take", "Picked"; marker "not in this snapshot"; admin fields "Selection opens", "Selection closes"; phase text "selection not scheduled".

## Review Focus

1. Admin saves a close time without an open time, or a close time at/before the open time → request rejected with 400 and the row unchanged (Task 1 test `rejects selectionClosesAt without or before selectionOpensAt`).
2. Coordinator posts a decision for a semester that is not the next one, or after selection closed → 409 and no audit row (Task 2 tests `past semester is read-only` and `closed selection locks decisions`).
3. A student saves a pick for a subject the coordinator withdrew a moment ago (stale 5-minute snapshot) → 409 `OFFERING_NOT_APPROVED`, no partial save (Task 6 test `PUT rejects a subject that is no longer approved`).
4. A student whose profile has no learning centre opens offerings → explicit `NO_LEARNING_CENTRE` state with a link to the profile, never an empty "no subjects" list (Task 6 test `no learning centre shows the profile prompt`).
5. A legacy student with no learning centre may set it even while selection is open, but a student who already has one cannot change it then → 200 / 409 `PROFILE_CENTRE_LOCKED` (Task 7 test `lock allows the first centre and blocks a change while selection is open`).

---

## Task map and dependencies

| # | Task | Record | Depends on |
|---|---|---|---|
| 1 | Migration 0009, shared selection phase, admin semester selection dates | S2-P004-017 | — |
| 2 | Offering decisions API (decision set, decide, audit) | S2-P004-018 | 1 |
| 3 | Picks API: pick counts, pickers, withdrawal of picks on removal | S2-P004-019 | 2 |
| 4 | Coordinator screen: semester + snapshot pickers, decisions table, audit | S2-P004-020 | 2 |
| 5 | Coordinator screen: open/closed behaviour, Picked column, pickers dialog | S2-P004-021 | 3, 4 |
| 6 | Student offerings on approved subjects for the next semester | S2-P004-022 | 3 (profile centre column from 1) |
| 7 | Profile learning centre, lock, live centre in forecasting | S2-P004-023 | 1 (6 shows `NO_LEARNING_CENTRE` until this lands) |
| 8 | Remove the old flow and refresh docs | S2-P004-024 | 4, 5, 6 |

The separately built profile-semester lock (spec 5.4 / 7) is **not** a dependency: Task 6 makes the offerings page ignore `student_profile.current_semester_id` on its own.

---

### Task 1: Migration 0009, shared selection phase and admin semester selection dates

**Record:** create `docs/changes/S2-P004-017-semester-selection-dates.md` first (Owner P004; UC20/UC23 + admin Academic Semesters; out of scope: everything coordinator/student-facing).

**Files:**
- Create: `db/migrations/0009_simplified_offering_flow.sql`
- Modify: `db/migrations/manifest.json` (append version `0009`, description "Semester selection window, student learning centre, per-scope offering decisions with append-only audit and pick withdrawals")
- Create: `db/checks/014_simplified_offering_flow.sql`; Modify: `tools/db/cli.mjs` (add the file to the `verify` list), `tools/db/migrations.test.mjs` (expected versions end `'0008','0009'`; add `0009 follows the exact 0008 prefix` mirroring the 0008 test)
- Create: `packages/shared/src/forecasting/selection-window.ts`, `packages/shared/src/forecasting/selection-window.test.ts`
- Modify: `packages/shared/src/admin/academic-setup.ts` (+ `.test.ts`), `apps/api/src/modules/admin/academic-repository.ts`, `apps/api/src/modules/admin/academic-routes.test.ts`, `apps/api/src/modules/admin/academic-repository.database.test.ts`, `apps/web/src/features/admin/academic-client.ts`, `apps/web/src/features/admin/SemestersPage.tsx`, `apps/web/src/features/admin/academic-ui.tsx`, `tools/admin/academic-fixtures.mjs`, `tools/admin/test-ui.mjs`, `docs/api/admin-academic-setup.openapi.json`

**Interfaces:**
- Produces (shared): `export type SelectionPhase = 'PLANNING' | 'OPEN' | 'CLOSED'`; `export interface SelectionWindow { selectionOpensAt: string | null; selectionClosesAt: string | null }`; `export function selectionPhase(window: SelectionWindow, now: Date): SelectionPhase` — `PLANNING` when `selectionOpensAt` is null or `now < opensAt`; `CLOSED` when `selectionClosesAt` is not null and `now >= closesAt`; otherwise `OPEN`.
- Produces (admin contract): `AcademicSemester` and `SemesterFields` gain `selectionOpensAt: string | null; selectionClosesAt: string | null` (ISO date-time or null). `validateCreateSemesterRequest` / `validateUpdateSemesterRequest` accept both as ISO date-time string (`!Number.isNaN(Date.parse(v))`, length ≤ 40) or null; `validateMergedSemester` fails with `'selectionClosesAt requires selectionOpensAt.'` and `'selectionClosesAt must be after selectionOpensAt.'`.
- Produces (DB): tables `offering_decision`, `offering_decision_audit`, `offering_pick_withdrawal`; columns `academic_semester.selection_opens_at`, `academic_semester.selection_closes_at`, `student_profile.learning_centre_id`.

- [ ] **Step 1: Write the migration**

`db/migrations/0009_simplified_offering_flow.sql`, additive only:

```sql
ALTER TABLE public.academic_semester ADD COLUMN selection_opens_at timestamptz;
ALTER TABLE public.academic_semester ADD COLUMN selection_closes_at timestamptz;
ALTER TABLE public.academic_semester ADD CONSTRAINT academic_semester_selection_window_rule
  CHECK (selection_closes_at IS NULL OR (selection_opens_at IS NOT NULL AND selection_closes_at > selection_opens_at));
ALTER TABLE public.student_profile ADD COLUMN learning_centre_id integer REFERENCES public.learning_centre(learning_centre_id) ON DELETE RESTRICT;
CREATE INDEX student_profile_learning_centre_idx ON public.student_profile(learning_centre_id) WHERE learning_centre_id IS NOT NULL;
-- Product owner 2026-11-10: every existing student is at Kuala Lumpur until they choose otherwise.
UPDATE public.student_profile SET learning_centre_id = (SELECT learning_centre_id FROM public.learning_centre WHERE centre_code = 'KL') WHERE learning_centre_id IS NULL;
```

`offering_decision`: `decision_id` identity PK; `programme_id`, `learning_centre_id`, `semester_id`, `subject_id` NOT NULL FKs (ON DELETE RESTRICT); `status varchar(10) NOT NULL CHECK (status IN ('APPROVED','REMOVED'))`; `decided_by varchar(255) NOT NULL CHECK (length(btrim(decided_by)) > 0)`; `decided_at timestamptz NOT NULL DEFAULT now()`; `UNIQUE (programme_id, learning_centre_id, semester_id, subject_id)`. No row means Pending.

`offering_decision_audit`: `audit_id bigint` identity PK; the same four NOT NULL FKs; `before_status`, `after_status varchar(10) NOT NULL` each `CHECK IN ('PENDING','APPROVED','REMOVED')` plus `CHECK (before_status <> after_status)`; `import_batch_id integer NULL REFERENCES public.academic_import_batch ON DELETE RESTRICT` (the snapshot shown at the time); `affected_picks integer NOT NULL DEFAULT 0 CHECK (affected_picks >= 0)`; `recorded_by varchar(255) NOT NULL` non-blank; `recorded_at timestamptz NOT NULL DEFAULT now()`; index `(programme_id, learning_centre_id, semester_id, audit_id)`; triggers `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement) executing the existing `public.db_immutable()`.

`offering_pick_withdrawal`: `withdrawal_id bigint` identity PK; `audit_id bigint NOT NULL REFERENCES public.offering_decision_audit`; `student_id` → `student_profile`, `semester_id` → `academic_semester`, `subject_id` → `subject` (NOT NULL, ON DELETE RESTRICT); `withdrawn_at timestamptz NOT NULL DEFAULT now()`; index `(student_id, semester_id)`; the same two `db_immutable` triggers.

End with `REVOKE ALL ON public.offering_decision, public.offering_decision_audit, public.offering_pick_withdrawal FROM PUBLIC;`. Do not touch any 0007 table or trigger. The 0008 `academic_semester_audit` trigger already serialises `to_jsonb(NEW)`, so edits of the new columns are audited without further work.

- [ ] **Step 2: Register the migration and the check file**

Append `0009` to `db/migrations/manifest.json`. Write `db/checks/014_simplified_offering_flow.sql` in the style of `012_admin_academic_setup.sql`: one row per assertion with `test_name` and `status` ('PASS'/'FAIL') checking the three tables, the three new columns and the `academic_semester_selection_window_rule` constraint exist. Add the file name to the `verify` list in `tools/db/cli.mjs`. Update `tools/db/migrations.test.mjs` (`['0000',…,'0008','0009']`, `entries.slice(-2)` → `['0008','0009']`).

- [ ] **Step 3: Run the migration tooling tests**

Run: `npm run test:db-tooling` and `npm run lint:db`
Expected: PASS (the manifest, ordering and review gates accept 0009).

- [ ] **Step 4: Write the failing shared tests**

`packages/shared/src/forecasting/selection-window.test.ts`:

```ts
const t = (s: string) => new Date(s);
it('is PLANNING without dates or before opening', () => {
  expect(selectionPhase({ selectionOpensAt: null, selectionClosesAt: null }, t('2026-11-10T00:00:00Z'))).toBe('PLANNING');
  expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: null }, t('2026-11-19T23:59:59Z'))).toBe('PLANNING');
});
it('is OPEN from the opening time until the closing time', () => {
  expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: '2026-12-01T00:00:00Z' }, t('2026-11-20T00:00:00Z'))).toBe('OPEN');
  expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: null }, t('2027-01-01T00:00:00Z'))).toBe('OPEN');
});
it('is CLOSED from the closing time', () => {
  expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: '2026-12-01T00:00:00Z' }, t('2026-12-01T00:00:00Z'))).toBe('CLOSED');
});
```

`packages/shared/src/admin/academic-setup.test.ts`, add:

```ts
it('accepts ISO selection dates or null and rejects other values', () => {
  expect(validateCreateSemesterRequest({ ...base, selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: null }).ok).toBe(true);
  expect(validateCreateSemesterRequest({ ...base, selectionOpensAt: 'tomorrow', selectionClosesAt: null }).ok).toBe(false);
});
it('rejects selectionClosesAt without or before selectionOpensAt', () => {
  expect(validateMergedSemester(existing, { selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);          // existing opensAt null
  expect(validateMergedSemester({ ...existing, selectionOpensAt: '2026-12-02T00:00:00.000Z' }, { selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);
});
```

(`base` is the existing valid create body in that test file plus the two new fields; `existing` an `AcademicSemester` literal.)

- [ ] **Step 5: Run the shared tests to verify they fail**

Run: `npm test -- packages/shared/src/forecasting/selection-window.test.ts packages/shared/src/admin/academic-setup.test.ts`
Expected: FAIL (`selectionPhase` not found; validators reject the unknown fields).

- [ ] **Step 6: Implement the shared helper and the validators**

`selection-window.ts` exports the types and `selectionPhase` from the Interfaces block. In `academic-setup.ts` add the two fields to `AcademicSemester` / `SemesterFields`, to the `fields` list in `semester()`, a `dateTime(v)` predicate (null or ISO string parseable by `Date.parse`, ≤ 40 chars), and the two merged-window rules in `validateMergedSemester` (and the same pair check inside `semester()` when both keys are supplied).

- [ ] **Step 7: Run the shared tests to verify they pass**

Run: the Step 5 command. Expected: PASS.

- [ ] **Step 8: Write the failing API tests**

`apps/api/src/modules/admin/academic-routes.test.ts`: extend the `semester` and `semesterInput` literals with `selectionOpensAt: null, selectionClosesAt: null`; add a PATCH row `{ path: '/semesters/10', method: 'PATCH', body: { selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }, … }` expecting `updateAcademicSemester` called with those values; add a 400 case for a body `{ selectionOpensAt: '2026-12-02T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }` (both keys supplied, pair rule fails in the request validator). A PATCH that supplies only `selectionClosesAt` passes the request validator and is checked by `updateAcademicSemester` against the stored row (`validateMergedSemester`); that path is covered by the database test below.

`apps/api/src/modules/admin/academic-repository.database.test.ts` (skips without `ACADEMIC_TEST_DATABASE_URL`): `it('stores and returns selection dates as UTC ISO text and rejects a closing time before the opening time')` — create with `selectionOpensAt: '2080-01-10T02:00:00.000Z'`, `selectionClosesAt: '2080-02-10T02:00:00.000Z'`, expect the returned strings equal the inputs; then `updateAcademicSemester(id, { selectionClosesAt: '2080-01-01T00:00:00.000Z', reason })` rejects with `AcademicSetupDomainError` code `INVALID_REQUEST`.

- [ ] **Step 9: Implement the repository and the OpenAPI document**

`academic-repository.ts`: add to `semesterColumns` `to_char(selection_opens_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "selectionOpensAt"` and the same for `selection_closes_at`; map them in `semester(r)` (null-safe); add `selectionOpensAt: 'selection_opens_at', selectionClosesAt: 'selection_closes_at'` to `semesterFields`; in `updateAcademicSemester`, before the UPDATE statement, read the stored row (`SELECT ${semesterColumns} … WHERE semester_id=$1`), run `validateMergedSemester(existing, input)` and throw `new AcademicSetupDomainError('INVALID_REQUEST')` on failure (the DB CHECK is the last line of defence and maps to `INVALID_REQUEST` through the existing `mapAcademicDatabaseError`). `createAcademicSemester` inserts the two new columns. Add the two properties (`type: ['string','null'], format: date-time`) to the `AcademicSemester`, create and update schemas in `docs/api/admin-academic-setup.openapi.json`.

- [ ] **Step 10: Run the API tests**

Run: `npm test -- apps/api/src/modules/admin`
Expected: PASS (database suite reports skipped without the env var).

- [ ] **Step 11: Write the failing admin browser check**

In `tools/admin/academic-fixtures.mjs` give every fixture semester `selectionOpensAt: null, selectionClosesAt: null` and make `PATCH semesters/{id}` merge the two keys. In `tools/admin/test-ui.mjs` add:

```js
await check('semesters: selection opens/closes are editable, shown in the table and sent as ISO', async page => {
  const state = await mock(page); await page.goto(base + '/admin/semesters');
  await page.getByRole('button', { name: 'Edit 2026/2027 · Semester 2' }).click();
  await page.getByLabel('Selection opens').fill('2026-11-20T09:00');
  await page.getByLabel('Selection closes').fill('2026-12-01T17:00');
  await page.getByLabel('Reason (recorded in the audit log)').fill('Open picking for semester 2');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Semester configuration saved.').waitFor();
  const patch = state.requests.find(r => r.method === 'PATCH' && r.path.endsWith('/semesters/2'));
  assert.equal(patch.body.selectionOpensAt, new Date('2026-11-20T09:00').toISOString());
  assert.equal(patch.body.selectionClosesAt, new Date('2026-12-01T17:00').toISOString());
  assert.match(await page.getByRole('table', { name: 'Academic semesters' }).innerText(), /Selection/);
});
```

(`state.requests` must record PATCH bodies — extend the admin mock the way the coordinator mock records `bodies` if it does not already.)

- [ ] **Step 12: Implement the admin page**

`academic-ui.tsx`: export `toLocalInput(iso: string): string` and `localToIso(local: string): string | null` (copy the two helpers from `apps/web/src/features/coordinator/DecisionsPage.tsx`, which Task 8 deletes). `SemestersPage.tsx`: two optional `Field`s `{ key: 'selectionOpensAt', label: 'Selection opens', type: 'datetime-local', optional: true }`, `{ key: 'selectionClosesAt', label: 'Selection closes', type: 'datetime-local', optional: true }`; initial values through `toLocalInput`, outgoing through `localToIso` (`''` → null); a table column "Selection" rendering `opens → closes` with `when()`-style local formatting or "Not scheduled"; the form hint "Students can pick from the opening time until the closing time. Coordinator decisions lock at the closing time." `academic-client.ts` `semester()` decoder passes the two new fields into `validateCreateSemesterRequest`.

- [ ] **Step 13: Run the admin browser suite**

Run: `node tools/admin/test-ui.mjs`
Expected: all checks PASS including the new one; `assertReadable` passes (the two inputs are 44px tall through the shared `.admin-field` styles).

- [ ] **Step 14: Full verification and record**

Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS. Fill sections 2–4 of S2-P004-017 with the actual files, commands and results (note that 0009 was not applied to a database by the implementer unless it was). Stop and report for coordinator review; do not commit.

---

### Task 2: Offering decisions API

**Record:** create `docs/changes/S2-P004-018-offering-decisions-api.md` first.

**Files:**
- Create: `packages/shared/src/forecasting/offering-decisions.ts`, `apps/api/src/modules/forecasting/decisions-contracts.ts`, `apps/api/src/modules/forecasting/decisions-repository.ts`, `apps/api/src/modules/forecasting/decisions-routes.ts`, `apps/api/src/modules/forecasting/decisions-testing.ts`, `apps/api/src/modules/forecasting/decisions-routes.test.ts`, `apps/api/src/modules/forecasting/semester-window.ts`
- Modify: `packages/shared/src/forecasting/contracts.ts` (`SemesterOption` gains optional `selectionOpensAt?: string | null; selectionClosesAt?: string | null`; `ForecastContext` gains optional `semesters?: SemesterOption[]`), `apps/api/src/modules/forecasting/repository.ts` (`semesters()` selects the two columns), `apps/api/src/modules/forecasting/routes.ts` (context returns `semesters`; dispatch to the new route), `apps/api/src/modules/forecasting/contracts.ts` (`ForecastingDependencies.decisions: OfferingDecisionsRepository`), `apps/api/src/modules/forecasting/index.ts`, `apps/api/src/modules/forecasting/errors.ts`, `apps/api/src/modules/forecasting/routes.test.ts` (fixture deps gain `decisions`), `apps/api/src/modules/forecasting/repository.database.test.ts`, `docs/api/forecasting-uc20.openapi.json`

**Interfaces:**
- Consumes: `selectionPhase` (Task 1); `nextSemesterAfter` from `packages/shared/src/offerings/confirmed-offerings.ts`; `deps.repository.catalogue(programmeId)` (subjects with `includeInOfferingForecast`); `deps.repository.getBatch`.
- Produces (shared `offering-decisions.ts`):
  - `export const OFFERING_DECISION_STATUSES = ['PENDING','APPROVED','REMOVED'] as const; export type OfferingDecisionStatus`
  - `export interface OfferingDecision { subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; classType: ClassType; status: 'APPROVED' | 'REMOVED'; decidedBy: string; decidedAt: string }`
  - `export interface OfferingDecisionSet { scope: ForecastScope; semester: SemesterOption & SelectionWindow; phase: SelectionPhase; asOf: string; editable: boolean; decisions: OfferingDecision[]; pickCounts: Array<{ subjectId: Int32Id; pickCount: number }> }` (`pickCounts` is `[]` until Task 3)
  - `export interface DecideOfferingRequest { scope: ForecastScope; subjectId: Int32Id; status: OfferingDecisionStatus; expectedStatus: OfferingDecisionStatus; importBatchId: Int32Id | null }`
  - `export interface DecideOfferingResult { subjectId: Int32Id; beforeStatus: OfferingDecisionStatus; afterStatus: OfferingDecisionStatus; affectedPicks: number; phase: SelectionPhase }`
  - `export interface OfferingDecisionAuditEntry { auditId: number; scope: ForecastScope; subjectId: Int32Id; subjectCode: string; subjectName: string; beforeStatus: OfferingDecisionStatus; afterStatus: OfferingDecisionStatus; importBatchId: Int32Id | null; affectedPicks: number; recordedBy: string; recordedAt: string }`
- Produces (API, all `/api/coordinator/`, COORDINATOR only, scope checked with `isScopeAssigned`):
  - `GET offering-decisions?programmeId&learningCentreId&targetSemesterId` → `{ data: OfferingDecisionSet }`, `no-store`. `editable` = semester is the next semester after the current one **and** `phase !== 'CLOSED'`.
  - `POST offering-decisions` body `DecideOfferingRequest` (optional `Idempotency-Key`, no `If-Match`) → `200 { data: DecideOfferingResult }`. Errors: 400 invalid body; 403 `SCOPE_NOT_ASSIGNED`; 409 `SEMESTER_READ_ONLY` ("Only the next semester can be planned."); 409 `SELECTION_CLOSED` ("Selection for this semester has closed; decisions are locked."); 409 `DECISION_STALE` ("This subject was changed by someone else. Reload to see the current decision."); 422 `DECISION_SUBJECT_NOT_FOUND` (subject not in the programme catalogue) / `SUBJECT_EXCLUDED` (`includeInOfferingForecast` false); 404 `IMPORT_NOT_FOUND` (importBatchId not an ACCEPTED batch of the scope); `status === expectedStatus` → 200 with `affectedPicks: 0` and no write.
  - `GET offering-decisions/audit?scope…&limit&cursor` → `{ data: Paginated<OfferingDecisionAuditEntry> }` newest first, keyset by `auditId` (existing `encodeCursor`/`decodeCursor`).
- Produces (repository `OfferingDecisionsRepository`): `get(scope): Promise<DecisionRow[]>`; `decide(input: { scope; subjectId; expectedStatus; status; actor; importBatchId }): Promise<{ beforeStatus; afterStatus; affectedPicks }>`; `listAudit(scope, limit, beforeAuditId): Promise<OfferingDecisionAuditEntry[]>`; `pickCounts(scope): Promise<Array<{ subjectId; pickCount }>>` (returns `[]` in this task; Task 3 implements it).
- Produces (`semester-window.ts`): `resolveSemesterWindow(deps, targetSemesterId): Promise<{ semester: SemesterOption & SelectionWindow; isNext: boolean; phase: SelectionPhase }>` — throws `SCOPE_NOT_FOUND` when the semester does not exist; `isNext` compares with `nextSemesterAfter(currentSemesterId, semesters)`; phase uses `deps.now`.
- Error catalogue additions in `errors.ts`: `SEMESTER_READ_ONLY` 409, `SELECTION_CLOSED` 409, `DECISION_STALE` 409; guard token `DECISION_GUARD_STALE = 'GUARD_DECISION_STALE'` mapped from `22P02` in a new `context: 'decision'` branch of `mapForecastingDatabaseError` (23514/23505 → `RUN_CONFLICT`-style `DECISION_CONFLICT` 409 "The decision conflicts with existing data. Reload and retry."; other → `DECISION_FAILED` 500).

- [ ] **Step 1: Write the failing route tests**

`decisions-routes.test.ts`, using the `fixture()` pattern from `offerings-routes.test.ts` (fake runs repo, `testScopeProvider`, `now` fixed at `2026-11-01T12:00:00.000Z`, `repository.semesters` returning semesters 1–3 of 2026/2027 with `selectionOpensAt/ClosesAt` set per test, `repository.catalogue` returning the four test subjects, `repository.getBatch` returning batch 1) and `fakeDecisionsRepository()` from `decisions-testing.ts`:

- `GET returns an empty set in PLANNING with editable true for the next semester` — expect `phase 'PLANNING'`, `editable true`, `decisions []`, header `cache-control: no-store`.
- `POST approve writes a decision and an audit row; same status again is a no-op` — body `{ scope, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 }` → 200 `{ beforeStatus: 'PENDING', afterStatus: 'APPROVED', affectedPicks: 0 }`; GET shows one APPROVED decision with `subjectCode 'LEC101'`; audit has one entry with `importBatchId 1`; repeating with `expectedStatus: 'APPROVED', status: 'APPROVED'` → 200 and audit length still 1.
- `POST with a stale expectedStatus is 409 DECISION_STALE` — approve A, then post `{ status: 'REMOVED', expectedStatus: 'PENDING' }` → 409.
- `POST PENDING (add back) deletes the row and audits REMOVED -> PENDING`.
- `POST rejects an excluded subject and an unknown subject` → 422 `SUBJECT_EXCLUDED` for X (FYP104), 422 `DECISION_SUBJECT_NOT_FOUND` for 999.
- `past semester is read-only` — scope `targetSemesterId: 1` (the current one) → GET `editable false`; POST → 409 `SEMESTER_READ_ONLY`, audit empty.
- `closed selection locks decisions` — semester 2 with `selectionOpensAt '2026-10-01…'`, `selectionClosesAt '2026-10-31…'` → GET `phase 'CLOSED'`, `editable false`; POST → 409 `SELECTION_CLOSED`.
- `audit is paged newest first` — three decisions on A/B/C, `limit=2` → two items + `nextCursor`, second page one item.
- `unassigned scope is 403 on every route` using `assignedTo([5, 2])`.
- `forecast-context lists every semester with its selection window` (in `routes.test.ts`): `data.semesters` has three entries carrying `selectionOpensAt`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- apps/api/src/modules/forecasting/decisions-routes.test.ts apps/api/src/modules/forecasting/routes.test.ts`
Expected: FAIL (modules missing / 404).

- [ ] **Step 3: Implement contracts, fake repository, window helper and routes**

`decisions-contracts.ts`: `DecisionRow { subjectId; subjectCode; subjectName; creditHours; classType; status: 'APPROVED'|'REMOVED'; decidedBy; decidedAt }` and the `OfferingDecisionsRepository` interface above. `decisions-testing.ts`: in-memory implementation (Map keyed `scopeKey|subjectId`, audit array, `pickCounts` → `[]`, `DECISION_STALE` when `expectedStatus` differs). `decisions-routes.ts`: `export const DECISION_ROUTE = /^offering-decisions(?:\/(audit))?$/` and `handleDecisionRoute(route, request, url, deps, actor)`; validation with `bad()` for exact keys and integer ids; the semester-window check before the repository call; `importBatchId` checked with `getBatch` (ACCEPTED and same scope). `routes.ts`: add `DECISION_ROUTE.test(route)` to `known` and the dispatch; `forecastContext` fills `semesters` from `deps.repository.semesters()` (now carrying the window) and keeps `targetSemesters` as today. `index.ts`: construct `createOfferingDecisionsRepository(query, transaction)` and pass `decisions`. Add the new paths and schemas to `docs/api/forecasting-uc20.openapi.json`.

- [ ] **Step 4: Run the route tests to verify they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Implement the SQL repository**

`decisions-repository.ts` (`createOfferingDecisionsRepository(query, transaction)`, errors through `mapForecastingDatabaseError(error, 'decision')`):

- `get`: `SELECT d.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, d.status, d.decided_by, <isoSql(d.decided_at)> FROM offering_decision d JOIN subject s USING (subject_id) WHERE scope ORDER BY s.subject_code`.
- `decide`: one `transaction([...])`:
  1. `SELECT pg_advisory_xact_lock(hashtext($1::text))` with `$1 = programmeId:centreId:semesterId:subjectId` (there is no row to lock while Pending).
  2. Guard (same technique as `guardRun`): `SELECT CASE WHEN coalesce((SELECT status FROM public.offering_decision WHERE <scope> AND subject_id=$4), 'PENDING') = $5::text THEN 0 ELSE ('GUARD_DECISION_STALE')::integer END AS ok`.
  3. Decision write: for `APPROVED`/`REMOVED` an `INSERT … ON CONFLICT (programme_id, learning_centre_id, semester_id, subject_id) DO UPDATE SET status = EXCLUDED.status, decided_by = EXCLUDED.decided_by, decided_at = now()`; for `PENDING` a `DELETE`.
  4. Audit + withdrawals in **one** statement so the pick count and the deletion share a snapshot (Task 3 fills the pick parts; in this task `affected_picks` is the literal 0 and the `gone`/withdrawal CTEs are omitted):
     ```sql
     WITH a AS (INSERT INTO public.offering_decision_audit(programme_id, learning_centre_id, semester_id, subject_id, before_status, after_status, import_batch_id, affected_picks, recorded_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING audit_id)
     SELECT audit_id FROM a
     ```
  Return `{ beforeStatus: expectedStatus, afterStatus: status, affectedPicks }` from the last statement's row.
- `listAudit`: join `subject` for code/name, `WHERE scope AND ($4::bigint IS NULL OR audit_id < $4) ORDER BY audit_id DESC LIMIT $5`.
- `pickCounts`: `async () => []` (Task 3 replaces it).

`repository.ts` `semesters()`: add `to_char(selection_opens_at …) AS selection_opens_at` (and closes) and map to `selectionOpensAt/ClosesAt`.

- [ ] **Step 6: Write the database test (skips without the env var)**

In `repository.database.test.ts` add `describe('offering decisions on PostgreSQL')`: approve A for the seeded scope through `handleForecastingRequest`, assert one `offering_decision` row and one audit row with `before_status 'PENDING'`; post `expectedStatus 'PENDING'` again → 409 `DECISION_STALE`; `UPDATE public.offering_decision_audit SET recorded_by='x'` rejects (immutable trigger). Seed `selection_opens_at` null on the target semester so the phase is PLANNING.

- [ ] **Step 7: Verification and record**

Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS. Fill S2-P004-018 sections 2–4. Stop and report; do not commit.

---

### Task 3: Picks API — pick counts, pickers and pick withdrawal on removal

**Record:** create `docs/changes/S2-P004-019-offering-picks-api.md` first.

**Files:**
- Modify: `packages/shared/src/forecasting/offering-decisions.ts` (add `OfferingPickers`), `apps/api/src/modules/forecasting/decisions-contracts.ts`, `decisions-repository.ts`, `decisions-routes.ts`, `decisions-testing.ts`, `decisions-routes.test.ts`, `repository.database.test.ts`, `docs/api/forecasting-uc20.openapi.json`

**Interfaces:**
- Consumes: `deps.portalContacts` (matric/email lookup from `apps/api/src/modules/forecasting/index.ts`) and `withContacts`-style merging (copy the small helper from `runs-routes.ts` rather than importing it, because Task 8 reshapes that file).
- Produces (shared): `export interface OfferingPicker { studentId: number; studentName: string; matricNo: string | null; email: string | null }`; `export interface OfferingPickers { scope: ForecastScope; subjectId: Int32Id; subjectCode: string; subjectName: string; pickCount: number; emailsAvailable: boolean; pickers: OfferingPicker[] }` (sorted by `studentName`, then `studentId`).
- Produces (API): `GET offering-decisions/{subjectId}/pickers?scope…` → `{ data: OfferingPickers }`, `no-store`; 404 `DECISION_SUBJECT_NOT_FOUND` when the subject has no decision row in the scope. Route regex becomes `/^offering-decisions(?:\/(audit)|\/([1-9]\d*)\/pickers)?$/`.
- Produces (repository): `pickCounts(scope)` real; `pickers(scope, subjectId): Promise<Array<{ studentId; studentName; matricNo }>>`; `decide` returns the real `affectedPicks` and writes `offering_pick_withdrawal` rows.
- A pick of a student counts for the scope when `semester_offering.semester_id = scope.targetSemesterId`, the student's `student_profile.learning_centre_id = scope.learningCentreId`, the student's `curriculum.programme_id = scope.programmeId`, and `curriculum_subject.subject_id = <subject>`.

- [ ] **Step 1: Write the failing tests**

In `decisions-routes.test.ts` the fake repository gains `seedPicks(scope, subjectId, students: Array<{ studentId; studentName; matricNo }>)`:
- `GET set includes pick counts per subject` — seed 2 picks for A → `pickCounts` `[{ subjectId: A, pickCount: 2 }]`.
- `pickers lists names and matric numbers, no-store` — expect `pickCount 2`, two pickers sorted by name, `cache-control: no-store`; unknown subject → 404.
- `removing an approved subject while open withdraws its picks and reports how many` — semester OPEN (`selectionOpensAt` in the past, closes null), approve A, seed 3 picks, POST `{ status: 'REMOVED', expectedStatus: 'APPROVED' }` → `affectedPicks 3`; GET `pickCounts` for A is absent/0; audit entry `affectedPicks 3`.
- `removing a subject nobody picked reports zero`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- apps/api/src/modules/forecasting/decisions-routes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Fake repository: picks map and withdrawal behaviour. SQL repository:
- `pickCounts`: `SELECT cs.subject_id, count(*)::int AS pick_count FROM public.semester_offering o JOIN public.student_profile p ON p.student_id = o.student_id JOIN public.curriculum c ON c.curriculum_id = p.curriculum_id JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = o.curriculum_subject_id WHERE o.semester_id = $3 AND c.programme_id = $1 AND p.learning_centre_id = $2 GROUP BY cs.subject_id`.
- `pickers`: same joins filtered by `cs.subject_id = $4`, selecting `p.student_id, p.student_name, p.matric_no`, `ORDER BY p.student_name, p.student_id`.
- `decide`, statement 4 becomes (only when `expectedStatus === 'APPROVED'`; otherwise keep the Task 2 form):
  ```sql
  WITH scoped AS (SELECT o.offering_id, o.student_id FROM public.semester_offering o
                  JOIN public.student_profile p ON p.student_id = o.student_id
                  JOIN public.curriculum c ON c.curriculum_id = p.curriculum_id
                  JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = o.curriculum_subject_id
                  WHERE o.semester_id = $3 AND c.programme_id = $1 AND p.learning_centre_id = $2 AND cs.subject_id = $4),
       a AS (INSERT INTO public.offering_decision_audit(…, affected_picks, recorded_by)
             VALUES (…, (SELECT count(*) FROM scoped), $9) RETURNING audit_id),
       gone AS (DELETE FROM public.semester_offering o USING scoped WHERE o.offering_id = scoped.offering_id RETURNING o.student_id),
       w AS (INSERT INTO public.offering_pick_withdrawal(audit_id, student_id, semester_id, subject_id)
             SELECT a.audit_id, gone.student_id, $3, $4 FROM a, gone RETURNING withdrawal_id)
  SELECT (SELECT count(*) FROM w)::int AS affected_picks
  ```
  All CTEs of one statement share a snapshot, so the count, the delete and the withdrawal rows agree.
- Route handler for `pickers` merging `portalContacts` (matric from the row; email from the lookup; `emailsAvailable` false on lookup failure).

- [ ] **Step 4: Run the route tests**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Database test**

In `repository.database.test.ts` add `it('withdraws scoped picks when an approved subject is removed and keeps the withdrawal record')`: seed a `student_profile` with `learning_centre_id = ids.centre` and a `semester_offering` row for the target semester and subject s101, approve then remove s101 → `affectedPicks 1`, `semester_offering` row gone, one `offering_pick_withdrawal` row; a second student at another centre keeps their pick.

- [ ] **Step 6: Verification and record**

Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS. Update OpenAPI. Fill S2-P004-019. Stop and report; do not commit.

---

### Task 4: Coordinator screen — snapshot picker, decisions table, audit

**Record:** create `docs/changes/S2-P004-020-coordinator-decision-screen.md` first.

**Files:**
- Rewrite: `apps/web/src/features/coordinator/ForecastsPage.tsx` (keep `RadioMenu`, `SummaryFacts`-style facts, `SubjectStudentsDialog` use, `AuditTable` shape)
- Modify: `apps/web/src/features/coordinator/client.ts` (+ `client.test.ts`), `coordinator-ui.tsx` (no change to `ScopeFields`: the target semester stays a read-only output), `coordinator-help.tsx`, `coordinator.css` (only new classes needed), `CoordinatorRoutes.tsx` (page description for `/coordinator/forecasts`: "Look at the forecast for a student data snapshot and decide which subjects are offered."), `tools/coordinator/fixtures.mjs`, `tools/coordinator/test-ui.mjs`
- Leave `DecisionsPage.tsx`, old client methods and old fixtures in place (Task 8 removes them) so the suite keeps passing between tasks.

**Interfaces:**
- Consumes: `OfferingDecisionSet`, `DecideOfferingRequest`, `DecideOfferingResult`, `OfferingDecisionAuditEntry` (Task 2); `ForecastContext.semesters` (Task 2); existing `client.generateRun`, `client.getRun`, `client.listImports`, `client.getSubjectStudents`; `ToastStack` + `useToastNotifications` from `apps/web/src/components/feedback/`.
- Produces (client): `getDecisions(scope: ForecastScope, signal?): Promise<OfferingDecisionSet>`; `decide(input: DecideOfferingRequest): Promise<DecideOfferingResult>` (POST with `Idempotency-Key`); `listDecisionAudit(scope, page?: PageQuery, signal?): Promise<Paginated<OfferingDecisionAuditEntry>>`.
- URL state on `/coordinator/forecasts`: `programmeId`, `learningCentreId`, `snapshot` (import batch id; default the newest accepted import of the scope + next semester). The semester is always `context.targetSemesterId` (the next semester); there is no semester select or `semester` parameter. The old `run` parameter is no longer read.
- Page composition (one screen):
  1. Header card: `ScopeFields` with the existing read-only next-semester output (no semester select); snapshot select (`listImports(scope, { limit: 100 })`, option text `${sourceLabel} · ${SOURCE_META[source].label} · ${sourceDate}`); status line `<p role="status" className="coordinator-phase">` with phase text: PLANNING + no date → "Selection not scheduled"; PLANNING → `Selection opens ${when(opensAt)}`; OPEN → `Selection open until ${when(closesAt)}` or "Selection open" when closes is null; CLOSED → `Selection closed ${when(closesAt)}`; followed by ` · ${n} subjects still pending` (singular "subject"). In PLANNING with `n > 0` a second `<p className="coordinator-warning" role="status">` reads `${n} subjects still pending; they won't be shown to students unless approved.`
  2. Loading the forecast for the chosen snapshot: `generateRun({ ...scope, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' })` then `getRun(receipt.resourceId)`; the run id is kept in state, never in the URL.
  3. Subjects table rows = run subjects where `!excluded && !semesterTypeExcluded`, merged with `set.decisions` by `subjectId`; decided subjects absent from the run are appended with counts "—" and the pill "not in this snapshot" (`className="admin-pill coordinator-pill-muted"`). Columns: Subject (name, code, class type + credit hours under it) · **Not taken yet** (`breakdown.inCurriculum - breakdown.alreadyPassed`, "—" when `breakdown` null) · **Eligible to take** (`supportedEligibleCount` plus the existing "View students" button) · **Action** (`RadioMenu` with options Pending / Approved / Removed, `checked` = current status, no `help` text; `aria-label` `Action for ${code}: ${label}`). Default sort: eligible desc, then name; 0-eligible rows sink to the bottom. Toolbar: `SegmentedFilter` tabs All / Pending / Approved; `FilterMenu` groups Class type (Lecture / Lab / Not set) and Flags (only "Has uncertain students"); `FilterMenu` Sort (Eligible to take, Subject name, Subject code); `SearchField`; `ClearFilters`. Page size 20 as today.
  4. Removed side table (`RemovedSubjects`) with Add back → `decide({ status: 'PENDING', expectedStatus: 'REMOVED' })`.
  5. Audit card from `listDecisionAudit` (columns When · Change · Subject · By · Snapshot), `Change` text `${label(before)} → ${label(after)}`, refreshed after every decision.
  6. Toasts via `ToastStack`: `${code} approved.` / `${code} removed.` / `${code} added back.`; Task 5 adds the withdrawn variant.
  7. `DECISION_STALE` → toast warning "This subject was changed by someone else; reloaded." and reload the set; `SEMESTER_READ_ONLY` / `SELECTION_CLOSED` → reload the set (the page re-renders locked).
- Help texts (`coordinator-help.tsx`): `notTakenYet`: "Students whose curriculum includes the subject and who have not passed it or been exempted."; `eligible`: "Students who have not taken the subject and meet its prerequisites according to their records. This is the number you decide on; it is a forecast, not registration."; `action`: "Pending subjects are not shown to students. Approved subjects are offered when selection opens. Removed subjects are listed beside the table and can be added back."; `snapshot`: "Forecast numbers come from the chosen student data snapshot. Decisions belong to the semester and carry over when you choose another snapshot."

- [ ] **Step 1: Extend the fixtures**

`tools/coordinator/fixtures.mjs`: `createState` options `phase: 'planning' | 'open' | 'closed'` (default `'planning'`), `selectionDates` derived from it (`open`: opens 2 days ago, closes 10 days ahead; `closed`: both in the past; `planning`: `scheduled: true` sets opens 10 days ahead); `state.decisions = new Map()`; `state.decisionAudit = []`; `state.picks = new Map()` (subjectId → `[{ studentId, studentName, matricNo, email }]`); `forecast-context` returns `semesters` (ids 1–3 of 2026/2027 with the window on semester 2); routes `offering-decisions` GET/POST (409 `DECISION_STALE`, `SELECTION_CLOSED`, `SEMESTER_READ_ONLY` mirrored), `offering-decisions/audit` (paged), `offering-decisions/{id}/pickers`. Seeds: `seed: 'decided'` = snapshot + run + decisions {101: APPROVED, 102: REMOVED} + one decided subject `107` ("SECJ2203 Software Engineering", not in the run).

- [ ] **Step 2: Write the failing browser checks** (replace the `forecasts:` group in `tools/coordinator/test-ui.mjs`; keep imports and decisions groups untouched for now)

- `forecast: the newest snapshot is pre-selected, its forecast is generated when missing, and subjects are sorted by eligible students` — `mock(page, { seed: 'import' })`, goto `/coordinator/forecasts` + scoped; expect a POST `/api/coordinator/forecast-runs` with `importBatchId: 1`; the Subjects table rows in order `SCSJ1013, SECJ1013, SECD2523, SECJ1023`; header cells include `Not taken yet`, `Eligible to take`, `Action`; no `Potential demand` text anywhere; `page.url()` contains `snapshot=1`.
- `forecast: choosing Approved, Removed and Pending takes effect at once with a toast and an audit row, no dialog, no reason` — `pickAction(page, 'SECJ1013', 'Approved')` → toast text `SECJ1013 approved.`; `state.bodies` last POST to `offering-decisions` equals `{ scope: scopeBody, subjectId: 101, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 }`; no `dialog` role appeared; audit table first row contains `Pending → Approved`; `pickAction(page, 'SECD2523', 'Removed')` moves it to "Removed subjects"; `Add back SECD2523` → toast `SECD2523 added back.` and the row returns with `Pending`.
- `forecast: the status line counts pending subjects and warns during planning` — seed `decided`, expect `role=status` text `Selection not scheduled · 2 subjects still pending` and the warning `2 subjects still pending; they won't be shown to students unless approved.`; with `scheduled: true` the line starts `Selection opens`.
- `forecast: decisions carry over when another snapshot is chosen and a decided subject missing from it is marked` — seed `decided` + second import; choose the "October cohort" snapshot; `SECJ1013` still shows `Approved`; row `SECJ2203` shows `not in this snapshot` and `—` counts.
- `forecast: tabs, class type, uncertain filter, sort and search use the shared toolbar` — tab `Pending` hides approved rows; Filter → Class type Lab shows only lab rows; `Has uncertain students` keeps `SECJ1013` and `SCSJ1013`; search `SECD` → one row; Clear filters restores four rows.
- `forecast: 409 DECISION_STALE reloads the decisions and says so` — `state.staleDecision = true`; pick Approved → toast `This subject was changed by someone else; reloaded.` and a second GET of `offering-decisions`.
- Keep and adapt: info-tip check (now on `Not taken yet` / `Eligible to take` headers), View students checks (open from the new column), both `mobile:` overflow checks for forecasts.

- [ ] **Step 3: Run the suite to verify the new checks fail**

Run: `node tools/coordinator/test-ui.mjs`. Expected: the new `forecast:` checks FAIL; imports and decisions checks still PASS.

- [ ] **Step 4: Implement client, help texts, `ScopeFields.semester` and the page**

Follow the composition in the Interfaces block. Reuse `useRead`, `usePagedList`, `Panel`, `StatusRegion` for errors, `RadioMenu` (move it unchanged), `SubjectStudentsDialog` with the run id, `StudentListCache` cleared when the run id changes. Decision writes: optimistic nothing — after `decide` resolves, reload the set and refresh the audit. Numbers right-aligned with tabular figures (`coordinator-number`).

- [ ] **Step 5: Run the coordinator suite**

Run: `node tools/coordinator/test-ui.mjs`. Expected: all PASS, `assertReadable` passes on every check.

- [ ] **Step 6: Client unit tests, full verification, record**

Add to `client.test.ts`: `getDecisions` decodes `decisions`/`pickCounts` arrays and rejects a body without `phase`; `decide` sends `Idempotency-Key` and the exact body. Run: `npm run typecheck && npm run lint && npm test && node tools/admin/test-ui.mjs` (admin suite exercises the coordinator shell). Expected: PASS. Fill S2-P004-020. Stop and report; do not commit.

---

### Task 5: Coordinator screen — selection open/closed, Picked column and pickers dialog

**Record:** create `docs/changes/S2-P004-021-coordinator-open-closed.md` first.

**Files:**
- Modify: `apps/web/src/features/coordinator/ForecastsPage.tsx`, `client.ts` (+ test), `coordinator-help.tsx`, `coordinator.css`, `tools/coordinator/fixtures.mjs`, `tools/coordinator/test-ui.mjs`
- Create: `apps/web/src/features/coordinator/SubjectPickersDialog.tsx`

**Interfaces:**
- Consumes: `OfferingPickers` and `GET offering-decisions/{subjectId}/pickers` (Task 3); `OfferingDecisionSet.pickCounts`, `DecideOfferingResult.affectedPicks`, `phase`.
- Produces (client): `getPickers(scope: ForecastScope, subjectId: number, signal?): Promise<OfferingPickers>`.
- Behaviour: phase `OPEN` → dropdown stays enabled; removing a subject whose current status is `APPROVED` shows toast `${code} withdrawn. ${n} students who picked it will see a note.` (`1 student`), or `${code} withdrawn.` when `affectedPicks === 0`; phase `CLOSED` → no `RadioMenu` (status pill only), no Add back button, table gains a **Picked** column (count from `pickCounts`, "—" for non-approved rows) with a button `View pickers for ${code}` opening `SubjectPickersDialog` (`ReadOnlyDialog`, title `Picked · ${code}`, table Student (name, matric number or sign-in email under it) only, search field through `TableToolbar`, "No student picked this subject." when empty, the `emailsAvailable` warning copied from the students dialog). Picker lists are cached in memory on the page (`Map<string, OfferingPickers>` keyed `subjectId` (one semester only)) and dropped when the page is left or Refresh is pressed; never in storage.
- Help text `picked`: "Students who picked this subject before selection closed. A pick is not a registration."

- [ ] **Step 1: Write the failing browser checks**

- `forecast: while selection is open, removing an approved subject reports the affected students and the change goes live` — `mock(page, { seed: 'decided', phase: 'open' })`, `state.picks.set(101, [three students])`; `pickAction(page, 'SECJ1013', 'Removed')` → toast `SECJ1013 withdrawn. 3 students who picked it will see a note.`; `pickAction` on `SCSJ1013` Removed → toast `SCSJ1013 withdrawn.` (nobody picked); status line starts `Selection open until`.
- `forecast: after selection closes the dropdown is locked, the Picked column shows counts and the pickers dialog lists names and matric numbers` — `phase: 'closed'`, picks for 101; no `Action for` buttons; header `Picked`; `SECJ1013` row shows `3`; click `View pickers for SECJ1013` → dialog `Picked · SECJ1013` with three rows (`Aisyah binti Ahmad` + `A22EC0051`; a student without matric shows `student052@graduate.utm.my`); the request to `/pickers` happened once even after closing and reopening the dialog; Refresh then reopen → requested again.
- `mobile: the pickers dialog fits without page overflow at 320 and 375`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tools/coordinator/test-ui.mjs`. Expected: new checks FAIL.

- [ ] **Step 3: Implement**

Client method, fixtures route already exists (Task 4 Step 1) — make it honour `state.picks`; page changes per Interfaces; `SubjectPickersDialog` modelled on `SubjectStudentsDialog`.

- [ ] **Step 4: Run the suite, full verification, record**

Run: `node tools/coordinator/test-ui.mjs && npm run typecheck && npm run lint && npm test`. Expected: PASS. Fill S2-P004-021. Stop and report; do not commit.

---

### Task 6: Student offerings — approved subjects for the next semester, selection window, withdrawal note

**Record:** create `docs/changes/S2-P004-022-student-offerings-approved.md` first (cross-module: P002 page, P002 owner to review).

**Files:**
- Modify: `packages/shared/src/offerings/offerings.ts`, `apps/api/src/modules/offerings/context.ts` (+ `context.test.ts`), `contracts.ts`, `routes.ts` (+ `routes.test.ts`), `repository.ts` (+ `repository.test.ts`, `database.test.ts`), `validation.ts` if needed, `apps/web/src/features/offerings/response.ts` (+ tests), `client.ts` (+ test: cache marker), `OfferingsPage.tsx`, `offerings.css`, `testing/ui-harness.tsx`, `testing/rich-fixtures.ts`, `tools/offerings/demo/fixtures.ts`, `tools/offerings/test-ui.mjs`, `tools/integration/test-ui.mjs` (mock payload gains `window`), `docs/cachingguide.md` rule 8 (marker name only — the rest of the wording is Task 8), `docs/offerings/integration.md` if it documents the response

**Interfaces:**
- Consumes: `selectionPhase`, `nextSemesterAfter`, tables `offering_decision`, `offering_pick_withdrawal`, `student_profile.learning_centre_id`, `academic_semester.is_current` + window columns.
- Produces (shared `offerings.ts`, additive): `export type OfferingWindowStatus = 'NO_NEXT_SEMESTER' | 'NO_LEARNING_CENTRE' | 'NOT_SCHEDULED' | 'NOT_OPEN' | 'OPEN' | 'CLOSED'`; `export interface OfferingWindow { status: OfferingWindowStatus; targetSemesterId: string | null; selectionOpensAt: string | null; selectionClosesAt: string | null; learningCentreName: string | null }`; `export interface WithdrawnOffering { subjectId: string; code: string; name: string; withdrawnAt: string }`; `OfferingContext` gains `window?: OfferingWindow`; `OfferingPageData` gains `withdrawnSubjects?: WithdrawnOffering[]`. `currentSemesterId` now carries the **target** (next) semester id. Mapping: no next semester → `NO_NEXT_SEMESTER`; profile centre null → `NO_LEARNING_CENTRE`; phase PLANNING → `NOT_SCHEDULED` (opens null) or `NOT_OPEN`; else `OPEN` / `CLOSED`.
- Produces (API `GET /api/semester-offerings`): `subjects` = curriculum subjects of the student's curriculum whose `subject_id` has an `APPROVED` decision for (programme of the curriculum, profile centre, target semester) — `[]` unless status is `OPEN` or `CLOSED`; `selection` read for the target semester; `withdrawnSubjects` from `offering_pick_withdrawal` for the student + target semester (newest first). The profile `current_semester_id` is **not** read; `PROFILE_SETUP_REQUIRED`/`PROFILE_SEMESTER_*` checks tied to it are removed. `semesterId` query, when present, must equal the target → else 409 `SEMESTER_NOT_TARGET` ("Offerings are only available for the next semester.").
- Produces (API `PUT`): body unchanged (`semesterId`, `curriculumSubjectIds`); 409 `SEMESTER_NOT_TARGET`; 409 `PICKS_NOT_OPEN` ("Picking has not opened yet.") in PLANNING / `NO_*` states; 409 `PICKS_CLOSED` ("Picking is closed. The selection period has ended.") when CLOSED; 409 `PICK_LIMIT_EXCEEDED` ("You can pick at most ${maxSubjects} subjects and ${maxCredits} credits for this semester.") when the picks exceed the target semester's `max_subjects` or their total `credit_hours` exceeds `max_credits` (checked in the same transaction); 409 `OFFERING_NOT_APPROVED` ("A subject you picked is no longer offered. Reload offerings.") when any id is outside the approved set — rechecked **inside** the repository transaction against `offering_decision` and the semester window (`FOR SHARE` on the semester row), so a stale client cannot save.
- Produces (web): cache key marker `'p002-context-v6-approved-offerings'`; page states: `NO_NEXT_SEMESTER` → card "No next semester is configured yet."; `NO_LEARNING_CENTRE` → card "Choose your learning centre in your academic profile to see the subjects offered to you." with link `/student/profile`; `NOT_SCHEDULED` → "Offerings are not open yet. The selection date has not been scheduled."; `NOT_OPEN` → `Offerings open on ${local date-time}.`; `OPEN` → existing select/review/saved flow with a live counter `${picked} of ${maxSubjects} subjects · ${credits} of ${maxCredits} credits` (selection beyond either limit is blocked in the page with the same message as the API) and the hint `Picks can be changed until ${closes}` (or "until selection closes"), review confirmation text `I confirm these are my picks for ${year}, Semester ${n}. A pick is not a registration.`, saved banner "Your picks were saved."; `CLOSED` → saved view only, banner `Selection closed on ${closes}. Your picks are read-only.`, no Edit / Review buttons; whenever `withdrawnSubjects` is non-empty a `role="status"` list "Withdrawn by the coordinator" with lines `${code} was withdrawn by the coordinator`. The page computes OPEN/CLOSED locally from the window dates while a cached snapshot ages; the server answer on PUT wins and a 409 `PICKS_CLOSED` / `OFFERING_NOT_APPROVED` clears the cache and reloads.

- [ ] **Step 1: Write the failing API tests**

`context.test.ts` (mocked `query`): `targets the next semester after the admin current semester and ignores the profile semester` (profile `current_semester_id` = 1, admin current = 1 → `currentSemesterId '2'`, `window.targetSemesterId '2'`); `returns NO_LEARNING_CENTRE when the profile has no centre`; `returns NOT_OPEN with the opening date before selection opens and lists no subjects`; `lists only approved subjects of the student's curriculum when open` (decision rows for subject ids 10 and 11, curriculum has 10 only → one subject); `returns withdrawn subjects for the student`.
`routes.test.ts`: `PUT rejects a subject that is no longer approved` → 409 `OFFERING_NOT_APPROVED`; `PUT rejects picks over max_subjects or max_credits` → 409 `PICK_LIMIT_EXCEEDED`; `PUT is 409 PICKS_CLOSED after closing`; `PUT is 409 PICKS_NOT_OPEN during planning`; `GET with another semesterId is 409 SEMESTER_NOT_TARGET`; `no learning centre shows the profile prompt` → GET 200 with `window.status 'NO_LEARNING_CENTRE'` and `subjects []`.
`repository.test.ts`: `replace rechecks the window and the approved set inside the transaction` (the transaction mock returns a CLOSED window → `PICKS_CLOSED` and no DELETE/INSERT issued).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- apps/api/src/modules/offerings`. Expected: FAIL.

- [ ] **Step 3: Implement the API**

`context.ts`: profile query adds `p.learning_centre_id, c.programme_id, lc.centre_name` (LEFT JOIN `learning_centre`); semesters query adds `is_current, selection_opens_at, selection_closes_at` (UTC ISO text); compute target with `nextSemesterAfter(currentId, semesters)`; build `window`; approved subjects query `SELECT cs.curriculum_subject_id, … FROM curriculum_subject cs JOIN subject s USING (subject_id) JOIN offering_decision d ON d.subject_id = cs.subject_id AND d.status='APPROVED' AND d.programme_id=$2 AND d.learning_centre_id=$3 AND d.semester_id=$4 WHERE cs.curriculum_id=$1 ORDER BY s.subject_code` (keep the prerequisite enrichment on that list); withdrawals query. `StudentOfferingContext` gains `window`, `withdrawnSubjects`, `programmeId`, `learningCentreId`. `routes.ts`: window gating, `semesterId` check, approved-set check before `repository.replace`. `repository.ts` `replace`: replace the `current_semester_id` recheck by (a) `SELECT selection_opens_at, selection_closes_at FROM academic_semester WHERE semester_id=$1 FOR SHARE` + `selectionPhase` → `PICKS_CLOSED` / `PICKS_NOT_OPEN`; (b) limits: `SELECT max_subjects, max_credits` from the same semester row, and `sum(s.credit_hours)` of the picked subjects → `PICK_LIMIT_EXCEEDED`; (c) `SELECT cs.curriculum_subject_id FROM curriculum_subject cs JOIN offering_decision d … WHERE cs.curriculum_subject_id = ANY($ids) AND d.status='APPROVED' …` count equals `ids.length` else `OFFERING_NOT_APPROVED`. `OfferingScope` gains `programmeId`, `learningCentreId`. `database.test.ts` (skips without the DB): one end-to-end approve → pick → remove → `offering_pick_withdrawal` check if the fixture SQL can host the 0009 tables; otherwise record it as not covered.

- [ ] **Step 4: Run the API tests**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write the failing browser checks**

`tools/offerings/test-ui.mjs` (harness scenarios: `not-open`, `not-scheduled`, `closed`, `withdrawn`, `no-centre`; default fixtures carry `window: { status: 'OPEN', … }`):
- `offerings before opening show the opening date and no subjects` → text `Offerings open on`; no checkbox.
- `offerings not scheduled say so`.
- `closed selection shows picks read-only without edit controls` → banner `Selection closed on`, no `Edit offerings` button, saved list visible.
- `a withdrawn subject shows the coordinator note` → status list contains `DEMO204 was withdrawn by the coordinator`.
- `no learning centre shows the profile prompt` → link `/student/profile`.
- Update existing checks whose copy changed (`I confirm this is my student-reported list` → `I confirm these are my picks`, `Your student-reported offerings were saved.` → `Your picks were saved.`), and the `offerings period is pinned to profile …` check becomes `offerings period is the next semester and exposes no period selector`.
- `tools/integration/test-ui.mjs` line-30 mock gains `window: { status: 'OPEN', targetSemesterId: '1', selectionOpensAt: null, selectionClosesAt: null, learningCentreName: 'KL' }`.

- [ ] **Step 6: Implement the web page and decoder**

`response.ts`: decode `window` (optional; when absent the page treats it as `OPEN` so demo fixtures keep working) and `withdrawnSubjects` (optional). `client.ts`: marker bump. `OfferingsPage.tsx` per Interfaces; keep `TableToolbar` search; use the existing `offerings-card` / `offerings-empty` styles for the new state cards.

- [ ] **Step 7: Run the browser suites**

Run: `node tools/offerings/test-ui.mjs && node tools/integration/test-ui.mjs --installed`. Expected: PASS.

- [ ] **Step 8: Full verification and record**

Run: `npm run typecheck && npm run lint && npm test` and also `npm run typecheck:offerings && npm run lint:offerings && npm run test:offerings`. Expected: PASS. Fill S2-P004-022. Stop and report; do not commit.

---

### Task 7: Profile learning centre, lock during selection, live centre in forecasting

**Record:** create `docs/changes/S2-P004-023-profile-learning-centre.md` first (cross-module: P001 profile, P001 owner to review).

**Files:**
- Modify: `apps/api/src/modules/profile/contracts.ts`, `validation.ts`, `repository.ts` (+ `repository.test.ts`, `profile.test.ts`, `index.test.ts`), `apps/web/src/features/profile/ProfilePage.tsx` (+ `profile.css` if a help style is needed), `tools/p001/test-ui.mjs`, `tools/p001/test-db.mjs` (fixture input), `tools/integration/test-ui.mjs` (setup fills the centre; `/api/profile/options` mock gains `learningCentres`), `apps/api/src/modules/forecasting/scope-provider.ts` (+ `.test.ts`, `.test-support.ts`), `apps/api/src/modules/forecasting/index.ts`, `apps/api/src/modules/forecasting/system-snapshot.ts` (`CENTRE_NOTE`), `apps/api/src/modules/forecasting/system-snapshot.test.ts`, `tools/coordinator/fixtures.mjs` (`coverage.centreNote` text), `docs/api/*` where `/api/profile` is documented (grep `matricNo` under `docs/api`)

**Interfaces:**
- Produces (API contracts): `ProfileInput.learningCentreId: number`; `Profile.learningCentreId: number | null`; `Profile.learningCentreLocked: boolean`; `ProfileOptions.learningCentres: Array<{ learningCentreId: number; centreCode: string; centreName: string }>` (active centres, ordered by code; the saved centre is included even if inactive so the select can show it).
- Lock rule: `learningCentreLocked = existing.learningCentreId !== null && selectionPhase(nextSemesterWindow, now) !== 'PLANNING'` where `nextSemesterWindow` is the window of the semester after the admin current semester (null window → not locked). Save with a **different** centre while locked → 409 `PROFILE_CENTRE_LOCKED` ("Your learning centre is locked while subject selection for the next semester is open. It unlocks when the next semester starts."). A null existing centre may be set at any time.
- Save validation: `learningCentreId` must be an active centre → else 400 `INVALID_LEARNING_CENTRE` ("Select an available learning centre.").
- Completeness (`createProfileReader`): `learningCentreId` required for `COMPLETE`.
- Produces (forecasting): `createDbScopeProvider(source: ScopeSource, studentCentre: (studentId: number) => Promise<number | null>)`; `index.ts` passes `async (id) => { const rows = await query('SELECT learning_centre_id FROM public.student_profile WHERE student_id = $1', [id]); return rows[0]?.learning_centre_id == null ? null : Number(rows[0].learning_centre_id); }`. `DEFAULT_STUDENT_CENTRE_ID` is deleted. `CENTRE_NOTE` becomes "Students are counted under the learning centre saved in their profile. Students without a learning centre are excluded (counted under other centre)."
- Web: a required `Learning centre` select in the "Programme and identity" fieldset; when `learningCentreLocked` the select is `disabled` with help `Locked while subject selection for the next semester is open. It unlocks when the next semester starts.`; a saved profile with `learningCentreId === null` shows the status line `Add your learning centre to continue using the student pages.` (same place as the matric message).

- [ ] **Step 1: Write the failing API tests**

`profile.test.ts`: `profileInput requires learningCentreId` (missing → 400 message `Learning centre must be a positive integer ID.`); `stateFor is SETUP_REQUIRED without a learning centre`. `repository.test.ts` (mocked `query`): `find returns learningCentreId and learningCentreLocked from the next semester window` (window opened → `true`); `lock allows the first centre and blocks a change while selection is open` (existing null + locked window → save proceeds; existing 1 → 2 while locked → `P001Error` 409 `PROFILE_CENTRE_LOCKED`); `save rejects an inactive centre with INVALID_LEARNING_CENTRE`; `options lists active learning centres`.
`scope-provider.test.ts`: `studentLearningCentreId reads the profile centre and returns null when unset`.
`system-snapshot.test.ts`: `students without a centre are excluded and counted under otherCentre` (centreOf → null).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- apps/api/src/modules/profile apps/api/src/modules/forecasting/scope-provider.test.ts apps/api/src/modules/forecasting/system-snapshot.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the API**

`validation.ts` `profileInput` adds `learningCentreId: positiveId(body.learningCentreId, 'Learning centre')`. `repository.ts`: `select` adds `p.learning_centre_id AS "learningCentreId"`; `find` runs one extra query for the next-semester window (`SELECT s.selection_opens_at, s.selection_closes_at FROM academic_semester s, academic_semester c WHERE c.is_current AND (s.academic_year, s.semester_no) > (c.academic_year, c.semester_no) ORDER BY s.academic_year, s.semester_no LIMIT 1`) and sets `learningCentreLocked`; `save` reads the existing row + lock first, throws `PROFILE_CENTRE_LOCKED`, then runs the upsert with `learning_centre_id` joined to `learning_centre … AND is_active`; when no row returns, probe centre existence/activity before the existing semester/curriculum probes → `INVALID_LEARNING_CENTRE`. `options` adds `learningCentres` (plain query in both branches). `createProfileReader` requires the centre. `scope-provider.ts` per Interfaces; delete `DEFAULT_STUDENT_CENTRE_ID`; fix `scope-provider.test-support.ts` (`studentLearningCentreId` stays `1` for the fixture) and the coordinator fixture note.

- [ ] **Step 4: Run the API tests**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write the failing browser checks**

`tools/p001/test-ui.mjs`: fixture `options.learningCentres = [{ learningCentreId: 1, centreCode: 'KL', centreName: 'DEMO Kuala Lumpur' }, { learningCentreId: 2, centreCode: 'JB', centreName: 'DEMO Johor Bahru' }]`, `profile.learningCentreId = 1`, `profile.learningCentreLocked = false`; checks: `setup requires a learning centre and sends it` (select `DEMO Johor Bahru`, saved body has `learningCentreId: 2`); `a saved profile without a learning centre asks for it` (status text `Add your learning centre to continue using the student pages.`); `a locked learning centre is disabled with an explanation` (`learningCentreLocked: true` → select disabled, help text visible, Save still works for other fields). `tools/integration/test-ui.mjs`: the setup flow selects the centre.

- [ ] **Step 6: Implement the page**

`ProfilePage.tsx`: `Draft.learningCentreId`; the select (`aria-label="Learning centre"`, options from `options.learningCentres`); lock handling; message; send `learningCentreId: Number(draft.learningCentreId)`; the Save button also requires `draft.learningCentreId`.

- [ ] **Step 7: Run the browser suites and full verification; record**

Run: `node tools/p001/test-ui.mjs && node tools/integration/test-ui.mjs --installed && node tools/coordinator/test-ui.mjs && npm run typecheck && npm run lint && npm test`. Expected: PASS. Fill S2-P004-023. Stop and report; do not commit.

---

### Task 8: Remove the old flow and refresh documentation

**Record:** create `docs/changes/S2-P004-024-remove-review-confirm-flow.md` first.

**Files:**
- Delete: `apps/web/src/features/coordinator/DecisionsPage.tsx`; `apps/api/src/modules/forecasting/runs-decisions.ts`, `offerings-routes.ts`, `offerings-repository.ts`, `offerings-contracts.ts`, `offerings-testing.ts`, `offerings-routes.test.ts`
- Modify: `apps/web/src/features/coordinator/CoordinatorRoutes.tsx` (groups: Workspace / Academic data (Data Imports, Data Quality) / Forecast planning (Class Offering Forecast only) / Audit; `pages` without versions, comparison, decisions; Overview quick links accordingly), `apps/web/src/features/admin/staff-navigation.tsx` (drop `versions`, `compare`, `decisions` icons if no longer referenced), `apps/web/src/features/coordinator/client.ts` (+ test; remove `listRuns`, `listAudit`, `startReview`, `decide` (old), `finalize`, `getConfirmation`, `listConfirmationAudit`, `pickCounts`, `confirmOfferings`, `withdrawOfferings`, `setPickDeadline` and their types), `coordinator-ui.tsx` (`ActionDialog` stays — Data Imports uses it), `coordinator.css` (classes only used by the deleted page), `apps/api/src/modules/forecasting/runs-routes.ts` (keep `POST forecast-runs`, `GET forecast-runs/{id}`, `GET …/subjects/{id}/students`; remove list, audit, reviews, decisions, finalizations; `RUN_ROUTE` becomes `/^forecast-runs(?:\/([1-9]\d*)(?:\/subjects\/([1-9]\d*)\/students)?)?$/`), `runs-repository.ts` + `runs-contracts.ts` + `runs-testing.ts` (remove `listRuns`, `listAudit`, `latestVersion`, `startReview`, `applyDecisions`, `finalize`, `DecisionPlan`, `RunExpectation`, guard SQL), `runs-view.ts` (remove `newerOf`, `summaryOfList`; `detailOf` takes no audit and sets `newerForecastAvailable: null`, `audit: []`, `auditTruncated: false` — keep the `ForecastRunDetail` shape so the fixtures and page stay valid), `runs-routes.test.ts`, `routes.ts` (drop `OFFERING_ROUTE`), `contracts.ts` (drop `offerings` dependency), `index.ts`, `errors.ts` (drop codes that no longer have a thrower: `RUN_REVISION_MISMATCH`, `RUN_FINALIZED`, `RUN_STATE_CONFLICT`, `DECISION_*` except `DECISION_SUBJECT_NOT_FOUND`/`DECISION_STALE`/`DECISION_CONFLICT`/`DECISION_FAILED`, `ALLOCATION_*`, `REVIEWS_INCOMPLETE`, `CONFIRMATION_*`, `RUN_NOT_FINALIZED`, `RUN_SCOPE_MISMATCH`, `SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE`, `SUBJECT_NOT_IN_RUN`, `OFFERING_NOT_CONFIRMED`, `PICK_DEADLINE_*`, `IF_MATCH_REQUIRED` if unused), `repository.database.test.ts` (remove review/finalize/confirmation sections), `tools/coordinator/fixtures.mjs` (remove `handleConfirmation`, review/finalize mutation, `seed: 'review' | 'finalized' | 'confirmed'`), `tools/coordinator/test-ui.mjs` (remove `decisions:` checks and `mobile: offering decisions …`), `tools/admin/test-ui.mjs` (`coordinator quick links` check: the planned routes are now Data Quality and Decision Audit), `docs/api/forecasting-uc20.openapi.json` (remove the deleted paths; keep the new ones), `docs/cachingguide.md` (rule 8: replace the confirmed-offerings paragraph with the approved-offerings behaviour and the `v6` marker; rule 9: add the pickers list cache `semesterId|subjectId`), `docs/database/data-contracts.md` and `docs/offerings/integration.md` (pick deadline → admin selection window; confirmed → approved), `README.md` line 80/82 feature rows, `docs/implementationguide.md` section 2 owner table (P002 and P004 descriptions mention approved offerings and the selection window), `packages/shared/src/forecasting/confirmed-offerings.ts` and `packages/shared/src/offerings/confirmed-offerings.ts` (header comment: superseded by `forecasting/offering-decisions.ts` and the selection window; keep the exports other modules still import — `CoordinatorAssignment`, `nextSemesterAfter`, `CONFIRMED_OFFERING_*` — and delete only validators/types with no remaining importer)
- Keep untouched: migration 0007 tables and triggers (documented as unused), `proposed_class_section` writes in `createRun`, `forecast_run.status` (always `DRAFT` from now on).

- [ ] **Step 1: Delete the web page and navigation entries; update the admin and coordinator browser checks**

Run: `node tools/admin/test-ui.mjs && node tools/coordinator/test-ui.mjs`. Expected: PASS after the check edits (the `decisions:` group is gone; `/coordinator/decisions` now renders "Page not found").

- [ ] **Step 2: Delete the API routes, repositories and tests; prune the client**

Use `npm run typecheck` as the guide: every removed export must leave no importer. Update `runs-routes.test.ts` (list/audit/review/decide/finalize cases removed; detail still returns `ETag`). Keep `revisionOf` only if `detail` still sets the `ETag` (it may; the page ignores it).

Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.

- [ ] **Step 3: Refresh documentation**

Apply the doc edits listed under Files. In `docs/api/forecasting-uc20.openapi.json` update the `info.description` to describe the three-step flow. Add a short "Superseded" note to `docs/changes/S2-P004-006-confirmed-offerings-rule.md`, `S2-P004-007-…`, `S2-P004-013-…` pointing at S2-P004-017…024 (one line each; do not rewrite history).

- [ ] **Step 4: Run every suite, fill the record**

Run: `npm run typecheck && npm run lint && npm test && node tools/coordinator/test-ui.mjs && node tools/p001/test-ui.mjs && node tools/integration/test-ui.mjs --installed && node tools/offerings/test-ui.mjs && node tools/admin/test-ui.mjs && node tools/auth/test-ui.mjs && node tools/pathway/test-ui.mjs`. Expected: all PASS. Fill S2-P004-024 (Type: Removed / Docs) and list the 0007 tables as retained-unused. Stop and report; do not commit.

---

## Self-review notes (plan author)

- Spec coverage: 5.1 → Task 1; 5.2 unchanged; 5.3 header/table/decisions/toolbar/audit → Task 4, open/closed/Picked/pickers → Tasks 3 + 5; 5.4 → Task 6; 5.5 → Task 7 (lock rule = section 9 last bullet); 6 → Task 8; 7 constraints → Global Constraints; 8 builder calls → Architecture (new tables, stored runs, 0007 kept unused, withdrawal table, wording pinned in each task, migration 0009, API shapes in Task 2/3/6 Interfaces); 9 → accepted as written (one window per semester, no semester picker (owner answer), pending not shown, no reason column, "not in this snapshot", lock until the semester advances).
- Type consistency: `OfferingDecisionStatus`, `OfferingDecisionSet`, `DecideOfferingRequest`, `DecideOfferingResult`, `OfferingDecisionAuditEntry`, `OfferingPickers`, `SelectionPhase`, `SelectionWindow`, `OfferingWindow` are defined once (Tasks 1, 2, 3, 6) and used by name afterwards; client method names `getDecisions` / `decide` / `listDecisionAudit` / `getPickers` are consistent between Tasks 4 and 5.
