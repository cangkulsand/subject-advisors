# S1-P002-010 - Display configured prerequisites for offered subjects

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 follow-up
- **Owner:** P002 / Programmer 2
- **Related UC / FR:** UC08; user-requested display-only extension for student-reported semester offerings
- **Branch / PR:** `feature-offerings-prerequisites` / not created
- **Reviewer:** Coordinator AI review passed for Mini-tasks A-C. Human peer review pending

## 1. Plan

### Objective / problem
When a student reviews subjects reported as offered for the profile's current semester, show the configured direct prerequisite, corequisite, and recommended-preparation relationships for each subject. The relationships help students understand catalogue context; they do not determine whether an offering may be saved.

### Scope and requirements
- **Owner and use case:** P002, Sprint 1 UC08. FOUNDATION provides catalogue prerequisites; P001's curriculum association and P004's verified identity remain authoritative.
- **In scope:** Add optional relationship metadata to the UC08 subject context; read and validate direct relationships for the authenticated student's current curriculum on GET; present them in the catalogue selection rows and selected-subject review/saved list; narrowly version the UC08 browser snapshot; focused tests, this record, and required documentation updates.
- **Out of scope:** Eligibility, recommendations, degree progress, recursive prerequisite-chain evaluation, official verification, registration, blocking or filtering subjects by completion, new prerequisite-based selection disabling, save-policy changes, P001 profile/records behavior, P003 pathway behavior, cache/Redis changes, database migrations, seed data, and provider operations. Existing loading/saving disabled states remain unchanged.
- UC08 remains a student report of which subjects are offered. A missing or incomplete prerequisite record cannot block a report or be represented as a failed eligibility check.

### Current behavior and intended behavior
The P002 context reader resolves student, curriculum and current semester from the verified Clerk identity; loads the full curriculum subject catalogue and semester list; then rechecks the live curriculum and semester before returning. GET and PUT currently call the same `contextFor` reader. The client drops unknown additive subject fields and caches the UC08 response for five minutes under `p002-context-v3-profile-semester`. The page has a four-column selection table and uses `offerings-review-list` for review and saved states; selected subjects hidden by filters remain part of the review/save.

The `subject_prerequisite` schema stores direct edges from `curriculum_subject_id` to `required_curriculum_subject_id`, with `MANDATORY`, `RECOMMENDED`, or `COREQUISITE` types. It enforces same-curriculum membership and unique source/target/type rows. It does not model OR groups or alternative prerequisite sets. The page will show configured direct relationships as descriptive catalogue metadata, not derive policy or eligibility from them.

### Proposed implementation
- Add optional `prerequisites` metadata to `OfferingSubject`: `{ status: 'available', items: [...] }` or `{ status: 'unavailable' }`. Each item contains the required curriculum-subject ID and one of the three schema requirement types. A known empty `items` array means “No prerequisites configured”; absent legacy metadata or unavailable metadata means “Prerequisite information unavailable,” never “none.”
- Extend the internal `contextFor` boundary with a small optional read mode (defaulting to current behavior for existing callers). GET opts into prerequisite enrichment; PUT opts out. Keep context/profile authorization and the final live curriculum/current-semester recheck in place. If another equivalent boundary is clearer during implementation, record that decision before changing code.
- On opted-in GET only, run one batched query for direct prerequisite rows scoped through the source curriculum subject to the captured current `curriculumId`. Resolve both ends against the full loaded curriculum subject map, including subjects hidden by semester/history filters. Validate IDs, allowed types, same-curriculum references, and duplicates; any missing or malformed relationship makes optional metadata unavailable, not known-empty. If the prerequisite query or optional metadata validation fails, return the otherwise valid context with unavailable relationship metadata. Do not swallow auth, profile, core subject/semester, or live-context recheck errors.
- Strictly validate optional metadata in the web response decoder. Unknown/missing/invalid optional metadata becomes unavailable; retain existing strict validation for catalogue, semester, and selection fields. Resolve code/name from the full context catalogue, not the currently visible/remaining list.
- Reuse a small requirements display helper/component under the subject name in selection rows and in every selected subject entry in review/saved mode. Group direct items under Prerequisites, Corequisites, and Recommended preparation, sorting deterministically by required subject code. Preserve all existing page controls, columns, responsive behavior, and user edits. Sidebar compact selected codes may stay compact.
- Bump only the UC08 response-contract marker to `p002-context-v4-prerequisites`; preserve identity at cache-key index zero, the five-minute TTL, session/account invalidation and generation guards, HTTP `no-store`, P001 profile/record retention, and successful-PUT invalidation-before-decode. Do not change the Redis P001 options cache.

### Expected files
- `packages/shared/src/offerings/offerings.ts` and focused shared contract tests.
- `apps/api/src/modules/offerings/context.ts`, `contracts.ts`, `routes.ts`, and focused context/route tests.
- `apps/web/src/features/offerings/response.ts`, decoder tests, `client.ts`, snapshot tests, `OfferingsPage.tsx`, a small requirement display helper/component, scoped CSS, and relevant UI fixtures/tests in `tools/offerings/test-ui.mjs`.
- `docs/cachingguide.md` for the narrow UC08 marker rule if needed, plus this record.
- No migration or generated seed changes are expected.

### APIs, data, and cross-owner impacts
- GET adds optional descriptive fields to each subject; PUT request and selection response remain unchanged. No new endpoint or public diagnostic surface.
- P002 reads only the existing FOUNDATION `subject_prerequisite` and `curriculum_subject` data, scoped to the verified profile curriculum. P004 authorization, P001 profile resolution, all existing offerings ownership/curriculum/semester validation and atomic replacement, and P001 record validation remain unchanged. Displayed prerequisites do not establish eligibility.
- No personal eligibility result, academic record, identity, or prerequisite relationship is placed in Redis or any new long-lived cache.

### Acceptance criteria
- [x] Direct mandatory, corequisite, and recommended entries are displayed for catalogue subjects and all selected subjects in review/saved states, including selected subjects hidden by filters.
- [x] Labels and required-subject code/name resolve from the full authenticated curriculum catalogue, sort deterministically, and do not imply an OR group, recursive chain, completion state, official verification, or save restriction.
- [x] Known empty metadata is distinguishable from unavailable/legacy metadata; query/metadata-only failure leaves the rest of GET context and saved selection usable with an explicit unavailable state.
- [x] GET performs one batched relationship query, not an N+1 query; source and target IDs/types are validated against the current curriculum, and malformed/cross-curriculum/missing/duplicate rows never appear as “no prerequisites.”
- [x] PUT does not request prerequisite enrichment and remains usable when the optional relationship query is unavailable; existing atomic replacement and subject-membership validation are unchanged.
- [x] Existing current-curriculum/current-semester rechecks, auth/owner privacy, filters, selection retention, review/save/revisit behavior, and public response/save contracts remain intact.
- [x] Only the UC08 browser marker changes; identity remains first in the key, five-minute retention and account/session invalidation remain, and profile/record session-long snapshots are unaffected.
- [x] The prerequisite display is readable, keyboard-accessible, responsive, and does not add a new table column or blocking control.

### Verification plan for implementation
- Verify actual offerings test/config scripts before running. Planned focused checks: `npm.cmd run test:offerings`, `npm.cmd run test:ui:offerings`, `npm.cmd run typecheck:offerings`, `npm.cmd run lint:offerings`, and `npm.cmd run build:offerings`.
- Run the project-required full typecheck/lint/test set when implementation is ready; for `npm.cmd test`, omit only `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL` from the child process. Run `npm.cmd run test:integration` if generated composition changes. Use installed UI/browser integration tooling only when needed and avoid a shared Neon fixture.
- Tests should cover zero/one/multiple direct rows by type; missing/legacy versus known-empty metadata; invalid IDs/type, duplicate and cross-curriculum/missing references; a target hidden by page filters; exactly one batched relation query; GET/PUT mode separation and optional-query failure with save unaffected; context-change 409 and auth/privacy regressions; old snapshot marker bypass with unchanged identity/TTL/invalidation; and selection/review/saved/revisit/responsive keyboard UI states.
- Review `git diff --check`, generated output, public response shape, and that only planned P002/shared-contract/documentation files changed. No provider or database writes are planned.

### Risks, dependencies, assumptions, and rollback
- **Risks:** Showing unavailable data as empty could mislead students; strict distinction between `available` with zero items and `unavailable` is required. Filters can hide prerequisite subjects; reference labels must use the full context catalogue. A query failure must not make the optional metadata look authoritative or disable reporting.
- **Dependencies:** Existing FOUNDATION prerequisite table and UC08 authenticated catalogue context. No migration, dependency, provider, or new cache is needed.
- **Data readiness / assumptions:** The read-only configured catalogue snapshot found prerequisite rows, but does not establish completeness or authoritative policy. Never invent or seed prerequisite relationships in this feature. The current direct-row schema is the only relationship shape proposed for display; do not infer alternatives, recommended eligibility, completion policy, or official verification.
- **Rollback:** Remove the optional GET enrichment and UI while retaining the original context/save contract; or show the explicit unavailable state. Revert only the narrow UC08 marker change with the corresponding payload change. No stored data needs migration or cleanup.

## 2. Implementation

- **Status:** READY_FOR_REVIEW - Mini-tasks A-C completed; coordinator AI review passed, human peer review pending.
- **Mini-task A:** Added an optional shared prerequisite union and opt-in API context mode. GET requests a single source-curriculum-scoped batch; PUT/default calls skip it. The batch validates canonical IDs, endpoint membership in the full loaded catalogue, allowed type, self-edge and exact duplicates. Any invalid batch is unavailable, and a valid zero-row batch is available with empty lists. Final live profile curriculum/semester checks remain after metadata work; 401/403 errors propagate.
- **Data readiness:** Read-only query completed in an explicit `BEGIN READ ONLY` / `ROLLBACK` transaction through ignored local development settings. Across the configured catalogue, curriculum 1 has 29 `MANDATORY` rows and zero `RECOMMENDED`/`COREQUISITE` rows; no rows were returned for other curricula. Aggregate integrity checks found 0 missing sources, 0 missing targets, 0 cross-curriculum edges, 0 unknown types, and 0 self-edges. This is a catalogue snapshot only; it does not establish completeness or official policy. No user, profile, owner, or access records were queried. No writes were issued.
- **Mini-task B:** The browser decoder strictly validates core subjects and unique IDs first, then validates optional edge types/canonical IDs/self/duplicates/full-catalogue targets. Missing, null, unknown, or invalid optional metadata becomes unavailable; valid [] remains available-empty. Only the UC08 marker changed from `p002-context-v3-profile-semester` to `p002-context-v4-prerequisites`; identity order, TTL, request no-store, invalidation/generation behavior, P001 records retention and PUT invalidation-before-decode remain as before. Added a reusable display under catalogue names and every selected review/saved entry; groups use the fixed Prerequisites, Corequisites, Recommended preparation order and targets sort by subject code. Existing selection labels, four columns, filters, hidden-selection retention and save/revisit flow remain.
- **Files changed:** Shared contract; API offering context/contracts/routes and focused tests; web response decoder/tests, client/tests, OfferingsPage, prerequisite display/model/tests, scoped CSS; fictional rich fixtures and browser checks; caching guide and this change record. No schema, dependency, env, provider, Redis or P001 files changed.
- **Screenshots:** `dist-offerings/review/prerequisites-desktop.png`, `prerequisites-mobile.png` (360px), `prerequisites-saved-mobile.png` (360px), and additional `prerequisites-saved-mobile-320.png`. All use fictional data and show nonempty relationship metadata where applicable.
- **Migrations / env / shared contracts:** No migration, environment, provider, dependency, or persistent data changes. Shared/API metadata is additive and display-only.
- **Mini-task C plan:** Run full tests, typecheck, lint, integration composition and UI checks sequentially, followed by the local build, `build:local` Vite integration build and Cloudflare Wrangler dry-run check. Remove database URL variables from every test/build command environment. No live database/auth/provider tests, deployment, or production actions. Make only the planned narrow caching guide note; record actual results and warnings, then stop for final coordinator diff review.

## 3. Review

- **Self-review checklist:** PASS for Mini-tasks A-C. Core decoder validation remains strict and precedes optional validation. Invalid optional metadata never turns into known-empty or a dangling visible relationship. The full catalogue resolves prerequisite names even for filtered targets. UI keeps four columns and unchanged select/review/confirm/save/revisit controls; unavailable metadata does not prevent saving. CSS uses scoped/direct-child selectors, no new table column, and responsive wrapping. Auth, final server rechecks and save implementation remain unchanged. Mini-task C added no runtime code; the planned API/web production code is part of this feature, while no production checkout, deployment, schema, dependency, provider, database, environment, commit, push, or merge was changed.
- **Focused verification:** With `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` removed from the command environment: `npm.cmd run test:offerings` - PASS (13 files passed, 1 skipped; 154 tests passed, 8 skipped); `npm.cmd run typecheck:offerings` - PASS; `npm.cmd run lint:offerings` - PASS; `npm.cmd run test:ui:offerings` - PASS (36 browser checks); `npm.cmd run build:offerings` - PASS.
- **Full verification:** Under the same DB URL restrictions, `npm.cmd test` - PASS (35 files passed, 2 skipped; 484 tests passed, 13 skipped); `npm.cmd run typecheck` - PASS; `npm.cmd run lint` - PASS; `npm.cmd run test:integration` - PASS (7/7); default `npm.cmd run test:ui:integration` - PASS (29 checks); installed-owner `npm.cmd run test:ui:integration -- --installed` - PASS (34 checks, `installedOwnerPages:true`, Clerk/API mocked); `npm.cmd run build` - PASS; `npm.cmd run build:local` - PASS (Vite transformed 134 modules); `git diff --check` - PASS after final doc updates. The default harness's `installedOwnerPages:false` was the default mode flag, not missing overlay wiring.
- **Manual checks:** Visually reviewed all four prerequisite screenshots at desktop, 360px and 320px widths. The 320px screenshot contains nonempty grouped prerequisites in saved mode; automated geometry checks reported no horizontal page overflow. Browser tests verify search hides target checkboxes while source metadata continues to resolve, hidden selections remain reviewable, keyboard selection remains operable, unavailable metadata does not block save, and reload/revisit retains saved-source relationship display.
- **Cloudflare validation:** `npm.cmd run check:cloudflare` built Vite Worker assets and Wrangler 4.148.0 printed the dry-run bundle, local asset and binding summary, then `--dry-run: exiting now`. The Wrangler CLI process remained alive without returning an exit status; I terminated only the process tree started by this check. A standalone rerun with documented `WRANGLER_SEND_METRICS=false` and `CI=true` produced the same terminal dry-run output but also remained alive; that process tree was likewise terminated. Therefore Worker build/bundle/assets validation completed, but the Wrangler command result is INCONCLUSIVE, not PASS. [Cloudflare's Wrangler deploy command docs](https://developers.cloudflare.com/workers/wrangler/commands/workers/) define `--dry-run` as compile/check without deployment; no upload or provider operation occurred.
- **Coordinator review:** PASS - coordinator reviewed the A/B code and screenshots, then reviewed C scope/evidence and this final integration result. Human peer review pending.
- **Review outcome:** PASS - SELF-REVIEW and coordinator AI review; READY_FOR_REVIEW with the Wrangler process-exit limitation above. No human approval is claimed.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Changed / Tests
- **Added / Changed / Fixed / Removed:** Added optional prerequisite metadata to shared UC08 subjects and the GET-only batch reader; added strict optional browser decoding, v4 response marker, and grouped prerequisite displays for catalogue and selected review/saved entries.
- **Affected routes / tables / consumers:** Authenticated GET `/api/semester-offerings`; existing `subject_prerequisite` and full curriculum catalogue; UC08 browser catalogue/review/saved list. PUT save payload and behavior remain unchanged.
- **Breaking changes / migration steps:** None. No migration, dependency, provider, or environment change.
- **Verification summary:** Focused and full tests, typechecks, lints, integration UI and local builds passed as itemized in Review. Wrangler dry-run process exit was inconclusive although bundle/assets were reported. Read-only aggregate DB readiness query rolled back; curriculum 1 had 29 mandatory relations and aggregate integrity counts were zero. Screenshots are in `dist-offerings/review/`.
- **Outstanding blockers / follow-up:** Human peer review remains pending. Wrangler process did not return an exit status after dry-run output; no deployment occurred. Catalogue counts do not confirm data completeness or official policy.
- **Final status:** READY_FOR_REVIEW
