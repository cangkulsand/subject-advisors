# Database Implementation Guide — Database-First Foundation

> **Project:** AI-Powered Academic Advisory System for UTMSPACE Part-Time Students  
> **Primary specification:** *SRS + SDD v2.0*, dated **24 October 2026**, especially Chapter 5 (Data Design), Chapter 2 (Requirements) and Chapter 3 (Architecture).  
> **Target:** **Neon PostgreSQL**, accessed only through authenticated Cloudflare Workers API; identity supplied by **Clerk**.  
> **Change-control rule:** `implementationguide.md` — **PLAN → IMPLEMENTATION → REVIEW → CHANGELOG** on every database modification.  
> **Database gate:** Complete and review this foundation **before** Programmers 1–4 implement production data access.  
> **Status:** Reviewable baseline implementation, **not** a claim that the database has been deployed or its policies officially approved.

## 0. Copy/paste Codex instruction — execute this database task first

```text
Read databaseimplementation.md and implementationguide.md completely.
You are acting as the designated DATABASE_FOUNDATION owner for the entire
UTMSPACE academic advisory database, not as Programmer 1/2/3/4.

Inspect the repository, git status, existing database code and the SRS/SDD v2.0.
Plan the work in docs/changes/DB-FOUNDATION-001-schema-baseline.md, then
review db/migrations/0001_initial_schema.sql and db/checks/001_schema_verification.sql.
Resolve any repository compatibility issues without silently changing the
26-entity SRS model. Use a single, versioned migration workflow and create
necessary migration tracking in the repository. Do not add application UI,
APIs, login screens, forecasting algorithms or sprint feature code.

Run the migration and SQL checks ONLY on a disposable/local/Neon development
database that has been explicitly selected and confirmed safe for schema creation.
Never connect to or alter production by default. Do not run destructive resets
against existing data. If credentials or approval decisions are missing,
complete static review and report BLOCKED rather than pretending DB tests passed.

Test schema inventory, column mappings, foreign keys, unique/check constraints,
role enforcement boundaries, curriculum isolation, rejected invalid inserts,
audit immutability, forecast versioning and finalized-run read-only behavior.
Record real commands and results. Update the change record's PLAN,
IMPLEMENTATION, REVIEW and CHANGELOG stages. Publish final schema/ERD,
migration order, known decisions and handoff contracts for all four programmers.
```

This one-off database task is **separate from Sprint 1 ownership**. Once the schema baseline is merged, all programmers **consume the same tables**. Do **not** let P001, P002 or P004 recreate `student_profile`, `semester_offering` or `user_access_assignment` in competing migrations. `sprint1.md` originally assigns feature-level migration ownership; **this new database-first workflow supersedes that allocation only after the shared database baseline is adopted by the team**. Their feature ownership and six Sprint 1 use cases remain unchanged.

## 1. Deliverables and completion order

| Order | Deliverable | Gate / evidence |
| --- | --- | --- |
| 1 | `docs/changes/DB-FOUNDATION-001-schema-baseline.md` | Write PLAN before modifying repository code/migrations |
| 2 | `docs/database/schema-decisions.md` | Record all decisions in §4, official-data blockers and any approved deviations |
| 3 | `db/migrations/0001_initial_schema.sql` | Exactly 26 entity tables, constraints, indexes and documented triggers |
| 4 | `db/checks/001_schema_verification.sql` and `002_behavior_tests.sql` | Read-only structural inventory plus rollback-only synthetic integrity tests |
| 5 | `db/erd/schema.mmd` and reviewed ERD documentation | Document PK/FK cardinalities; retain separate student/coordinator cohorts |
| 6 | `docs/database/data-contracts.md` | Publish stable table/column/status conventions for P001–P004 |
| 7 | DB integration/invariant tests | Demonstrate rejected invalid writes and allowed valid writes in a disposable DB |
| 8 | Completed REVIEW + CHANGELOG | Exact executed commands, outcomes, reviewer status and decision log |

**Done means design + tested development migration + review evidence**, not simply that the SQL file exists. External Neon resources and credentials are supplied by the team, not fabricated by Codex.

## 2. System boundaries (non-negotiable)

- **26 entities total:** **15 academic** (M1–M5), **9 coordinator forecast** (M6) and **2 administrator access/audit** (M0/M7). All are defined in §5 / Appendix A.
- Initial release supports **one selected programme and curriculum version**. The schema supports future curricula, but never seeds unverified programme rules as official.
- Students manually enter academic history and current offerings; **no direct official UTM/UTMSPACE integration** is in scope.
- Coordinator-provided `academic_import_batch` → `imported_student` → `imported_subject_record` records are independent of `student_profile`/`academic_record`. Never merge their identities or expose cohorts to students.
- `subject` and `curriculum` are shared references; students use curriculum mapping and coordinator imports use the same vetted catalogue.
- Clerk owns credentials, verification and sessions. PostgreSQL stores **only `clerk_user_id` mappings and application authorization**; no local passwords or secret tokens.
- Three roles: `STUDENT`, `COORDINATOR`, `SYSTEM_ADMIN`; application state: `ACTIVE`/`SUSPENDED`. **Never grant elevated roles from client-submitted values.**
- All personalized academic outputs are advisory. The DB must never imply official enrollment, confirmed offering or guaranteed graduation.
- Academic records and simulations are distinct: simulation updates must never write academic-record history.
- Planning rules (credits, prerequisites, exceptions, capacities) must be **configuration-driven**, not assumed universal constants.

## 3. Canonical 26-table inventory and ownership

| Domain | Tables (canonical PostgreSQL name) | Features / primary users |
| --- | --- | --- |
| Reference catalogue (7) | `programme`, `curriculum`, `subject`, `curriculum_subject`, `curriculum_requirement`, `subject_prerequisite`, `subject_semester_rule` | M2, shared |
| Semester + student data (4) | `academic_semester`, `student_profile`, `academic_record`, `semester_offering` | M1/M3, P001/P002 |
| Plans + scenarios (4) | `academic_plan`, `plan_subject`, `simulation_scenario`, `simulation_subject` | M3/M5, P002/P003 |
| Coordinator input + forecasting (8) | `learning_centre`, `academic_import_batch`, `imported_student`, `imported_subject_record`, `class_capacity_rule`, `forecast_run`, `forecast_subject_demand`, `proposed_class_section` | M6, P004 in later sprints |
| Authorization + audit (2) | `user_access_assignment`, `user_access_audit_log` | M0/M7, P004 |
| Coordinator decision audit (1) | `forecast_decision_audit_log` | M6, P004 in later sprints |
| **Total** | **26** | Matches SRS/SDD v2.0 Chapter 5 |

Migration order must respect those dependencies. The supplied baseline SQL creates tables in foreign-key order and defines indexes/triggers last. Do **not** derive database table names by asking each programmer to invent them.

## 4. Decisions to document before declaring schema FROZEN

The following are **engineering implementation decisions or unresolved specification questions**, not claims that the SRS already settled them. Record the accepted decision, owner, rationale and any follow-up in `docs/database/schema-decisions.md`.

| # | Topic | Proposed safe database baseline | Open question / effect |
| --- | --- | --- | --- |
| D01 | Naming | PostgreSQL `snake_case` tables/columns; map each original entity/field in Appendix A. | Source contains the anomalous literal `Curriculumcurriculum_id`. The SQL intentionally normalizes it to `curriculum_requirement.curriculum_id`; document before freeze. |
| D02 | Keys/time | Integer identity PK, declarative FKs, `timestamptz` UTC for documented TIMESTAMP fields, `date` for date-only values. | Source specifies INTEGER/TIMESTAMP conceptually, not sequence or timezone policy. |
| D03 | Academic attempts | Preserve multiple attempts of a subject in **different semesters**, prevent duplicates in one semester; allow one undated attempt until its semester is clarified. Do not sum attempted credits twice. | Source does not assign an `attempt_no`. Confirm record correction/versioning and how to record repeated attempts when semester is unknown. |
| D04 | Auth/profile creation | Create `user_access_assignment` after authenticated/verified student account; create non-null `student_profile.curriculum_id` only when mandatory profile setup selects a valid curriculum. | Resolve the UC01 text's preliminary profile initialization against the required `curriculum_id` FK. |
| D05 | Subject uniqueness | Retain globally unique `subject.subject_code` from SRS; permit one subject in multiple curricula via `curriculum_subject`. | If the **same code** legitimately represents two distinct subjects, official catalogue evidence requires a reviewed change. |
| D06 | Learning centre | Coordinator cohorts always carry a learning centre. No student learning centre FK is present in the 26-entity data dictionary. | Validate whether student programme/centre-specific planning also requires `student_profile.learning_centre_id`, or a separate assignment model, before implementing cross-centre restrictions. |
| D07 | Academic parameters | Require configured semester caps, types and permitted-subject rules; no hard-coded data rows. | SRS states normal semester caps and some capacity values are **provisional** until verified. |
| D08 | Non-classroom subjects | `subject.include_in_offering_forecast = false` for confirmed FYP1, FYP2, Industrial Training catalogue records. | These remain relevant to graduation but not ordinary lecture/lab section calculations. Never flag unverified dummy subjects as official. |
| D09 | Class-capacity policy | Capacity rule values editable and explicit; no invented reference numbers. | SRS examples include provisional thresholds/capacities; consult coordinator before seeding live values. Current table is not centre-specific. |
| D10 | Forecast lineage | Unique `(learning_centre_id, target_semester_id, version_number)`; immutable prior versions; scoped parent link; no overwriting snapshots. | Define initial version number and allowed status transitions in application workflow. |
| D11 | Finalization | Stored forecast demand/section decisions become immutable after finalization; finalized versions may receive controlled lifecycle metadata updates. | Ensure a transaction records the final decision audit **before** the finalizing status change. |
| D12 | Roles/audit | DB checks roles, status and append-only audit. Only server-owned admin workflows may change privileges, with a last-admin safeguard implemented and concurrency-tested at API/service level. | Approval/privileged bootstrap runbook still needed; never give every new Clerk user admin privileges. |
| D13 | Status coding | Canonical uppercase database values where fixed enums exist (e.g., `COMPLETED`, `DRAFT`); API/UI render readable labels. | SRS uses mixed case in descriptions; mapping must be documented and consistent. |
| D14 | Dependency semantics | Mandatory prerequisite edges are acyclic; advisory edges are non-blocking; corequisites/concurrent conditions are distinct. | Actual curriculum dependencies, including English sequence/FYP exceptions, require approved catalogue records. |
| D15 | RLS vs Workers | Database access via protected Worker backend, parameterized statements, least-privilege DB role; no browser-side credentials. | If a team adds direct database access later, design RLS first; **Clerk IDs do not automatically create Postgres roles**. |
| D16 | Unspecified lifecycle fields | Keep only documented columns unless a change record approves additions. Use constraints when semantics are certain; ambiguous statuses remain `varchar` until confirmed. | Define plan statuses, scenario change types, source import statuses, subject offering source labels and exceptional decision lifecycle before using them in APIs. |

**Freeze policy:** Any unresolved item that affects a primary/foreign key, relationship, access model or academic-policy correctness is a **blocker to production rollout**. Development may proceed against the labelled baseline when the risks are documented; do not claim academic-policy approval.

## 5. Implementation constraints and invariants

### 5.1 IDs, constraints, indexes

- Use referential foreign keys, uniqueness, and `CHECK` constraints. Prevent negative credit counts, invalid academic semester numbers, invalid roles and impossible forecast section counts.
- Avoid duplicate `(curriculum_id, subject_id)` and duplicate `(student_id, semester_id, curriculum_subject_id)`.
- `academic_semester` must have unique `(academic_year, semester_no)`, with semester 3 `SHORT` and semesters 1/2 `NORMAL`. Limits come from configuration rather than a permanent 10/6 DB constant.
- Every subject recorded, offered, planned or simulated by a student must belong to the **same curriculum** as that student. The migration includes membership triggers to supplement simple FKs.
- `subject_prerequisite` endpoints must belong to the same curriculum and mandatory prerequisite relationships must not form cycles. Enforce at DB write time and repeat in domain validation.
- Source plan for a scenario must belong to the same student.
- One `forecast_run` must reference an import batch from its own learning centre; parent forecast must share the learning centre and target semester.
- Index common owner-scoped queries, curriculum lookups, forecast version lookups and timestamped audit history.
- **Known limitation:** schema triggers check membership at the time of child writes. Reassigning an existing student's curriculum or re-mapping subjects can invalidate dependent historical references. Require a domain-level controlled workflow and migration review; do not permit ad hoc curriculum switching after dependent records exist.

### 5.2 Roles, security, and audit

1. Derive `clerk_user_id` from a **verified server-side Clerk session**. Never trust an arbitrary browser `student_id` for ownership.
2. Only verified `@graduate.utm.my` students receive automatically provisioned `STUDENT` access; Coordinator/System Administrator roles are explicitly authorized.
3. Reject suspended access and missing roles at the API. Database FK/role checks do **not** replace authorization.
4. Retain access changes in `user_access_audit_log`: actor, target, old/new status or role, reason and timestamp. Never update/delete audit events.
5. Use an explicit, reviewed administrator bootstrap procedure; never seed a real admin Clerk ID into public migrations.
6. Forbid disabling or demoting the last active System Administrator, with transaction-safe serialization and tests. A simple UI check is insufficient.
7. Restrict personally identifying coordinator imports and student records to authorized services; do not create publicly accessible database clients.
8. Store Neon credentials in server-side secret storage or local `.env` (gitignored), **never** as a `VITE_*` variable.

### 5.3 Coordinator forecasting protection

- Snapshot dates, source labels, the supplied/recorded `is_synthetic` flag and data coverage must stay explicit. Missing academic history must not become falsely verified eligibility.
- Coordinator import records are not links to live `StudentProfile` rows.
- Version numbers are unique per centre + target semester; refresh means **new run**, not destructive update.
- `FORECAST_RUN` draft/under-review modifications are recorded through application services; once `FINALIZED`, stored forecasts and decisions cannot change. Controlled transition to `SUPERSEDED` or `ARCHIVED` does not unlock the payload.
- Decision records are append-only; imported snapshots and finalized versions are retained for history and comparison.
- FYP1/FYP2/Industrial Training exclusion flags should only be set when actual curriculum catalogue and policy are verified.

## 6. Execution instructions — development environment ONLY

### Prerequisites

- An **empty or separately approved** Neon PostgreSQL **development** database/branch.
- A suitable migration runner / CLI and secured `DATABASE_URL` available **only on the server/developer environment**.
- Repository backed up or version controlled. No known uncommitted changes overwritten.
- The SQL scripts in the bundle placed at the paths shown above. **Do not assume a production database is empty.**

### A. Repository review and Plan

```bash
git status --short
find db -maxdepth 3 -type f | sort
```

Read all existing migrations and inspect the actual database schema through a secure DB client. Record whether the DB is new, existing or already partially migrated. If schema already exists, write a **forward-only reconciliation migration**, not `DROP ... CASCADE` and not a blind re-run of this initial migration.

### B. Run on a NEW disposable development database

```bash
# Export DATABASE_URL securely beforehand (do not echo or commit it).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f db/migrations/0001_initial_schema.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f db/checks/001_schema_verification.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f db/checks/002_behavior_tests.sql
```

If the repo already uses Drizzle/Prisma/Kysely, use the **existing versioned migration system** instead of adopting a second one or running untracked raw SQL. The direct `psql` invocation is suitable only for initial isolated-schema verification; applied migrations must remain tracked exactly once. Neon SQL Editor is an alternative for a manually selected **development branch**, but still requires recording what was applied.

### C. Verification and invalid-write tests (run in rollback-only transactions)

Codex should write transaction-wrapped tests (`BEGIN; ... ROLLBACK;`) that use **synthetic fixtures only** and verify that the DB rejects:

- Duplicate programme/subject/curriculum mappings and duplicate student offerings.
- Invalid semester 4; semester 3 labelled NORMAL; negative credit or hours.
- Curriculum mismatch in records, student offerings, plans and simulations.
- Prerequisite edges across curricula; a prerequisite cycle.
- A scenario using another student's source plan.
- Forecast run whose source batch belongs to another learning centre.
- Duplicate forecast version for the same centre+semester; mutated finalized demand/sections.
- Update/delete of either audit table.
- Invalid role/status, including unauthorized elevation at the Worker layer.

Also verify **positive** examples: two curricula sharing a vetted subject catalogue row, legitimate retakes in separate semesters, student offerings stored as self-reported information, valid draft-to-finalized forecasts, new forecast version retaining its predecessor, and valid coordinator/student identities remaining separate.

Save the **actual** test output and inventory counts. SQL checks in the bundle verify the schema structure; they do **not** replace behavioral tests or a formal security review. A missing local PostgreSQL/Neon connection must be reported `NOT RUN`.

### D. Handoff before Sprint 1 application coding

Publish the accepted entity names, types, role/status enums, constraints, data ownership, migration identifiers, test evidence, approved curriculum dataset status, and outstanding blockers. Ensure P001/P002/P003/P004 import common shared contracts rather than designing their own tables. If the migration baseline is not yet merged, use clearly labelled fixtures for UI tests and avoid working production APIs that rely on nonexistent tables.

## 7. Data import and seed policy

**Do not seed real degree curriculum, graduation total, prerequisites, campus/centre allocation, forecast thresholds, or capacity figures unless the approved source is supplied.** The SRS is a **proposed model**, not a verified authoritative catalogue. Create one controlled import mechanism for approved source files, including version, source, effective date and validation report in documentation.

For local tests only, synthetic curriculum fixtures may demonstrate prerequisites and semester limits, but label them `DEMO / NOT OFFICIAL UTMSPACE DATA`. Do not invent programme codes, student identities, matric numbers or realistic external cohort references. Never commit real student academic histories or Neon secrets.

## 8. Migration/versioning policy

- The single `DATABASE_FOUNDATION` owner creates `0001_initial_schema.sql`; then freeze it once successfully applied to shared development. Later changes are **additive migrations** (`0002_...sql`, `0003_...sql`) with change records.
- Use transactions for reversible DDL where supported; make backup/recovery explicit for destructive operations. Do not drop/recreate shared tables to resolve development conflicts.
- Test migrations from an empty development DB and, for subsequent changes, from the preceding migration version. Test rollback strategies using a disposable DB or restore snapshots; production rollbacks may require a forward fix.
- Never expose database passwords in a change log, CI output, screenshots or markdown.
- Any change impacting cross-programmer contracts requires review and a synchronized migration/type update, not an undocumented alteration by one feature owner.

## 9. Acceptance checklist — database foundation gate

- [ ] A single designated DATABASE_FOUNDATION owner and change record exist.
- [ ] All **26 SRS entities** mapped and documented; no silently added 27th domain entity.
- [ ] All SRS-required fields/relationships represented or explicitly mapped/deviated.
- [ ] All primary keys, foreign keys, unique indexes and important checks are present.
- [ ] Student and coordinator academic records are isolated.
- [ ] Subject/curriculum consistency and prerequisite cycles are tested.
- [ ] Authentication/authorization requirements are documented; no local password fields.
- [ ] App roles, role-change history and append-only decision history are supported.
- [ ] Forecast version uniqueness, source snapshot, lineage and frozen-finalization behavior verified.
- [ ] Approved official data and provisional policy values are clearly distinguished from demo fixtures.
- [ ] Development database migration and schema verification executed and **actual results recorded**.
- [ ] No development run touched production or destructively reset existing records.
- [ ] ERD and data contracts handed to all programmers.
- [ ] PLAN → IMPLEMENTATION → REVIEW → CHANGELOG complete; human approval labelled truthfully.

## 10. Change record and reporting template

```markdown
# DB-FOUNDATION-001 — Initial 26-entity database baseline

## PLAN
Scope: SRS/SDD v2.0 Chapter 5; owner DATABASE_FOUNDATION.
Existing schema: <inspection findings>
Decisions: D01–D16 accepted / pending; risks, rollback and database target.
Expected files: initial migration, checks, ERD, contracts, behavior tests.

## IMPLEMENTATION
Actual files changed:
Migrations applied on: <DEVELOPMENT database/branch identifier, no secret>
Differences from SRS (if any):

## REVIEW
Schema count: PASS/FAIL/NOT RUN
FK/unique/check tests: PASS/FAIL/NOT RUN
Curriculum/auth/forecast invariant tests: PASS/FAIL/NOT RUN
Command/output evidence: <sanitized logs>
Peer/human review: APPROVED/PENDING (name optional)
Outstanding risks and mitigation:

## CHANGELOG
- YYYY-MM-DD: <what actually changed; link to commit/PR if available>
```

## Appendix A — Source-to-schema field mapping (all 26 entities)

The **attribute labels, order and source descriptions** below are transcribed from the uploaded SRS/SDD v2.0 Chapter 5.2. SQL uses lower-case snake_case and explicit database constraints. Where implementation types or names differ, §4 and the SQL migration define the intended mapping. The original data-dictionary entries are not automatically proof of university policy approval.

### A.01 Programme → `programme`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `programme_id` | INTEGER; PK; NOT NULL | Unique programme identifier. |
| `programme_code` | VARCHAR(20); U; NOT NULL | Unique programme code. |
| `programme_name` | VARCHAR(255); NOT NULL | Official programme name. |
| `level` | VARCHAR(50); NULL | Optional qualification or programme level. |
| `status` | VARCHAR(20); NULL | Optional programme status. |

### A.02 Curriculum → `curriculum`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `curriculum_id` | INTEGER; PK; NOT NULL | Unique curriculum version identifier. |
| `curriculum_version` | VARCHAR(20); NOT NULL | Version label for the curriculum. |
| `total_credit_required` | INTEGER; NOT NULL | Credit total needed for graduation under this curriculum. |
| `effective_year` | INTEGER; NULL | Optional year in which this curriculum takes effect. |
| `status` | VARCHAR(20); NULL | Optional curriculum status. |
| `programme_id` | INTEGER; FK; NOT NULL | Parent Programme. |

### A.03 Subject → `subject`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `subject_id` | INTEGER; PK; NOT NULL | Unique subject identifier. |
| `subject_code` | VARCHAR(20); U; NOT NULL | Unique subject code in the current ERD. |
| `subject_name` | VARCHAR(255); NOT NULL | Subject title. |
| `credit_hours` | INTEGER; NOT NULL | Credit value assigned to the subject. |
| `subject_category` | VARCHAR(50); NULL | Optional subject category. |
| `status` | VARCHAR(20); NULL | Optional subject availability/status. |
| `include_in_offering_forecast` | BOOLEAN; NOT NULL; DEFAULT TRUE | Controls inclusion in M6 class-section recommendations; FALSE for FYP1, FYP2 and Industrial Training. |
| `class_type` | VARCHAR(20); NULL | LECTURE or LAB for M6 capacity rules; future combined teaching components may require a separate mapping. |

### A.04 CurriculumSubject → `curriculum_subject`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `curriculum_subject_id` | INTEGER; PK; NOT NULL | Identifier for the curriculum-subject mapping. |
| `is_compulsory` | SMALLINT; NOT NULL | Compulsory-subject flag (0 or 1 in the current ERD). |
| `subject_category` | VARCHAR(50); NOT NULL | Subject classification within the applicable curriculum. |
| `curriculum_id` | INTEGER; FK; NOT NULL | References Curriculum. |
| `subject_id` | INTEGER; FK; NOT NULL | References Subject. |

### A.05 CurriculumRequirement → `curriculum_requirement`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `requirement_id` | INTEGER; PK; NOT NULL | Unique graduation requirement identifier. |
| `requirement_type` | VARCHAR(30); NOT NULL | Requirement category (e.g., compulsory or elective). |
| `required_credits` | INTEGER; NULL | Optional minimum credits for this requirement. |
| `required_subjects` | INTEGER; NULL | Optional minimum number of subjects in this requirement. |
| `Curriculumcurriculum_id` | INTEGER; FK; NOT NULL | References Curriculum; name retained exactly from the ERD. |

### A.06 SubjectPrerequisite → `subject_prerequisite`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `prerequisite_id` | INTEGER; PK; NOT NULL | Unique dependency rule identifier. |
| `requirement_type` | VARCHAR(20); NOT NULL | Type of prerequisite or associated requirement. |
| `curriculum_subject_id` | INTEGER; FK; NOT NULL | Dependent CurriculumSubject. |
| `required_curriculum_subject_id` | INTEGER; FK; NOT NULL | Required or related CurriculumSubject. |

### A.07 SubjectSemesterRule → `subject_semester_rule`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `rule_id` | INTEGER; PK; NOT NULL | Unique semester restriction rule. |
| `semester_type` | VARCHAR(10); NOT NULL | Allowed or configured semester type. |
| `curriculum_subject_id` | INTEGER; FK; NOT NULL | References the restricted CurriculumSubject. |

### A.08 AcademicSemester → `academic_semester`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `semester_id` | INTEGER; PK; NOT NULL | Unique academic semester identifier. |
| `academic_year` | VARCHAR(9); NOT NULL | Academic year label, e.g., 2026/2027. |
| `semester_no` | SMALLINT; NOT NULL | Semester number: 1, 2 or 3. |
| `semester_type` | VARCHAR(10); NOT NULL | NORMAL for 1/2 or SHORT for 3. |
| `max_subjects` | SMALLINT; NOT NULL | Configured subject-count limit for the semester. |
| `max_credits` | SMALLINT; NOT NULL | Configured credit limit for the semester. |
| `start_date` | DATE; NULL | Optional starting date of the semester. |
| `end_date` | DATE; NULL | Optional ending date of the semester. |

### A.09 StudentProfile → `student_profile`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `student_id` | INTEGER; PK; NOT NULL | Internal academic student profile identifier. |
| `clerk_user_id` | VARCHAR(255); U; NOT NULL | Unique authenticated user identifier supplied by Clerk. |
| `matric_no` | VARCHAR(30); NULL | Optional student matriculation number. |
| `student_name` | VARCHAR(255); NOT NULL | Student display name. |
| `weekly_working_hours` | INTEGER; NULL | Optional self-reported weekly employment hours. |
| `available_study_hours` | INTEGER; NULL | Optional self-reported study time per week. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time the profile was created. |
| `updated_at` | TIMESTAMP; NOT NULL | Date/time the profile was last updated. |
| `curriculum_id` | INTEGER; FK; NOT NULL | References the student's selected Curriculum. |

### A.10 AcademicRecord → `academic_record`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `record_id` | INTEGER; PK; NOT NULL | Unique academic subject record identifier. |
| `status` | VARCHAR(20); NOT NULL | Subject status: completed, exempted, failed or withdrawn. |
| `grade` | VARCHAR(5); NULL | Optional subject grade. |
| `recognized_credits` | INTEGER; NOT NULL | Credits recognized for graduation; may be zero. |
| `remarks` | VARCHAR(255); NULL | Optional exemption or academic record notes. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time this record was created. |
| `student_id` | INTEGER; FK; NOT NULL | References the owning StudentProfile. |
| `subject_id` | INTEGER; FK; NOT NULL | References Subject. |
| `semester_id` | INTEGER; FK, NULL | Optional reference to AcademicSemester. |

### A.11 SemesterOffering → `semester_offering`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `offering_id` | INTEGER; PK; NOT NULL | Unique semester-offering entry. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time the reported offering was created. |
| `student_id` | INTEGER; FK; NOT NULL | Student who reported the offering. |
| `semester_id` | INTEGER; FK; NOT NULL | AcademicSemester to which the offering applies. |
| `curriculum_subject_id` | INTEGER; FK; NOT NULL | Offered CurriculumSubject. |

### A.12 AcademicPlan → `academic_plan`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `plan_id` | INTEGER; PK; NOT NULL | Unique academic plan identifier. |
| `plan_name` | VARCHAR(100); NULL | Optional name assigned to the plan. |
| `plan_type` | VARCHAR(30); NOT NULL | Plan type, such as student-selected or recommended. |
| `status` | VARCHAR(20); NOT NULL | Current plan state. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time the plan was created. |
| `updated_at` | TIMESTAMP; NOT NULL | Date/time the plan was last updated. |
| `student_id` | INTEGER; FK; NOT NULL | References the owning StudentProfile. |

### A.13 PlanSubject → `plan_subject`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `plan_subject_id` | INTEGER; PK; NOT NULL | Unique selected-subject entry. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time the plan-subject entry was created. |
| `plan_id` | INTEGER; FK; NOT NULL | References AcademicPlan. |
| `curriculum_subject_id` | INTEGER; FK; NOT NULL | References the selected CurriculumSubject. |
| `semester_id` | INTEGER; FK; NOT NULL | References AcademicSemester for the planned subject. |

### A.14 SimulationScenario → `simulation_scenario`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `scenario_id` | INTEGER; PK; NOT NULL | Unique simulation scenario identifier. |
| `scenario_name` | VARCHAR(100); NOT NULL | Name of the hypothetical scenario. |
| `description` | VARCHAR(255); NULL | Optional scenario description. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time scenario was created. |
| `student_id` | INTEGER; FK; NOT NULL | References the owning StudentProfile. |
| `source_plan_id` | INTEGER; FK, NULL | Optional baseline AcademicPlan used for comparison. |

### A.15 SimulationSubject → `simulation_subject`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `simulation_subject_id` | INTEGER; PK; NOT NULL | Unique simulated subject-change identifier. |
| `change_type` | VARCHAR(20); NOT NULL | Type of simulated academic change. |
| `hypothetical_status` | VARCHAR(20); NULL | Optional assumed academic subject status. |
| `remarks` | VARCHAR(255); NULL | Optional explanation of the hypothetical change. |
| `created_at` | TIMESTAMP; NOT NULL | Date/time simulated change was created. |
| `scenario_id` | INTEGER; FK; NOT NULL | References the owning SimulationScenario. |
| `curriculum_subject_id` | INTEGER; FK; NOT NULL | References the affected CurriculumSubject. |
| `proposed_semester_id` | INTEGER; FK, NULL | Optional AcademicSemester proposed for the change. |

### A.16 LearningCentre → `learning_centre`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `learning_centre_id` | INTEGER; PK | Unique learning centre |
| `centre_code` | VARCHAR(10); U | Centre code (KL/JB/PP) |
| `centre_name` | VARCHAR(100) | Centre name |

### A.17 AcademicImportBatch → `academic_import_batch`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `import_batch_id` | INTEGER; PK | Provided academic data batch |
| `learning_centre_id` | INTEGER; FK | Learning centre |
| `snapshot_date` | DATE | Date source data was current |
| `provided_by` | VARCHAR(255) | Clerk coordinator identifier |
| `source_label` | VARCHAR(255) | Origin and description of provided academic data |
| `import_status` | VARCHAR(20) | Validation state |
| `provided_at` | TIMESTAMP | Data provision time |

### A.18 ImportedStudent → `imported_student`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `imported_student_id` | INTEGER; PK | Cohort row identifier |
| `import_batch_id` | INTEGER; FK | Parent import batch |
| `curriculum_id` | INTEGER; FK | Shared curriculum |
| `external_reference` | VARCHAR(100) | Source student reference; protect identifiers |
| `cohort_status` | VARCHAR(20) | Continuing/deferred/expected graduate |

### A.19 ImportedSubjectRecord → `imported_subject_record`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `import_record_id` | INTEGER; PK | Imported subject history row |
| `imported_student_id` | INTEGER; FK | Owning imported student |
| `subject_id` | INTEGER; FK | Shared subject catalogue |
| `subject_status` | VARCHAR(20) | Completed/failed/in progress/exempted |
| `semester_id` | INTEGER; FK, NULL | Academic period if supplied |
| `is_synthetic` | BOOLEAN | Distinguish generated histories from real source records |

### A.20 ClassCapacityRule → `class_capacity_rule`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `capacity_rule_id` | INTEGER; PK | Capacity rule identifier |
| `class_type` | VARCHAR(20) | LAB or LECTURE |
| `minimum_enrollment` | INTEGER | Working minimum (e.g., 15; configurable) |
| `break_even_target` | INTEGER | Financial reference (e.g., 25; provisional) |
| `normal_maximum` | INTEGER | Standard capacity (e.g., lab 30, lecture 40) |
| `exception_maximum` | INTEGER; NULL | Approved exception capacity (e.g., lab 35) |
| `is_active` | BOOLEAN | Whether rule is currently in force |

### A.21 ForecastRun → `forecast_run`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `forecast_run_id` | INTEGER; PK | Forecast identifier |
| `import_batch_id` | INTEGER; FK | Source academic data snapshot |
| `target_semester_id` | INTEGER; FK | Proposed next semester |
| `scenario_assumptions` | JSONB | Assumed pass rates and uncertain data handling |
| `generated_by` | VARCHAR(255) | Coordinator Clerk identifier |
| `generated_at` | TIMESTAMP | Forecast time |
| `status` | VARCHAR(20) | Draft / Under Review / Finalized / Superseded / Archived |
| `learning_centre_id` | INTEGER; FK | Centre for version-number uniqueness and filtering |
| `version_number` | INTEGER; NOT NULL | Unique with learning_centre_id and target_semester_id |
| `parent_forecast_run_id` | INTEGER; FK, NULL | Previous version; nullable for first run |
| `finalized_by` | VARCHAR(255); NULL | Coordinator who finalized this version |
| `finalized_at` | TIMESTAMP; NULL | Finalization time; locks stored results and decisions |

### A.22 ForecastSubjectDemand → `forecast_subject_demand`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `demand_id` | INTEGER; PK | Subject-level forecast identifier |
| `forecast_run_id` | INTEGER; FK | Parent forecast |
| `subject_id` | INTEGER; FK | Shared Subject |
| `eligible_count` | INTEGER; NULL | Verified count if sufficient data exists |
| `forecast_count` | INTEGER; NULL | Estimated next-semester enrollment |
| `graduation_critical_count` | INTEGER; NULL | Confirmed/projection-based urgency, nullable |
| `data_quality_status` | VARCHAR(30) | Validated/preliminary/insufficient |

### A.23 ProposedClassSection → `proposed_class_section`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `proposed_section_id` | INTEGER; PK | Proposed section |
| `demand_id` | INTEGER; FK | Subject demand entry |
| `capacity_rule_id` | INTEGER; FK | Applied capacity policy |
| `section_number` | SMALLINT | Section number |
| `expected_students` | INTEGER | Expected enrollment in section |
| `review_status` | VARCHAR(30) | Current section review status; all changes are recorded in ForecastDecisionAuditLog |
| `justification` | TEXT; NULL | Coordinator review reason |
| `reviewed_by` | VARCHAR(255); NULL | Clerk reviewer |
| `reviewed_at` | TIMESTAMP; NULL | Review time |

### A.24 UserAccessAssignment → `user_access_assignment`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `access_assignment_id` | INTEGER; PK | Unique application authorization mapping. |
| `clerk_user_id` | VARCHAR(255); U; NOT NULL | Clerk identity reference; application stores no password. |
| `app_role` | VARCHAR(30); NOT NULL | STUDENT, COORDINATOR or SYSTEM_ADMIN. |
| `access_status` | VARCHAR(20); NOT NULL | ACTIVE or SUSPENDED. |
| `created_at` | TIMESTAMP; NOT NULL | Assignment creation timestamp. |
| `updated_at` | TIMESTAMP; NOT NULL | Last application-access update. |

### A.25 UserAccessAuditLog → `user_access_audit_log`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `access_audit_id` | INTEGER; PK | Unique immutable audit event. |
| `access_assignment_id` | INTEGER; FK; NOT NULL | Account access record whose role or status changed. |
| `performed_by_clerk_user_id` | VARCHAR(255); NOT NULL | Clerk identity of authorized administrator. |
| `change_type` | VARCHAR(30); NOT NULL | ROLE_CHANGE or ACCESS_STATUS_CHANGE. |
| `old_value` | VARCHAR(50); NULL | Previous role or status. |
| `new_value` | VARCHAR(50); NOT NULL | Applied new role or status. |
| `reason` | TEXT; NULL | Optional administrative justification. |
| `created_at` | TIMESTAMP; NOT NULL | Event timestamp. |

### A.26 ForecastDecisionAuditLog → `forecast_decision_audit_log`

| SRS/SDD field | SRS type/constraint | Description |
| --- | --- | --- |
| `decision_audit_id` | INTEGER; PK | Unique, append-only decision event |
| `proposed_section_id` | INTEGER; FK; NOT NULL | Proposed section whose decision changed |
| `action_type` | VARCHAR(30); NOT NULL | REVIEW / APPROVE / DEFER / REOPEN / FINALIZE |
| `old_status` | VARCHAR(30); NULL | Previous review status, if any |
| `new_status` | VARCHAR(30); NOT NULL | New review status |
| `reason` | TEXT; NULL | Coordinator explanation or justification |
| `recorded_by` | VARCHAR(255); NOT NULL | Authorized Clerk coordinator identifier |
| `recorded_at` | TIMESTAMP; NOT NULL | Immutable event timestamp |

## Appendix B — Companion scripts and limitations

| File | Purpose |
| --- | --- |
| `db/migrations/0001_initial_schema.sql` | Proposed executable PostgreSQL DDL, all 26 tables, selected integrity constraints, indexes and triggers |
| `db/checks/001_schema_verification.sql` | Read-only structural table/column/constraint/index/trigger inventory after migration |
| `db/checks/002_behavior_tests.sql` | Rollback-only synthetic constraint and immutability checks, suitable for a disposable dev database |
| `db/erd/schema.mmd` | Mermaid overview of all 26 entities and their direct foreign-key relationships |

**Verification disclosure:** These files are authored from the supplied SRS/SDD and inspected statically here. They have **not** been executed against the user's Neon instance or a live PostgreSQL server in this conversation. A Codex run with an isolated development DB must perform real execution, integration tests and schema review before marking this implementation approved.

**Known model boundaries:** The supplied 26-entity model does not explicitly include student learning-centre assignment, detailed course component scheduling, per-centre capacity-rule binding, explicit subject attempt numbers, import validation error rows, or forecast assumptions revision history outside the run JSON and audit. Do not quietly add these concepts to scope; raise the corresponding decision when a future feature depends on them.
