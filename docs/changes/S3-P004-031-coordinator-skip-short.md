# S3-P004-031 — Coordinators forecast the next Normal semester (Short semesters skipped)

- **Status:** Implemented on branch; not merged or deployed
- **Date:** 2026-11-21
- **Sprint:** Sprint 3
- **Owner:** P004 (coordinator forecast)
- **Related UC / FR:** UC20 class offering forecast
- **Branch / PR:** `feature/coordinator-skip-short`; no PR
- **Reviewer:** Pending

## 1. Plan

The coordinator forecast targeted the semester straight after the admin current semester. After Semester 2 that is Semester 3 (Short), so coordinators saw and could approve Short-semester subjects. Short semesters are managed by other people, outside this application.

Owner decisions (2026-11-21):
- **Coordinators skip to the next Normal semester.** For example, while the current semester is 2026/2027 Semester 2, the target is 2027/2028 Semester 1.
- **Students: leave as is.** Students still pick for the semester straight after the current one.

Out of scope: the student offerings page, admin semester advance, the database.

## 2. Implementation

- `packages/shared/src/forecasting/target-semester.ts` (new): `coordinatorTargetSemester(currentSemesterId, semesters)` returns the first semester after the current one whose type is not SHORT. A semester without a type counts as Normal. Tests are in `target-semester.test.ts`.
- `packages/shared/src/forecasting/contracts.ts`: `SemesterOption` gains an optional `semesterType`.
- `apps/api/src/modules/forecasting/repository.ts`: the semester list now reads `semester_type`.
- `apps/api/src/modules/forecasting/routes.ts` (`resolveTarget`) and `semester-window.ts` (`isNext`, which allows decisions) use the helper. Context, imports, snapshots, runs and decisions therefore all target the same Normal semester, and a Short semester is read-only for coordinators.
- `ForecastsPage.tsx`: the page description now says "the next Normal semester (Short semesters are arranged separately)".

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | PASS |
| `npm test` | 1906 passed, 67 skipped (new: 6 helper tests, 1 context test, 1 decisions test) |
| `npm run test:ui:coordinator` | 57 PASS |
| `npm run test:ui:integration` | 75 PASS (mocked) |

The database already enforces that Semester 3 is SHORT and Semesters 1–2 are NORMAL (`academic_semester_rule_4`).

What this means in practice:
- While the current semester is Semester 2, coordinators approve subjects for Semester 1 of the next year.
- Students see the Short semester as their next semester, with no approved subjects (as the owner chose).
- Students see the coordinators' Semester 1 approvals once the admin advances the current semester to Semester 3.

## 4. Changelog

- Coordinators now forecast and approve subjects for the next Normal semester. Short semesters are skipped because they are arranged separately.
