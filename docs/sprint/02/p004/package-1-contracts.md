# UC20 Package 1 — contracts and policy

**Status:** Proposed contract for review; no UC20 endpoint or import/forecast behavior is implemented.
**Owner:** P004 / Sprint 2. **Trace:** UC20, FR-H1–H9.

## Scope and source of truth

Package 1 defines the CSV, validation results, advisory forecast vocabulary and proposed
HTTP contract before implementation. The user-provided UC20 definition governs. The API
spec at `docs/api/forecasting-uc20.openapi.json` is authoritative; TypeScript types and
fictional examples must agree with it. This is an additive M6 contract, not a student
profile API, eligibility engine, final timetable or official offering publication.

The canonical database has import/forecast/audit tables, but its current import freeze
only protects a batch after a forecast references it. Package 2 must add programme scope
and freeze a snapshot at acceptance. No Package 1 statement implies those fields or a
running forecasting API already exist.

## Coordinator flow, catalogue and cohort identity

1. An active, backend-authorized Coordinator chooses a configured degree/programme.
2. The Coordinator chooses any configured learning centre and target semester.
3. The Coordinator uploads one CSV file.

Any active Coordinator may choose any configured programme and centre. There is no
per-centre assignment or extra policy-approval screen. System Administrators may manage
forecast configuration only; they do not receive cohort or forecast access by that role.
The server derives actor and role from the verified Clerk session and current assignments.

`GET /api/coordinator/forecast-context` supplies configured programmes, centres and
semesters, plus the selected programme's configured curriculum versions, curriculum
subjects, class type/inclusion and prerequisite conditions. Subjects come from
the selected programme's `curriculum_subject` → `subject` catalogue data, not from the
upload. Unknown uploaded codes are correction findings; they never create subjects.
Approved aliases may be used internally while resolving uploaded subject codes; the context
response exposes canonical catalogue codes, not the alias table.
Prerequisite expressions and conditions, including conditional workbook-derived rules,
must remain intact. The selected centre groups the cohort and forecast; it does not
replace the programme's curriculum rules. Each subject option includes its curriculum
ID and canonical credit hours; class type is nullable and, when configured, is `LECTURE`
or `LAB`. Prerequisite availability distinguishes a known empty rule from unavailable
source data.

Every upload and run is scoped by programme, centre and target semester. An imported
person is identified only by an external reference. No student portal account, Clerk
student ID, StudentProfile, AcademicRecord or student/profile/options endpoint is needed
or consulted. Uploaded records do not link to portal students; only the Coordinator is
authenticated. Every student's curriculum must belong to the selected programme. A blank
`curriculum_version` may resolve only when exactly one configured version exists; when
more than one exists, require an explicit per-row version rather than selecting latest.
Scope IDs are carried in operation bodies and list filters, echoed by resources, and
checked against stored scope; the URL keeps resource paths shallow.

## Single-file CSV contract

The proposed template has this exact header and order:

```csv
external_reference,curriculum_version,cohort_status,history_completeness,subject_code,subject_status,record_semester_id,recognized_credits,is_synthetic
```

The correction example uses fictional `DEMO-*` references and assumes its selected
fictional programme has exactly one configured curriculum version, so the blank version
on `DEMO-002` is valid only in that example context. The separate fully valid example uses
an explicit curriculum version, as required when the selected programme has multiple versions.

CSV v1 is UTF-8 with an optional BOM, comma-delimited, and accepts standard double-quoted
field escaping with doubled quotes. LF and CRLF line endings are accepted. Trim surrounding
space before validation; an empty trimmed field is blank. External references are opaque,
case-sensitive values of 1-128 Unicode characters. Semester IDs use positive decimal int32
lexemes; recognized credits use nonnegative decimal integers; `is_synthetic` is exactly
`true` or `false` for attempts. The API limits uploads to 5 MiB and 10,000 data rows; these
are proposed transport safeguards, not institutional policy.

One row represents a student attempt. Student-level fields repeat on each row for that
external reference and must match exactly. Conflicting programme/curriculum/status or
completeness metadata is a student-group error; the system never chooses a winning row.
A student with no subject history is still represented by one row with all five attempt
fields (`subject_code`, `subject_status`, `record_semester_id`, `recognized_credits`,
`is_synthetic`) blank.

If an attempt row is invalid while its student-level fields are valid, keep the roster
student, reject that history row, retain a separate rejected-row uncertainty, and include
row/field error and rejected counts. Downgrade only `COMPLETE` to `PARTIAL`; `PARTIAL`
stays `PARTIAL` and `UNKNOWN` stays `UNKNOWN`. Do not silently drop the student. If a
conflicting student-level group cannot be resolved, report the group and do not guess. A
whole-valid upload is accepted directly. After row errors, show a correction report and
allow correction/reupload; a single explicit subset acknowledgement is required only if
the Coordinator elects to accept the remaining valid rows.

| Field | Contract |
| --- | --- |
| `external_reference` | Required opaque source identifier; no names, portal IDs or credentials. |
| `curriculum_version` | Required unless one configured version exists for the selected programme. Must resolve to a curriculum in that programme. |
| `cohort_status` | Source-provided nonblank token. Propose `ACTIVE` as a configured engineering mapping to potential eligible-pool demand, not an institutional claim. Unsupported tokens make only that student's eligibility uncertain. |
| `history_completeness` | `COMPLETE`, `PARTIAL`, or `UNKNOWN`. `COMPLETE` with no attempts means source-attested empty history; `UNKNOWN` means no evidence. Rejection changes only `COMPLETE` to `PARTIAL`; `UNKNOWN` remains `UNKNOWN`. |
| `subject_code` | Exact catalogue code or approved alias for that student's selected curriculum. No fuzzy matching or catalogue creation. |
| `subject_status` | `COMPLETED`, `EXEMPTED`, `FAILED`, `IN_PROGRESS`; other source values are not normalized. |
| `record_semester_id` | Optional positive canonical int32 semester ID when known; blank means undated/unknown, not a guessed semester. |
| `recognized_credits` | Optional source evidence, nonnegative and bounded by verified subject credits. `FAILED`/`IN_PROGRESS` permit only blank or `0`, never positive recognized credits. Blank evidence leaves credit-based conditions uncertain; Package 2 must persist it. |
| `is_synthetic` | Required `true`/`false` on an attempt; blank only when there is no attempt group. |

Different-semester repeats are valid attempts. Conflicting same-student/subject/semester
attempts, duplicate undated attempts, unknown curriculum versions, unmatched codes and
invalid enum/field values are correction findings. The imported database currently allows
only `COMPLETED`, `EXEMPTED`, `FAILED`, `IN_PROGRESS`; portal `WITHDRAWN` is not an import
status. `WITHDRAWN` therefore yields an `UNMAPPED_SUBJECT_STATUS` row error and uncertainty,
never an inferred failure/completion. Subset acceptance retains the roster student; rejection
changes only `COMPLETE` to `PARTIAL` and preserves `UNKNOWN` as unknown.
Failed and in-progress attempts carry no recognized-credits value in the example; credit
evidence is applicable only when supplied by the source and must be bounded by verified
catalogue credits. For these non-passing statuses, a supplied value must be `0`; positive
recognized credits are a correction error.

## Validation and correction results

- **File errors:** encoding, malformed CSV, missing/extra columns or invalid structure;
  reject the upload as a whole and return a safe correction report.
- **Row/group errors:** missing or unsupported values, conflicting repeated student
  metadata, bad curriculum membership/version, ambiguous/unknown code, status mapping,
  or conflicting attempts. Reject affected history; preserve valid roster information when
  possible and report how completeness/counts change.
- **Warnings:** no/partial history, synthetic attempt, unknown semester/credit evidence,
  unresolved per-record prerequisite/retake, or a source date older than configured
  threshold. Missing stale threshold itself is a warning, not a cohort-wide block.

Each finding carries severity, stable code, row, field, message and corrective action.
Reports distinguish total rows, valid students/attempts, rejected rows, completeness
changes, and whether subset acknowledgement is available/required. Private report and
cohort responses use `Cache-Control: no-store`.

## Forecast semantics and configured curriculum

Use the supported eligible pool as the default advisory demand assumption. State in every
result that this is potential demand, not confirmed registration or a feasible semester
workload; do not require an administrator approval screen for this assumption. Preserve
the assumption and rule/catalogue snapshot used for the deterministic calculation.

Count each student at most once per subject. A conflicting retake or missing history,
credit or corequisite evidence makes that student's subject result uncertain, not the
entire cohort forecast. Do not choose first/last retake without a rule, turn unknown into
zero, or call uncertain eligibility verified. Preserve separate supported and uncertain
counts/reasons. Recommended knowledge remains advisory; mandatory prerequisites and
corequisites remain distinct. If conditional prerequisite evidence is unavailable or
unsupported, mark only the affected result uncertain. A graduation-critical designation
without verified graduation contract/evidence is explicitly advisory and recorded with its
reason.

Obtain subject names, codes, curriculum membership, prerequisite expressions/conditions,
`include_in_offering_forecast`, configured exclusions and reasons from the selected
programme's catalogue/configuration. Excluded subjects, including configured FYP and
Industrial Training exclusions, remain visible with their configured reason and receive
no classroom section. The center does not select a different curriculum. Missing catalogue
rules never create or default a subject.

Capacity precedence is proposed as: approved subject-specific rule, then centre/class-type
rule, then global class-type rule. Tie or missing active configuration returns
`CONFIGURATION_REQUIRED` for affected sections; other calculable subjects may proceed.
Normal capacity drives balanced `ceil(supportedDemand / normalCapacity)` sections. Never
fill exception capacity automatically; an exception requires configured maximum and
justification, with approval reference where configured policy requires one. Values 15
minimum, 25 break-even, 40 lecture, 30 lab and selected 35 exceptions remain examples,
not defaults. Missing stale-source threshold warns, not whole-cohort blocks.
Compare effective-semester ranges by configured academic-year and term chronology, not
numeric semester-ID order.
Validate capacity scope tuples: `GLOBAL` has neither centre nor subject ID; `CENTRE` requires
a centre and no subject ID; `SUBJECT_CENTRE` requires both. Counts must satisfy
`minimumEnrollment <= breakEvenTarget <= normalMaximum`; a non-null `exceptionMaximum` must
be at least `normalMaximum`. Every supplied semester ID is a positive int32 and any non-null
end ID must resolve in the shared configured semester catalogue and not precede the start by
configured academic-year/term chronology. Subject-exclusion IDs and effective ranges use the
same positive-int32 and chronological checks.

## Proposed HTTP surface

All paths are proposed, not implemented. OpenAPI uses the existing `{data: ...}` success
and `{error: {code, message}}` failure envelopes. PostgreSQL int32 IDs are positive JSON
numbers. Requests reject unknown fields and never accept actor, role or portal-student ID.
Create requests carry required programme/centre/semester scope and the server validates it
against configured catalogue and stored resource scope; resources echo that scope.

| Operation | Role and behavior |
| --- | --- |
| `GET /api/coordinator/forecast-context` | Active Coordinator; configured programmes/centres/semesters; optional `programmeId` adds that programme's curricula and subjects/rules. No student options. |
| `GET /api/coordinator/forecast-import-template` | Active Coordinator; returns the single CSV template. |
| `POST /api/coordinator/forecast-imports` | Active Coordinator; multipart one CSV with required programme/centre/semester IDs plus source date/label. Fully valid upload accepts directly; row errors return 422 report and validation ID without accepting rejected history. |
| `POST /api/coordinator/forecast-imports/{validationId}/subset-acceptances` | Same role; request repeats exact scope and acknowledges rejected rows. Required `If-Match` binds acknowledgement to the validated fingerprint/revision; a validation can be accepted once. |
| `GET /api/coordinator/forecast-imports?programmeId=&learningCentreId=&targetSemesterId=&limit=&cursor=` | Active Coordinator; paged import summaries, not raw CSV. |
| `GET /api/coordinator/forecast-imports/{importBatchId}` | Active Coordinator; full validation report and warnings remain retrievable for every accepted import; no raw CSV. |
| `GET /api/coordinator/forecast-runs?programmeId=&learningCentreId=&targetSemesterId=&limit=&cursor=` | Active Coordinator; paged runs for the required scope. |
| `POST /api/coordinator/forecast-runs` | Active Coordinator; body includes required programme/centre/semester scope and matching accepted import; create initial version 1 with null parent. |
| `POST /api/coordinator/forecast-runs/{forecastRunId}/reviews` | Same scope; explicit `DRAFT` to `UNDER_REVIEW` transition, optimistic revision and atomic audit. |
| `GET /api/coordinator/forecast-runs/{forecastRunId}` and `GET /api/coordinator/forecast-runs/{forecastRunId}/audit?limit=&cursor=` | Same role; resource echoes stored scope; paged audit; unknown IDs return 404 without data leakage. |
| `POST /api/coordinator/forecast-runs/{forecastRunId}/decisions` | Same scope; body includes scope; justified decision/section adjustment; `subjectId` is canonical `subject.subject_id`, not a `curriculum_subject_id`; actor and before/after values derived server-side and audited atomically. |
| `POST /api/coordinator/forecast-runs/{forecastRunId}/finalizations` | Same scope; body includes scope; resolve required review, append final audit, then freeze in one transaction. No publication endpoint. |
| `GET/PUT /api/admin/forecasting/configuration` | Active System Administrator only; read/update UC20 capacities, precedence, exclusions and staleness settings; no cohort access. |

The multipart contract uses a UTF-8 CSV upload with the v1 size/row bounds above. A 422
correction report includes an `ETag` bound to `validationRevision`; the one-time subset
acceptance sends that exact revision in `If-Match` and the request body. Import and every
mutation require `Idempotency-Key`. The server namespaces it by authenticated
actor, operation and programme/centre/semester scope; the literal key value need not contain
scope. After authenticating, check a matching prior operation receipt before current resource
state/revision so identical retries replay the original receipt even after later changes.
Key reuse with a different payload returns 409. Subset acceptance is fingerprint/revision
bound and single-use. Review, finalization and configuration updates require current `ETag`
via `If-Match`; stale revision returns 412. Initial run is `(programme, centre, target
semester, version 1, parent null)`; an existing baseline conflicts rather than creating a
duplicate.
Configuration updates append a new immutable configuration version/active pointer; they do
not mutate capacity-rule rows already referenced by a forecast. Only `REPLACE_ALLOCATION`
replaces a subject's full proposed allocation (omitted prior section IDs are retired from the
current allocation, entries without IDs create sections). `REVIEW`, `APPROVE` and `DEFER`
preserve the current allocation. All actions retain original recommendations and historical
rows and audit complete before/after values. The run records server-derived
`generatedBy`; finalization records
server-derived actor/time, and the finalized run is read-only. Per-subject result quality is
`SUPPORTED`, `PRELIMINARY` or `INSUFFICIENT_DATA`; an unknown forecast count is `null`, never
zero. The immutable rule snapshot stores actual curriculum, prerequisite/condition,
exclusion, capacity, source and assumption provenance, not only an engine version.
Bound list/audit reads with cursor/limit. Use 401/403 for auth, 404 for absent or
scope-mismatched resource, 413 for upload size, 422 for field/row correction, 409 for
state/idempotency conflict and 503 for retryable dependency failure. Never expose SQL or
provider errors. No-store all private responses.

## Persistence and lifecycle requirements for Package 2

- Add programme context to accepted import and forecast resources; enforce scope agreement.
  Replace current `(centre, semester, version)` uniqueness with
  `(programme, centre, target semester, version)` and reserve initial version 1 with no
  parent per scope.
- Store completeness, source fingerprint/date/label, validation counts, subset decision,
  accepted state, recognized credit evidence, per-student uncertainty, rule/config snapshot,
  engine version and exclusion reasons needed for reproducibility.
- Freeze an import snapshot when accepted, before any forecast references it; correction
  creates another snapshot. Keep `DRAFT -> UNDER_REVIEW -> FINALIZED`; audit before/after
  decisions/allocations and verified actor/time/reason/reference append-only in the same
  transaction. Finalized data is read-only. No raw cohort access to browser storage, shared
  caches or logs; retention duration/external data handling remain operational decisions,
  not a coordinator UI approval step.
- Extend persistence for recognized-credit evidence, subject-level quality/nullable counts,
  immutable rule snapshots and run-level/subject-level audit anchors needed for complete
  allocation before/after history. Preserve class type as nullable `LECTURE`/`LAB`; keep
  prerequisite data availability separate from a known empty prerequisite rule.

## Unresolved institutional inputs

Do not invent source outcome mappings, retake precedence, official credit/CGPA evidence,
capacity values, exception authority or retention duration. The proposed `ACTIVE` to
supported-potential-demand mapping is a provisional engineering default, not an institutional
eligibility claim; unknown source tokens stay uncertain per student. Missing capacity
is section-level `CONFIGURATION_REQUIRED`, not a fabricated value. User-approved global
configured-centre/programme selection and the advisory supported-pool baseline are not
approval gates.
