# S2-P004-002 — UC20 contracts and policy

- **Status:** READY_FOR_REVIEW; package artifacts and focused local checks are complete
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related use case / requirements:** UC20, Provide Academic Data and Generate Class Offering Forecast; FR-H1–H9
- **Branch / PR:** `feature/p004-s2-uc20-contracts`; no PR
- **Reviewer:** Root artifact review passed; human peer review pending

## 1. Plan

### Objective and current behavior

Define UC20's first implementation package before coding: a single-file import contract,
validation and uncertainty vocabulary, advisory forecasting assumptions, API and shared
types. Canonical import/forecast tables and protections exist, but there is no UC20 API,
forecast engine or functioning coordinator workflow; current coordinator routes are
role-gated placeholders. The user-provided UC20 definition governs; retain the initial
advisory baseline boundary, without changing portal records or publishing official offerings.

### Scope and requirements

- **In scope:** contract/policy documentation, one CSV template and fictional example,
  validation/error/report vocabulary, deterministic assumptions and uncertainty, configurable
  capacity resolution, OpenAPI and shared TypeScript types, auth/idempotency/conflict/audit/
  lifecycle requirements, and a targeted clarification to the existing UC20 plan.
- **Out of scope:** CSV parser or API/engine implementation, database migration, UI, live or
  real student data, official offering publication, UC23 comparisons/updates, and complete
  P001/P002/P003 eligibility or graduation engines.

### Proposed files

1. `docs/sprint/02/p004/package-1-contracts.md` — concise decision register, CSV format,
   validation behavior, forecast assumptions, lifecycle, privacy and unresolved policies.
2. `docs/api/forecasting-uc20.openapi.json` — authoritative proposed OpenAPI 3.0.3 contract;
   no runnable collection until endpoints exist.
3. `packages/shared/src/forecasting/contracts.ts`, `index.ts`, and
   `contracts.test.ts` — shared transport types and focused contract/example drift checks;
   no runtime CSV parser or forecasting logic.
4. `docs/api/examples/forecasting/uc20-import.template.csv`,
   `uc20-import.example.csv`, `uc20-import.valid.example.csv`, and `expected-validation.json` —
   one upload format, a fictional correction case and accepted-import case, including a
   student row with no subject history. Typed context/run/config/request examples live with
   the focused shared contract tests.
5. `docs/sprint/02/p004/uc20-plan.md` — narrowly clarify degree → centre → upload, external
   student independence, approved global centre choice, programme-scoped persistence and
   acceptance-time snapshot freezing. Remove the prior unresolved global/assigned-centre
   wording; leave unrelated records unchanged.
6. This change record. No dependencies, application runtime, environment or migrations.

The OpenAPI contract is the API source of truth. Shared types and examples must match it.

### Contract proposals

**Flow, scope and identity**

- Coordinator flow is degree/programme → configured centre → upload. Any active,
  backend-authorized Coordinator may choose any configured programme and centre; there is no
  per-centre assignment or extra approval screen. System Administrators manage forecast
  configuration only. Current role and suspension checks remain server-enforced.
- Provide a Coordinator-only forecast-context read for configured programmes, centres,
  semesters and curriculum versions for the selected programme. Do not call student/profile
  or student-options endpoints. The authenticated Coordinator is the forecast actor, derived
  server-side; only uploaded people are represented, by external reference.
- Uploaded students do not need portal accounts, Clerk IDs, StudentProfiles, AcademicRecords
  or profile completion. Never read/write portal student rows for import matching or forecast
  calculation. Use only the shared catalogue, prerequisite data and uploaded history.
- Require `programmeId`, `learningCentreId` and `targetSemesterId` in upload and forecast
  scope. Every row's curriculum must belong to the selected programme. `curriculum_version`
  may be blank only when exactly one configured version exists; if versions are ambiguous,
  require an explicit per-row version. Never default to latest/current.

**One-file CSV and validation**

- Proposed header: `external_reference,curriculum_version,cohort_status,history_completeness,subject_code,subject_status,record_semester_id,recognized_credits,is_synthetic`.
- One row per attempt; roster fields repeat on every row for a student and must agree. A
  single row with the subject-attempt group blank represents a student with no history.
  Repeated references are valid only with consistent roster metadata; conflicting student
  metadata is an error for that student, with no arbitrary row winner.
- Attempt fields are all blank for a no-history row, or supplied as a valid group. Preserve
  valid roster metadata when an attempt row is invalid; reject that history and only change
  `COMPLETE` to `PARTIAL` (`PARTIAL` and `UNKNOWN` never upgrade), with rejected counts and corrective report. Explicit subset
  acknowledgement is needed only when accepting a valid subset after row errors. Fully valid
  uploads proceed without a second-person or formal policy-approval step.
- Proposed completeness tokens: `COMPLETE`, `PARTIAL`, `UNKNOWN`. `COMPLETE` with no attempts
  means the source attests to no prior history; `UNKNOWN` means absence of evidence. Missing
  or rejected attempts never upgrade completeness. Repeats in different semesters are valid;
  ambiguous duplicate same-semester or multiple undated attempts require correction.
- Canonical imported outcomes are `COMPLETED`, `EXEMPTED`, `FAILED`, `IN_PROGRESS`. The
  portal also uses `WITHDRAWN`, which the imported table cannot store. Report `WITHDRAWN` and
  unknown statuses as unmapped row-level uncertainty until an explicit mapping is agreed;
  never silently convert to failed, completed or exempted. Cohort status tokens are source
  metadata, not eligibility by themselves; unsupported values produce per-student
  uncertainty.
- Report fatal file errors separately from row errors and warnings. Resolve exact approved
  subject aliases only; unmatched/ambiguous codes need correction, with no fuzzy matching or
  master-catalogue creation. Missing/partial history, synthetic rows and stale source dates
  are warnings. Return row, field, code and corrective action. Repeated conflicting outcomes
  create per-student/per-subject uncertainty, not a cohort-wide rejection.

**Advisory demand and capacity**

- Use the supported eligible pool as the default advisory demand assumption. Label it as
  potential demand, not confirmed registration or a feasible semester workload; preserve the
  assumption in each forecast. No administrator approval gate is needed for this assumption.
  An unresolved retake, credit or corequisite affects only the relevant student's subject
  certainty, not the whole forecast. Unknown evidence stays separate from supported counts;
  never claim verified eligibility or turn unknown into zero.
- Reuse shared curriculum/prerequisite contracts, including conditional prerequisite details;
  recommended knowledge stays advisory and corequisites distinct. Do not replace P001/P002's
  complete engines. Graduation-critical counts require verified shared evidence; otherwise a
  Coordinator designation is explicitly advisory with its evidence recorded.
- Keep excluded subjects visible with reasons. Proposed capacity precedence is approved
  subject-specific override, then centre/class-type rule, then global class-type rule; an
  ambiguous active rule yields `CONFIGURATION_REQUIRED`. Missing capacity does not invent a
  value or block the whole forecast; report affected sections as configuration-required.
  Normal capacity sets allocation. Exceptional capacity is not filled automatically and
  requires a justification/reference where configured policy requires it. Figures 15/25/40/
  30/35 remain configurable examples, not seeded rules. Missing staleness threshold produces
  a warning, not a cohort-wide block.

**API, lifecycle, persistence and privacy**

- Proposed operations: read coordinator forecast context; download the single template;
  submit an upload and return validation/correction results; accept a valid subset only when
  needed; retrieve import quality; generate/retrieve the initial forecast; submit section
  decisions; finalize; retrieve audit. No UC23 endpoints. Exact paths and payloads remain
  proposals in OpenAPI until review.
- Use existing `{data: ...}` success and `{error: {code, message}}` failure envelopes,
  positive PostgreSQL int32 JSON number IDs (the offerings API's decimal-string IDs are a
  module-specific exception), and documented `401`/`403`, validation, `409`/`412` and
  retryable `5xx` behavior. Do not expose SQL/provider details. No-store private responses.
- Require idempotency keys for imports and all mutations; after current authorization,
  identical retries return the original receipt before state/revision checks, and key reuse
  with a different body conflicts. Bind corrections and review/configuration writes to ETag/
  If-Match. Initial baseline is version 1, parent null, unique
  by programme + centre + target semester. Package 2 must add programme scope to import and
  forecast records and replace centre/semester/version uniqueness with programme/centre/
  semester/version uniqueness.
- Keep `DRAFT -> UNDER_REVIEW -> FINALIZED` for the initial baseline; finalize only from
  `UNDER_REVIEW` after required reviews. Preserve original recommendations and append actor,
  timestamp, reason, approval reference and before/after decisions/allocations transactionally.
  Package 2 must freeze accepted snapshots immediately
  on acceptance, not only once forecast-referenced; corrections create a new snapshot. No
  official offering is published.
- Minimize data to external references; keep raw cohorts out of browser storage, shared
  caches and logs. Retention duration and external-data handling are operational decisions,
  not a new Coordinator workflow step. Gate real-data use on the approved retention process.

### Explicit unresolved inputs

Do not invent official rules: preserve unresolved source/outcome mappings, cohort-status to
retake precedence, credit evidence, exceptional-review authority,
capacity values and retention duration as unconfigured policy. Per-record uncertainty and
configuration-required section results must allow other supported forecasts to continue.
Centre access is approved globally for active authorized Coordinators across configured
programmes and centres; it is not a blocker or per-centre policy gate.

### Acceptance criteria

- OpenAPI and shared types capture coordinator-only catalogue context, programme/centre/
  semester scope, external-reference-only students, standard envelopes, no-store, validation,
  idempotency, stale-write protection, audit and lifecycle.
- One CSV template, valid example, correction example and accepted-report example agree with the contract, permit repeated attempts, and represent
  no-history students without dropping them. Invalid attempts preserve the roster, downgrade
  completeness and report errors/counts; conflicting roster metadata has no row-winner rule.
- Status and retake mappings distinguish imported outcomes from portal `WITHDRAWN`; unknown
  evidence remains per-student uncertainty. No unsupported official policy becomes a default.
- Demand uses the preserved advisory eligible-pool assumption; missing capacities/stale
  thresholds generate bounded configuration-required results/warnings, not invented values
  or whole-cohort blocks.
- Package 2 requirements explicitly include programme-scoped uniqueness and acceptance-time
  snapshot freezing; the plan does not claim these are current schema behavior.
- Context/run/config/request examples are typed against shared contracts and checked against
  declared OpenAPI object members; successful import examples preserve nonblocking warnings.
  All examples are fictional. References resolve, local OpenAPI lint and TypeScript/contract checks
  pass, and only planned documentation/shared-contract/example paths change. No endpoint,
  parser, engine, migration or live-data behavior is implemented.

### Verification plan

- Review the actual diff against FR-H1–H9, the current UC20 plan, canonical schema, shared
  auth/envelope conventions and coordinator placeholders; resolve all local references.
- Run local `postman spec lint docs/api/forecasting-uc20.openapi.json --issueType syntax
  --no-report-events` (Postman CLI 1.74.0). No workspace/auth setup, event reporting,
  publication, requests or live provider calls.
- Run `npm.cmd run typecheck`, focused `contracts.test.ts`, and direct ESLint on the new
  shared-contract paths because the default npm lint excludes packages. Review CSV/example
  alignment in focused contract tests and the OpenAPI examples; add no validator dependency,
  home-grown JSON Schema validator, runtime parser or engine.
- Run `git diff --check` and inspect exact changed paths. Do not run database checks, full
  tests with database child URLs, live services, deployment or production operations.

### Risks, dependencies and rollback

- **Risks:** Contract drift can mislead future API clients; Package 2 must implement programme
  scope and acceptance-time immutability before imports are used. Real data remains gated by
  retention and unresolved official mappings, not by centre assignment or an extra approval UI.
- **Dependencies:** Shared catalogue/prerequisite data and DATABASE_FOUNDATION migration review.
  P002 eligibility or P003 graduation contracts are optional boundaries only when compatible;
  there is no student profile/account or P001 endpoint dependency.
- **Rollback:** Revert this plan/package before clients consume it; later contract changes are
  additive/versioned. No database rollback is in this package.

## 2. Implementation

- **Status:** Complete for Package 1 contract artifacts; root artifact review passed; human peer review pending.
- **Files actually changed:** `docs/sprint/02/p004/package-1-contracts.md`,
  `docs/sprint/02/p004/uc20-plan.md`, `docs/api/forecasting-uc20.openapi.json`,
  `packages/shared/src/forecasting/contracts.ts`, `index.ts`, `contracts.test.ts`, and the
  four `docs/api/examples/forecasting` fixtures, alongside this record.
- **Summary:** Defined the single-file CSV with correction and fully valid acceptance examples;
  coordinator-only
  external-cohort context and programme/centre/semester scoping; planned OpenAPI operations,
  TypeScript transport contracts, advisory uncertainty/capacity semantics, idempotency,
  lifecycle/audit rules and Package 2 persistence gaps. No runtime endpoint, parser, engine,
  migration or UI was implemented.
- **Migrations / environment / shared contracts:** No migration or environment changes.
  Added only additive planned shared transport types; no dependency changes.

## 3. Review

- **Self-review:** Plan and artifact reviews passed; diff checked against the UC20 plan, database
  schema and existing auth/envelope conventions. Scope remains documentation and shared
  transport contracts only.
- **Tests / validation:** These full-package commands passed before the final wording-only
  corrections: `npm.cmd run typecheck`; `node node_modules/vitest/vitest.mjs run --config
  vitest.auth.config.ts packages/shared/src/forecasting/contracts.test.ts` (4 passed);
  `node node_modules/eslint/bin/eslint.js packages/shared/src/forecasting --max-warnings 0`;
  and `postman spec lint docs/api/forecasting-uc20.openapi.json --issueType syntax
  --no-report-events` (no issues). The full 11-file encoding/whitespace scan passed during that
  verification. After final wording edits, Postman syntax lint and `git diff --check` were rerun,
  followed by an encoding/whitespace scan of the three edited files. Postman governance lint
  requires login, so it was not run; no login/workspace operation was attempted. Checks cover
  contracts only, not runtime or database behavior.
- **Review outcome:** Root artifact review passed.
- **Human peer review:** Pending.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Docs
- **Actual changes:** Added the planned UC20 API/CSV/type contract and fictional examples;
  clarified the existing plan for programme selection and external-reference-only cohorts.
- **Compatibility:** Planning/contracts/examples only; no endpoint, runtime, data or migration changes.
- **Verification:** OpenAPI syntax lint, strict TypeScript, focused contract/example tests,
  direct lint, diff whitespace and encoding scans completed locally. No live API, database,
  browser, provider or deployment check was run because this package defines contracts only.
- **Outstanding:** Human peer review.
- **Final status:** READY_FOR_REVIEW
