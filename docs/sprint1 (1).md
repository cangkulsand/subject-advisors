# Sprint 1 — Foundation & Setup

> **Execution specification for OpenAI Codex**  
> **Project:** AI-Powered Academic Advisory System for UTMSPACE Part-Time Students  
> **Reference:** SRS + SDD, Version 2.0, dated 24 October 2026  
> **Sprint objective:** Deliver a runnable, secure, end-to-end foundation and the six Sprint 1 use cases: **UC01, UC02, UC03, UC04, UC08, and UC17**.

## 0. READ FIRST — Programmer-specific execution mode

**IMPORTANT: This is ONE shared sprint reference, NOT an instruction to implement every task.** Each developer runs Codex independently and specifies exactly one scope. Read the entire file for context, but **edit and implement ONLY the selected scope**. A request for "Programmer 4" never authorizes work on Programmers 1–3 or the complete shared foundation.

### 0.1 Copy/paste prompts (choose one)

| Who runs Codex? | Exact prompt |
| --- | --- |
| **Programmer 1 (P001)** | `Read sprint1.md. Implement ONLY Programmer 1 (P001) Sprint 1 tasks: UC03 and UC04. Follow the file ownership, dependency, testing and reporting rules. Do not implement other programmers' tasks or the FOUNDATION work package.` |
| **Programmer 2 (P002)** | `Read sprint1.md. Implement ONLY Programmer 2 (P002) Sprint 1 tasks: UC08. Follow the file ownership, dependency, testing and reporting rules. Do not implement other programmers' tasks or the FOUNDATION work package.` |
| **Programmer 3 (P003)** | `Read sprint1.md. Implement ONLY Programmer 3 (P003) Sprint 1 tasks: UC17 interactive talent-tree UI prototype. Follow the file ownership, dependency, testing and reporting rules. Do not implement other programmers' tasks or the FOUNDATION work package.` |
| **Programmer 4 (P004)** | `Read sprint1.md. Implement ONLY Programmer 4 (P004) Sprint 1 tasks: UC01 and UC02 using Clerk. Follow the file ownership, dependency, testing and reporting rules. Do not implement other programmers' tasks or the FOUNDATION work package.` |
| **Integration lead / foundation maintainer** | `Read sprint1.md. Implement ONLY the FOUNDATION shared setup in Section 3. Do not implement UC01, UC02, UC03, UC04, UC08, or UC17 beyond minimal shared interfaces.` |

**For example, "implement Programmer 4 task" means Section 4 ONLY, plus minimal supporting auth-specific files; it does not mean Sections 3, 5, 6 or 7.** Do not infer authorization to implement additional modules from dependency lists, example API routes, or the combined Definition of Done.

### 0.2 Strict scope-selection rules for Codex

1. **Select exactly one owner:** `FOUNDATION`, `P001`, `P002`, `P003`, or `P004` from the user's prompt. `Programmer 1`, `programmer1`, and `P001` mean the same owner (likewise 2/3/4). If the user gives no owner, do not modify code; present the scope choices briefly.
2. **Inspect first:** inspect repository structure, active branch and `git status`; read the existing code/manifest/config. Preserve unrelated code and uncommitted changes. Follow the existing project stack and conventions; never blindly scaffold over existing work.
3. **Execute only selected acceptance tests.** Tests and builds should cover affected code and the repo-wide checks that are practical. The combined Sprint 1 release gate is for later integration, not a mandate for every programmer to finish every use case.
4. **Respect ownership:** implement the selected section and its owned feature files. Make only the smallest necessary changes to shared route registration, types or configuration; do not refactor another programmer's module. Document any shared-file changes in the final report.
5. **Handle dependencies without scope creep:** if a shared module/API is missing, consume the contracts in Section 3, add **test-only mocks/fixtures or a narrowly scoped interface**, and report an integration blocker. Do not recreate another owner's real API, authentication service, database tables or business logic. Do not expose insecure production routes to bypass missing authentication.
6. **Real implementation, not just planning:** write code and tests for the selected tasks where the repository/infrastructure allows. Missing external credentials are blockers to report, **not** permission to fake Clerk authentication, verified email, DB writes, or official university data. Non-production demo fixtures must be labelled clearly.
7. **Do not broaden Sprint 1:** other use cases (including M6 forecasting and M7 administration) belong to later sprints. Student/Coordinator/System Administrator role checks are part of P004's M0 foundation, but UC21–UC23 features are not.
8. **Never invent verification:** run available typecheck/lint/unit/build checks, list actual results, and disclose skipped checks and why. Do not deploy or modify production environments unless explicitly requested.
9. **Stop at your boundary:** after selected tasks, hand off the affected contracts, PR/branch readiness, tests and known dependencies; **do not continue to the next programmer**.

### 0.3 Programmer ownership and handoff map

| Owner | Implement now | Owns code primarily under | Must NOT implement |
| --- | --- | --- | --- |
| **FOUNDATION** (one-time, designated lead) | Shared repo configuration, app/API shells, shared contracts, reference catalogue/semester database, health check, docs/CI | `packages/shared/`, `db/migrations/*reference*`, `apps/web/src/app/`, `apps/api/src/index.ts`, common tooling/docs | User-facing UC01–UC04, UC08, UC17 workflows |
| **P001 — Programmer 1** | **UC03, UC04:** student profile and self-reported academic subject records | `apps/web/src/features/profile/`, `features/records/`, `apps/api/src/modules/profile/`, `modules/records/`, profile/record migrations and tests | Sign-in/auth, offering management, pathway visualization |
| **P002 — Programmer 2** | **UC08:** student-reported semester subject offerings | `apps/web/src/features/offerings/`, `apps/api/src/modules/offerings/`, offering migration and tests | Student records, eligibility/recommendation engine, coordinator forecasts |
| **P003 — Programmer 3** | **UC17:** interactive prerequisite talent-tree prototype, read-only graph adapter | `apps/web/src/features/pathway/`, `apps/api/src/modules/pathway/` (read-only), relevant tests | Student record mutation, what-if engine, scheduling/timeline algorithms |
| **P004 — Programmer 4** | **UC01, UC02:** Clerk registration/login/logout, verified-domain checks, server-side RBAC/session/account binding | `apps/web/src/features/auth/`, `apps/api/src/modules/auth/`, `apps/api/src/middleware/auth*`, auth/access migration and tests | Profile forms, subject records, semester offerings, talent tree, admin dashboard, coordinator forecasting |

**Shared-file policy:** Integrate through existing extension points. If a route must be registered in a shared router or schema type must change, keep the diff minimal, backward compatible if possible, and identify it clearly in the PR. Do not concurrently rewrite `package.json`, root migrations, common app layout, API entry point or environment files without coordination. Recommended workflow: foundation PR merges first, then one feature branch/PR per programmer.

### 0.4 Independent completion criteria

A programmer is **DONE** when the use case(s) in their selected section meet their own acceptance tests, their changed code has reasonable tests and documentation, and dependencies they cannot yet integrate are documented. They are **not** responsible for making all six Sprint 1 use cases pass. Full end-to-end acceptance is a separate integration responsibility.

## 1. Project and sprint scope

### Product context

This is a responsive academic **advisory** web application, initially supporting **one selected UTMSPACE degree programme and curriculum version**. Student academic history and semester offerings are self-reported in this initial version. The system does **not** officially register subjects, verify university records, guarantee future offerings, or guarantee graduation dates.

There are eight modules overall (**M0–M7**), allocated to four developer-owned subsystems (**P001–P004**). The following are the only Sprint 1 functional commitments:

| Owner | Modules | Sprint 1 use case | Deliverable |
| --- | --- | --- | --- |
| **P004 — Mohd Sharhan** | M0 | **UC01 Register Account** | Clerk signup, institutional email verification and policy, local account association, first-time setup navigation |
| **P004 — Mohd Sharhan** | M0 | **UC02 Login / Logout** | Clerk session handling, server-enforced roles/access status, secure logout, role-appropriate routing |
| **P001 — Aisar Afiq** | M1, M2 dependencies | **UC03 Manage Academic Profile** | Create, view, update own profile; programme/curriculum selection; work/study availability |
| **P001 — Aisar Afiq** | M1, M2 dependencies | **UC04 Manage Academic Subject Records** | Add/view/update self-reported completed, exempted, failed and withdrawn subjects |
| **P002 — Muhammad Nor Idham** | M3 | **UC08 Enter Semester Subject Offerings** | Save/update student-reported offerings for selected academic year and semester |
| **P003 — Harraz Haziq** | M5 | **UC17 View Interactive Academic Pathway** | React Flow prerequisite/talent-tree UI prototype with status legend and safe data integration |

**Combined Sprint 1 target (integration phase only):** a working frontend, backend API, Clerk integration, PostgreSQL schema/migrations, shared contracts, local development setup, and automated validation. **No individual programmer is assigned the entire combined target.**

### Explicitly outside Sprint 1

- **UC05–UC07:** finished progress calculations, full administrator curriculum editing, graduation-requirement management.
- **UC09–UC12:** complete eligibility engine, semester-plan validation, recommendations and bottleneck algorithms.
- **UC13–UC16 and UC18–UC19:** graduation checking, full pathway scheduling, what-if simulations, detailed dependency exploration, and synchronized projected timeline.
- **UC20–UC23:** M6 coordinator forecast/data upload/optimization/versioning and M7 administrator dashboard/user-management features. **Build foundational roles/access checks now; do not implement these modules' full workflows.**
- Official UTMSPACE/SMP APIs, PDF imports, native mobile apps, mandatory LLMs, automated academic registration, real student-data scraping, or auto-publication of class offerings.

## 2. Architecture and engineering standards

Use the stack specified in SRS/SDD v2.0:

| Layer | Required choice | Responsibility in Sprint 1 |
| --- | --- | --- |
| Web | **React + TypeScript + Vite** | Responsive pages, Clerk UI, profile/record/offering forms, interactive talent tree |
| Authentication | **Clerk** | Registration, email verification, sign-in/sign-out, authenticated sessions |
| API | **Cloudflare Workers + TypeScript** | Validate Clerk identity, enforce roles/ownership, validate requests, query persistence |
| Database | **Neon PostgreSQL** | Academic reference entities, student records, offerings, application role mappings |
| Pathway UI | **React Flow** (currently `@xyflow/react`, if compatible with existing app) | Node/edge rendering, zoom/pan, prerequisite connections and states |
| Collaboration | **Git/GitHub** | Small commits/PRs and clear module ownership |

**For the FOUNDATION owner only**, if starting from an empty repo, prefer a simple workspace/monorepo so the web and API can share types and validation schemas. Feature programmers should reuse the merged foundation and must not re-scaffold or replace it. A suggested structure (adapt to an existing repo rather than forcing it):

```text
apps/
  web/
    src/
      app/                    # App shell, router, Clerk provider
      features/auth/
      features/profile/       # P001
      features/records/       # P001
      features/offerings/     # P002
      features/pathway/       # P003
      components/             # Shared UI, states, layout
      lib/api-client.ts
  api/
    src/
      index.ts               # Worker entry point and routes
      middleware/            # Clerk authentication and role checks
      modules/auth/          # P004
      modules/profile/       # P001
      modules/records/       # P001
      modules/offerings/     # P002
      modules/pathway/       # Read-only graph data for P003
      db/
packages/
  shared/                    # Types, Zod schemas (if chosen), role enums
db/
  migrations/
  seeds/                     # Clearly labelled development-only fixtures
 docs/
  setup.md
  api.md
.env.example
README.md
```

Choose a consistent DB migration/query strategy appropriate for Cloudflare Workers and Neon (e.g. a Workers-compatible PostgreSQL driver and migration tooling). Do not introduce multiple competing ORMs or database clients. Use parameterized queries. No application passwords are stored locally.

### Non-negotiable standards

- TypeScript strict mode, consistent formatting/lint rules, reusable server-side validation, no untyped `any` around auth and API contracts.
- One consistent API response/error shape; meaningful `400`, `401`, `403`, `404`, `409`, and `500` cases where appropriate.
- All private student queries are scoped using the **verified Clerk user ID from the authenticated session**, never an arbitrary `student_id` accepted from the browser as ownership proof.
- Secrets only in local environment/Cloudflare secrets; never commit Neon URLs, Clerk secret keys, JWTs, real identities, or real academic histories.
- Loading, empty, validation, network-error, forbidden, and success states for every Sprint 1 page.
- Responsive layout and accessible labels/keyboard use; aim toward WCAG 2.1 AA.
- Clearly label **student-reported**, **demonstration**, and **unverified** academic information.
- Implement shared programme/curriculum/subject contracts in ways the other programmers can consume without duplicating logic.
- Do not hardcode graduation credit totals or curricular policy into UI components. SRS v2.0 says academic policies are programme-configured and some numeric values still require official confirmation.

## 3. FOUNDATION — One-time shared setup (separate owner; not implicit in P001–P004)

**Selection requirement:** Execute this section only when the explicit prompt selects `FOUNDATION`. If a prompt selects Programmer 1, 2, 3 or 4, treat this section as **contracts and dependencies to consume**, not as instructions to implement the entire foundation. Developers may make narrowly scoped modifications required by their own feature while respecting the shared-file policy.

**Foundation acceptance goal:** Common project scripts/builds work, reference data types and migrations exist, and the health check succeeds. Do not build user-facing use cases in this section.

### A1. Repository and local development

- [ ] Inspect and preserve the existing repository and branch; document important existing decisions.
- [ ] Scaffold or finish React/Vite frontend and Cloudflare Workers API, with reusable scripts for `dev`, `lint`, `typecheck`, `test`, and `build`.
- [ ] Configure local frontend-to-API communication without embedding server secrets in browser builds.
- [ ] Provide `.env.example`, Worker secret/binding guidance, and `docs/setup.md` including prerequisite services and commands.
- [ ] Add a safe `/api/health` response that reveals no credentials or private data.
- [ ] Add a shared shell/navigation for Student, Academic Coordinator and System Administrator. Non-Sprint-1 features may show clearly marked **not yet implemented** placeholders, behind correct authorization.
- [ ] Set up gitignore and a simple CI workflow or documented local quality gate for typecheck, tests, and build.

### A2. Schema and migrations

Define the **migration-managed schema contract** for Sprint 1, but implement tables **by the single owner shown** (instead of having everyone implement all entities). Based on the v2.0 data dictionary, implement or map existing equivalents of:

| Entity | Migration owner | Minimum purpose/important fields |
| --- | --- | --- |
| `Programme` | **FOUNDATION** | `programme_id`, unique `programme_code`, `programme_name`, optional status |
| `Curriculum` | **FOUNDATION** | `curriculum_id`, `programme_id`, `curriculum_version`, `total_credit_required`, optional effective year/status |
| `Subject` | **FOUNDATION** | `subject_id`, `subject_code`, `subject_name`, `credit_hours`, classification/status where applicable |
| `CurriculumSubject` | **FOUNDATION** | `curriculum_subject_id`, `curriculum_id`, `subject_id`, `is_compulsory`, `subject_category` |
| `SubjectPrerequisite` | **FOUNDATION** | `prerequisite_id`, dependent `curriculum_subject_id`, required `curriculum_subject_id`, `requirement_type` |
| `AcademicSemester` | **FOUNDATION** | `semester_id`, `academic_year`, `semester_no` (1/2/3), derived or validated `semester_type`, limits if configured |
| `StudentProfile` | **P001** | `student_id`, unique `clerk_user_id`, `curriculum_id`, `student_name`, optional `matric_no`, work/study hours, timestamps |
| `AcademicRecord` | **P001** | `record_id`, `student_id`, `subject_id`, `status`, optional grade, `recognized_credits`, optional notes/semester, timestamp |
| `SemesterOffering` | **P002** | `offering_id`, `student_id`, `semester_id`, `curriculum_subject_id`, timestamp |
| `UserAccessAssignment` | **P004** | `access_assignment_id`, unique `clerk_user_id`, `app_role`, `access_status`, timestamps |

**P004 may** add `UserAccessAuditLog` as a forward-compatible table if needed for auth infrastructure; full UC22 auditing workflows are for a later sprint. Remaining SRS entities (plans, simulations, forecast versions, imported cohorts, etc.) are **not** required to be fully implemented now.

**Each owning programmer enforces their table constraints:** foreign keys, proper uniqueness, sensible checks (non-negative hours and credits, permitted status/role values), indexes for owner/semester lookups, and safe migrations. Prevent duplicate curriculum-subject mappings and duplicate reported offerings for the same student, semester and curriculum subject. Choose carefully whether `AcademicRecord` is one current state per subject or supports attempts later; document the decision and ensure the Sprint 1 UI cannot double-count/duplicate one subject.

Do not seed unverified programme requirements as if they were official. If real approved curriculum data has not been supplied, seed a deliberately fictional programme/subject graph clearly marked **DEMO / NOT OFFICIAL UTMSPACE DATA**, accessible only as dev/demo content. The system should be able to run using one real approved curriculum when later provided.

### A3. Shared API and types (FOUNDATION publishes contracts; each programmer implements owned endpoints)

- [ ] Create types/schemas for users, programme/curriculum subjects, prerequisites, profile, academic record, semester and offering.
- [ ] Create a typed API client with session-aware authorization, structured errors, and a consistent loading pattern.
- [ ] Define authenticated API contracts (FOUNDATION); protected route implementation is owned by its programmer. All student-owned resources are resolved by Clerk identity on the API. Do not implement a fake production auth bypass while waiting for P004.
- [ ] Document routes and example sanitized request/response payloads in `docs/api.md`.

**Suggested HTTP contract** (adapt existing route naming, keep the intent; **the route owner implements the endpoint**, not every programmer):

| Owner | Method | Route | Purpose |
| --- | --- | --- |
| **FOUNDATION** | `GET` | `/api/health` | Safe service availability |
| **P004** | `GET` | `/api/me` | Current verified identity, local role, status and profile-setup state |
| **P004** | `POST` | `/api/me/initialize` | Idempotently create **student** access assignment after verified, policy-compliant Clerk signup |
| **FOUNDATION** | `GET` | `/api/catalogue/curricula` | Selectable configured programme/curriculum catalogue |
| **FOUNDATION** | `GET` | `/api/catalogue/curricula/:id/subjects` | Applicable subject list with credits and prerequisites |
| **P001** | `GET` | `/api/profile` | Own profile or setup-required response |
| **P001** | `PUT` | `/api/profile` | Create/update own academic profile and chosen valid curriculum |
| **P001** | `GET` | `/api/academic-records` | Own subject statuses |
| **P001** | `POST` | `/api/academic-records` | Create own valid subject record |
| **P001** | `PUT` | `/api/academic-records/:id` | Update only own record |
| **P002** | `GET` | `/api/semester-offerings?academicYear=...&semester=...` | Own student-reported offerings |
| **P002** | `PUT` | `/api/semester-offerings` | Replace/update own offerings for a semester transactionally |
| **P003** | `GET` | `/api/pathway/graph` | Read-only curriculum + recorded-status graph data for UC17 |

Avoid inventing a public privileged-role creation endpoint. Server-side invite/assignment for coordinators and administrators must be explicitly controlled and may be provisioned via a safe documented bootstrap/admin operation until UC22 arrives.

## 4. P004 — Programmer 4: M0 Clerk authentication (UC01, UC02)

> **Only execute this section when the prompt selects Programmer 4 / P004.** Never implement P001's student profile/records, P002's offerings, P003's talent tree, or the full FOUNDATION task.

**Ownership/deliverables:** Clerk-based registration and login/logout UI, Worker-side verified session and institutional email validation, local `UserAccessAssignment` migration, role/access middleware, `/api/me` and `/api/me/initialize`, secured route/landing decisions, and auth tests. Make minimal shared router/env changes only when required; list them in the final report.

**If other modules are not ready:** after registration, redirect to the agreed `/student/setup` route even if P001 has not yet implemented its form; use a clearly marked placeholder or missing-dependency state only for integration. Determine profile completion through a shared contract/DB read when available. Do not build the profile form or invent a complete profile to pass the flow. Coordinator and administrator destinations may also be protected placeholders; no M7 dashboard or UC22 role editor.

**P004-only completion gate:** UC01 and UC02 acceptance tests under B3; session/role checks fail closed, local access assignment is idempotent, user identity cannot be forged, and no other programmer's feature is implemented.


### B1. UC01 Register Account — FR-A1

- [ ] Implement Clerk signup for student users with email verification.
- [ ] Require a **verified** email address with exact permitted domain `@graduate.utm.my` for student application access. Verify this **on the Worker backend**, not solely with a frontend form or Clerk appearance setting. Validate exact domain boundaries; `name@graduate.utm.my.attacker.test` must fail.
- [ ] On valid signup, bind the Clerk identity to a unique local application access record with `STUDENT` and `ACTIVE` (idempotent; never upgrade an existing role or reactivate suspended users).
- [ ] Prevent changes to registered institutional email through application forms. If a user's externally managed Clerk identity no longer satisfies the student verification/domain policy, deny protected student access until resolved.
- [ ] Redirect new student accounts to mandatory academic profile setup; student planning screens stay blocked until a valid profile with curriculum exists.
- [ ] Handle wrong domain, unverified email, existing account, Clerk failure and database failure with friendly but accurate states.

**Consistency decision for implementation:** The UC01 narrative mentions both initial student-profile association and later mandatory curriculum selection. Because `StudentProfile.curriculum_id` is required in the data dictionary, create the **Clerk-linked application access identity first**, then create `StudentProfile` when the student completes UC03 profile setup with a valid curriculum. This avoids inserting an invalid placeholder curriculum or fake academic profile.

### B2. UC02 Login / Logout — FR-A2

- [ ] Implement Clerk login and logout and session expiry handling.
- [ ] Validate Clerk sessions/tokens on protected Worker routes using the supported Clerk server-side validation method.
- [ ] Resolve local application access: `STUDENT`, `COORDINATOR`, or `SYSTEM_ADMIN`; access status `ACTIVE` or `SUSPENDED`.
- [ ] Redirect users to permitted Student, Coordinator, or Administrator landing screens. Coordinator/Admin landing screens can be secured placeholders until later sprints.
- [ ] Deny missing/unapproved privileged assignments, suspended accounts, wrong-role API requests, and expired sessions.
- [ ] Students may never grant themselves `COORDINATOR` or `SYSTEM_ADMIN`, including via body parameters, metadata, local storage, or client-side route manipulation.
- [ ] Provide a **manual trusted bootstrap procedure** for the first administrator/approved coordinator used in testing. Never choose an arbitrary new registrant as an administrator; bootstrap credentials/identifiers remain secrets.

### B3. Auth acceptance tests

- Verified `@graduate.utm.my` student can create an active student account and proceed to profile setup.
- Unverified or wrong-domain student cannot access protected student API endpoints, even by calling the Worker directly.
- Student cannot access coordinator/admin routes or APIs; frontend navigation alone is not counted as protection.
- Suspended accounts are denied; retries do not silently restore access.
- Invalid/expired sessions get `401`; valid session with insufficient permission gets `403`.
- Logout prevents reuse of the ended browser session; secrets and tokens are absent from application logs.

## 5. P001 — Programmer 1: M1 academic profile and subject records (UC03, UC04)

> **Only execute this section when the prompt selects Programmer 1 / P001.** Do not implement authentication, student-reported offerings, the pathway visualization, or full M2 curriculum-management (UC06–UC07).

**Ownership/deliverables:** StudentProfile and AcademicRecord migrations, `/api/profile` and `/api/academic-records` endpoints, corresponding student screens, strict owner and curriculum validation, and tests. Consume FOUNDATION catalogue/semester contracts and P004's verified Clerk identity middleware; no separate auth implementation.

**If P004/FOUNDATION is not merged:** write module-level tests with a mocked verified identity and clearly labelled catalogue fixtures. Do not ship an unprotected profile/record API; record any missing integration seams. Publish profile/academic-record data shape for P003 to consume. Do not silently create shared reference data tables.

**P001-only completion gate:** UC03 and UC04 acceptance tests under C3; private data stays owner-scoped and validated, including exemptions; no other programmer's feature is implemented.


### C1. UC03 Manage Academic Profile — FR-A3

- [ ] Provide `/student/profile` (and a mandatory first-time `/student/setup` flow, or equivalent).
- [ ] Student can select an existing configured programme/curriculum, supply a display name, optional matric number, employment commitments where modeled, `weekly_working_hours`, and `available_study_hours`.
- [ ] Validate required fields and non-negative numeric work/study hours. Save to Neon through authenticated API, then reload successfully persisted data.
- [ ] Limit viewing and editing to the current Clerk-linked student; prevent changes to Clerk identity/institutional email from this page.
- [ ] Provide success, error, cancel/unsaved-changes, and incomplete-setup states.
- [ ] Profile setup must not silently select a default real curriculum when multiple versions are available.

### C2. UC04 Manage Academic Subject Records — FR-A4

- [ ] Provide `/student/records` with a curriculum-scoped subject picker and own existing entries.
- [ ] Supported statuses: `COMPLETED`, `EXEMPTED`, `FAILED`, `WITHDRAWN` (normalize consistently between API, database and UI).
- [ ] Permit create/view/update; show subject code, title, credits, recorded status, optional grade/remarks, and exemption/credit-recognition details where relevant.
- [ ] A selected subject must belong to the student's configured curriculum. Reject conflicting/duplicate entries as appropriate to the agreed record model.
- [ ] For exemptions, distinguish **requirement satisfaction** from **awarded/recognized credits**. A non-credit-bearing exemption may satisfy a subject requirement while contributing **zero** earned credits.
- [ ] Failed and withdrawn outcomes must not be treated as completed, earned-credit subjects. Do not show unimplemented full graduation totals as accurate Sprint 1 results.
- [ ] Use transactional or otherwise safe update behavior so failed writes preserve the previous saved record.
- [ ] Make newly saved records immediately available in the shared graph data returned to P003.

### C3. Profile/records acceptance tests

- A student without completed setup is routed to profile setup before viewing academic features.
- Student A cannot view/edit Student B's profile or record by changing URL IDs or request payloads.
- Invalid curriculum subject, missing required fields, negative work/study hours, and inconsistent exemption data are rejected.
- A completed record and a zero-credit exemption remain distinguishable; failed/withdrawn records are never labelled completed.
- Saving/editing academic history changes the subsequent pathway graph state without modifying other students.

## 6. P002 — Programmer 2: M3 semester offerings (UC08)

> **Only execute this section when the prompt selects Programmer 2 / P002.** Do not implement UC09–UC12 eligibility, selection or recommendations, and do not build P001 student profiles or P004 authentication.

**Ownership/deliverables:** SemesterOffering migration, `/api/semester-offerings` GET/PUT endpoints, semester-specific offerings page, validations, transaction-safe saves, and tests. Use FOUNDATION's AcademicSemester/catalogue contract, P001's existing profile curriculum association and P004's verified identity middleware.

**If dependencies are missing:** develop UI and API modules with test-only fixtures and interface mocks. Report missing shared services instead of building another owner's functionality or opening a production route without auth.

**P002-only completion gate:** UC08 acceptance tests under D2; offerings are student-reported, scoped to the user/semester/curriculum, and saved safely; no other programmer's feature is implemented.


### D1. UC08 Enter Semester Subject Offerings — FR-C1

- [ ] Provide `/student/offerings` with selectable academic year and semester number **1, 2, or 3**.
- [ ] Display semester type consistently: Semester 1/2 = **Normal**; Semester 3 = **Short**. Use a display such as `Academic Year 2026/2027 — Semester 3 (Short Semester)`.
- [ ] Load only subjects mapped to the student's selected curriculum. Student selects the courses **they report as offered** during the current registration period.
- [ ] Support a clear select/review/confirm/save workflow and edit/remove of previously recorded offerings.
- [ ] Save entries against the current student and selected `AcademicSemester`; avoid duplicates; validate all subjects server-side.
- [ ] A cancelled edit must leave previously saved offerings unchanged. A failed replace/update must not delete the prior complete offering set.
- [ ] With no subjects selected, show an informative empty state; explain that future recommendation generation needs offerings. Do not invent availability.
- [ ] Prominently show **“Student-reported offerings — not verified by UTMSPACE”** (or equivalent).

**Sprint boundary:** UC08 records reported availability; it does **not** compute eligibility, validate final selected semester loads, or officially register subjects. Those occur in later use cases. The fact a subject is in a curriculum does not mean it is offered.

### D2. Offerings acceptance tests

- Semester type derives correctly from semester number.
- Student cannot submit a subject outside the selected curriculum or duplicate a subject in the same offering list.
- Student A's offerings are separate from Student B's.
- An update is idempotent/safely reconciled and persists after page reload.
- No offering is labelled official; no official registration occurs.

## 7. P003 — Programmer 3: M5 Interactive Academic Pathway prototype (UC17)

> **Only execute this section when the prompt selects Programmer 3 / P003.** Build UC17's graph prototype, not UC13–UC16 or UC18–UC19 scheduling, graduation evaluation, scenario simulation or synchronized roadmap.

**Ownership/deliverables:** Read-only prerequisite tree/React Flow UI, data-to-node/edge adapter, `/api/pathway/graph` read-only endpoint or agreed data composition, accessible list fallback, presentation/status tests. Consume FOUNDATION subjects/prerequisites and P001's stored academic record statuses. No mutation of another owner's data.

**If P001 or catalogue data is absent:** build the visualization against explicitly labelled fictional demo fixtures and test the adapter contract; leave production data integration as a documented blocker. Do not pretend uncomputed statuses are real or add fake pathway algorithms.

**P003-only completion gate:** UC17 acceptance tests under E2; safe read-only node/edge rendering, accurate statuses and labels, no persistence of hypothetical changes; no other programmer's feature is implemented.


### E1. UC17 View Interactive Academic Pathway — FR-G1, FR-G2

- [ ] Create `/student/pathway`, accessible only after authenticated profile setup.
- [ ] Build the basic **React Flow prerequisite/talent tree**, inspired by a game skill-tree structure but clear and usable as an academic tool.
- [ ] Draw subject nodes from the selected curriculum, with code, name and credit value; draw directed edges for configured prerequisite relationships.
- [ ] Distinguish **mandatory prerequisites** from **recommended prior knowledge** when such relationships are present. Do not misrepresent advisory links as hard blockers.
- [ ] Provide a visible legend and reusable visual states for `Completed`, `Exempted`, `In Progress`, `Eligible`, `Locked`, `Recommended`, and `Remaining` as specified by the SRS. Do not **invent** current student states that cannot be derived from stored records or later engines.
- [ ] For real Sprint 1 data, reliably show `Completed`, `Exempted`, remaining subjects, and clear unmet mandatory-prerequisite relationships. For `Eligible`, `In Progress`, and `Recommended`, use real supported inputs **only when available**; otherwise show an uncalculated/unknown state. It is acceptable for a separately labelled DEMO graph fixture to demonstrate all status styles.
- [ ] Add zoom/pan, fit-to-view, basic node selection for code/name/credits/prerequisite summary, and responsive layout. This is a preview of inspection behavior, **not** full UC18.
- [ ] Provide an accessible fallback/list view when graph rendering fails or is unusable with keyboard/accessibility tools.
- [ ] Handle empty academic history by showing the curriculum graph with neutral statuses and a prompt to complete UC04 records.
- [ ] Do not allow talent-tree interactions to modify real academic outcomes or curriculum rules.
- [ ] Add a clear label: **“Advisory roadmap — future offerings and graduation dates are not guaranteed.”**

**Sprint boundary:** no complete graduation algorithm, semester-by-semester scheduling, selectable what-if placements, scenario persistence, or synchronized timeline in this sprint. Leave clean interfaces/hooks for Sprint 2/3 rather than embedding fake calculations.

### E2. Pathway prototype acceptance tests

- Graph nodes and edges match fixture/current curriculum subjects and prerequisites.
- Recorded completed/exempted statuses appear distinctly; another student's records never leak into the graph.
- Prerequisite edges remain clear at typical desktop and mobile viewport sizes.
- No mandatory/advisory relationship is visually mislabelled.
- Empty, error and simplified-list fallback states exist.
- The UI never labels an unverified recommendation as real or writes simulated changes to `AcademicRecord`.

## 8. Integration plan — for the integrator AFTER individual PRs

**This section is a cross-team integration checklist, NOT an instruction for an individual programmer to implement every step.** After independent scope PRs, integrate in this order:

1. **FOUNDATION PR:** React, Worker, shared types, scripts, reference catalog/semester tables, health check and environment documentation.
2. **Owner migrations:** merge P004 access assignment, P001 student profile/records and P002 semester offerings in dependency-aware migration order; keep demo fixtures isolated.
3. **P004 auth first:** Clerk + server-side role/ownership middleware, account initialization, login/logout and protected app shell.
4. **P001 profile:** student profile setup + academic records API/UI. Publish stable curriculum and record contracts.
5. **P002 offerings:** API/UI built against P001 curriculum IDs and P004 authenticated student identity.
6. **P003 tree prototype:** consume P001 subjects/prerequisites/records through read-only graph endpoint; do not fork academic status data models.
7. **E2E integration:** test new student signup -> profile setup -> record subject -> report offerings -> open tree -> logout.

### Shared contract rules

- **P004 owns:** authentication/session verification, role/status middleware, Clerk-to-app identity binding.
- **P001 owns:** student profile, subject academic records and catalogue contracts (with M2 management UI deferred).
- **P002 owns:** student-reported semester offering data and screen; must not overwrite coordinator datasets.
- **P003 owns:** M5 talent-tree visualization; must not reimplement profile persistence or complete eligibility/forecast services.
- Changes to common types/schema/endpoints require coordination because the other programmers will consume them.

## 9. Combined Sprint 1 Definition of Done — integration/release gate ONLY

**Not an individual developer task list.** Each programmer finishes when their own section acceptance tests pass. The integration lead checks the combined items below after merging all owner branches.

Check each item only after it has been implemented and verified:

### Functional

- [ ] Valid student can sign up, verify email, log in, complete profile setup and log out.
- [ ] Invalid student domain and unverified email are rejected server-side.
- [ ] Backend distinguishes Student / Coordinator / System Admin, handles suspended accounts, and prevents student privilege escalation.
- [ ] Student can save and reload own academic profile and four supported academic-record statuses.
- [ ] Student can save/reload/update their own reported semester offerings for a selected year/semester.
- [ ] Student can open an interactive curriculum graph reflecting saved academic history and prerequisite links.
- [ ] Cross-user data access is blocked at API/DB-query level.

### Engineering

- [ ] Migrations run cleanly on an empty development database and are documented.
- [ ] Dev commands start both web and API; `.env.example` does not contain real secrets.
- [ ] Code typechecks, lints, tests, and builds successfully, or blockers are precisely documented.
- [ ] Test coverage includes API authorization, ownership, critical validation, database uniqueness, and key page behavior.
- [ ] Pages have responsive, keyboard-usable interfaces and meaningful error/empty/loading states.
- [ ] No real institutional academic data is invented; demo fixtures are labelled and cannot be mistaken for verified production content.
- [ ] README/setup/API docs are updated, including provider configuration steps that require a human account owner.
- [ ] Implemented Sprint 1 routes and tests are listed in the final Codex report.

### Suggested end-to-end test scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| S1-01 | New verified student email `test@graduate.utm.my` | Student role created; redirected to mandatory profile setup |
| S1-02 | Signup `test@gmail.com` or unverified `@graduate.utm.my` | Student API access denied |
| S1-03 | Student calls administrator/coordinator API directly | `403 Forbidden` |
| S1-04 | Student creates profile with negative study hours | Validation error; nothing invalid saved |
| S1-05 | Student records a completed subject and non-credit exemption | Both persist with distinct status/recognized-credit treatment |
| S1-06 | Student tries to update another student's academic record | Denied; other student's data unchanged |
| S1-07 | Student selects offered subjects for Semester 3 | Saved with `SHORT` semester classification and student-reported label |
| S1-08 | Student submits duplicate/out-of-curriculum offering | Rejected without corrupting saved list |
| S1-09 | Student opens pathway after recording subject result | Node status changes and prerequisite edges render |
| S1-10 | Database/Clerk unavailable | Useful error and no misleading success state |

The `test@graduate.utm.my` address above is a **test pattern**, not a real user account; tests must use mocked provider identities or approved test accounts.

## 10. Environment and deployment readiness (owner-specific updates only)

Document and configure only the variables actually needed by the selected SDKs/drivers. Likely variables or bindings include:

```dotenv
# Public browser-side Clerk identifier only
VITE_CLERK_PUBLISHABLE_KEY=

# Public API base address for the browser
VITE_API_BASE_URL=

# Backend-only values: set via Wrangler/Cloudflare secrets or local ignored files
CLERK_SECRET_KEY=
DATABASE_URL=

# Optional, trusted one-time administrative bootstrap (never browser-visible)
ADMIN_BOOTSTRAP_CLERK_USER_ID=
```

- Keep Clerk secret key and Neon connection string out of frontend `VITE_*` variables.
- Configure allowed origins/CORS and Clerk production domain/session settings properly.
- Use Workers-compatible connection handling for Neon; verify at build/runtime rather than assuming Node-specific drivers work.
- Document `wrangler dev`/deploy setup if using Wrangler and the chosen migration commands. **Do not auto-deploy to production** unless the user explicitly requested it and the environment supports it.
- Set sensible defaults for test/demo only; production must fail safely when crucial credentials or verified catalogue data are missing.

## 11. Individual programmer handoff — REQUIRED Codex response

After a **selected owner** completes their work, report **only the selected scope**:

1. **Selection:** Programmer N / P00N (or FOUNDATION), the exact UC numbers implemented, and whether the work is fully implemented, partial, or blocked.
2. **Files changed:** owned modules, routes, migrations and tests. Identify **any shared files touched**, with justification.
3. **How to run:** exact commands and required human-supplied Clerk/Neon/Workers settings relevant to these changes.
4. **Verification:** commands actually executed and their outcomes. Clearly distinguish automated tests from manual verification.
5. **Integration contract:** routes, request/response data types, migration dependencies, UI entry points, and other owners' services needed for end-to-end testing.
6. **Open blockers:** credentials, approved curriculum data, unmerged foundation/auth/profile modules, or tests not run.
7. **Stop:** do **not** implement the next programmer's task. The combined end-to-end Sprint 1 report is produced only by a separately instructed integration lead after merging all owners.

---

## 12. Reference and scope traceability

Source: **UTMSPACE SRS + SDD v2.0 (24 October 2026)**, especially:

- Revision Page — **Sprint Development Plan / Sprint 1 — Foundation & Setup**.
- Section **1.2 Scope** — single-programme baseline, manually entered records and student-reported offerings.
- Section **2.2.A0 / UC01–UC02** — Clerk registration, login/logout and backend authorization.
- Section **2.2.A1 / UC03–UC04** — academic profile and subject-record management.
- Section **2.2.A3 / UC08** — semester offering selection and provenance.
- Section **2.2.A7 / UC17** — talent tree status and prerequisite visualization.
- Sections **2.3–2.4** — security, maintainability, usability, and design constraints.
- Sections **3.1–3.2** — React/TypeScript/Vite, Cloudflare Workers, Clerk, Neon PostgreSQL architecture.
- Section **5.2** — schema/data dictionary and role assignment definitions.

**Implementation interpretation, not a new SRS requirement:** This file chooses practical staging, independent programmer execution boundaries, migration ownership, endpoint shapes, directory organization, test scenarios, and how to reconcile profile creation with the required curriculum foreign key. If actual SRS rules or approved curriculum data conflict with a convenience design choice, prefer the authoritative specification and flag the difference explicitly.
