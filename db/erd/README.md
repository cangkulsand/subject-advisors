# ERD notes

schema.mmd lists every source-defined field in all 26 SRS entities and the 39 explicit
foreign keys, plus the labelled 0008 academic setup engineering extension below.
Optional parent relationships use zero-or-one parent cardinality;
required ones use exactly one. Parent rows may have zero or many children unless
a stronger uniqueness constraint is documented in the schema.

The ERD deliberately does not invent a relationship from imported_student to
student_profile. They represent independent coordinator snapshots and portal students.
Actors' Clerk IDs are external identity values, not local password/account entities.
Migration bookkeeping and UUID adoption archives are outside the domain diagram.

Source naming/type/nullability decisions and extra uniqueness/integrity constraints
are listed in docs/database/field-mapping.md and schema-decisions.md.
This is a reviewable development ERD, not a production schema freeze.

## Migration 0008 academic setup extension

The diagram adds `faculty`, `coordinator_assignment`, `academic_setup_audit_log`,
`programme.faculty_id`, `learning_centre.is_active` and `academic_semester.is_current`.
These are registered engineering extensions; the frozen 26-entity/171-field/39-FK
baseline in `db/schema-contract.json` is unchanged. This diagram does not enumerate
all other engineering extensions (for example role memberships and invitations).

The optional faculty link has no inferred/backfilled value. Centre/faculty deactivation
preserves references. Coordinator assignments retain ended history; a partial unique
index permits only one unended account/programme/centre scope. New assignments require
active account and COORDINATOR membership, active faculty/centre/programme and matching
programme/faculty. `is_current` defaults false; zero current semesters is valid and
one partial unique index prevents multiple current rows. Only the audited atomic setter
switches the marker; dates never choose it automatically. This system marker is separate
from the profile-owned `student_profile.current_semester_id` added in 0003.

Audit entity IDs describe several table types and deliberately have no fabricated FK.
Audit rows are immutable and record verified actor, normalized reason and before/after
data. The private `migration_meta.academic_switch_context` helper is omitted along with
other technical metadata. See `docs/database/migrations.md` for the isolated local
0000-0006+0008 history and the required shared 0007 -> 0008 -> 0009 integration order.
