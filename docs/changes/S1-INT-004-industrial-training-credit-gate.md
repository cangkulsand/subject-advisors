# S1-INT-004 — SECJ Industrial Training eligibility rule

- Status: READY_FOR_REVIEW
- Date: 2026-10-26
- Owner: Integration / curriculum data
- Scope: Store the approved 92-credit threshold and document the deferred CGPA check.
- User decision: Count recognized credits for completed and exempted academic records;
  CGPA above 2.00 will be handled with a later system note.

## 1. Plan

Record a curriculum-level `INDUSTRIAL_TRAINING` requirement of 92 credits for SECJ
version 1. Document that eligibility credit calculation includes only
`COMPLETED` and `EXEMPTED` records and must not double-count repeated attempts for
the same subject. Keep the source CGPA condition (>2.00) visible as deferred because
the current schema has no CGPA field or grade-point scale. Do not change application
code or claim automated eligibility enforcement.

## 2. Implementation

Added one `curriculum_requirement` row for SECJ version 1:
`requirement_type=INDUSTRIAL_TRAINING`, `required_credits=92`.
Updated `docs/database/data-contracts.md` with the calculation rule: sum recognized
credits from completed/exempted records and count each subject once across attempts.
Documented the deferred CGPA >2.00 check and the future student-facing note.
No application logic or schema migration was added.

## 3. Review

Database read-back confirmed exactly one matching 92-credit requirement. The source
CGPA condition remains documented but is not represented as an automated check.
No application tests were run because no application code changed. Human review
pending. No migration, deployment, commit or push.

## 4. Changelog

2026-10-26: Stored the SECJ Industrial Training minimum-credit requirement and
documented its recognized-credit calculation, repeated-attempt handling and deferred
CGPA note. Status READY_FOR_REVIEW.
