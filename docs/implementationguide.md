# Implementation Guide — Mandatory Change Workflow

> **Project:** AI-Powered Academic Advisory System for UTMSPACE Part-Time Students  
> **Audience:** Programmers 1–4, Foundation/Integration Lead, and AI coding assistants (including Codex)  
> **Applies to:** Every implementation change, in every sprint  
> **Workflow:** **PLAN → IMPLEMENTATION → REVIEW → CHANGELOG**  
> **Status:** Team engineering-process instructions; not an additional product requirement in the SRS/SDD

## 1. Purpose and non-negotiable rule

**For EVERY change, complete all four stages: Plan, Implementation, Review, and Changelog.** A change includes a new feature, bug fix, UI update, refactor, API modification, migration, dependency/configuration update, security patch, test, or documentation edit. Small changes may use short entries, but **none of the four stages may be silently skipped**.

A change is **not DONE** simply because code was written or a test passed. It is done only when the implementation matches the plan, verification results are recorded truthfully, review is completed or marked pending, and the actual changes are documented.

**Codex instruction:** Read this guide before modifying repository files. Use it on every task, even if a prompt says only `Read sprint1.md and implement Programmer 4 task`. `sprint1.md` defines **WHAT** the selected owner may build; this guide defines **HOW** every change must be carried out.

### 1.1 Source of truth and scope

1. **Current user request:** Defines the selected task, owner and any explicit overrides.
2. **SRS + SDD v2.0 (24 October 2026):** Authoritative product requirements and assigned use cases; identify unclear policies rather than inventing them.
3. **`sprint1.md` (and future sprint files):** Defines sprint boundaries, ownership, deliverables, and acceptance criteria.
4. **`implementationguide.md` (this file):** Mandatory change-management, review and reporting process.
5. **Existing project code and shared contracts:** Inspect before implementing; keep compatible with the current codebase.

When a scope or architecture conflict is discovered, record it as a blocker/decision. Do not unilaterally implement another owner's features or reinterpret unverified curriculum policy as an official rule.

## 2. Developer isolation and ownership

| Owner | Sprint 1 responsibility | Use cases |
| --- | --- | --- |
| FOUNDATION | One-time shared setup, tooling, reference catalogue and API contracts | Shared infrastructure only |
| P001 / Programmer 1 | Student academic profile and subject records | UC03, UC04 |
| P002 / Programmer 2 | Student-reported semester subject offerings | UC08 |
| P003 / Programmer 3 | Interactive Academic Pathway talent-tree prototype | UC17 |
| P004 / Programmer 4 | Clerk registration, login/logout and backend role/access checks | UC01, UC02 |

- Work in **one designated owner scope at a time**. Reading another section for context does not authorize implementing it.
- Recommended branches: `feature/p001-s1-profile`, `feature/p002-s1-offerings`, `feature/p003-s1-pathway`, `feature/p004-s1-auth`, and `chore/foundation-s1` (adapt to repository conventions).
- **Do not overwrite another developer's in-progress work.** Inspect `git status`, branch, files and existing dependencies first. Do not clean/reset/rebase, force push, or commit unrelated modifications without an explicit request.
- Changes to shared files (router, root app shell, common schemas, package manifest, migration index, environment examples) must be **minimal**, backward-compatible where possible, and called out in the change record/PR.
- When another owner's API/table does not exist, use a typed boundary and clearly labelled tests/mocks; document the blocker. Never fabricate real authentication, database persistence or official student records.
- Coordinator forecasting (M6) and administration dashboard/user management (M7) are **not** Programmer 4 Sprint 1 deliverables; role checks needed by M0 are in scope.

## 3. One change = one traceable record

For each coherent, reviewable task, create an individual Markdown record at:

```text
docs/changes/<change-id>.md
```

**Change ID format:** `S<sprint>-<owner>-<sequence>-<short-slug>`.

Examples:

```text
docs/changes/S1-P004-001-clerk-registration.md
docs/changes/S1-P004-002-server-role-checks.md
docs/changes/S1-P001-001-academic-profile.md
docs/changes/S1-P003-001-pathway-node-ui.md
```

Use `FOUNDATION` for foundation changes and `INT` for integration work. Choose a new unique sequence per owner. Use the same change ID in the branch/commit/PR description when practical. This **per-change log prevents four programmers from repeatedly editing one shared changelog file and causing merge conflicts**.

One record contains **all four sections**: `1. Plan`, `2. Implementation`, `3. Review`, `4. Changelog`, plus status/metadata. Create the record **before editing implementation files**, then update it progressively as the work proceeds. Records are committed/reviewed with their corresponding code. The integration lead may later summarize accepted changes in a root `CHANGELOG.md`, but this summary **does not replace** per-change records.

If a task grows into multiple independently testable changes, split it into separate records. If there is a follow-up fix after review, either update the same record while the PR is still open or create a linked new record if it is a separate change/commit. Never describe future work as completed.

## 4. Stage 1 — PLAN (required BEFORE changing code)

**Goal:** Decide what will change, why, who owns it, and how success will be verified.

Codex MUST:

1. Read the selected sprint section, relevant SRS use case(s), this guide, and the existing affected code.
2. Inspect the current branch and working tree (`git status` when Git is available). Preserve changes made by others.
3. Create `docs/changes/<change-id>.md` containing a concise plan before implementation edits.
4. Specify the selected owner and exact use cases/requirements; distinguish implementation assumptions from verified specification facts.
5. Identify expected files, interfaces, DB/API impacts, dependencies, tests and rollback approach.
6. Define measurable acceptance criteria and explicit **out-of-scope** items.
7. Flag risky or destructive operations (e.g. dropping data, production writes, privileged access changes, secret rotations) and **seek explicit authorization before executing them**. Routine low-risk changes may proceed without pausing for human approval.

**Mandatory Plan fields:**

- Problem / requested outcome
- Owner, sprint, use case(s) and functional requirements (if applicable)
- Current behavior and intended behavior
- Proposed approach and expected file changes
- API/data/migration and cross-programmer impacts
- Acceptance criteria and verification commands
- Risks, dependencies, assumptions, rollback strategy
- Out-of-scope exclusions

**Plan gate:** Do not begin implementation until the plan is written. If new findings require a material scope or schema change, **revise the plan first** and explain the change.

## 5. Stage 2 — IMPLEMENTATION (required)

**Goal:** Apply only the planned, authorized changes safely and keep them reviewable.

Codex MUST:

1. Implement the smallest coherent change within the selected owner's file boundaries.
2. Follow existing React/TypeScript, Cloudflare Workers API, Clerk, Neon PostgreSQL, and shared-contract conventions **where applicable to the actual repository**; do not replace existing libraries without a documented reason.
3. Add or update tests alongside changed behavior. Prefer reusable typed interfaces and server-side input validation.
4. Enforce authentication/authorization on the backend, and scope student-owned data to the verified user identity; do not trust browser-supplied user IDs.
5. Never store passwords locally, expose secrets in source control, or silently use invented UTMSPACE rules/data. Label any demo fixtures clearly.
6. Handle loading, success, empty, validation, forbidden and failure states where the feature requires them.
7. Use additive, reversible migrations when possible; don't remove/overwrite real data to make tests pass.
8. Keep edits focused. Avoid unrelated formatting, dependency upgrades, wide refactors or other programmers' feature implementations.
9. Record the **actual** files edited, decisions made and deviations from the original plan.

**Implementation gate:** The selected feature must have a reviewable diff and appropriate tests. If credentials, fixtures, APIs or approved curriculum data are missing, implement only what can be done safely and mark the rest **BLOCKED/PARTIAL**; do not invent success.

## 6. Stage 3 — REVIEW (required AFTER implementation)

**Goal:** Verify correctness, safety, scope and maintainability before merge.

### 6.1 Required self-review checklist

- [ ] **Scope:** Only the selected owner/use cases were implemented; no later-sprint features slipped in.
- [ ] **Plan vs diff:** Every substantive code change is explained; revised requirements are documented.
- [ ] **Correctness:** Acceptance criteria are met or explicitly marked incomplete.
- [ ] **Authorization:** API access, ownership checks and role restrictions are server-enforced where relevant.
- [ ] **Validation:** Invalid inputs, duplicates, missing dependencies and failures are handled safely.
- [ ] **Contracts:** Existing API response types, database constraints and other modules are not accidentally broken.
- [ ] **Migrations:** Any schema change has a safe upgrade path; rollback/recovery is considered.
- [ ] **Security/privacy:** No committed secrets, unexpected sensitive logs, exposed student records or unsafe auth bypasses.
- [ ] **UX/accessibility:** Relevant loading/empty/error states, labels and keyboard behavior are considered.
- [ ] **Tests:** Run relevant unit/integration checks and practical repo lint/typecheck/build; record real outcomes.
- [ ] **Diff quality:** Remove debug statements, accidental generated files and unrelated edits.
- [ ] **Documentation:** API/setup/test instructions and the per-change record reflect the current implementation.

### 6.2 Review evidence and outcome

Record the **commands actually executed** and result for each (for example `npm run typecheck`, `npm test`, `npm run build`), including failures or skipped checks and reasons. Record relevant manual checks separately. Never claim a test passed when it was not run.

Use one of these review outcomes:

- **PASS — SELF-REVIEW:** Codex/developer verified the change locally; **human peer review still pending**.
- **PASS — PEER-REVIEWED:** Named reviewer approved after inspecting the change (record who and when).
- **CHANGES REQUESTED:** Issues found; fix and repeat the affected checks.
- **BLOCKED:** Critical dependency, permission, credentials or test environment unavailable; describe exactly what is missing.

**Do not claim that Codex's own review equals human approval.** A teammate or integration lead should approve the PR before merging into the shared integration branch. If peer review cannot be performed yet, leave status `READY_FOR_REVIEW`, not `MERGED` or `APPROVED`.

**Review gate:** All blockers must be documented; critical security failures and unauthorized scope changes prevent a PASS. Fixes made during review must go back through implementation, checks and changelog updates.

## 7. Stage 4 — CHANGELOG (required FOR EVERY change)

**Goal:** Leave an accurate, auditable summary of what actually changed.

Update the `4. Changelog` section in the same per-change record, even for a one-line fix. Include:

- **Date** and change ID; owner and related use case(s).
- **Type:** `Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Docs`, `Tests`, or `Chore`.
- **Actual changes:** Short summary of implemented behavior and important files/routes/tables.
- **Compatibility/impact:** Breaking changes, migrations, environment variables, integrations or other programmers affected.
- **Verification:** Commands and real results, and review outcome.
- **Outstanding items:** Unfinished work, constraints, follow-ups and integration dependencies.
- **Status:** `PLANNED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, `CHANGES_REQUESTED`, `BLOCKED`, `APPROVED`, or `MERGED`.

**Changelog gate:** No silent changes. A PR/commit is not ready for review unless its per-change record contains all four sections, accurately filled for the current status. The root `CHANGELOG.md` is **optional** for individual developers and may be updated by the integration lead at release time.

## 8. Definition of Done — PER CHANGE

Mark the change **DONE for the assigned programmer** only if:

- [ ] **PLAN** exists and names owner, scope, acceptance criteria, dependencies and risks.
- [ ] **IMPLEMENTATION** matches the documented plan or records approved amendments.
- [ ] **REVIEW** includes an inspected diff, completed self-review checklist and actual test results.
- [ ] **CHANGELOG** describes actual changes, impact, remaining issues and status.
- [ ] Changed tests/code/docs and the change record are ready in the same PR.
- [ ] Ownership boundaries respected and shared-file impacts explained.
- [ ] No fabricated verification, unsupported curriculum rule or committed credential.

**Terminology:** `READY_FOR_REVIEW` means coding and local self-review are complete, not that the PR has been peer-approved or merged. Team/release **DONE** additionally requires the configured PR approval and integration gates.

## 9. Required record template (copy for each change)

Create `docs/changes/<change-id>.md` using this template. Keep each field; use `N/A` with a reason when genuinely not applicable.

```markdown
# <CHANGE_ID> — <Short descriptive title>

- **Status:** PLANNED
- **Date:** YYYY-MM-DD
- **Sprint:** Sprint 1
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC01 / FR-A1
- **Branch / PR:** <branch or not created>
- **Reviewer:** Pending

## 1. Plan

### Objective / problem
<Why the change is needed; expected user-facing outcome.>

### Scope and requirements
- In scope: <specific behavior, UC/FR references>
- Out of scope: <other owners, other sprints, unrelated refactors>

### Proposed implementation
- Expected files: <paths / areas>
- APIs / database / interfaces: <change or N/A>
- Dependencies / shared-file impact: <change or N/A>

### Acceptance criteria
- [ ] <Observable acceptance condition 1>
- [ ] <Observable acceptance condition 2>

### Verification plan
- <commands and manual checks planned>

### Risk / assumptions / rollback
- Risks: <...>
- Assumptions / blockers: <...>
- Rollback: <safe reversal or mitigation>

## 2. Implementation

- **Status:** NOT STARTED
- **Files actually changed:** None yet
- **Summary:** Pending
- **Decisions / deviations from plan:** None yet
- **Migrations / env / shared contracts:** N/A or pending

## 3. Review

- **Self-review checklist:** Pending
- **Test evidence:** Not yet run
- **Manual checks:** Not yet run
- **Defects found and fixes:** None reported yet
- **Review outcome:** PENDING
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** Pending implementation
- **Type:** Pending
- **Added / Changed / Fixed / Removed:** Pending actual work
- **Affected routes / tables / consumers:** Pending
- **Breaking changes / migration steps:** Pending
- **Verification summary:** Pending
- **Outstanding blockers / follow-up:** Pending
- **Final status:** PLANNED
```

### 9.1 Example: change requested from Programmer 4

- Change record: `docs/changes/S1-P004-001-clerk-registration.md`.
- Plan: implement verified `@graduate.utm.my` student signup and safe account initialization for **UC01**; explicitly exclude the academic profile form (P001), admin dashboard (later sprint), and forecast logic (later sprint).
- Implementation: work only on authentication-owned code plus minimal documented shared registration, with tests.
- Review: verify invalid/unverified domains are rejected **on the backend**, registration remains idempotent, roles cannot be self-assigned, and the planned tests actually run.
- Changelog: describe routes, role/access schema and migration, tests and any integration dependency on the profile-setup route. Do **not** claim the profile form was implemented by P004.

## 10. Codex execution protocol

### 10.1 What Codex must do on EVERY invocation that changes files

1. Identify the chosen owner/sprint/use case from the user's prompt.
2. Read `implementationguide.md`, the relevant sprint file and the existing implementation.
3. Inspect working tree, current conventions and dependencies; protect any unrelated changes.
4. Split work into reviewable changes if needed; create a plan record for **each** before editing code.
5. Implement only the selected owner's changes; revise plans before significant deviations.
6. Run relevant checks; conduct and document self-review; request peer review for merging.
7. Complete/update the **Changelog** section with actual modifications and verification.
8. Report records, changed files, tests, unresolved blockers and exact handoff; **stop** at the selected owner boundary.

### 10.2 Recommended Codex prompt — one programmer

```text
Read implementationguide.md and sprint1.md completely.
Implement ONLY Programmer 4 (P004) Sprint 1 tasks: UC01 and UC02.
For EVERY change, follow PLAN -> IMPLEMENTATION -> REVIEW -> CHANGELOG.
Before editing code, create docs/changes/<change-id>.md with the plan.
Update the same record with actual implementation, review evidence,
and changelog. Respect ownership, report blockers, and do not touch
other programmers' tasks or implement later-sprint features.
```

Substitute `Programmer 1 / P001 / UC03, UC04`, `Programmer 2 / P002 / UC08`, or `Programmer 3 / P003 / UC17` as needed. For shared setup, explicitly select `FOUNDATION` instead of a programmer.

### 10.3 Mandatory completion response (Codex)

After performing the requested changes, report succinctly:

```text
Owner / scope:
Change record(s):
Plan executed / deviations:
Implementation summary / files changed:
Tests and checks ACTUALLY run (pass/fail/skipped):
Self-review findings / peer-review status:
Changelog updated (record paths):
Shared-file or API impacts:
Blockers / follow-up / handoff:
Final status: READY_FOR_REVIEW | BLOCKED | PARTIAL | APPROVED
```

If no repository/code changes were possible, still document the plan and the blocker (when a writable repository is available), and state clearly that no implementation or verification occurred.

## 11. Change request and merge rules

Changes to data fetching, saves, or authentication lifecycle must follow the
[project caching guideline](cachingguide.md). Academic profile and records retain
session-scoped snapshots across navigation and refresh; successful updates and
authentication changes invalidate them. Curriculum options retain a five-minute TTL.

- **Feature PR:** One owner, reviewable scope, associated change record(s), tests and explanation of cross-module effects.
- **PR approval:** Human peer review is required by this team process before the integration lead merges; Codex self-review is supporting evidence, not a substitute.
- **Integration lead:** Resolves shared contracts and merge conflicts with impacted owners; runs end-to-end Sprint 1 tests **after** the four owner PRs and foundation are integrated.
- **Blocking defect discovered after merge:** Create a new change record and repeat all four stages. Don't silently patch the integration branch.
- **Emergency fixes:** May use a shorter record, but still document all four stages and capture missing review evidence as soon as possible. Never bypass security/production authorization.
- **Future sprints:** Apply this same file unchanged unless the team explicitly revises the process; replace `sprint1.md` with the relevant sprint specification.

---

**Always remember:** Every change needs **PLAN → IMPLEMENTATION → REVIEW → CHANGELOG**. The guide is intentionally structured so a developer can tell Codex **“Read sprint1.md, implement Programmer 4”** without Codex implementing unrelated modules, skipping review or leaving undocumented changes.
