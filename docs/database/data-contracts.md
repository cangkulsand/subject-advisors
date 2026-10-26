# Shared database handoff — all programmers

Status: development draft, not production-frozen. See schema-decisions.md and
verification.md for exact evidence and blockers. The dictionary maps 26 entities,
171 fields and 39 source FKs without adding domain tables.

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

## P002 — semesters, offerings and plans

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
separate from academic_record. No learning-centre FK is invented for StudentProfile.
The DB contains scenario/plan data structures, not scheduling/forecast algorithms.

## P004 — authentication, M6 and M7 persistence

Current auth queries select clerk_user_id/app_role/access_status and let the database
generate the assignment key. Those production query shapes work with INTEGER keys;
no auth UI/API changes were made in this task.
Existing auth database tests build an isolated historical UUID test table. They test
that historical contract, not the 26-table schema. Use db:verify/db:test for this baseline.
Future account APIs that expose assignment IDs must adapt to integers explicitly.

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
