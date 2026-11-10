# Shared database handoff — all programmers

Status: development draft, not production-frozen. See schema-decisions.md and
verification.md for exact evidence and blockers. The dictionary maps 26 entities,
171 fields and 39 source FKs without adding domain tables.
Approved additive engineering extensions are registered separately in
`db/engineering-extensions.json`; they do not rewrite that frozen baseline dictionary.

## IDs and storage

Canonical domain PK/FK values are INTEGER, not UUID. Source TIMESTAMP maps to
timestamptz. JSONB assumptions must be objects. Source field names/types and explicit
normalizations are exhaustively listed in field-mapping.md and db/schema-contract.json.
Undefined source nullability and additional constraints are explicit decisions.

The historical UUID access table is not the canonical schema. Approved adoption
preserves its rows/key history in private migration_meta metadata. Application queries
must use the public schema. Do not expose metadata archive/mapping tables to browsers.

## P001 — profiles, curriculum and academic records

Consume programme, curriculum, subject, curriculum_subject, curriculum_requirement,
subject_prerequisite, subject_semester_rule, student_profile and academic_record.
No independent recreation of these tables after baseline adoption.
CurriculumRequirement's source Curriculumcurriculum_id maps to curriculum_id.
Academic records preserve retakes across semesters and one undated attempt; consumers
must not double-count credits from attempts. This supersedes the old P001 handoff's
proposed one-current-record constraint once the database baseline is adopted.
Record notes use remarks. Profile work/study hours are nullable in the source and
nonnegative when supplied. Valid profile completion remains an application contract.
Credit totals and official subject/prerequisite rules must come from approved data.

### SECJ version 1 Industrial Training eligibility

The SECJ version 1 curriculum requires at least 92 recognized credits before
Industrial Training (SECJ4114 and SECJ4118). Calculate the total from
`academic_record.recognized_credits` for `COMPLETED` and `EXEMPTED` records, counting
credit for a subject only once across repeated attempts. The current database stores
the 92-credit threshold in `curriculum_requirement` as `INDUSTRIAL_TRAINING`.

The source also requires CGPA above 2.00. CGPA is not calculated or enforced yet:
there is no CGPA field or agreed grade-point scale/repeat policy in the current
system. Add a student-facing note for this condition when the eligibility UI is
implemented, and do not report Industrial Training eligibility as fully verified
until CGPA handling is defined.

## P002 — semesters, offerings and plans

> **S2-P004-017 to S2-P004-024 (2026-11-10):** the coordinator-confirmation plan of S2-P004-006 was replaced by a simpler flow (migration 0009). `offering_decision` holds one row per programme + learning centre + semester + subject with status `APPROVED` or `REMOVED` (no row means Pending); `offering_decision_audit` is its append-only history and `offering_pick_withdrawal` remembers which students lost a pick when an approved subject was removed. `academic_semester.selection_opens_at` / `selection_closes_at` (admin-managed) decide when students may pick: before opening, planning; from opening until closing, open; after closing, read-only. Students pick only approved subjects of the next semester after the admin current semester, still stored in `semester_offering`, and picks respect `academic_semester.max_subjects` / `max_credits`; already-passed subjects are hidden. Assigned coordinators see the pickers per subject (`student_profile.student_name`, `matric_no`, sign-in email) for their programme + learning centre; students never see others' picks. The 0007 tables (`offering_confirmation`, `confirmed_offering` and their audit tables) stay in the database but nothing reads or writes them; `forecast_run.status` is always `DRAFT` from now on and `proposed_class_section` is only written when a run is generated.

Consume academic_semester, semester_offering, academic_plan and plan_subject.
SemesterOffering uniqueness: student_id + semester_id + curriculum_subject_id.
Storage uses integer IDs. The current P002 integration adapter serializes these as
positive decimal strings at its API boundary and normalizes numeric input; it rejects
UUIDs. Keep those conversions at the boundary, without changing canonical SQL types.
Do not apply p002/db/20261024_p002_semester_offering.sql to this canonical database.
Semester 1/2 type NORMAL; 3 SHORT; limits are configured data, not fixed 10/6 values.
A subject mapping must match its owner's selected curriculum.

## P003 — pathways and simulations

Read the same catalogue and academic records. Treat duplicate attempts with the
agreed outcome/credit policy; do not count every attempt as independent earned credit.
MANDATORY is a blocking edge, RECOMMENDED advisory, COREQUISITE distinct.
SimulationScenario source plan must have the same owner; simulated subjects remain
separate from academic_record. Superseded (S2-P004-006, S2-P004-023): StudentProfile gains a learning centre (`student_profile.learning_centre_id`, P001) that the student chooses on the profile page; programme and curriculum are locked after setup, and the centre is locked from the moment selection opens for the next semester until the admin moves the current semester forward (a student with no centre may always set one).
The DB contains scenario/plan data structures, not scheduling/forecast algorithms.

## P004 — authentication, M6 and M7 persistence

Current auth queries select clerk_user_id/app_role/access_status and let the database
generate the assignment key. Those production query shapes work with INTEGER keys;
no auth UI/API changes were made in this task.
Existing auth database tests build an isolated historical UUID test table. They test
that historical contract, not the 26-table schema. Use db:verify/db:test for this baseline.
Future account APIs that expose assignment IDs must adapt to integers explicitly.

### Package A academic setup (0008, local implementation)

SYSTEM_ADMIN management APIs are wired at `/api/admin/academic-setup`; see
`docs/api/admin-academic-setup.openapi.json` and `packages/shared/src/admin/academic-setup.ts`.
The backend repository implements reference/semester maintenance, programme faculty
assignment, explicit current-semester selection and coordinator assignment creation/end.
All mutations require a normalized 1-500 character reason and use the verified actor
with transaction-local settings. SQL binds values, PATCH changes only supplied whitelisted
fields and PostgreSQL validates merged semester dates/type. Failures expose fixed domain
messages, never driver SQL. No Clerk API call is added by this academic module.

`faculty` is an active/inactive reference and `programme.faculty_id` is optional.
No institutional mapping/catalogue is seeded. `learning_centre.is_active` preserves
historical references when deactivated; inactive references cannot be used for new links
or assignments. Programme reassignment is rejected while live assignments reference it.
`academic_semester.is_current` is a system marker separate from the profile's current
semester: no current row is valid and GET returns null until deliberate admin selection.
The atomic setter permits at most one current row, with no automatic date-based choice.

`coordinator_assignment` records account/faculty/programme/centre plus start/end timestamps.
Only one unended account/programme/centre scope is permitted; ending retains history.
Creation requires an ACTIVE account with a current COORDINATOR membership, active
faculty/centre/programme and matching programme/faculty. Admin history remains readable
after suspension, role removal or reference deactivation. Immutable
`academic_setup_audit_log` stores actor/reason and before/after data for academic changes;
one SET_CURRENT audit event represents each actual switch, with repeated selection a no-op.

Future forecast adapters may consume the exported `AcademicScopeReader` through
`createAcademicRepository` in `apps/api/src/modules/admin/index.ts`:

| Method | Read contract |
| --- | --- |
| `currentSemesterId()` | Explicit system current ID or null; never infer from dates/order. |
| `listActiveLearningCentres()` | Only active centre options. |
| `listScopes(clerkUserId)` | Distinct live faculty/programme/centre scopes for the supplied verified identity. |
| `isScopeAssigned(clerkUserId, programmeId, learningCentreId)` | Live assignment predicate for the requested programme/centre. |

Scope reads are uncached and join the currently ACTIVE account, COORDINATOR membership,
unended assignment, active faculty/centre and programme with matching faculty.
Programme status uses `coalesce(upper(status),'ACTIVE')='ACTIVE'`. Consuming adapters
must authenticate/authorize their caller; supplying an arbitrary Clerk ID is not an
authorization mechanism. This package did not change the forecast ScopeProvider; `studentLearningCentreId` now
reads `student_profile.learning_centre_id` (S2-P004-023): the student chooses the learning
centre on the profile page (P001), migration 0009 set existing students to Kuala Lumpur, and
students without a centre are left out of "students in the system" snapshots (counted under
other centre).

Local verification uses isolated 0000-0006+0008 only. Shared development must first
integrate exact 0007/checksum/prefix, then 0008, then 0009; see migrations.md.
No shared/Neon 0008 application or deployed service-role readiness is implied.

Keep STUDENT/COORDINATOR/SYSTEM_ADMIN and ACTIVE/SUSPENDED.
Clerk owns credentials and verified identity. DB roles do not authenticate Clerk users.
Workers enforce owner scope, email verification and role/status authorization.
Privileged services must authenticate the actor, serialize role updates/last-admin
checks, and append the corresponding audit atomically. The last-admin trigger is an
additional backstop, not a replacement for authenticated service authorization.

Coordinator imports are independent of StudentProfile. Import batches store source date,
provider and synthetic labels. Forecasts preserve centre/semester/version/parent and
source references. Finalized payloads and decisions remain frozen after status becomes
SUPERSEDED or ARCHIVED. Write final decision audit before finalization in one transaction.
Use new runs/rules/snapshots for revisions; never rewrite saved forecasts for refresh.

## Runtime database permissions

Use non-owner backend roles with least-privilege grants. Student-facing services must
not have access to coordinator cohorts or mutable access/audit privileges.
Do not grant table ownership, schema CREATE or trigger-disable powers to runtime users.
Grant only required table/sequence/function permissions through reviewed deployment
configuration. No automatic role/bootstrap grants are hidden in the schema migration.
There is no claim of tenant RLS. No browser-visible database credential is permitted.

## Shared migration ownership

The canonical manifest supersedes feature-level table creation only after team adoption.
Subsequent schema changes require DATABASE_FOUNDATION/integration review and a new version.
P001/P002/P003/P004 keep their feature ownership, using the same shared schema.
