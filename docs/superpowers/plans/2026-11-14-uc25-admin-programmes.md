# UC25 Admin Programmes and Curriculums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an audited `/admin/programmes` page where a System Administrator creates, edits and deactivates programmes and their curriculum versions, completing the UC25 Faculty → Department → Programme → Curriculum chain.

**Architecture:** Extend the existing admin academic-setup stack end to end: migration 0012 (status cleanup + audit coverage) → shared contracts/validators in `packages/shared/src/admin/academic-setup.ts` → repository/routes under `/api/admin/academic-setup` → web client and a new `ProgrammesPage` built from `academic-ui.tsx` (`SetupCard`/`SetupTable`/`SetupForm`/`ReasonDialog`).

**Tech Stack:** TypeScript, React, Cloudflare Worker API, Neon PostgreSQL (plpgsql triggers), Vitest, node:test, Playwright UI checks.

**Spec:** `docs/superpowers/specs/2026-11-14-uc25-admin-programmes-design.md`

## Global Constraints

- SYSTEM_ADMIN only; every write goes through `write(actor, reason, ...)` so `app.access_actor` / `app.access_reason` are set and audited in the same transaction.
- Statuses written by the app: `'ACTIVE'` / `'INACTIVE'`. Read rule everywhere: `coalesce(upper(status),'ACTIVE')='ACTIVE'` means active.
- Keep all current rows. Only data change: `UPDATE public.curriculum SET status='ACTIVE' WHERE status IS NULL`.
- Do not edit migrations 0000–0011. No hard delete. No new public tables or columns.
- `tools/db/import-reference.mjs` writes programmes/curricula without actor context and must keep working: new audit/guard logic applies only when the actor context is set, except the pre-existing faculty/department rules.
- Deactivating never moves or clears students; it only stops new assignments (0011 already filters inactive programme/curriculum).
- UI: typography tokens from `apps/web/src/app/typography.css`, `assertReadable` in UI checks, ≥44px controls, no table toolbar (no filter/search/sort).
- Limits: programme code ≤20, name ≤255, level ≤50 or null; curriculum version ≤20, total credits integer 0–1000, effective year null or 1900–2100.

## Review Focus

1. Importer path: inserting a programme/curriculum or flipping `status` with **no** actor context must still succeed and write no audit row (test in Task 1 check 017).
2. Deactivated programme with a live coordinator assignment: deactivation succeeds; the scope reader already drops it (existing `scopeSelect`). Pin with a repository DB test (Task 3).
3. Creating a curriculum under an inactive programme → `409 REFERENCE_INACTIVE` (Task 1 guard, Task 3 route test).
4. Duplicate programme code / duplicate (programme, version) → `409 CONFLICT`, dialog shows the message and keeps input (Task 3 test, Task 5 UI check).
5. Legacy programme with `status NULL` or no department renders as Active / "No department" and can be edited without forcing a department (Task 4 client test, Task 5 fixture row).

---

### Task 1: Migration 0012 — curriculum status cleanup and audit coverage

**Files:**
- Create: `db/migrations/0012_programme_curriculum_admin.sql`
- Create: `db/checks/017_programme_curriculum_admin.sql`
- Modify: `db/migrations/manifest.json` (append 0012), `db/engineering-extensions.json` (append 0012 entry, `"tables": []`)
- Modify: `tools/db/cli.mjs:36` and `tools/db/review.mjs:95` (add `017_programme_curriculum_admin.sql` to the check lists)
- Test: `tools/db/migrations.test.mjs` (version list line 31; 0011 test at line 195 must locate 0011 by version instead of `.at(-1)`; new 0012 test)

**Interfaces:**
- Produces: DB behaviour Task 3 relies on — audited programme INSERT/UPDATE of any column and curriculum INSERT/UPDATE when actor context is set; `ACADEMIC_SETUP:REFERENCE_INACTIVE` (SQLSTATE 23514) when a curriculum is inserted with context under an inactive programme.

- [ ] **Step 1: Write the failing tooling test** in `tools/db/migrations.test.mjs`:

```js
test('0012 follows 0011, adds no table, activates NULL curricula and audits programme/curriculum',async()=>{
 const entries=await loadMigrations();assert.deepEqual(entries.slice(-2).map(m=>m.version),['0011','0012']);
 const sql=entries.at(-1).sql, code=sql.replace(/--.*$/gm,'');
 assert.doesNotMatch(code,/CREATE\s+TABLE|DROP\s+(?:TABLE|COLUMN)|TRUNCATE|ALTER\s+TABLE/i);
 assert.match(code,/UPDATE public\.curriculum SET status='ACTIVE' WHERE status IS NULL;/);
 assert.match(code,/CREATE TRIGGER academic_programme_audit AFTER INSERT OR UPDATE ON public\.programme/);
 assert.match(code,/CREATE TRIGGER academic_curriculum_audit AFTER INSERT OR UPDATE ON public\.curriculum/);
 assert.match(code,/CREATE TRIGGER academic_curriculum_guard BEFORE INSERT OR UPDATE OF programme_id ON public\.curriculum/);
 const applied=entries.slice(0,-1).map(m=>({version:m.version,filename:m.file,sha256:m.sha256}));
 assert.deepEqual((await migrationStatus(client({applied}),entries)).pending.map(m=>m.version),['0012']);
});
```
Also extend the line-31 version list with `'0012'`, and in the 0011 test replace `entries.slice(-2)` / `entries.at(-1)` with `entries.find(m=>m.version==='0011')` (and its predecessor), keeping its assertions.

- [ ] **Step 2: Run** `npm run test:db-tooling` — Expected: FAIL (0012 missing).

- [ ] **Step 3: Write `0012_programme_curriculum_admin.sql`**, in this order:
  1. Header comment: `-- S2-P001-005 (UC25 / FR-B9, built by P004): admin programme and curriculum maintenance. ...`
  2. `UPDATE public.curriculum SET status='ACTIVE' WHERE status IS NULL;` (before any curriculum trigger exists).
  3. `CREATE OR REPLACE FUNCTION public.db_academic_setup_audit()` — copy of the 0010 body with these changes only:
     - New local `has_context boolean := nullif(btrim(current_setting('app.access_actor',true)),'') IS NOT NULL AND nullif(btrim(current_setting('app.access_reason',true)),'') IS NOT NULL;`
     - Programme branch: if the change touches `faculty_id`/`department_id` (INSERT with either non-null, or UPDATE where either is distinct) keep the existing behaviour (context required via `PERFORM public.db_academic_setup_context()`); otherwise `IF NOT has_context THEN RETURN NEW; END IF;` then audit.
     - Curriculum branch: `IF TG_TABLE_NAME='curriculum' AND NOT has_context THEN RETURN NEW; END IF;`
     - `key_name` CASE gains `WHEN 'curriculum' THEN 'curriculum_id'`.
  4. `DROP TRIGGER academic_programme_audit ON public.programme;` then `CREATE TRIGGER academic_programme_audit AFTER INSERT OR UPDATE ON public.programme FOR EACH ROW EXECUTE FUNCTION public.db_academic_setup_audit();`
  5. `CREATE TRIGGER academic_curriculum_audit AFTER INSERT OR UPDATE ON public.curriculum FOR EACH ROW EXECUTE FUNCTION public.db_academic_setup_audit();`
  6. `CREATE FUNCTION public.db_academic_curriculum_guard()`: when actor context is set and (INSERT or `programme_id` changed), `SELECT status FROM public.programme WHERE programme_id=NEW.programme_id FOR SHARE`; not found → `ACADEMIC_SETUP:NOT_FOUND`, inactive → `ACADEMIC_SETUP:REFERENCE_INACTIVE` (both `ERRCODE='23514'`); no context → `RETURN NEW`. Trigger `academic_curriculum_guard BEFORE INSERT OR UPDATE OF programme_id ON public.curriculum`.
  7. `REVOKE EXECUTE ON FUNCTION public.db_academic_curriculum_guard() FROM PUBLIC;`

- [ ] **Step 4: Append manifest entry** `{"version":"0012","file":"0012_programme_curriculum_admin.sql","description":"UC25 admin programmes and curricula: NULL curriculum status set ACTIVE, audited programme/curriculum changes and active-programme guard"}` and the engineering-extensions entry (`"tables": []`, purpose naming S2-P001-005).

- [ ] **Step 5: Write `db/checks/017_programme_curriculum_admin.sql`** (structure only, read-only, `test_name`/`status` rows like `016`): both new triggers exist and are enabled; guard has no PUBLIC execute; audit function source contains `'curriculum_id'`; `NOT EXISTS (SELECT 1 FROM public.curriculum WHERE status IS NULL)`. Behaviour (no-context insert writes no audit row; context insert under an inactive programme raises REFERENCE_INACTIVE) is covered by the gated repository DB test in Task 3.

- [ ] **Step 6: Run** `npm run test:db-tooling` and `npm run lint:db` — Expected: PASS.

- [ ] **Step 7: Commit** `feat(db): migration 0012 audits programme and curriculum changes, sets NULL curriculum status ACTIVE (S2-P001-005)`.

- [ ] **Step 8: Apply to the shared Neon dev database** (owner-approved in conversation): load `DB_FOUNDATION_URL` from `.wrangler/db-foundation/neon-dev.env` (strip `\r`), then `node tools/db/cli.mjs migrate --target .wrangler/db-foundation/target.json --websocket` and `node tools/db/cli.mjs verify ... --websocket`. Expected: applied `["0012"]`, verify all PASS, `status` shows pending `[]`.

### Task 2: Shared contracts and validators

**Files:**
- Modify: `packages/shared/src/admin/academic-setup.ts`
- Test: `packages/shared/src/admin/academic-setup.test.ts`

**Interfaces:**
- Produces:
  - `ProgrammeFaculty` gains `level: string | null; isActive: boolean`.
  - `interface Curriculum { curriculumId: number; programmeId: number; curriculumVersion: string; totalCreditRequired: number; effectiveYear: number | null; isActive: boolean; subjectCount: number }`
  - `interface CreateProgrammeRequest { programmeCode: string; programmeName: string; level: string | null; departmentId: number; reason: string }`
  - `interface UpdateProgrammeRequest { programmeCode?: string; programmeName?: string; level?: string | null; isActive?: boolean; reason: string }`
  - `interface CreateCurriculumRequest { programmeId: number; curriculumVersion: string; totalCreditRequired: number; effectiveYear: number | null; reason: string }`
  - `interface UpdateCurriculumRequest { curriculumVersion?: string; totalCreditRequired?: number; effectiveYear?: number | null; isActive?: boolean; reason: string }`
  - `validateCreateProgrammeRequest`, `validateUpdateProgrammeRequest`, `validateCreateCurriculumRequest`, `validateUpdateCurriculumRequest`, each `(body: unknown) => AdminValidation<…>`.

- [ ] **Step 1: Write failing tests** (one `describe('programme and curriculum validators')`):
  - create programme trims and accepts `{programmeCode:' SECX ',programmeName:'Fictional',level:null,departmentId:1,reason:'r'}` → `programmeCode:'SECX'`.
  - rejects: code of 21 chars (`'Invalid programmeCode.'`), missing `departmentId` (`'Invalid departmentId.'`), level of 51 chars (`'Invalid level.'`), unknown field `status` (`'Unknown field: status.'`), blank reason.
  - update programme: `{reason:'r'}` alone → `'At least one change is required.'`; `{isActive:false,reason:'r'}` ok; `{level:'',reason:'r'}` → level `null` (blank level clears it).
  - create curriculum: `totalCreditRequired` `-1`, `1001`, `1.5` → `'Invalid totalCreditRequired.'`; `effectiveYear` `1899` → `'Invalid effectiveYear.'`; `null` ok.
  - update curriculum: `programmeId` present → `'Unknown field: programmeId.'` (programme is fixed after creation).
- [ ] **Step 2: Run** `npx vitest run packages/shared/src/admin/academic-setup.test.ts --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the types and validators next to the department validator, reusing `record`, `reason`, `label`, `id`, `own`, `fail`. Level: string trimmed ≤50, empty string → `null`.
- [ ] **Step 4: Run the test** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): programme and curriculum setup contracts (S2-P001-005)`.

### Task 3: API repository and routes

**Files:**
- Modify: `apps/api/src/modules/admin/academic-contracts.ts`, `academic-repository.ts`, `academic-routes.ts`
- Test: `academic-repository.test.ts`, `academic-routes.test.ts`, `academic-repository.database.test.ts` (gated), plus any mock repositories implementing `AcademicSetupRepository` that typecheck flags (e.g. `academic-integration.test.ts`)

**Interfaces:**
- Consumes: Task 2 types; Task 1 DB guards.
- Produces (`AcademicSetupRepository`):
  - `createProgramme(input: C.CreateProgrammeRequest, actor: string): Promise<C.ProgrammeFaculty>`
  - `updateProgramme(id: number, input: C.UpdateProgrammeRequest, actor: string): Promise<C.ProgrammeFaculty>`
  - `listCurricula(): Promise<C.Curriculum[]>`
  - `createCurriculum(input: C.CreateCurriculumRequest, actor: string): Promise<C.Curriculum>`
  - `updateCurriculum(id: number, input: C.UpdateCurriculumRequest, actor: string): Promise<C.Curriculum>`
- Produces (HTTP, under `/api/admin/academic-setup`): `POST /programmes` (201), `PATCH /programmes/{id}`, `GET /curricula`, `POST /curricula` (201), `PATCH /curricula/{id}`. Existing `GET /programmes` and `PATCH /programmes/{id}/department` unchanged.

- [ ] **Step 1: Write failing route tests** in `academic-routes.test.ts`, extending its existing table of `{path, method, repo, body, args, data}` cases with the five new routes (e.g. `{ path: '/curricula/4', method: 'PATCH', repo: 'updateCurriculum', body: { isActive: false, reason }, args: [4, { isActive: false, reason }, ACTOR] }`), plus: `GET /curricula?x=1` → 400; `PUT /curricula` → 405 with `Allow: GET, POST`.
- [ ] **Step 2: Write failing repository unit tests** in `academic-repository.test.ts` (mock `query`/`transaction` as the file does): `updateProgramme(9,{isActive:false,reason})` issues `UPDATE public.programme SET status=$2 WHERE programme_id=$1` with `'INACTIVE'`; `createProgramme` inserts `faculty_id` from the department sub-select; `listCurricula` maps `status NULL` → `isActive:true` and `subjectCount` to a number.
- [ ] **Step 3: Run** `npx vitest run apps/api/src/modules/admin --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `programmeSelect` adds `p.level AS "level", coalesce(upper(p.status),'ACTIVE')='ACTIVE' AS "programmeIsActive"`; `programme()` maps them.
  - `createProgramme`: one statement, `WITH created AS (INSERT INTO public.programme(programme_code,programme_name,level,status,department_id,faculty_id) SELECT $1,$2,$3,'ACTIVE',d.department_id,d.faculty_id FROM public.department d WHERE d.department_id=$4 RETURNING *)`, followed by the programme select columns reading from `created` (joined to faculty/department). Zero rows (unknown department) → `NOT_FOUND`; inactive department → the existing 0010 guard's `REFERENCE_INACTIVE`.
  - `updateProgramme` / `updateCurriculum`: translate `isActive` to `status` (`'ACTIVE'|'INACTIVE'`) before `patch(...)`; field maps `{programmeCode:'programme_code',programmeName:'programme_name',level:'level',status:'status'}` and `{curriculumVersion:'curriculum_version',totalCreditRequired:'total_credit_required',effectiveYear:'effective_year',status:'status'}`. Programme update returns via a second `programmeSelect` statement like `setProgrammeDepartment`.
  - Curriculum columns: `curriculum_id, programme_id, curriculum_version, total_credit_required, effective_year, coalesce(upper(status),'ACTIVE')='ACTIVE' AS "isActive", (SELECT count(*) FROM public.curriculum_subject cs WHERE cs.curriculum_id=c.curriculum_id)::int AS "subjectCount"`; list ordered by programme code then version.
  - `createCurriculum`: `INSERT ... VALUES ($1,$2,$3,'ACTIVE',$4)`; the 0012 guard raises `REFERENCE_INACTIVE` for an inactive programme; FK miss → `NOT_FOUND`; unique `(programme_id, curriculum_version)` → `CONFLICT` (existing mapper).
  - Routes: add the entries above; extend the id regex alternation with `curricula`; `programmes/{id}` with no suffix → `PATCH updateProgramme`.
- [ ] **Step 5: Add gated DB tests** in `academic-repository.database.test.ts` (run only with `AUTH_TEST_DATABASE_URL`, inside its existing rollback harness): create programme under an active department writes one `academic_setup_audit_log` row `entity_type='programme', action='INSERT'`; deactivating it writes `action='UPDATE'` and the scope reader no longer lists an existing live assignment for it; `createCurriculum` under that inactive programme rejects `REFERENCE_INACTIVE`; a raw `INSERT INTO public.curriculum` with no actor context succeeds and writes no audit row.
- [ ] **Step 6: Run** `npm run typecheck` and `npx vitest run apps/api/src/modules/admin --config vitest.auth.config.ts` — Expected: PASS (DB tests skipped without the env var).
- [ ] **Step 7: Commit** `feat(api): admin programme and curriculum create, edit and deactivate (S2-P001-005)`.

### Task 4: Web client, Programmes page, navigation

**Files:**
- Modify: `apps/web/src/features/admin/academic-client.ts` (+ `academic-client.test.ts`)
- Create: `apps/web/src/features/admin/ProgrammesPage.tsx`
- Modify: `apps/web/src/features/admin/DepartmentsPage.tsx` (remove the "Programme departments" section and its dialog/state), `AdminShell.tsx:6` (add `{ href: '/admin/programmes', label: 'Programmes', icon: 'curriculum' }` after Departments), `AdminRoutes.tsx` (title `'/admin/programmes': 'Programmes'`, render `<ProgrammesPage client={academic}/>`; pass `initialCurriculumId={location.searchParams.get('curriculum') ?? ''}` to `CurriculumPage`)
- Modify: `apps/web/src/features/p001-sprint2/CurriculumPage.tsx` (optional prop `initialCurriculumId?: string`, used as the initial `id` state and loaded on mount when it matches a catalogue entry; P003 file, minimal change)

**Interfaces:**
- Consumes: Task 3 HTTP routes, Task 2 types.
- Produces (client): `createProgramme(input)`, `updateProgramme(id, input)`, `curricula(signal?)`, `createCurriculum(input)`, `updateCurriculum(id, input)`; `programme()` decoder validates `level` (string|null) and `isActive` (boolean).

- [ ] **Step 1: Write failing client tests** in `academic-client.test.ts`: `curricula()` GETs `/api/admin/academic-setup/curricula` and decodes `effectiveYear:null`; a curriculum row missing `subjectCount` → `INVALID_RESPONSE`; `updateProgramme(3,{isActive:false,reason:'r'})` sends `PATCH /programmes/3` with that JSON; a programme row with `level:null,isActive:true,departmentId:null,department:null` decodes (legacy row).
- [ ] **Step 2: Run** `npx vitest run apps/web/src/features/admin --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 3: Implement the client methods**, then `ProgrammesPage({ client }: { client: AcademicSetupClient })` modelled on `DepartmentsPage`:
  - One `useSetupRead` loading faculties, departments, programmes, curricula; key `'programmes'`.
  - `SetupCard title="Programmes"`, action button **Add programme**.
  - Programmes `SetupTable label="Programmes"` headings `['Code','Name','Level','Department','Faculty','Status','Actions']`; Department cell `department?.departmentName ?? 'No department'`; row actions **Edit**, **Department**, **Deactivate**/**Reactivate** with accessible names `Edit SECJ`, `Department SECJ`, `Deactivate SECJ`.
  - Add/Edit programme `SetupForm`: fields code, name, level (optional); Add also has Department (required, active only). Department action reuses the moved assignment dialog (`setProgrammeDepartment`, "None clears the assignment").
  - `<h2>Curriculums</h2>` + **Add curriculum** button; `SetupTable label="Curriculums"` headings `['Programme','Version','Total credits','Effective year','Status','Subjects','Actions']`; Subjects cell is a link `href={'/admin/curriculum?curriculum=' + id}` reading `"{n} subjects"`; actions **Edit**, **Deactivate**/**Reactivate**.
  - Add curriculum form: Programme (required, active programmes only), Version, Total credits (`type="number"`), Effective year (optional number). Edit omits Programme.
  - Deactivate/Reactivate via `ReasonDialog` (as Departments). Success message `'Academic setup saved.'` and `state.refresh()`.
- [ ] **Step 4: Run** `npm run typecheck`, `npm run lint`, and the web vitest command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): admin Programmes page with curriculums; department assignment moves from Departments (S2-P001-005)`.

### Task 5: UI fixtures and browser checks

**Files:**
- Modify: `tools/admin/academic-fixtures.mjs` (programme rows gain `level`, `isActive`; add a legacy row `{ programmeId: 2, programmeCode: 'LEGACY', programmeName: 'Fictional legacy programme', level: null, isActive: true, facultyId: null, departmentId: null }`; `curricula` collection with handlers for GET/POST/PATCH and programme POST/PATCH mirroring the API errors: duplicate code → 409 `CONFLICT`, curriculum under inactive programme → 409 `REFERENCE_INACTIVE`)
- Modify: `tools/admin/academic-ui-checks.mjs` (add `['programmes','Programmes','Add programme']` to `routes`; move the existing "programme department" check to `/admin/programmes`; new check below)
- Modify: `tools/admin/test-ui.mjs` only if its route/count assertions need the new page

- [ ] **Step 1: Write the new check** `programmes: create/edit/deactivate programme, legacy row, curriculum create/edit/deactivate, inactive-programme and duplicate errors, subjects link`: Add programme dialog focuses "Programme code"; duplicate `TEST` shows "Code already exists." and keeps the typed name; create `NEWP` → row appears; legacy row shows "No department" and edits without a department; deactivate `NEWP` → status "Inactive", then Add curriculum lists only active programmes; PATCH a curriculum's total credits; Subjects link `href` is `/admin/curriculum?curriculum=1`; `assertReadable(page)` and screenshots `.wrangler/admin-review/academic-programmes-{desktop,mobile}.png` at 1440 and 375.
- [ ] **Step 2: Run** `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:admin` — Expected: FAIL on the new check before fixtures/page are complete, PASS after.
- [ ] **Step 3: Commit** `test(admin): Programmes page browser checks and fixtures (S2-P001-005)`.

### Task 6: Change record, docs and full verification

**Files:**
- Create: `docs/changes/S2-P001-005-uc25-admin-programmes.md` (Plan / Implementation / Review / Changelog, Owner `P001 (UC25 / FR-B9); built by P004`, Status `READY_FOR_REVIEW`)
- Modify: `README.md` Sprint 2 table (row: `P004 (for P001 UC25 / FR-B9)` | admin Programmes page: programmes and curriculum versions create/edit/deactivate, department assignment moved here, audited; migration 0012 | `S2-P001-005`), and the Departments row wording ("programmes are assigned on the Programmes page")
- Modify: `docs/database/migrations.md` if it lists migrations by number

- [ ] **Step 1:** Write the change record with actual evidence from Tasks 1–5 (commands and pass counts).
- [ ] **Step 2: Full verification:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:db-tooling`, `npm run build`, `npm run check:cloudflare`, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:admin`. Expected: all PASS; record counts.
- [ ] **Step 3: Commit** `docs: S2-P001-005 change record and README`.
