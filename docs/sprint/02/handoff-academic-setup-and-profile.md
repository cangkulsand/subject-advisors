# Sprint 2 hand-off: admin academic setup and profile learning centre

Two work packages that the coordinator-confirmed offerings rule
([S2-P004-006](../../changes/S2-P004-006-confirmed-offerings-rule.md)) depends on. Each section is
a self-contained task prompt: a programmer or a coding agent (Codex, Claude, etc.) can pick one up
and run it as written.

## Parallel work and numbering

Three branches run in parallel. Keep these numbers so migrations and change records do not collide:

| Work | Branch | Migration | Change record | Status |
| --- | --- | --- | --- | --- |
| UC20 forecast engine, screens, confirm offerings | `feature/p004-s2-uc20-forecast-build` | `0007` | S2-P004-007 | In progress |
| Package A: admin academic setup | `feature/p004-s2-admin-academic-setup` | `0008` | S2-P004-008 | Open |
| Package B: profile learning centre and lock | `feature/p001-s2-profile-learning-centre` | `0009` | S2-P001-001 | Open |

Merge in migration order (0007, 0008, 0009). Whoever merges out of order renumbers their migration
and manifest entry.

Until Packages A and B land, the forecast build uses a temporary hardcoded `ScopeProvider`
(`listScopes()`, `isScopeAssigned(clerkUserId, programmeId, learningCentreId)`,
`currentSemesterId()`, `studentLearningCentreId(studentId)`). Package A's read API should make a
DB-backed `ScopeProvider` easy to write, so that only one file changes when it lands.

The forecast build has since merged (S2-P004-007). The temporary provider (`apps/api/src/config/interim-scope.ts`) was replaced by the DB-backed `createDbScopeProvider` in `apps/api/src/modules/forecasting/scope-provider.ts` (S2-P004-011); only `studentLearningCentreId` stays a KL default until Package B. For the subject create/edit menu (class type, semester type, "offered as a class"), follow [subject-configuration-rules.md](../../database/subject-configuration-rules.md).

## Package A prompt: admin academic setup

```text
Repo: E:\study\subject-advisors. Create branch `feature/p004-s2-admin-academic-setup` from `main`.
Follow AGENTS.md and docs/implementationguide.md: write the change record
`docs/changes/S2-P004-008-admin-academic-setup.md` (Plan / Implementation / Review / Changelog)
before editing code. Local only: do not push, and do not touch the production database.
Apply migrations only to the Neon DEVELOPMENT branch (see docs/neonsetup.md and tools/db/cli.mjs).

GOAL
Build the System Admin "academic setup" module that the coordinator-confirmed offerings rule
depends on. Read docs/changes/S2-P004-006-confirmed-offerings-rule.md first: it is the
authoritative rule and names the planned tables. Use those names exactly.

SCOPE (SYSTEM_ADMIN only)
1. Learning centres: list, create and edit the existing `learning_centre` table
   (centre_code, centre_name). No hard delete: add an `is_active` flag if needed.
2. Faculties: new `faculty` table (code, name, is_active), plus a nullable
   `programme.faculty_id` FK. Admin assigns each programme to a faculty.
3. Current semester: add the admin-managed marker `academic_semester.is_current`.
   Exactly one row may be current (partial unique index). Build the planned page
   /admin/semesters (currently a placeholder in apps/web/src/features/admin/AdminRoutes.tsx):
   list semesters, create/edit semesters (academic_year, semester_no, semester_type,
   max_subjects, max_credits, dates), and an "advance / set current semester" action.
4. Coordinator assignments: new `coordinator_assignment` table linking a coordinator account
   (user_access_assignment / clerk user with the COORDINATOR role) to faculty + programme +
   learning_centre. Admin adds and removes assignments, from the coordinator's account page
   (/admin/users/:id) or a dedicated page. Removal is soft (ended_at), never a hard delete.
5. Every change needs a reason and is audited, following the pattern of migration
   0006_admin_user_management.sql and apps/api/src/modules/admin (trusted context via
   set_config('app.access_actor'/'app.access_reason'), audit tables, stable error codes,
   reason dialog in the UI).

OUT OF SCOPE
- Degree subjects/curriculum editing (/admin/curriculum) and graduation requirements.
- The student profile. Package B adds the learning centre to the profile.
- Anything under apps/api/src/modules/profile, apps/web/src/features/profile or
  apps/web/src/features/coordinator. Another branch is building the forecast and
  confirmation work there.
- Do not edit historical migrations.

CONSTRAINTS
- Migration number: use `0008_admin_academic_setup.sql`. Another branch owns 0007.
  Do not depend on any table from 0007. Update db/migrations/manifest.json, the db/checks
  and the tools/db tests, as 0006 did.
- Expose a small read API that the forecast build can consume later:
  - GET current semester
  - list active learning centres
  - list a coordinator's assignments (programmeId, learningCentreId, facultyId)
  The forecast branch has a temporary `ScopeProvider` interface with
  listScopes(), isScopeAssigned(clerkUserId, programmeId, learningCentreId),
  currentSemesterId() and studentLearningCentreId(studentId). Shape your repository
  so a DB-backed ScopeProvider is easy to write.
- Shared types go in packages/shared/src/admin/. OpenAPI goes in docs/api/ (extend
  admin-users.openapi.json or add admin-academic-setup.openapi.json).
- Match the existing admin UI: a single card per page, a modal for create/edit,
  and in-page reason dialogs (see AdminUserManagement.tsx).

VERIFY
npm run typecheck, npm run lint, npm test, npm run test:ui:admin (extend
tools/admin/test-ui.mjs and fixtures), the db checks on a local disposable DB,
then migrate + verify on the Neon development branch. Record results in the change record.
```

## Package B prompt: profile learning centre and lock

```text
Repo: E:\study\subject-advisors. Create branch `feature/p001-s2-profile-learning-centre`
from `main`. Follow AGENTS.md and docs/implementationguide.md: write the change record
`docs/changes/S2-P001-001-profile-learning-centre-and-lock.md`
(Plan / Implementation / Review / Changelog) before editing code. Local only: do not push,
and do not touch the production database. Apply migrations only to the Neon DEVELOPMENT branch.

GOAL
Implement the profile part of the coordinator-confirmed offerings rule. Read
docs/changes/S2-P004-006-confirmed-offerings-rule.md (rules 2 and 4 and the OP5/OP11/OP16
decisions) and docs/requirements/srs-amendment-2026-11-01-confirmed-offerings.md.
The shared contract already exists: packages/shared/src/profile/profile-setup.ts
(ProfileLearningCentreOption, PROFILE_SETUP_LOCKED_FIELDS, PROFILE_SETUP_LOCKED_ERROR,
lockedProfileFieldChanges). Use it rather than redefining it.

SCOPE
1. Migration `0009_profile_learning_centre.sql` (0007 and 0008 are taken by other branches;
   depend only on tables in 0001-0006):
   - student_profile.learning_centre_id: nullable FK to the existing learning_centre table.
   - student_profile.intake_semester_id: nullable FK to academic_semester (planned field,
     used for the seniority tie-break).
   - Database enforcement of the lock: once programme/curriculum/learning centre are set,
     a normal student update cannot change them. A trusted admin correction path
     (reason required, audited) can, following the trusted-context pattern of migrations
     0004/0006.
   - Update db/migrations/manifest.json, the db/checks and the tools/db tests.
2. API (apps/api/src/modules/profile):
   - Profile setup accepts learningCentreId and intakeSemesterId.
   - Offer the list of learning centres as options.
   - Return 409 PROFILE_SETUP_LOCKED when a student tries to change a locked field.
   - Existing profiles without a centre may set it ONCE, then it locks.
   - The current semester stays student-editable as today.
3. Web (apps/web/src/features/profile/ProfilePage.tsx):
   - Learning centre and intake semester selection in profile setup.
   - After setup, show programme / curriculum / learning centre read-only, with a note:
     "Contact the administrator to correct these details".
   - Existing users with no centre see a one-time prompt to choose it.
4. Admin correction (OP5): a minimal SYSTEM_ADMIN API endpoint to correct a student's
   programme/curriculum/learning centre with a reason (audited). A UI is optional; if you
   add one, put it on the existing /admin/users/:id account page only.

OUT OF SCOPE
- Learning centre CRUD, faculties, coordinator assignments and the current-semester marker:
  Package A builds those (migration 0008). Read learning centres straight from the
  existing learning_centre table.
- The offerings page, the coordinator screens, and anything under apps/api/src/modules/offerings,
  apps/web/src/features/offerings or apps/web/src/features/coordinator.
- Do not edit historical migrations.

VERIFY
npm run typecheck, npm run lint, npm test (extend the profile tests: the lock, set-once centre,
409 code, admin correction), the db checks on a local disposable DB, then migrate + verify on
the Neon development branch. Record results in the change record.
```
