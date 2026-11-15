# UC13 Graduation Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student "Graduation check" page that judges credits from records and saves the student's own fees-cleared and MUET confirmations.

**Architecture:** Migration 0013 adds two nullable timestamps to `student_profile` → a new API module `apps/api/src/modules/graduation/` reuses the UC05 progress source and `calculateProgress` for credits, reads/writes the two timestamps, and is wired through the shared router and `tools/integration/prepare.mjs` → a new web feature `apps/web/src/features/graduation/` renders `/student/graduation` in the student shell.

**Tech Stack:** TypeScript, React, Cloudflare Worker API, Neon PostgreSQL, Vitest, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-uc13-graduation-check-design.md`

## Global Constraints

- Do NOT edit `docs/System Documents/*`. Never touch the shared Neon database: no migration apply, no live queries. The controller applies migrations.
- Never commit `.dev.vars`, `.env.local`, `.wrangler`, secrets.
- Credits met = earned credits (`calculateProgress(source).earnedCredits`, COMPLETED + EXEMPTED recognised credits) >= curriculum `total_credit_required`. Required credits missing or 0 → `CANNOT_ASSESS`, never `ELIGIBLE`.
- Eligible = credits met AND fees confirmed AND MUET confirmed.
- Ticking stores the current time; ticking an already-ticked box keeps its original time; unticking clears it. Only the signed-in student's own row changes.
- Exact copy: menu label and page title `Graduation check`; status labels `Eligible to graduate` / `Not yet eligible` / `Cannot assess`; checkbox labels `I have no outstanding fees (no debt)` and `I have my MUET certificate`; confirmation text `confirmed <D Mon YYYY>` (en-GB, `Asia/Kuala_Lumpur`, e.g. `confirmed 15 Nov 2026`) or `not confirmed`; note `Based on your recorded subjects and your own confirmations. Not an official UTMSPACE graduation decision.`
- `missing` strings (in this order, only those that apply): `The programme credit requirement is not configured.` / `<N> more credits needed.` / `Confirm you have no outstanding fees.` / `Confirm you have your MUET certificate.`
- UI: student template classes, typography tokens from `apps/web/src/app/typography.css`, controls >= 44px, `assertReadable` in UI checks (`docs/themeguide.md`).

## Review Focus

1. Re-sending `true` for an already-confirmed item keeps the original date (Task 2 `nextConfirmations` test).
2. Required credits 0 or null with both ticks → `CANNOT_ASSESS`, not `ELIGIBLE` (Task 2 `assessGraduation` test).
3. Body with an extra field, a missing field or a non-boolean → 400 `VALIDATION_ERROR`, repository save not called (Task 2 route test).
4. Save request fails → the checkbox reverts to its saved state and an error with retry shows (Task 3 UI check).
5. Real shared router dispatches both paths and fails closed with student authorization when the feature is absent (Task 2 router test) — the S2-P001-006 progress 404 came from a missing router entry that mocked UI checks could not see.

---

### Task 1: Migration 0013 — confirmation timestamps

**Files:** Create `db/migrations/0013_graduation_confirmations.sql`, `db/checks/018_graduation_confirmations.sql`; modify `db/migrations/manifest.json`, `tools/db/migrations.test.mjs`.

- [ ] Step 1: in `tools/db/migrations.test.mjs` extend the version list assertion (line ~31) with `'0013'` and add `test('0013 follows 0012 and only adds two nullable student_profile timestamps', …)` modelled on the 0012 test: last two versions `['0012','0013']`, pending `['0013']` when 0000–0012 applied, the SQL text contains `ADD COLUMN IF NOT EXISTS fees_cleared_confirmed_at timestamptz` and `ADD COLUMN IF NOT EXISTS muet_confirmed_at timestamptz` and contains no `CREATE TABLE`, `DEFAULT` or `NOT NULL` for these columns.
- [ ] Step 2: `npm run test:db-tooling` — FAIL.
- [ ] Step 3: migration: header comment (S3-P004-001, UC13, rollback = drop both columns), `ALTER TABLE public.student_profile ADD COLUMN IF NOT EXISTS fees_cleared_confirmed_at timestamptz, ADD COLUMN IF NOT EXISTS muet_confirmed_at timestamptz;`. Manifest entry version `0013`, description `UC13 graduation check: student-confirmed fees-cleared and MUET timestamps on student_profile`. Check file `018` in the 016/017 style (runner owns READ ONLY/ROLLBACK): both columns exist, type `timestamptz`, nullable, no default; `student_profile` still has no PUBLIC privileges; `preserve_student_curriculum` trigger still enabled.
- [ ] Step 4: `npm run test:db-tooling` — PASS. Commit `feat(db): 0013 graduation confirmation timestamps on student_profile (S3-P004-001)`.

### Task 2: Graduation API module and routing

**Files:**
- Create `apps/api/src/modules/graduation/{contracts.ts,assess.ts,repository.ts,routes.ts,index.ts,graduation.test.ts}`.
- Modify `apps/api/src/integration/router.ts` (+ `router.test.ts`), `tools/integration/prepare.mjs`.

**Interfaces (produced):**
- `type GraduationStatus = 'ELIGIBLE' | 'NOT_YET_ELIGIBLE' | 'CANNOT_ASSESS'`
- `interface Confirmations { feesClearedConfirmedAt: string | null; muetConfirmedAt: string | null }` (ISO strings)
- `interface GraduationCheck extends Confirmations { requiredCredits: number | null; earnedCredits: number; remainingCredits: number | null; creditsMet: boolean | null; status: GraduationStatus; missing: string[] }`
- `assessGraduation(progress: Progress, confirmations: Confirmations): GraduationCheck` (`Progress` from `../p001-sprint2/contracts`; required/remaining = `progress.totalCredits`/`progress.remainingCredits`).
- `nextConfirmations(current: Confirmations, input: { feesCleared: boolean; muet: boolean }, now: Date): Confirmations` — true keeps an existing value, else `now.toISOString()`; false → null.
- `interface GraduationRepository { source(clerkUserId: string): Promise<{ progress: ProgressSource; confirmations: Confirmations } | null>; save(clerkUserId: string, value: Confirmations): Promise<boolean> }` — `source` reuses `progressSql` from `../p001-sprint2/repository` plus a select of the two columns for the same `clerk_user_id`; `save` is one `UPDATE public.student_profile SET fees_cleared_confirmed_at=$2, muet_confirmed_at=$3 WHERE clerk_user_id=$1` returning whether a row changed. Reuse `neonDatabase` and `databaseError` from p001-sprint2.
- `handleGraduationRequest(request: Request, deps: { auth: AuthDependencies; repository: GraduationRepository; now?: () => Date }): Promise<Response | null>` — null unless the path is `/api/graduation-check` or `/api/graduation-check/confirmations`. `authorize(..., { roles: ['STUDENT'], requireProfile: true })`. `GET /api/graduation-check` → `{ data: GraduationCheck }`; `PUT …/confirmations` → validate with `jsonBody` + `fields(body, ['feesCleared','muet'])`, both must be booleans (else 400 `VALIDATION_ERROR` via `P001Error`), compute `nextConfirmations`, `save`, respond `{ data: GraduationCheck }`. No profile row → 403 `PROFILE_SETUP_REQUIRED`. Other methods → 405. Errors through `authErrorResponse`, as p001-sprint2 `routes.ts` does.
- Router: `IntegratedServices` gains `graduation?: FeatureHandler`; both paths dispatch to it; absent → `authorize` STUDENT then 503 `FEATURE_NOT_INSTALLED` (same shape as the progress block). `prepare.mjs`: feature `graduationApi` = `entry('apps/api/src/modules/graduation','apps/api/src/modules/graduation/index.ts')`, import `createGraduationHandler` and add `graduation: createGraduationHandler(env, auth),` (`createGraduationHandler(env: AuthBindings, auth: AuthDependencies): FeatureHandler` in `index.ts`).

- [ ] Step 1: failing tests in `graduation.test.ts`:
  - `assessGraduation`: earned 120/required 120 + both ticks → `ELIGIBLE`, `missing: []`; earned 98/120, no ticks → `NOT_YET_ELIGIBLE`, `missing` = `['22 more credits needed.','Confirm you have no outstanding fees.','Confirm you have your MUET certificate.']`, `creditsMet:false`; earned 130/120 → `creditsMet:true`, `remainingCredits:0`; `totalCredits:null` + both ticks → `CANNOT_ASSESS`, `creditsMet:null`, first missing `The programme credit requirement is not configured.`
  - `nextConfirmations`: true over existing `'2026-01-01T00:00:00.000Z'` keeps it; true over null → `now`; false → null.
  - routes (fake auth + fake repository): GET 200 shape; PUT `{feesCleared:true,muet:false}` saves and returns the new state; PUT with `{feesCleared:true}`, `{feesCleared:'yes',muet:false}`, `{feesCleared:true,muet:false,studentId:1}` → 400 and `save` not called; COORDINATOR → 403; source null → 403 `PROFILE_SETUP_REQUIRED`; POST → 405.
  - `router.test.ts`: both paths dispatch to `graduation`; absent feature with a SYSTEM_ADMIN identity rejects 403.
- [ ] Step 2: `npx vitest run apps/api/src/modules/graduation apps/api/src/integration/router.test.ts` — FAIL. Step 3: implement. Step 4: same command + `npm run typecheck` + `npm run check:cloudflare` — PASS; `.generated-integration/status.json` shows `"graduationApi": true`.
- [ ] Step 5: commit `feat(api): UC13 graduation check API with saved confirmations (S3-P004-001)`.

### Task 3: Graduation check page

**Files:** Create `apps/web/src/features/graduation/{client.ts,GraduationPage.tsx,graduation-page.css,client.test.ts}`; modify `apps/web/src/app/StudentRoutes.tsx` (`StudentArea` gains `'graduation'`, title `Graduation check`, `requireProfile` true), `AppRoutes.tsx` (`/student/graduation`), `StudentShell.tsx` (menu item after Academic progress, an existing icon), `tools/integration/test-ui.mjs`.

**Interfaces:** `createGraduationClient(getToken, apiBase): { load(): Promise<GraduationCheck>; save(input: { feesCleared: boolean; muet: boolean }): Promise<GraduationCheck> }` — follow `features/p001-sprint2/client.ts` (auth header, error mapping). Web keeps its own copy of the `GraduationCheck` type (web does not import from `apps/api`; check how `p001-sprint2/client.ts` types `Progress`).

- [ ] Step 1: `client.test.ts`: `load` GETs `/api/graduation-check`; `save` PUTs `/api/graduation-check/confirmations` with JSON `{feesCleared,muet}`; a 400/503 rejects with the server message.
- [ ] Step 2: run — FAIL. Step 3: implement client and page: status label, credits (`<earned> of <required> credits earned`, `<remaining> remaining`, a `<progress>` bar only when required is set), the `missing` list, two checkboxes (each change saves both values at once; disabled while saving; on failure revert and show an `role="alert"` error with a `Try again` button), confirmation text, the note. Loading and load-failure states with retry, like `ProgressPage`.
- [ ] Step 4: UI checks in `tools/integration/test-ui.mjs` (mock `/api/graduation-check` GET/PUT with state): menu link `Graduation check` reaches `/student/graduation` with `aria-current="page"`; NOT_YET_ELIGIBLE shows the three missing lines; ticking MUET sends `{feesCleared:false,muet:true}` and shows `confirmed 15 Nov 2026` (mock returns `2026-11-15T02:00:00.000Z`); PUT failing → box unticked again and alert shown; ELIGIBLE fixture shows `Eligible to graduate`; CANNOT_ASSESS fixture shows no `<progress>`; needs a completed profile (redirect to `/student/setup`); 1440 and 375 with no horizontal overflow; `assertReadable`. Screenshots to `C:/Users/Asus/AppData/Local/Temp/claude/4795dd4a0714ec36/2f868daa-f74f-4c8a-8ab8-0db2a4082255/scratchpad/graduation/` via the harness's `PROGRESS_SHOTS`-style env var.
- [ ] Step 5: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `PLAYWRIGHT_CHANNEL=chrome node tools/integration/test-ui.mjs` — PASS. Commit `feat(web): Graduation check page for students (S3-P004-001)`.

### Task 4: Change record, docs, verification

- Create `docs/changes/S3-P004-001-uc13-graduation-check.md` (Owner `P003 (UC13); built by P004`, Status `READY_FOR_REVIEW`, migration 0013 not yet applied to Neon, SDD not updated, rollback).
- Update README (sprint table: add a Sprint 3 row or section for S3-P004-001), `docs/database/data-contracts.md` (two new `student_profile` columns), and the API docs folder if it documents student endpoints (look in `docs/api/`).
- Full verification: typecheck, lint, test, test:integration, test:db-tooling, build, check:cloudflare, `PLAYWRIGHT_CHANNEL=chrome node tools/integration/test-ui.mjs`, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`. Commit `docs: S3-P004-001 change record and docs`.
