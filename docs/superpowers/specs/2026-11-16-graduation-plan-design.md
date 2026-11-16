# Graduation plan and what-if scenarios (UC14–UC16) — design

- **Date:** 2026-11-16
- **Change record:** S3-P004-004 (owner M5 / P003 Harraz; built by P004, to be handed over as files)
- **SDD Sprint 3:** "UC14–UC16 — Combine baseline completion forecasting and scenario comparison"

## Intent

Students see when they could finish their degree if they keep going without delays (UC14). They can also try out
"what if I postpone, fail, withdraw from or swap a subject" and compare the result with their baseline (UC15/UC16),
without changing any record. Recommendations (UC11/UC12, M4) will later build on the same engine, so the engine is a
pure, shared function.

The project owner said "just proceed" and asked that the work be extractable as files for the module owners. Every
call below that the SRS leaves open is marked **(call)** for Harraz to confirm.

## Goals

- One deterministic planning engine in `packages/shared/src/planning/`, used by the API and the browser. Baseline and
  scenarios come from the same code (UC16 BR3).
- `GET /api/planning/input`: the planning input for the signed-in student (read-only).
- Student page `/student/plan` "Graduation plan": the semester-by-semester plan, the estimated completion semester,
  the theoretical earliest completion, bottleneck subjects, assumptions, and a "What if" panel with Compare and Reset.

## Non-goals

- Saving plans or scenarios to the database. Scenarios live in the browser only and are lost on reload
  **(call; the SRS SimulationScenario entities and the unused `simulation_scenario` tables stay for later)**.
- Recommendations, ranking and alternatives (UC11/UC12): next change, on top of this engine.
- Changing the old `/api/pathway/projection` scheduler. It is not routed by the integrated API router today; it is left
  as-is and noted for Harraz to retire.
- Graduation eligibility rules beyond credits and requirement groups (UC13 stays the authority).

## Anti-goals

- Never write to `academic_record` or any other table (UC15 BR1).
- Never show failure probabilities or guaranteed dates (UC11 BR9); the plan is labelled advisory.

## Engine rules

Input (`PlanningInput`): curriculum (total credits), curriculum subjects (code, name, credits, category, compulsory,
allowed semester types, MANDATORY prerequisites), requirement groups (type, required subjects, required credits),
passed subjects, earned credits, the start semester, configured semester limits, and the subjects the coordinator
approved for the first planned semester.

1. **Passed subjects:** a curriculum subject counts as done when any attempt is COMPLETED or EXEMPTED
   (same as UC09 eligibility and UC05 progress; the old scheduler's "duplicate attempt = unresolved" is dropped).
2. **What still has to be taken** (requirement groups): a group matches subjects whose category equals the
   requirement type after upper-casing and treating spaces and underscores alike (`Elective E1` = `ELECTIVE_E1`);
   `COMPULSORY` matches compulsory subjects. When a group's pool is larger than what is still needed, the engine picks
   the needed number (or credits): first subjects that unlock other needed subjects, then fewer prerequisites, then
   subject code **(call)**. Picked electives are marked "elective choice — any N of the M options". Compulsory subjects
   outside every group are always included. With no groups configured, every curriculum subject is included and an
   assumption says so. Unpassed MANDATORY prerequisites of anything included are pulled in.
3. **Semesters:** start at the semester after the system current semester (`academic_semester.is_current`, the same
   rule as the offerings page) **(call)**; without a current semester, plan in numbered semesters ("Semester 1 of your
   plan") (SRS UC14 BR10). Order 1, 2, 3 per academic year; 3 is Short. Labels: `AY 2026/2027 – Semester 3 (Short
   Semester)` (BR12); years past the configured calendar roll forward (2027/2028, …).
4. **Limits:** the configured `max_subjects` / `max_credits` of that semester; otherwise the latest configured semester
   of the same type; otherwise Normal 3 subjects / 10 credits and Short 3 subjects / 6 credits (BR4).
5. **Placement:** a subject may go in a semester only if all its MANDATORY prerequisites are passed or placed in an
   earlier semester, its semester-type rule allows that type (no rule = any), and no scenario change holds it back.
   Prerequisite chains therefore land in separate semesters (the English 1–2–3 chain, which are Short-only, lands in
   three separate Short semesters: BR9). COREQUISITE and RECOMMENDED links are not enforced (assumption shown).
6. **First planned semester:** when the coordinator has approved subjects for the student's programme and centre in
   that semester, only approved subjects go there (BR6, SRS amendment 2026-11-01). Later semesters assume every
   subject can be offered (assumption shown).
7. **Order of filling:** longest chain of needed subjects that still depend on it first (critical path), then how many
   needed subjects it unlocks, then compulsory first, then code. Fill up to the subject and credit limits.
8. **Stop:** when everything is placed, or after 9 semesters in a row with nothing placeable; anything left is listed
   as "cannot be planned" with the reason (for example no semester type allows it, or a prerequisite outside the
   curriculum).
9. **Earliest possible completion (lower bound):** the larger of (a) the longest chain of needed subjects in
   semesters and (b) the first semester by which the cumulative subject and credit limits could hold everything left.
   Shown next to the planned completion (UC14 main flow).
10. **Bottlenecks:** needed subjects with the longest chains of dependent needed subjects (top 5 with a chain of two
    or more), each with a sentence: "Delaying X delays N later subjects (X → Y → Z)" (UC12 BR2/BR5 wording, reused
    later by recommendations).

## Scenarios (UC15/UC16)

Changes the student can add, in the browser only:

- **Postpone** a planned subject: it cannot be placed before the semester after the one the baseline put it in.
- **Fail** a planned subject: the same, and the plan notes the retake.
- **Withdraw** from a planned subject: the same, and the plan notes the withdrawal.
- **Replace** an elective choice with another option from the same group.

The scenario plan comes from the same engine with these constraints. **Compare** shows baseline vs scenario
completion, the change in semesters, and each subject that moved (from, to). **Reset** clears all changes
(UC16 reset). Records are never touched.

## Approaches considered

1. **Shared pure engine, run in the browser on API-supplied input (chosen).** One code path for baseline and
   scenarios; scenarios are instant and need no write API; the API stays a thin read. Trade-off: the browser runs the
   engine (cheap; ~80 subjects).
2. Server computes baseline and scenarios (POST scenario → plan). Keeps logic server-side but needs a write-shaped API
   for a read-only feature and a round trip per change.
3. Extend the old pathway scheduler. Rejected: it is not routed, schedules every elective, ignores the start semester
   and approved offerings, and lives inside the UC17 module.

## Files (extractable for hand-over)

- `packages/shared/src/planning/` — contracts, engine, scenarios, labels, tests (M5).
- `apps/api/src/modules/planning/` — repository, route, index, tests (M5); router + `tools/integration/prepare.mjs`
  registration lines.
- `apps/web/src/features/planning/` — client, page, CSS, tests (M5); `AppRoutes`, `StudentRoutes`, `StudentShell`
  one-line registrations.
- Integration UI checks in `tools/integration/test-ui.mjs`.

## Left to the builder

Page layout details within `docs/themeguide.md` (typography tokens, readability guard).
