# P002 v2.1 requirement map

This map separates the SRS v2.1 baseline (dated 7 November), the lecturer discussion (1 November), and the current P002 implementation. The discussion records the revised workflow before its formal SRS allocation; references below identify each source separately. Full verification reports 1,462 passing tests, 59 inherited skips across 74 files, 30 UI checks, and 11 isolated PostgreSQL integration cases. Human peer review and connected Neon development-database acceptance remain pending.

## Idham's allocation across the SRS and discussion

| Stage | SRS v2.1 allocation | 1 November discussion's final direction | Relationship |
|---|---|---|---|
| Sprint 1 | `d. Sprint Development Plan`, “Sprint 1 — Foundation & Setup”: UC08 — semester subject offering entry/data structures under MUHAMMAD NOR IDHAM (M3, M4). | Heading `4 Idham responsibilities`, subsection `Sprint 1 initial course offering filter`: complete the first student-demand filter; count students who still need a subject and meet relevant eligibility/prerequisites. Heading `2 Course offering requirements`, “First stage identifying subjects based on student demand”: threshold discussed is at least 30; this produces the initial candidate list. | The SRS table is brief and does not spell out demand calculation. The 1 November discussion clarifies the intended first-filter deliverable; it assigns Sharhan the second-stage resource refinement.
| Sprint 2 | `d. Sprint Development Plan`, “Sprint 2 — Core Functionality”: UC09 and UC10 — eligibility validation and semester subject selection under Idham. | Heading `4 Idham responsibilities`, subsection `Sprint 2 individual student eligibility`: use the student's records, prerequisite information, and the finalised offering after Sharhan/coordinator adjustments. Heading `3 Revised workflow`: students use the finalised stored list, rather than re-uploading an offering PDF. | UC09/UC10 are Sprint 2 in the formal SRS allocation. Idham's discussion scope is the student-facing eligibility feature from confirmed offerings. UC10 save/reload/edit/cancel/clear and configured selection validation are now implemented; the isolated DB integration run verifies persistence and rollback behavior. Human review and connected Neon acceptance remain pending.
| Sprint 3 | `d. Sprint Development Plan`, “Sprint 3 — Advanced Features”: UC11 and UC12 — intelligent recommendations/ranking, bottlenecks and alternatives under Idham. | Heading `4 Idham responsibilities` says the final allocation lets Idham focus on the student-facing feature in Sprint 2 after moving the second offering filter to Sharhan. Heading `2 Course offering requirements` assigns second-stage refinement to Sharhan. | Do not relabel UC11/UC12 ranking or bottleneck work as Sprint 2. The 1 November discussion's “recommend eligible subjects” describes filtering the final offer set for an individual, not automatic AI ranking. The SRS names intelligent recommendation/ranking separately in Sprint 3.

The SRS ownership summary is in `e. Use Case Coverage Summary`: P002 / Idham, M3 and M4, UC08–UC12. Sprint 4 integration is in `d. Sprint Development Plan`, “Sprint 4 — Integration & Testing”: UC08–UC12. UC24 is assigned to Harraz/P003 for Sprint 2, not Idham/P002; see the same sprint table and `e. Use Case Coverage Summary`.

## Offering source and the UC08 wording conflict

The SRS functional requirement `2.2.A3 Functional Requirements — M3 Semester Offering and Eligibility Management`, FR-C1 / UC08, says students identify and select subjects offered “during the current semester registration period” from the curriculum subject list. Its detailed UC08 section is also titled “Enter Semester Subject Offerings” and contains the older student-entered/manual availability workflow. That wording conflicts with the 1 November discussion's revised workflow.

The discussion's explicit revised direction for the source-of-truth workflow is:

1. In `3 Revised workflow`, the system's demand stages produce and refine a list; the coordinator may add or remove subjects; the finalised list feeds Idham's eligibility feature. The student no longer uploads the same offering list as a PDF.
2. In `Approval and SMP`, an automated approval request or automatic publication to SMP was not confirmed. The discussion confirms generation, adjustment and consistency with final decisions, not SMP integration.
3. In `2 Course offering requirements`, the 30-student threshold belongs to the first stage. Examples of lowering it to 25 and of five/15 classes illustrate the second-stage issue; they were explicitly not fixed operating rules or class targets.

The change plan itself records this as a conflict to document, not as authority to preserve manual/PDF availability as the student feature's authoritative fallback. Do not infer that the formal SRS's older sentence has been amended: the discrepancy remains visible and should be reconciled in the requirements document.

## UC09 and UC10 scope

| Use case / source | Requirement | Current P002 implementation |
|---|---|---|
| UC09, SRS `2.2.A3`, FR-C2 and FR-C5 | Evaluate offered-subject eligibility using completed subjects, recognized exemptions, prerequisites and academic requirements; apply semester-type restrictions and sequential prerequisites. | Uses the student's own records, maintained rules and final confirmed offering list. Eligibility is explained as eligible, ineligible or uncertain; unresolved data is not treated as positive eligibility. |
| UC10, SRS `2.2.A3`, FR-C3 and FR-C4 | Validate a proposed selection against configured semester caps and programme exceptions; create and modify a proposed selection using eligible subjects from the current offering list. | Supports proposed selection totals, save/reload/edit/cancel/clear, eligibility and uncertainty explanations, concurrent prerequisite combination checks and maintained semester constraints. Eleven isolated PostgreSQL cases verified actual persistence, stale guards, invalid-plan preservation, and transaction rollback. Human review and connected Neon acceptance remain pending. |
| UC08, SRS `2.2.A3`, FR-C1 | Identify/select subjects offered during the current registration period. | The discussion directs use of the internally finalised list, replacing student re-entry/PDF upload in the revised workflow. The SRS's older manual wording remains a documented requirements conflict, not an amended SRS clause. |

The implementation preserves downstream compatibility by using existing `academic_plan` / `plan_subject` and an additive P002 metadata table for student/semester uniqueness, revision and confirmation provenance. It uses fresh authentication, server-side validation, source and revision guards, and an atomic transaction. The PGlite integration evidence verifies these against an isolated migrated PostgreSQL database; it is not connected Neon acceptance or multi-connection concurrency verification.

## Semester rules, limits and exceptions

The SRS `1.2 Scope` planning paragraph makes the policy hierarchy explicit: configure limits and exceptions from verified rules for the selected programme and curriculum; distinguish ordinary loads from higher loads requiring authorization. Pending confirmation, **10 credits for a Normal semester, an approval-dependent allowance up to 12, and 6 credits for a Short semester are provisional**. The SRS `1.3 Definitions` likewise calls Normal 10 the usual planning amount and says the applicable maximum (including a possible 12-credit allowance) is programme-configured and subject to verification. Do not present these values as settled institutional policy.

There is a more specific SRS requirement set in `2.2.A2 Functional Requirements — M2 Curriculum, Prerequisite and Graduation Requirements Management`:

- FR-B6 (UC07) says configure Semesters 1/2 as Normal with three subjects and a configured normal credit cap, and Semester 3 as Short with three subjects and six credits.
- FR-B7 (UC06) says configure subject-specific permitted semester types, including the default Short-only rule for two-credit subjects, a Final Year Project 1 exception, and the English 1 → English 2 → English 3 sequence.
- FR-C3 (UC10) again requires configured caps and configured programme exceptions, rather than hard-coding a universal 10/12/6 rule.
- The detailed UC06 business rules in SRS `2.2.6 Manage Curriculum and Prerequisites` state two-credit subjects are normally Semester 3 only unless a subject-specific exception is configured; Final Year Project 1 is exempt from the default restriction; and English 1/2/3 form a mandatory sequential chain.

The P002 implementation applies configured semester caps and explicit maintained subject permissions. A two-credit subject in a Normal semester requires an explicit maintained `NORMAL` permission. A Final Year Project exception is not inferred from a subject-code suffix. A sequential mandatory prerequisite must already be passed; co-selecting it with the next subject does not satisfy the sequence. Genuine co-requisites/concurrent rules are checked as combinations, distinct from sequential prerequisites. The isolated integration fixture passed a configured concurrent pair and rejected a failed sequential prerequisite co-selected with its dependent course.

The SRS document's policy wording is not perfectly uniform: FR-B7's prose calls the FYP1 exception, while its UC06 business rules describe it as a two-credit subject exempted from the default Semester-3-only restriction. The implementation uses configured subject-level permission; the selected curriculum's maintained configuration must be verified rather than guessed from names/codes.

## Exact source anchors

Use section/headings rather than page numbers, since pagination can change between document renders.

| Topic | SRS v2.1 anchor | Discussion anchor |
|---|---|---|
| Per-sprint ownership | `d. Sprint Development Plan`; `e. Use Case Coverage Summary` | `4 Idham responsibilities`; `5 Sharhan responsibilities`; `6 Aisar responsibilities`; `7 Harraz responsibilities` |
| Initial 30-student filter | `2.2.A3`, FR-C1 context only; the numeric threshold is not specified there | `2 Course offering requirements` → `First stage identifying subjects based on student demand`; `4 Idham responsibilities` → `Sprint 1 initial course offering filter` |
| Sharhan refinement and coordinator edits | P004/M6 and UC20 sprint wording in `d. Sprint Development Plan` (not Idham's UC09/10 allocation) | `2 Course offering requirements` → `Second stage refining the initial offering list`; `5 Sharhan responsibilities` → `Sprint 2 second offering filter and coordinator changes` |
| Manual UC08 vs revised list | `2.2.A3`, FR-C1 / UC08; detailed `2.2.8 Enter Semester Subject Offerings` | `3 Revised workflow` → `Approval and SMP` (meeting dated 1 November; SRS v2.1 dated 7 November) |
| Eligibility and selection | `2.2.A3`, FR-C2–FR-C5; detailed `2.2.9 Check Subject Eligibility`; detailed `2.2.10 Manage Semester Subject Selection` | `3 Revised workflow`; `4 Idham responsibilities` → `Sprint 2 individual student eligibility` |
| Configured limits, 2-credit exception and English sequence | `1.2 Scope`; `1.3 Definitions`; `2.2.A2` FR-B6/FR-B7; detailed `2.2.6 Manage Curriculum and Prerequisites`; `2.2.A3` FR-C3/FR-C5 | `Details still requiring confirmation` (discussion does not settle numerical limit policy) |
| Team dependencies | `d. Sprint Development Plan` | `8 Dependencies to reflect in the plan`; `9 Actions following the meeting` |

## Verification boundary

The current implementation is ready for review. The isolated PostgreSQL run is recorded at `../../verification/selection-db.log` and passed 11 actual route/repository persistence cases using the applied project migration set. The full verification run reports 1,462 passing tests, 59 inherited skips across 74 files, and 30 UI checks. Human peer review and connected Neon development-database acceptance are outstanding. The earlier `docs/p002-revised-sprints.md` and `docs/p002-verification.md` describe prior demand and eligibility work; the new database run separately verifies the UC10 selection writer. The current Kuala Lumpur student-centre mapping and Sharhan's downstream use of the first-filter handoff remain integration dependencies outside this implementation.
