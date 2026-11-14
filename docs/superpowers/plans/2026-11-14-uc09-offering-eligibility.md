# UC09 Offering Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify each approved offering as Eligible / Check with your coordinator / Not eligible, explain it on `/student/offerings`, and reject Not-eligible picks in `PUT /api/semester-offerings`.

**Architecture:** A pure shared evaluator in `packages/shared/src/offerings/eligibility.ts` → the API offerings context loads prerequisites and the student's academic records for PUT as well as GET, and the route rejects Not-eligible picks → the web Offerings page renders status, reasons and disabled checkboxes from the same evaluator.

**Tech Stack:** TypeScript, React, Cloudflare Worker API, Vitest, Playwright offerings UI checks.

**Spec:** `docs/superpowers/specs/2026-11-14-uc09-offering-eligibility-design.md`

## Global Constraints

- Do NOT edit `docs/System Documents/*` (the SRS/SDD) — owner instruction.
- No database migration, no new table or column.
- Passed = record status `COMPLETED` or `EXEMPTED`; `FAILED`/`WITHDRAWN` never satisfy.
- Only UC24 links (`MANDATORY`, `COREQUISITE`) and the imported `completedCredits` condition can block. CGPA, `topicDependent`, imported expression mismatch, unavailable history and unavailable prerequisite metadata → `CHECK` (pickable). `RECOMMENDED` never changes the status.
- Status labels (exact UI copy): `Eligible`, `Check with your coordinator`, `Not eligible`.
- New API error: `409 OFFERING_NOT_ELIGIBLE`, message `"<CODE> cannot be picked: <first blocking reason>."` (first offending subject in request order).
- UI: typography tokens from `apps/web/src/app/typography.css`, `assertReadable` in UI checks, ≥44px controls.

## Review Focus

1. Known-empty history (`available`, `records: []`) + subject with a MANDATORY link → `NOT_ELIGIBLE` (Task 1 test).
2. Records request failed (`unavailable`) → every subject with requirements is `CHECK`, never `NOT_ELIGIBLE`, and the server does not block (Task 1 + Task 2 tests).
3. COREQUISITE satisfied by a same-selection pick: picking both succeeds; picking the dependent alone is rejected (Task 1 + Task 2 tests).
4. A previously saved pick that is now Not eligible: GET still returns it, the page flags it, and saving without removing it is rejected with the message (Task 3 UI check).
5. SECRH-style subject: links passed but imported `anyOf` unmet → `CHECK` with the formatted expression in the reason (Task 1 test).

---

### Task 1: Shared eligibility evaluator

**Files:**
- Create: `packages/shared/src/offerings/eligibility.ts`, `packages/shared/src/offerings/eligibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OfferingEligibilityStatus = 'ELIGIBLE' | 'CHECK' | 'NOT_ELIGIBLE';
  export type OfferingEligibilityReasonKind = 'MISSING_PREREQUISITE' | 'MISSING_COREQUISITE' | 'CREDITS' | 'CGPA' | 'TOPIC' | 'IMPORTED_RULE' | 'RECOMMENDED' | 'HISTORY_UNAVAILABLE' | 'PREREQUISITES_UNAVAILABLE';
  export interface OfferingEligibilityReason { kind: OfferingEligibilityReasonKind; message: string; blocking: boolean }
  export interface OfferingEligibility { curriculumSubjectId: string; status: OfferingEligibilityStatus; reasons: OfferingEligibilityReason[] }
  export type EligibilityRecord = Pick<OfferingAcademicRecord, 'subjectId' | 'status' | 'recognizedCredits'>;
  export type EligibilityHistory = { status: 'available'; records: EligibilityRecord[] } | { status: 'unavailable' };
  export function evaluateOfferingEligibility(input: { subject: OfferingSubject; catalogue: readonly OfferingSubject[]; history: EligibilityHistory; pickedCurriculumSubjectIds: readonly string[] }): OfferingEligibility;
  export const OFFERING_ELIGIBILITY_LABELS: Record<OfferingEligibilityStatus, string>; // 'Eligible' | 'Check with your coordinator' | 'Not eligible'
  ```
  `catalogue` maps `curriculumSubjectId` → subject (for codes/names/subjectId of required subjects). `OfferingAcademicHistory` (full records) is assignable to `EligibilityHistory`.

- [ ] **Step 1: Write failing tests** (`describe('evaluateOfferingEligibility')`), with a small fictional catalogue (A required by B MANDATORY, C COREQUISITE of D, E RECOMMENDED for F):
  - no requirements → `ELIGIBLE`, `reasons: []`.
  - B with A `COMPLETED` → `ELIGIBLE`; A `EXEMPTED` → `ELIGIBLE`; A `FAILED` → `NOT_ELIGIBLE` with reason `{kind:'MISSING_PREREQUISITE', blocking:true, message:'Needs A001 Fictional A'}`; A `WITHDRAWN` → `NOT_ELIGIBLE`.
  - known-empty history → B `NOT_ELIGIBLE`.
  - history `unavailable` → B `CHECK` with `HISTORY_UNAVAILABLE` (`blocking:false`), message `'Your academic records could not be loaded, so prerequisites were not checked.'`.
  - prerequisites `{status:'unavailable'}` → `CHECK` with `PREREQUISITES_UNAVAILABLE`.
  - D with C not passed and not picked → `NOT_ELIGIBLE` (`MISSING_COREQUISITE`, message `'Take C001 Fictional C in the same semester or complete it first'`); with `pickedCurriculumSubjectIds` containing C → `ELIGIBLE`.
  - F with E not passed → `ELIGIBLE` and one non-blocking `RECOMMENDED` reason `'Recommended first: E001 Fictional E'`.
  - details condition `completedCredits > 80` with passed recognised credits 80 → `NOT_ELIGIBLE` (`CREDITS`, `'Needs more than 80 completed credits (you have 80)'`); 81 → `ELIGIBLE`; `>=` handled.
  - `cgpa >= 2` → `CHECK` (`CGPA`, `'Needs CGPA of at least 2; confirm with your coordinator'`); `topicDependent: true` → `CHECK` (`TOPIC`, `'Prerequisite depends on the chosen topic; confirm with your coordinator'`).
  - details expression `allOf[A, anyOf[G, H]]`, A passed, G and H not passed, links only A → `CHECK` (`IMPORTED_RULE`, message `'Check with your coordinator: requires ' + formatCurriculumPrerequisiteExpression(expression)`); with H passed → `ELIGIBLE`.
  - status precedence: any blocking → `NOT_ELIGIBLE`; else any `CHECK`-kind reason → `CHECK`; `RECOMMENDED` alone never changes status.
- [ ] **Step 2: Run** `npx vitest run packages/shared/src/offerings/eligibility.test.ts --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Passed set = subjectIds of records with `COMPLETED`/`EXEMPTED`. Completed credits = sum of `recognizedCredits` of passed records. Expression evaluation recurses over `course` (catalogue code → subjectId → passed), `allOf`, `anyOf`; codes not in the catalogue count as not passed. Reuse `formatCurriculumPrerequisiteExpression` from `packages/shared/src/curriculum-reference.ts`. When history is `unavailable`, skip link/credit/expression evaluation and return `CHECK` with only the history reason (plus CGPA/TOPIC reasons if present) — but if the subject has no requirements at all, return `ELIGIBLE`.
- [ ] **Step 4: Run the test** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): UC09 offering eligibility evaluator (S2-P004-027)`.

### Task 2: API — enforce eligibility on save

**Files:**
- Modify: `apps/api/src/modules/offerings/context.ts`, `contracts.ts`, `routes.ts`, `messages.ts` (if messages live there)
- Test: `apps/api/src/modules/offerings/context.test.ts`, `routes.test.ts`

**Interfaces:**
- Consumes: Task 1 `evaluateOfferingEligibility`, `EligibilityHistory`.
- Produces: the server context gains `history: EligibilityHistory` (server-only; NOT added to the GET response — the web already loads records from `/api/academic-records`). Prerequisites are loaded for PUT as well as GET.

- [ ] **Step 1: Write failing tests:**
  - context: reads `SELECT subject_id, status, recognized_credits FROM academic_record WHERE student_id=$1` and maps to `{status:'available', records:[{subjectId, status, recognizedCredits}]}`; a failing records query → `{status:'unavailable'}` (does not fail the whole context).
  - routes: PUT with a subject whose MANDATORY prerequisite is not passed → `409 OFFERING_NOT_ELIGIBLE`, message `'B001 cannot be picked: Needs A001 Fictional A.'`, repository `replace` not called; PUT picking D together with its corequisite C → 200; PUT when context history is `unavailable` → 200 (not blocked); existing 409s (`OFFERING_NOT_APPROVED`, `PICK_LIMIT_EXCEEDED`) keep precedence over eligibility (check order: approved → limits → eligibility).
  - GET response shape unchanged (no `history` key).
- [ ] **Step 2: Run** `npx vitest run apps/api/src/modules/offerings --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Route calls `contextFor(..., { includePrerequisites: true })` for both methods. Evaluate each submitted id with `pickedCurriculumSubjectIds` = the submitted ids and `catalogue` = `context.prerequisiteCatalogue ?? context.subjects`. Add `OFFERING_NOT_ELIGIBLE` to wherever offering error codes are listed/documented in the API (and the web client's known codes if it has a list).
- [ ] **Step 4: Run** the offerings tests, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): reject offering picks that fail UC09 eligibility (S2-P004-027)`.

### Task 3: Web — show eligibility and disable ineligible picks

**Files:**
- Modify: `apps/web/src/features/offerings/OfferingsPage.tsx` (+ its CSS file if one exists for offerings), `client.ts` / `response.ts` only if the new error code needs mapping
- Test: a new `apps/web/src/features/offerings/eligibility-display.test.tsx` (or extend existing page tests), `tools/offerings/test-ui.mjs`

**Interfaces:**
- Consumes: Task 1 evaluator and labels; `data.academicHistory` (already `OfferingAcademicHistory`), `data.prerequisiteCatalogue ?? data.subjects`, current `draft` picks.

- [ ] **Step 1: Write failing tests:** each listed subject row shows its status label (`Eligible` / `Check with your coordinator` / `Not eligible`) and its reason messages; a `NOT_ELIGIBLE` subject's checkbox is `disabled` unless it is already in the saved/draft picks (so the student can untick it); a draft containing a `NOT_ELIGIBLE` subject disables Save and shows `'Remove subjects you are not eligible for before saving.'`; when `academicHistory.status` is `unavailable`, a notice links to `/student/records` with text `'Add or reload your academic records so eligibility can be checked.'`; a 409 `OFFERING_NOT_ELIGIBLE` from the server shows its message in the existing error area.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/features/offerings --config vitest.auth.config.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Evaluate with `pickedCurriculumSubjectIds = draft` so corequisites update live. Keep the existing PrerequisiteDisplay; add the status + reasons next to it in both the table row and the mobile list item.
- [ ] **Step 4: Extend `tools/offerings/test-ui.mjs`** with a check `eligibility: status labels, disabled ineligible pick, saved ineligible pick blocks save, records-unavailable notice` using its existing mocks (add a MANDATORY prerequisite fixture whose required subject is not in the history). `assertReadable` must cover the page. Run `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings` — Expected: PASS.
- [ ] **Step 5: Run** `npm run typecheck`, `npm run lint`, `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): show UC09 eligibility on student offerings and block ineligible picks (S2-P004-027)`.

### Task 4: Change record, README, verification

**Files:**
- Create: `docs/changes/S2-P004-027-uc09-offering-eligibility.md` (sections like `S2-P004-025`; Owner `P002 (UC09 / FR-C2, FR-C5); built by P004`; Status `READY_FOR_REVIEW`)
- Modify: `README.md` Sprint 2 table (row `P004 (for P002 UC09)` | eligibility on student offerings: Eligible / Check with your coordinator / Not eligible with reasons; Not-eligible picks rejected (`409 OFFERING_NOT_ELIGIBLE`) | `S2-P004-027`); any API doc that lists `/api/semester-offerings` error codes.
- Do NOT touch `docs/System Documents/`.

- [ ] **Step 1:** Write the change record with the decided rules and real evidence.
- [ ] **Step 2: Full verification:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`, `npm run check:cloudflare`, `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`. Expected: all PASS; record counts.
- [ ] **Step 3: Commit** `docs: S2-P004-027 change record and README`.
