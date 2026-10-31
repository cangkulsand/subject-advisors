# P004 Sprint 2 UC20 implementation plan

- **Owner:** P004 / Programmer 4
- **Module:** M6 Class Offering Forecast and Optimization
- **Use case:** UC20, Provide Academic Data and Generate Class Offering Forecast
- **Status:** PLANNED; feature implementation has not started in this change
- **Date:** 2026-11-01
- **Actors:** Academic Coordinator; System Administrator for configuration only
- **Change record:** [S2-P004-001](../../../changes/S2-P004-001-uc20-sprint-plan.md)

UC20 provides a dated academic snapshot, generates an initial advisory forecast,
and supports review of proposed class sections. The forecast preserves its inputs,
rules, assumptions, quality warnings and decisions as the baseline for UC23.
It does not publish official semester offerings.

## 1. Existing foundation and scope

The repository already supplies guarded coordinator navigation, import and forecast
tables, append-only decision audits, and database protections for referenced
snapshots, capacity rules and finalized forecasts. The coordinator screens are
placeholders; these structures do not constitute an implemented UC20 workflow.

Build on the existing contracts and protections:

- [Implementation workflow](../../../implementationguide.md)
- [Database data contracts](../../../database/data-contracts.md)
- [Database schema decisions](../../../database/schema-decisions.md)
- [Caching guideline](../../../cachingguide.md)

The current user-supplied UC20 definition governs this plan. CSV input, API paths
and detailed schema additions below are proposed implementation choices. Capacity
figures remain provisional until configured and verified by an administrator.

In scope are data provision and validation, subject-code reconciliation, dated
snapshots, conditional demand estimation, exclusions, capacity-based proposals,
quality warnings, justified review and finalization of the initial baseline.

Out of scope are UC23 updates and comparisons, historical accuracy validation
without real outcomes, timetabling, lecturer or room optimization, official offering
publication, LLM explanations, transcript extraction, and other owners' complete
eligibility or graduation engines.

## 2. Implementation sequence

| Order | Work package | Deliverable |
| --- | --- | --- |
| 1 | Contracts and policy | Import template, validation vocabulary, demand assumptions, capacity resolution and lifecycle |
| 2 | Persistence | Additive support for provenance, completeness, rule snapshots, uncertainty and adjustment audits |
| 3 | Data provision | Upload, correction report, reconciliation and acceptance of a separate dated snapshot |
| 4 | Demand estimation | Deterministic evaluation using shared curriculum and prerequisite rules |
| 5 | Section allocation | Balanced capacity-based proposals with minimum and break-even warnings |
| 6 | Review and finalization | Justified adjustments, atomic audits, concurrency checks and frozen finalized results |
| 7 | Integration and verification | Coordinator screens, configuration controls, acceptance evidence and handoff |

Each implementation package requires its own Plan, Implementation, Review and
Changelog record. Review each completed package before dependent work begins.

## 3. Academic data provision and validation

Provide a downloadable CSV template as the initial input format. Support an explicit
student entry even when no subject history is supplied, so missing histories do not
make students disappear from coverage reporting. The exact file layout and status
mapping are settled in the first work package.

Capture the learning centre, target semester, source date and source label. Student
data includes an external reference, curriculum, cohort status and whether history
is complete, partial or unknown. Subject histories include subject code, academic
status, semester when known and synthetic-data indicators. Avoid collecting names
or other identifying fields unless the agreed workflow requires them.

Validate structure, required fields, supported values, duplicate students, duplicate
or conflicting subject attempts, curriculum membership and subject codes. Repeated
attempts in different semesters must not be rejected merely because the subject
appears more than once.

Classify findings as:

- **File errors:** malformed structure or missing required columns.
- **Record errors:** invalid values, conflicting duplicates, unknown curriculum or
  unmatched subject codes.
- **Warnings:** missing histories, incomplete coverage, synthetic records and stale
  source dates.

Use the shared catalogue and approved code aliases. Ambiguous matches require
correction; do not silently use fuzzy matches or create new master subjects.
Return a correction report with the row, field, problem and required action.

Reject malformed files and affected invalid records. If a coordinator accepts a
valid subset, preserve rejected-record counts, the acceptance decision and resulting
coverage warnings. Rejected history must not make a student appear to have complete
records or verified eligibility.

Acceptance creates a separate, immutable dated snapshot. Corrected data creates
another snapshot. Never overwrite StudentProfile, AcademicRecord or student-reported
semester offerings. M6 must work without imported students having portal accounts.
Source staleness uses an explicit configurable policy and warns about deferred or
changed enrollments.

## 4. Persistence and reproducibility

Reuse `academic_import_batch`, `imported_student`, `imported_subject_record`,
`class_capacity_rule`, `forecast_run`, `forecast_subject_demand`,
`proposed_class_section` and `forecast_decision_audit_log`.

| Current gap | Planned support |
| --- | --- |
| Import context | Target semester, source fingerprint, validation summary and acceptance metadata |
| History completeness | Per-student completeness and quality flags |
| Reproducible rules | Actual curriculum, prerequisites, semester rules, exclusions and capacity values used, with assumptions and engine version |
| Uncertain demand | Separate uncertainty counts and reason codes |
| Manual adjustments | Original proposal plus before/after values for decisions, section counts and allocations |
| Subject-specific capacities | Explicit policy resolution for approved exceptions such as selected 35-student labs |

Choose minimal additive fields or structures after reviewing the canonical schema.
Do not create parallel copies of existing domain tables or modify historical
migrations. Coordinate migration and manifest changes with DATABASE_FOUNDATION.

A foreign key to a mutable catalogue row is insufficient to reproduce a forecast.
Preserve the actual rules used. Generate from one consistent source and rule view;
save the run, quality results, demands and proposals atomically. On failure, expose
no successful partial forecast.

## 5. Demand estimation

Implement a deterministic engine without an LLM. For each imported student and
curriculum subject:

1. Determine whether the student's cohort status is supported by the stated
   forecasting assumptions.
2. Resolve completed and exempted subjects under the agreed outcome and retake
   policy, counting each student once per subject.
3. Apply curriculum membership and configured semester restrictions.
4. Evaluate mandatory prerequisites from supplied evidence. Recommended prior
   knowledge remains advisory; corequisites remain distinct.
5. Mark unsupported history, credit or corequisite conditions uncertain rather than
   inventing a satisfied or failed requirement.
6. Apply subject-level forecast exclusions.

Return supported eligibility, uncertain eligibility, estimated demand under the
selected assumptions, supported graduation-critical counts, and exclusions with
reason codes.

Eligible students form a potential demand pool, not confirmed enrollment. The initial
estimator may use that pool as a clearly labelled planning assumption, explaining
that student preferences and semester workloads can reduce actual demand. Do not
present the sum of all eligible subjects as each student's feasible semester plan.
The assumption must be explicit and preserved with the forecast.

Missing evidence produces `PRELIMINARY` or `INSUFFICIENT_DATA`, rather than a
misleading zero or verified-eligibility claim. Unknown counts remain separate and
do not silently increase section demand.

Graduation-critical status should consume an agreed graduation-evaluation contract
when available. Otherwise, allow a documented coordinator designation with evidence
and label it as such; do not claim that graduation eligibility was verified.
Synthetic fixtures establish calculation behavior, not real demand accuracy.

## 6. Capacity-based section proposals

Resolve the administrator-configured policy for each subject. For supported demand
`D > 0` and normal capacity `C`, propose `ceil(D / C)` sections. Distribute demand
evenly while preserving the total and respecting capacity limits.

| Example using provisional policies | Proposal |
| --- | --- |
| 14 students; minimum 15 | One section flagged for review |
| 41 students; lecture capacity 40 | Two sections, approximately 21 and 20 |
| 61 students; lab capacity 30 | Three sections, approximately 21, 20 and 20 |
| Zero supported demand with unresolved histories | Preserve the insufficient-data indication where applicable |

Flag sections below minimum enrollment and below the break-even reference
separately. Neither condition automatically cancels an offering. Graduation-critical
low enrollment requires documented exceptional review and any institutional approval.

Normal capacity is the allocation default. Exceeding it requires an authorized,
justified exception within the configured maximum; do not automatically fill to the
exception maximum. Fail with a useful configuration error when required capacity
rules are missing or ambiguous.

Use subject configuration to exclude FYP1, FYP2 and Industrial Training from
classroom recommendations. Keep the excluded subjects visible with their reasons.
The working figures of minimum 15, break-even around 25, lecture around 40, lab
around 30 and selected 35-student exceptions are configurable, provisional values.

## 7. Review, decisions and finalization

Use `DRAFT -> UNDER_REVIEW -> FINALIZED` for the initial baseline. Coordinators may
adjust section proposals and decisions only in Draft or Under Review. Require
justification for manual changes, low-enrollment exceptions and capacity exceptions.
Preserve the original recommendation alongside each adjustment.

Save decisions and append-only audit entries in one transaction. Record the verified
actor, timestamp, old and new values, reason, and relevant approval reference. Use
concurrency checks so overlapping reviews cannot silently overwrite each other.

Finalization validates that required reviews are resolved, preserves external
institutional approval references where needed, and records the final actor and
timestamp. Save the final audit entries before freezing the run in the same
transaction, consistent with existing database protections.

Finalized results and decisions are read-only through both API and database paths.
Finalization records an advisory result; it does not publish offerings or grant
institutional approval. UC20 creates the initial baseline. Changes to generated
source inputs or assumptions, and later version comparison, belong to UC23.

## 8. Screens, interfaces and access

Activate existing coordinator destinations for imports, data quality, forecasts,
decisions and audit. Version updates and comparisons remain under UC23. Provide
loading, empty, correction, forbidden and retryable failure states, with keyboard
and responsive behavior consistent with the shared staff shell.

Expected implementation areas:

- `apps/api/src/modules/forecasting/`
- `apps/web/src/features/coordinator/`
- `packages/shared/src/forecasting/`
- Canonical database migrations, checks and feature verification tooling.

The API covers validation, snapshot acceptance, initial forecast generation,
forecast retrieval, review decisions, finalization and audit retrieval. Exact paths
and request/response types are settled before implementation. Generation needs
idempotency protection, plus transactional version allocation, so retries or
concurrent requests cannot create duplicate initial baselines.

Every endpoint enforces current backend authorization. System Administrators receive
configuration access; cohort access and forecasting require the coordinator role.
Confirm global versus assigned-centre access before real-data use. A selected
centre in a browser request is not proof of authorization.

Keep raw cohorts out of browser persistence, shared caches and application logs.
Minimize identifying fields and define source access, retention, expiry and deletion
or anonymization procedures. Existing referenced-snapshot immutability must be
reconciled with the approved retention process without granting runtime services
permission to disable integrity protections. Use backend-authorized no-store
responses for private data, and document any narrow in-memory caching separately.

Administrative controls cover only the forecast configuration needed by UC20,
including capacities, exclusions and stale-source policy. Reuse shared catalogue
configuration instead of rebuilding M2 or the complete M7 dashboard.

## 9. Dependencies and decisions

- **P001 / M2:** Shared curriculum, subject, prerequisite, semester and requirement
  contracts; approved reference data and configuration ownership.
- **P002:** Reuse an agreed pure eligibility contract where compatible. Coordinator
  estimation must remain independent of student-profile participation.
- **P003:** Graduation-critical evidence can consume the agreed graduation contract
  when available. The documented manual designation provides an honest fallback.
- **P004 / FOUNDATION:** Current authentication and role checks, centre access policy,
  canonical migration review, runtime permissions and retention design.

Before implementation with real data, settle the CSV/status vocabulary, history and
retake semantics, initial demand assumption, centre access scope, capacity precedence,
institutional exceptional-review authority, stale-source threshold and retention
policy. Unavailable policy or reference evidence remains an explicit blocker to the
affected calculation rather than an invented institutional rule.

## 10. Acceptance and verification

- [ ] Invalid records produce a correction report; incomplete histories stay uncertain.
- [ ] Accepted snapshots are separate and dated; portal records remain unchanged.
- [ ] Identical accepted inputs, rule snapshots and engine versions produce identical calculations.
- [ ] Excluded subjects receive no classroom sections and retain an exclusion reason.
- [ ] Section allocations preserve supported demand and respect configured capacity.
- [ ] Below-minimum and graduation-critical cases require appropriate human review.
- [ ] Adjustments preserve justification, actor and before/after audit values atomically.
- [ ] Finalized results reject edits through both API and database protections.
- [ ] Unauthorized users and dataset scopes are denied, including direct-ID requests.
- [ ] Retries, concurrent generation and conflicting reviews cannot duplicate or silently overwrite work.
- [ ] Changes to the shared catalogue do not alter a saved forecast's meaning.
- [ ] Source provenance and retention controls are documented and exercised appropriately.
- [ ] No student records or official offerings are modified by the workflow.
- [ ] Synthetic tests are labelled and make no real demand-accuracy claim.

Run focused engine, API, database and browser tests for these behaviors, followed by
the existing repository checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:local
npm.cmd run check:cloudflare
```

The Cloudflare check is a build and deployment dry-run, not publication. Database
verification must use the reviewed migration workflow and an approved test target.
Record executed commands and actual outcomes in each implementation change record;
distinguish mocks, live checks and human review.

Rollback of future implementation should disable the new entry points and revert
feature code while preserving accepted snapshots, forecasts and audits. Review
migration recovery separately; do not delete live records as a routine rollback.
