# S1-INT-031 — Network Security curriculum consumer compatibility

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-31
- **Sprint:** Sprint 1 integration
- **Owner:** INT / Integration
- **Related UC / FR:** P001 UC03/UC04, P002 UC08, P003 UC17
- **Branch / PR:** Current working branch; no PR created
- **Reviewer:** Coordinator (root) — review PASS 2026-10-31; human peer review pending

## 1. Plan

### Objective / problem
Allow the existing application consumers to read the reviewed Network Security English curriculum data additively while remaining compatible with older databases where `curriculum_subject.display_name` and `prerequisite_details` are absent.

### Scope and requirements
- In scope: shared bounded prerequisite parser/formatter; P001/P002/P003 read/display compatibility; additive UC08 browser cache contract marker; E3 category and SECR3032 project-code display compatibility; focused tests and this record.
- Out of scope: database migrations, manifests, import tooling, database execution, deployment, auth, offering-save validation, eligibility engine changes, schedules or official availability.

### Proposed implementation
- Expected files: `packages/shared/src/curriculum-reference.ts` and tests; P001/P002/P003 API readers and web parsers/components/helpers with tests; `docs/cachingguide.md`; narrow UC08 cache marker; this record.
- APIs / database / interfaces: additive nullable fields are read via `to_jsonb(cs)` so old schemas remain queryable; P002 exposes validated optional prerequisite details; P003 exposes optional summary without changing core graph contract.
- Dependencies / shared-file impact: no new dependencies; P001/P002/P003 readers share a bounded parser in shared package.

### Acceptance criteria
- [x] Existing records/results are unchanged when new schema fields are absent or null.
- [x] New English names are used only where the curriculum provides them; shared Malay names are preserved.
- [x] Structured AND/OR/condition/topic notes display faithfully; malformed, cross-curriculum, self-referencing or unsupported structures fail closed as unavailable/unknown.
- [x] P003 does not treat conditions/topic-dependent prerequisites as eligible or remaining based on assumptions.
- [x] E3 is recognized without reclassifying University Compulsory; SECR3032 gets the established project display exception.
- [x] Focused tests, relevant typecheck and lint pass, with actual outcomes recorded.

### Verification plan
- Run affected Vitest subsets, offerings and P001 typechecks, and ESLint on changed files using installed local tools; run one appropriate app check if practical.
- Inspect SQL compatibility strings and response contracts; inspect final diff for ownership and compatibility.

### Risk / assumptions / rollback
- Risks: additive fields can be present while source metadata is malformed; readers must preserve unavailable/unknown rather than infer empty/eligible. Existing mixed working tree belongs to the parallel database task and must not be disturbed.
- Assumptions / blockers: reviewed source manifest is authoritative; migration is owned separately and must be applied before activating its new data.
- Rollback: revert this isolated consumer-support change; old schema remains readable.

## 2. Implementation

- **Status:** COMPLETE — coordinator review passed; human peer review pending
- **Files actually changed:** `packages/shared/src/curriculum-reference.ts` and test; shared offerings contract; P001 profile options; records list/save result queries; P002 context/browser decoder/prerequisite display/category handling/cache marker; P003 repository/adapter/node contract/selected details; E3 record and UC08 category helpers; focused API/web tests; `docs/cachingguide.md`; this record.
- **Summary:** Added a bounded fail-closed parser for optional imported prerequisite metadata, including code membership/self-reference checks, depth/node/string bounds, supported operator checks, and source-cell metadata checks. P001, records, P002, and P003 now use curriculum-local English overrides with `to_jsonb(cs)` fallback so pre-migration schemas remain readable. P002 returns a minimal public prerequisite summary with validated AND/OR structure, conditions, notes and topic-dependency, while removing workbook cell provenance; old edge-only responses keep their behavior. P003 uses the new logical expression when present, suppresses OR alternatives from mandatory graph edges, and leaves condition/topic/invalid cases UNKNOWN unless a completed/exempted record exists. E3 and SECR3032 are recognized according to the requested display/category behavior.
- **Decisions / deviations from plan:** Public P002 prerequisite summaries omit workbook source cells/status flags as they are not required by the client; the server validates the complete stored shape before generating the summary. Existing condition prose is rendered as React text.
- **Migrations / env / shared contracts:** No migrations or environment changes. Added optional `details` to available P002 prerequisite metadata and `prerequisiteSummary` to pathway nodes. Bumped only the UC08 browser response-contract marker to `p002-context-v5-curriculum-prerequisite-details`; TTLs and other cache behavior are unchanged.

## 3. Review

- **Self-review checklist:** PASS — scoped to read/display consumers; old schema reads use JSON row projection; names are scoped to the current curriculum; invalid metadata remains unavailable/unknown; no eligibility is inferred from grades/CGPA notes; no source cell data is returned by P002; OR prerequisites are not drawn as mandatory conjunctions; no database, auth, migration or deployment work was performed by this consumer change.
- **Test evidence:** Focused consumer run: 10 Vitest files / 149 tests passed. Coordinator full run: `npm test` — 39 files passed, 2 skipped; 524 tests passed, 13 skipped. `npm run typecheck` — PASS. Local `node node_modules/typescript/bin/tsc -p tsconfig.offerings.json --noEmit` and `-p tsconfig.p001.json --noEmit` — PASS. Changed-file ESLint with `--max-warnings 0` — PASS. `npm run build:offerings` — PASS. The full-suite skips are reported as skipped; no DB test was represented as passed.
- **Manual checks:** `git diff --check` on changed tracked consumer paths — PASS. Inspected SQL fallback queries and scoped subject joins; no `cs.display_name`/`cs.prerequisite_details` direct-column access was introduced. Verified the manifest has 79 subjects and no mismatch between `fixedCourseEdgesShown` and expression presence. SQL/query tests assert old-field fallback, owner curriculum scope, and explicit record-result joins. Coordinator prepared the records saved-result query with `EXPLAIN` on the approved development database using an empty saved CTE; PostgreSQL resolved the joins and aliases. The query did not execute against or read/write real records.
- **Defects found and fixes:** Corrected records list/save result joins to explicitly bind subject and semester aliases after adding curriculum-scoped overrides. Corrected the prerequisite display's known-empty check so a pure OR expression renders even with no legacy edges. When structured details exist, the display now prefers the full expression/conditions/topic note and avoids duplicate legacy groups or repeating the topic note. The shared parser now rejects a mismatch between `fixedCourseEdgesShown` and expression presence.
- **Review outcome:** PASS — self-review and coordinator actual-diff review; human peer review pending
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Changed / Fixed / Tests / Docs
- **Added / Changed / Fixed / Removed:** Added shared prerequisite parser/formatter and additive API summary; display_name fallback in P001 profile options, P001 records list/save results, P002 offering context, and P003 pathway catalogue; preserved logical prerequisite notes/alternatives in P002 and P003; recognized E3 and SECR3032; bumped UC08 browser marker and documented it.
- **Affected routes / tables / consumers:** Profile options and academic records consumers; semester-offerings GET context; pathway graph GET; existing curriculum_subject rows through JSON projection only.
- **Breaking changes / migration steps:** No breaking change. New data can be activated after its additive database migration; before that, missing fields fall back to `subject.subject_name` and legacy prerequisite edges.
- **Verification summary:** 10 focused Vitest files / 149 tests; coordinator full suite (39 passed / 2 skipped, 524 passed / 13 skipped); `npm run typecheck`; offerings and P001 TypeScript checks; changed-file ESLint; offerings production build; and coordinator's read-only SQL `EXPLAIN` all passed. No DB writes or deployment were performed for this consumer change.
- **Outstanding blockers / follow-up:** Human peer review pending. Schema support and curriculum import remain separately owned; deploy consumer code before activating imported curriculum data.
- **Final status:** READY_FOR_REVIEW
