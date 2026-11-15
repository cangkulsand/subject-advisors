# UC13 graduation check — design

- Date: 2026-11-15
- Change record: S3-P004-001 (UC13 / M5; owner P003, built by P004)
- Approved by the project owner in conversation on 2026-11-15. The SRS/SDD document is not updated.

## Intent

Students see whether they meet the graduation requirements the system can check, and confirm the ones it
cannot. UTMSPACE graduation needs: the required credits, no outstanding fees, and a MUET certificate. Only
credits are in this system; the other two are the student's own saved confirmations. Saving them lets a later
feature motivate students (for example a MUET reminder when credits are nearly met).

## Rules (decided)

- Credits met = earned credits (sum of recognised credits of COMPLETED and EXEMPTED records, the same
  calculation as UC05 `calculateProgress`) >= the curriculum's `total_credit_required` (admin input, UC25).
- Eligible = credits met AND fees confirmed AND MUET confirmed. Otherwise "Not yet eligible", listing what is missing.
- Required credits missing or 0 → "Cannot assess" (never Eligible).
- Ticking stores the current time; unticking clears it. Only the signed-in student changes their own ticks.
- Page note: "Based on your recorded subjects and your own confirmations. Not an official UTMSPACE graduation decision."

## Data

Migration `0013`: `student_profile` gains `fees_cleared_confirmed_at timestamptz NULL` and
`muet_confirmed_at timestamptz NULL` (no default, no backfill). Rollback: drop both columns.

## API (new module)

- `GET /api/graduation-check` → `{ requiredCredits: number|null, earnedCredits, remainingCredits: number|null,
  creditsMet: boolean|null, feesClearedConfirmedAt: string|null, muetConfirmedAt: string|null,
  status: 'ELIGIBLE'|'NOT_YET_ELIGIBLE'|'CANNOT_ASSESS', missing: string[] }`.
- `PUT /api/graduation-check/confirmations` body `{ feesCleared: boolean, muet: boolean }` (both required,
  no other fields) → same response. Student role, completed profile; same auth/profile guards as UC05.
- The existing profile save form and `PUT /api/profile` are untouched.

## UI

`/student/graduation` "Graduation check", student menu after Academic progress, student template styling,
AuthGate `requireProfile`. Shows the result, credits (earned / required / remaining with a bar), two
checkboxes with "confirmed <date>" or "not confirmed", and the note. A tick saves immediately; on failure the
box reverts and an error shows with retry.

## Non-goals

Compulsory subjects, FYP1/FYP2, Industrial Training, verification of the ticks, coordinator/admin views,
the motivation feature, SDD edits.

## Approaches

1. Two date columns on `student_profile` (chosen): "ticked and since when" is all motivation needs.
2. Separate confirmations table with history: extensible and auditable, but more than needed now.
