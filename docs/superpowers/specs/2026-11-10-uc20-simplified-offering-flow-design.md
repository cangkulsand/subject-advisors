# UC20 simplified offering flow — design

- **Date:** 2026-11-10
- **Status:** Draft for product owner approval
- **Owner:** P004 (UC20 / UC23); touches the P002 student offerings page, the P001 student profile and the admin Academic Semesters page
- **Replaces:** the review → finalize → confirm flow built in S2-P004-007 and refined in S2-P004-013/014

## 1. Why

The coordinator flow grew into too many steps for one decision: generate a forecast version, start review, approve/review/remove each subject with a typed reason, finalize, then open a separate Confirm offerings page, choose one of several finalized versions, tick subjects again and set a pick deadline. Coordinators decide twice. Several versions can be finalized at once. The forecast switch is hidden in the deadline dialog.

What the coordinator actually does (product owner, 2026-11-10):

1. Upload a CSV, or use the student data already in the system.
2. Run the forecast and look at the result.
3. Decide which subjects are offered to students.

The new flow keeps exactly those three steps. The head of programme's check happens outside the system; the coordinator reflects it by removing a subject. The decision is made by a person: there is no student-count cut-off. A subject with 7–10 eligible students can be approved. Capacity flags are information only.

## 2. Goals

- One screen where the coordinator sees the forecast and decides each subject: **Pending**, **Approved** or **Removed**.
- Decisions belong to the programme + learning centre + semester, not to a snapshot or forecast version, and carry over when the coordinator switches to another snapshot.
- Admin controls when students can see and pick: selection opens, selection closes.
- Students use the existing `/student/offerings` page, filtered to the subjects the coordinator approved.
- After selection closes, the coordinator sees how many students picked each subject and who they are.

## 3. Non-goals

- No head of programme sign-off or any other approval workflow.
- No class splitting or section planning (removed earlier in S2-P004-013).
- No minimum-demand rule that hides or blocks subjects.
- No notifications outside the app (email etc.).
- No forecast version comparison.
- No offering history screen yet: a read-only "Offering History" page for past semesters (final status, pick counts, pickers, audit) is planned for the next sprint. All past-semester data is kept so it can be built then.

## 4. Anti-goals (would be a failure even if it works)

- The coordinator has to decide the same subject twice, or in two places.
- A confirmation dialog or typed reason on every approve/remove.
- Students see a half-decided list before selection opens.
- Switching snapshots silently resets decisions.

## 5. The flow

### 5.1 Admin: semester dates

On the existing admin **Academic Semesters** page, each semester gets two date-times (product owner, 2026-11-10):

| Field | Meaning |
|---|---|
| Selection opens | Before it, coordinators plan and students see nothing. From it, students see the Approved subjects and pick, and coordinator changes go live. |
| Selection closes | After the opening time. From it, picks and coordinator decisions are locked for that semester. |

So each semester is in one of three phases: **planning** (before opens, or no dates set: "selection not scheduled"), **selection open**, **closed**.

The dates are the same for every programme and learning centre (my call; the product owner did not object). The admin can edit them, and edits are audited like other academic setup changes. This replaces the coordinator-set pick deadline.

**Which semester:** the coordinator plans, and students pick for, the **next semester**: the one after the semester admin marks as current. This is the target semester that UC20 already uses.

### 5.2 Coordinator: Data Imports (unchanged)

The coordinator uploads a CSV or uses the students in the system; either way the data is frozen as a dated snapshot. This stays exactly as it is today.

### 5.3 Coordinator: Class Offering Forecast (one screen)

**Header**
- Snapshot picker: accepted snapshots for the scope, newest pre-selected, each shown with its source and date. Choosing a snapshot shows its forecast numbers.
- The semester's dates from admin and its phase, as a status line, for example "Selection opens 20 Nov · 3 subjects still pending". While subjects are still Pending in the planning phase, a warning says: "3 subjects still pending; they won't be shown to students unless approved."
- No semester picker: the coordinator always works on the next semester (product owner, 2026-11-10). After admin moves the current semester forward, the previous semester's results are no longer shown here.

**Subjects table**, sorted by eligible students, highest first. All subjects of the curriculum are listed except those not offered in this semester type or excluded from forecasting (hidden as today). Subjects with 0 eligible students sink to the bottom.

| Column | Content |
|---|---|
| Subject | Name; code and class type under it |
| Not taken yet | Students whose curriculum includes the subject and who have not passed or been exempted (breakdown `inCurriculum − alreadyPassed`) |
| Eligible to take | Students who also meet the prerequisites according to their records (today's "supported eligible"). Has a **View students** button that opens the existing popup with names, matric numbers, uncertain, near graduation and not counted. |
| Action | Dropdown with **Pending** / **Approved** / **Removed** (the existing radio dropdown style, no helper text) |

The "Potential demand" label goes away; "Eligible to take" is the number the coordinator decides on. Uncertain and near-graduation counts stay inside the View students popup. Info tips (hover popovers) explain each column.

**Removed side table:** as today, removed subjects are listed beside the main table with **Add back**. Add back returns the subject to Pending.

**Decisions**
- New subjects start as **Pending**.
- Choosing an option takes effect at once: no dialog and no typed reason. A toast confirms each change, for example "SECJ2154 approved.", "SECD2523 removed." or "SECJ1013 added back.".
- Every change is written to the audit history automatically, with the subject, the before and after status, who, when, and the snapshot shown at the time. There is no typed reason. If the database requires a reason, the system writes a fixed text such as "Changed on the forecast screen".
- Decisions carry over when another snapshot is chosen. A subject that appears only in the newer snapshot starts as Pending. A decided subject that is missing from the chosen snapshot stays decided and is still listed, marked "not in this snapshot".
- Toolbar (shared table toolbar, mandatory): tabs **All / Pending / Approved**, search, and the existing filters that still make sense (class type, has uncertain students). Removed subjects are in the side table, not in a tab.

**While selection is open:** the same coordinator screen. The dropdown still works and changes go live for students immediately:
- Approving a subject adds it to students' offerings.
- Removing an approved subject withdraws it. Students who picked it lose that pick and see a note on their offerings page ("SECJ2154 was withdrawn by the coordinator"). The toast says how many students are affected: "SECJ2154 withdrawn. 12 students who picked it will see a note."

**After selection closes:** the dropdown is locked (read-only), the table gains a **Picked** column with the number of students who picked each approved subject, and a way to see their names and matric numbers (same popup style as View students).

**The audit history** of decisions stays visible on the screen as today.

### 5.4 Student: `/student/offerings` (existing page)

The page always works on the next semester (the planned one), and picks are stored against it. It no longer uses the semester the student chose in the profile. Locking the profile semester to the admin's current semester is being built separately (product owner, 2026-11-10). This work assumes that change, and does not rebuild it.

- **Before selection opens:** a message that offerings are not open yet, with the opening date (or "not scheduled yet").
- **Pick limits stay:** picks respect the semester's maximum subjects and credits set by admin (S2-P004-006), checked on the page and on the server.
- **While open:** the existing page, listing only the subjects Approved for the student's programme + learning centre (see 5.5) + the next semester, with the existing eligibility, prerequisites and picking. Picks can be changed until selection closes. A withdrawn subject disappears. A student who had picked it sees the withdrawal note.
- **After close:** the student's picks, read-only.

Pending or Removed subjects are never shown to students.

### 5.5 Student: learning centre on the profile

Student profiles do not record a learning centre today, and the forecast counts every portal student as Kuala Lumpur (interim rule in `scope-provider.ts`). This work adds it (product owner, 2026-11-10):

- The student chooses their learning centre on the existing profile page, from the active learning centres admin maintains. It is required for new profiles. Existing students without one are asked for it, in the same way as the matric number (S2-P004-016).
- Existing students are set to Kuala Lumpur by the migration (product owner, 2026-11-10); they can change it on the profile outside the lock.
- The centre decides which coordinator's approvals the student sees, and the student's forecast scope for "use students in the system" snapshots. This replaces the Kuala Lumpur default.
- **Locked during selection:** from the time selection opens for the next semester until admin moves the current semester forward, the student cannot change the centre. Changing it then would move the student to another centre's list and orphan their picks. The field shows why it is locked. Before selection opens, the student can change it freely.

## 6. What goes away

- Forecast lifecycle statuses (Draft, Under review, Finalized), Start review, Finalize, and the status dropdown.
- The **Reviewed** decision and all reason dialogs for approve/remove/add back.
- Forecast versions as something the coordinator manages. Coordinator navigation drops "Forecast Versions" and "Compare Versions".
- The separate **Offering Decisions** page (`/coordinator/decisions`): choosing a finalized forecast, ticking subjects, the coordinator-set pick deadline, and the forecast switch inside the deadline dialog. Its audit history and pick counts move to the forecast screen.
- The "Proposed classes" column anywhere it remains.

## 7. Constraints

- Follow `docs/implementationguide.md` (change records), `docs/themeguide.md` typography and the mandatory table toolbar, and `docs/cachingguide.md` (student lists are personal data: `no-store`, in-memory only).
- Coordinators only see and change scopes they are assigned to (existing scope checks).
- Use the development database only; production data does not need migrating (product owner, earlier in the project). Existing forecast runs and confirmations in development can be migrated or reset, whichever is simpler.
- Keep the forecast engine and its counting rules unchanged; this redesign changes the workflow, not the counting.
- Students' picks remain validated on the server against current state: a pick for a subject that is not Approved for the student's programme + centre + next semester, or outside the selection period, is rejected.
- The profile semester lock (built separately) must be in place before the student side ships, or the offerings page must ignore the profile semester on its own.

## 8. Left to the builder

- Data model. One option is to reuse `offering_confirmation` / `confirmed_offering` (CONFIRMED ≈ Approved, WITHDRAWN ≈ Removed, no row ≈ Pending) and drop the NOT NULL forecast-run link and the pick deadline. Another is a new per-scope decision table. Either is fine if decisions are keyed by programme + learning centre + semester + subject.
- Whether the forecast for a snapshot is stored (one run per snapshot already exists: a batch has at most one run) or computed on request. Choosing a snapshot must not require any extra step from the coordinator.
- What happens to `proposed_class_section`, `forecast_adjustment_audit` and the run statuses: keep them unused, or remove them in a migration.
- How the withdrawal note reaches students (stored flag on the pick, or derived from the audit).
- Exact wording of messages and toasts, within the examples above.
- Migration numbering, API shape and OpenAPI updates, and test structure. All existing browser suites must keep passing or be updated to the new flow.

## 9. Calls made by the designer (check these)

- One set of dates per semester, shared by all programmes and centres.
- Pending subjects at selection open are simply not shown, with a warning beforehand; nothing is approved automatically.
- No typed reason. If the database requires one, a fixed text such as "Changed on the forecast screen" is written.
- A decided subject missing from the chosen snapshot stays decided and is listed as "not in this snapshot".
- The learning centre is locked from selection opening until the semester moves forward, not only while selection is open.
