# Matric-number intake, matric lock and batch correction (S3-P004-039) — design

- **Date:** 2026-11-27
- **Owner:** P004, building P001's (Aisa) review item "batch correction of programme and intake"; to be handed over to Aisa
- **Status:** Draft, for owner approval (builder check done; four points settled as builder's calls)
- **Builds on:**
  - S3-P004-037: intake year, single admin intake change
  - S2-P004-026: single admin programme change
  - S3-P004-035: ACL row A5, "Wrong intake or programme for many students"

## 1. Why

**The problem:** a System Administrator who finds a group of students with the wrong programme or intake year has to fix them one account at a time.

**The real case:** migration 0016 backfilled every intake year from the curriculum's effective year. Every SECJ student is now 2020 and almost every SECRH student is 2022, while their matric numbers say 2020 to 2025:
- **SECJ:** 69 are 2023.
- **SECRH:** 55 are 2025.

**The proposed rule** (ACL A5, 2026-11-24):
- **Who:** System Administrator only.
- **Reason:** one reason is required.
- **Audit:** one audit row per student.
- **Rules:** the same as the single programme change.

**Stopping the problem at the source:** the intake year is read from the matric number when the student first sets up the profile. The matric number then locks like the programme and intake year, because the batch list depends on it.

## 2. Facts the design rests on (Neon read, 2026-11-27)

- **Profiles:** 375 student profiles, all with a matric number, and none of the numbers is used twice.
- **UTM format:** 323 profiles use it: `SX` + two-digit intake year + serial + programme code + mode + two digits.
  - **Owner-confirmed examples:** `SX232315ECJHF04` and `SX2302ECRHF04`, both intake 2023.
  - **Serial length varies.** The owner's example has 2 digits; the data has 4.
- **Unreadable numbers:** 51 test students use `DUMMY-…`/`DUMMY…`, which carry no year. One profile is lowercase (`sx2203…`).
- **No uniqueness rule:** `student_profile.matric_no` is `varchar(30)` with no unique constraint.
- **Today's locks:**
  - The profile save locks the programme (`PROFILE_PROGRAMME_LOCKED`) and the intake year (`PROFILE_INTAKE_LOCKED`).
  - The matric number is **not** locked. The upsert rewrites it on every save.
- **Intake ranges:**
  - Profile: the last 12 years (`intakeYearRange`).
  - Admin: 1990–2200 (`ADMIN_INTAKE_YEAR_MIN/MAX`).
- **Existing single changes:**
  - **Programme:** `changeStudentProgramme` calls `public.db_change_student_programme(student_id, curriculum_id)`. That function locks the row, validates the curriculum, removes future picks, updates the profile and writes the audit.
  - **Intake year:** `changeStudentIntakeYear` writes `academic_setup_audit_log` (`student_intake`, `CHANGE_INTAKE_YEAR`).

## 3. Goals, non-goals, anti-goals

**Goals:**
1. **Intake from the matric number:** the profile page fills the intake year from the matric number. The student can change it before the first save.
2. **Matric lock:** the matric number locks after it is first saved, and only a System Administrator changes it, with a reason and an audit row.
3. **No shared numbers:** no two students can save the same matric number.
4. **Batch correction:** a System Administrator corrects the programme and/or intake year of up to 500 students at once, identified by matric number. They see a preview first, then everything applies together or nothing does.
5. **Fix the mock data:** the mock intake years are corrected with the new screen after deploy, with owner approval at that time, since dev and prod share Neon.

**Non-goals:**
- Filling the programme from the matric number. The programme code is used only for a warning.
- Reading the "F/S" mode.
- Batch matric-number changes.
- Coordinator access.
- Changing `DUMMY-…` test students.

**Anti-goals:**
- **A half-applied batch.**
- **An audit row that doesn't name the student.**
- **A batch that bypasses the single-change rules.** For example, a programme change that keeps future picks.
- **Silently skipping numbers the admin pasted.**

## 4. Approaches considered

**Batch apply:**
- **A. Preview, then all at once in one transaction (chosen by owner, 2026-11-27).** If the data changed since the preview, it refuses and asks for a new check.
- **B. Each student saved on its own, with a report of failures.** Rejected: a partly applied correction is the hardest to clean up, and the admin has to redo the failures by hand.

**Choosing the students:**
- **Pasted matric numbers (chosen; the owner says lists usually come as matric numbers).**
- **Filter by curriculum and intake.** Not built: it doesn't match how lists arrive.
- **Multi-select on the Users list.** Not built: the list has no programme filter, and picking 300 by hand is slow.

**Uniqueness:**
- **Application check in the profile save and the admin change (chosen, no migration).**
- **A partial unique index on `upper(matric_no)`** would be stronger, but needs a migration on the shared database. Left as a follow-up.

## 5. Design

### 5.1 Reading the matric number (shared, pure)

**Function:** `packages/shared/src/profile/matric.ts` exports `readMatric(matricNo: string): { intakeYear: number; programmeCode: string | null } | null`.
- **Normalise first:** remove whitespace and uppercase, the same as the profile page does before saving.
- **Readable form:** the number starts with `SX` followed by two digits, which give `intakeYear = 2000 + yy`. Anything else returns `null`.
- **Programme code:** the first run of 4 letters after the digits, e.g. `ECJH` or `ECRH`. If there isn't one, it is `null`.
- **Range:** the function doesn't range-check. Callers apply their own range.

**Normalising rule:** `normaliseMatric(value) = value.replace(/\s+/g, '').toUpperCase()`. It is shared, and the profile API, admin API and batch all use it before comparing.

### 5.2 Profile page: intake from the matric number

**When it fills:**
- **Who:** a new profile, or an existing one whose intake is still empty.
- **What:** typing the matric number sets the Intake year select to the year read from it.
- **Conditions:** only if the year is inside the profile range, and only if the student hasn't picked a year themselves in this session.
- **Out-of-range or unreadable number:** nothing is filled.
- **A student pick wins:** changing the select by hand stops further filling.
- **Saved number, empty intake (builder's call):** when the page opens on a profile that has a saved matric number but no intake year, the select is filled from the saved number under the same conditions, because a locked number is never typed again.

**Hint text** (shown under the select while the fill applies): "Filled in from your matric number. Change it if it is wrong."

**Examples:** the help text and `title` change from `A22EC0001` to `SX232315ECJHF04`.

### 5.3 Matric number locks after it is saved

**Profile API (`PUT /api/profile`):**
- **Changed number:** if the saved profile has a non-empty matric number and the normalised input differs, the save returns 409 `PROFILE_MATRIC_LOCKED` with "Your matric number is set. Contact the admin to change it."
- **Empty saved number:** a profile with no matric number may set it once.
- **New profiles:** a new profile always sets it.
- **Number in use:** any save that would store a number another student profile already holds returns 409 `PROFILE_MATRIC_TAKEN` with "This matric number is already used by another student. Check it, or contact the admin."
  - **Comparison:** normalised and case-insensitive.
  - **Students compared:** every student profile except the student's own.

**Profile page:**
- **Read-only once saved:** a saved matric number shows as text with the hint "Contact the admin to change it", like the saved programme.
- **Stored value:** it is normalised, as today.
- **Lock comparison (builder's call):** both the saved value and the input are normalised before comparing, so the one lowercase saved number (`sx2203…`) does not trip the lock on every save.

**Admin change on the account page** (Student programme card), button **Change matric number**:
- **Endpoint:** `PATCH /api/admin/users/{id}/matric` with `{ matricNo, reason }`, SYSTEM_ADMIN only.
- **Validation:**
  - 4–30 letters or digits after normalising, otherwise 400 `INVALID_MATRIC`.
  - 404 when there is no account or no profile.
  - 409 `UNCHANGED`.
  - 409 `MATRIC_TAKEN` when another profile uses the number.
- **Audit:** in one transaction, `academic_setup_audit_log` gets `entity_type 'student_matric'`, `action 'CHANGE_MATRIC_NO'` and `before_data`/`after_data` `{ matricNo }`. It follows `changeStudentIntakeYear`.
- **No knock-on change:** it does not change the intake year.

### 5.4 Batch correction

**Page:** `/admin/users/batch`, titled "Batch correction", opened from a **Batch correction** button on the Users & Access page. System Administrator only.

**Step 1: matric numbers.**
- **Input:** a textarea. Numbers can be separated by new lines, commas, semicolons, tabs or spaces, so a column pasted from Excel works.
- **Normalising:** each number is normalised and repeats are dropped, with a count shown ("3 repeated numbers ignored").
- **Limit:** above 500 numbers, **Check** stays disabled with "Paste at most 500 matric numbers."

**Step 2: preview.**
- **Endpoint:** `POST /api/admin/students/batch/preview` with `{ matricNos }`.
- **Response:** for each number, either a match or a problem.
- **A match:** `{ matricNo, accountId, studentId, studentName, programmeCode, curriculumId, curriculumVersion, intakeYear, matricIntakeYear, matricProgrammeCode }`.
- **Problems:**
  - "Not found".
  - "Used by more than one student", which can exist in old data despite the new rule.
  - "No account for this student", for a profile with no `user_access_assignment` (builder's call: nothing is silently skipped).
- **Account status (builder's call):** a suspended account, or one whose roles no longer include STUDENT, is still a match, because correcting records does not depend on access. The table shows a "Suspended" or "Not a student account" warning, and the warning does not block.
- **The table:**
  - **Columns:** Matric number, Student, Programme (version), Intake year, then **After**, which recalculates live as the admin changes step 3.
  - **Problem rows:** listed first, with **Remove problem numbers**.
- **Programme warning:**
  - **Wording:** "Matric says ECRH, programme is SECJ".
  - **Compared with (builder's call):** the programme in the **After** column, so the warning recalculates in the page when step 3 picks a programme. That is the moment it matters most.
  - **When:** the matric programme code, prefixed with `S` and passed through the import aliases (`SECJH` becomes `SECJ`), doesn't equal the programme code.
  - **Unknown code:** no warning.
  - **Effect:** a warning never blocks the apply.

**Step 3: what to change.**
- **Programme:** "Keep each student's programme" (default), or a select of active curricula, the same list as Change programme.
- **Intake year:**
  - **"Keep each student's intake year"** (default).
  - **"Set all to"** a year (1990–2200).
  - **"From each student's matric number":** a number whose year can't be read becomes a problem, "Intake year cannot be read from this matric number".
- **Reason:** required, using the same reason rules as other admin changes.
- **Summary line:** "Applies to 324 students: 290 intake years change, 34 already correct."
- **A programme change** also says that future subject picks are removed, as in the single dialog.

**Step 4: apply.**
- **Endpoint:** `POST /api/admin/students/batch` with:
  - `matricNos`
  - `curriculumId | null`
  - `intake: { mode: 'keep' } | { mode: 'set', year } | { mode: 'matric' }`
  - `reason`
  - `expected: [{ studentId, curriculumId, intakeYear }]` from the preview
- **Refused before any write:**
  - **Problems left:** any number with a problem returns 409 `BATCH_HAS_PROBLEMS`.
  - **Stale preview:** a student whose curriculum or intake differs from `expected` returns 409 `BATCH_STALE` with "Some students changed since you checked. Check again."
    - **Also stale (builder's call):** a matric number that now belongs to a different student, or to no one, compared through `expected.studentId` per number.
  - **Chosen programme gone (builder's call):** a curriculum that has become inactive since the preview returns 409 `CURRICULUM_UNAVAILABLE` with "The chosen programme is no longer available. Choose another." This is checked before any write.
  - **Nothing to change:** 409 `UNCHANGED`.
  - **No change chosen:** keep and keep together return 400.
- **The write:** one transaction, with the rows locked first.
  - **Programme:** each student whose curriculum changes goes through `db_change_student_programme`, so picks are removed and the audit is written exactly as for a single change.
  - **Intake:** each student whose intake changes gets the same update and `student_intake` audit row as `changeStudentIntakeYear`.
- **Unchanged students:** students already correct are not written and get no audit row.
- **Audit grouping:** all rows share the reason and transaction time. Nothing else is added, and there is no schema change.
- **Result:** "Corrected 324 students: 290 intake years, 0 programmes; 12 subject picks removed." The page offers **Start another batch**.

### 5.5 API, docs and tests

**API and docs:**
- **Shared types:** the shared admin types and error codes go in `packages/shared/src/admin/admin.ts`.
- **OpenAPI:** `docs/api/admin-users.openapi.json` gets the three new endpoints and the new error codes.
- **ACL:** the batch row in the ACL amendment moves from Proposed to In force, and a matric row is added.

**Tests:**
- **Unit:** `readMatric`/`normaliseMatric`.
- **Profile repository:** lock, taken, and set-once.
- **Admin routes and repository:** matric change; batch preview and apply, including stale, problems and unchanged.
- **Browser checks:**
  - Profile auto-fill and the read-only matric.
  - The admin matric change.
  - Batch preview, remove problems, apply, and the result.
  - The readability guard, and 320/375/768px layouts.
- **Integration:** the existing profile integration checks are updated for the lock.

## 6. Left to the builder

- **Statement shape:** set-based SQL (unnest arrays) or a loop of statements inside one `run` transaction. Either is fine, as long as 500 students apply in one transaction within the Worker time limit.
- **Component split:** how to split the batch page into components.
- **Separators:** the exact paste-splitting regex, as long as the separators in 5.4 work.

## 7. After deploy (needs owner approval at that time)

**The mock fix:** run the batch on the 323 SX-form profiles with "From each student's matric number" and the reason "Intake year corrected from matric number (backfill 0016 used the curriculum year)".
- **Remaining problems:** anything still flagged, such as a year outside 1990–2200, is reported to the owner, not forced.
- **DUMMY students:** they are left out.
