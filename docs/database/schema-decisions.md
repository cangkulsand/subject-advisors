# Schema decisions — DATABASE_FOUNDATION

Status: development draft; production freeze and human review pending.
Source: supplied SRS/SDD v2.0 (24 October 2026), chapters 2, 3 and 5.2.
The original SQL companion files were absent. The SQL in this change was newly authored
from the verified dictionary; it is not presented as an unchanged supplied implementation.

## Canonical model

Exactly 26 public domain tables, 171 fields and 39 explicitly declared foreign keys.
db/schema-contract.json preserves original entity/field names, source definitions,
descriptions, normalization, source nullability and implemented nullability.
migration_meta contains technical version/adoption metadata, not additional SRS entities.
No official curriculum, capacities, prerequisite links or academic policies are seeded.

## Decisions D01–D16

| ID | Development implementation | Remaining review |
| --- | --- | --- |
| D01 | snake_case; Curriculumcurriculum_id maps explicitly to curriculum_requirement.curriculum_id | Confirm normalization at schema freeze |
| D02 | INTEGER identity PKs; timestamptz for TIMESTAMP; date preserved | Existing UUID databases require forward reconciliation |
| D03 | Attempts allowed across semesters; one undated record per owner/subject via partial unique indexes | Policy for repeated unknown-semester attempts remains unresolved |
| D04 | Access assignment first; profile only with a valid curriculum | P001 owns setup logic |
| D05 | Globally unique subject_code; shared catalogue across curricula | Duplicate legitimate institutional codes need reviewed change |
| D06 | Learning centre belongs to imported cohorts, not StudentProfile | No invented student learning-centre FK |
| D07 | Semester limits are required configuration, not hard-coded 10/6 credit limits | Approved curriculum/exception data not supplied |
| D08 | include_in_offering_forecast stored, defaults true per source | Confirm actual non-classroom subjects before flags/import |
| D09 | Capacities explicit; nonnegative values and sensible bounds checked | No unapproved example capacities seeded |
| D10 | Unique centre/semester/version; parent has same scope and a lower version | New source/assumptions require a new row |
| D11 | Finalized payload/delete/reopen blocked; FINALIZED -> SUPERSEDED/ARCHIVED and SUPERSEDED -> ARCHIVED only | Service must audit final decisions before finalizing; concurrent tests pending |
| D12 | Role/status checks, last-admin DB backstop and append-only audits | Verified actor authorization, atomic audit coupling and least-privilege runtime provisioning remain service/deployment responsibilities |
| D13 | Uppercase fixed states; UNDER_REVIEW and IN_PROGRESS use underscores | API/UI must use one documented mapping |
| D14 | MANDATORY edges acyclic; RECOMMENDED nonblocking; COREQUISITE separate | These exact DB codes are an explicit engineering vocabulary, not quoted SRS enum values |
| D15 | Worker-only data access; PUBLIC table/function privileges revoked for owned objects | No claim of tenant RLS; DB roles do not authenticate Clerk users |
| D16 | Ambiguous plan/import/scenario/review states remain VARCHAR | Final workflow vocabularies need owner approval |

## Additional explicit implementation decisions

- D17: The source omits NULL/NOT NULL for 36 non-PK coordinator fields.
  The development baseline makes them NOT NULL to prevent missing provenance/ownership.
  Source ambiguity is retained in schema-contract.json as required:null. This is a
  proposed tightening, not a claim that the SRS specified it. Review before freeze.
- D18: Preserve the historical P004 migration byte-for-byte. The canonical manifest runs
  0000 preservation, 0001 schema, 0002 account-copy/mapping atomically. UUID rows are moved
  into migration_meta.legacy_user_access_assignment; canonical INTEGER IDs are linked
  through legacy_access_id_map. Clerk ID, role, status and timestamps are preserved.
  No UUID is cast to integer and no old row is deleted.
- D19: Parent identity changes that invalidate children are rejected: student curricula
  after dependent data, plan/scenario owners, curriculum-subject identities, and recorded
  subject credit changes require a separate controlled reconciliation.
- D20: recognized_credits is bounded by configured subject credits; FAILED/WITHDRAWN
  require zero; EXEMPTED may be zero. Institutional exceptions require policy review.
- D21: Additional uniqueness covers programme+curriculum version, one planned subject
  per plan, one changed subject per scenario, per-batch external reference, and one
  demand subject/section number per run/demand. These are explicit development integrity
  choices and must be reviewed against real import/planning workflows.
- D22: Referenced coordinator snapshots cannot mutate or accept new history after a
  forecast points to them. Parent row locks serialize snapshot edits with forecast creation.
- D23: Audit UPDATE/DELETE/TRUNCATE is blocked; forecast payload TRUNCATE is blocked.
  Owner/superuser ability to disable triggers is outside these guarantees. Runtime
  credentials must not be table owners or have DDL/trigger-disabling privileges.

- D24: Referenced capacity rules are immutable; create a new rule for revised policy. Section counts cannot exceed the configured exception/normal maximum; above-normal counts require justification. Below-minimum proposals remain allowed for human review.

## Known incomplete verification

On 26 October 2026 the user explicitly confirmed br-shy-cherry-azuzy9v5 as the safe development branch (then named p004-local),
safe for schema creation. The runner matched the connected project/branch/database.
Versions 0000–0002, live inventory and 68 behavior/role-boundary checks passed.
One existing access record, its role/status/timestamps and original UUID were preserved;
migration replay was a no-op. Temporary test rows and the NOLOGIN probe role rolled back.

Multi-session competing-write races and deployed Worker behavior have not been tested
against this new baseline. The role probe verifies a limited database access boundary;
actual service-role provisioning, Clerk actor scope and atomic service audit coupling
remain deployment/application responsibilities. Production freeze still requires
independent decision review and outstanding institutional policy/source approvals.
