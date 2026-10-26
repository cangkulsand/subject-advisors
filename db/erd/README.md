# ERD notes

schema.mmd lists every source-defined field in all 26 SRS entities and the 39 explicit
foreign keys. Optional parent relationships use zero-or-one parent cardinality;
required ones use exactly one. Parent rows may have zero or many children unless
a stronger uniqueness constraint is documented in the schema.

The ERD deliberately does not invent a relationship from imported_student to
student_profile. They represent independent coordinator snapshots and portal students.
Actors' Clerk IDs are external identity values, not local password/account entities.
Migration bookkeeping and UUID adoption archives are outside the domain diagram.

Source naming/type/nullability decisions and extra uniqueness/integrity constraints
are listed in docs/database/field-mapping.md and schema-decisions.md.
This is a reviewable development ERD, not a production schema freeze.
