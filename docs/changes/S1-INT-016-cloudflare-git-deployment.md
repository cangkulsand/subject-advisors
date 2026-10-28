# S1-INT-016 — Cloudflare Git preview deployment

- **Status:** READY_FOR_REVIEW (repository configuration reviewed; authorized publication in progress); Workers Builds settings update is pending
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** INT / shared deployment
- **Related UC / FR:** Existing integrated application routes; infrastructure only, no new use case
- **Branch / PR:** `main` / staged diff approved by coordinator; commit and push in progress
- **Reviewer:** Coordinator (staged-diff review passed, 2026-10-28); human peer review pending

## 1. Plan

### Problem / requested outcome
Prepare the repository for GitHub-triggered Cloudflare Workers Builds on `main`, so a preview can be built and deployed using the existing development Clerk and Neon settings.

### Owner, requirements, and scope
- Owner: INT / shared deployment. No new business use cases or feature behavior.
- Preserve current integrated routes, auth checks, API contracts, and local development setup.
- Do not perform provider writes, deployment, database migration, or dependency changes in this task. The user subsequently authorized committing and pushing only reviewed deployment changes to `main`; unrelated dependency edits remain local.

### Current and intended behavior
- Current: local integrated Worker/Vite setup exists; no dedicated Cloudflare Git build adapter or deployment instructions.
- Intended: root Wrangler config serves the existing integrated API and built SPA; Workers Builds can use one build command and deploy command with preview-only dev service settings.

### Proposed approach / expected files
- Add root `wrangler.jsonc`, Cloudflare Vite entry/config, a small build preparation script, and `apps/web` entry files.
- Extract existing shared route selection from local runner into `apps/web/src/app/AppRoutes.tsx`; local runner retains its setup diagnostics.
- Add package scripts and ignore `dist-cloudflare/`; document dashboard configuration, preview settings, and secrets without values.
- Add minimal adapter tests for unauthorized JSON, unknown API JSON, and local-only route exclusion if practical.
- Follow-up verification correction: make the existing integrated UI test's `Semester` selector exact so it resolves the select instead of also matching the “Semester offerings” navigation link. This changes only the test locator, not application behavior; rerun the installed UI suite.

### API / data / migration / cross-programmer impacts
- No API or database changes. No migrations or external service writes. Runtime bindings reuse existing auth and integrated service contracts.
- Static assets use Worker SPA fallback; `/api` requests execute Worker-first.

### Acceptance criteria / verification
- GitHub Workers Builds instructions specify repo, `main`, root directory, Node 22.12+, build/deploy commands, public Clerk publishable key, and runtime preview secrets/settings.
- Local-only `/api/auth/local-status` is not exposed by deployed adapter; API errors remain JSON and static deep links resolve through SPA assets.
- Run typecheck, lint, test, Cloudflare build, Wrangler dry-run, and relevant existing browser checks if feasible; record actual evidence.

### Risks, dependencies, assumptions, rollback
- Assumption: user’s existing development Clerk/Neon configuration is appropriate for preview; no values are inspected or committed.
- The project owner supplied current Workers Builds settings showing an existing Git repository connection. Correcting its root/build/deploy values, configuring keys, and triggering a preview remain pending after review and publication of these repository changes. User authorized publication on 2026-10-28; coordinator review of the staged diff is required before commit/push.
- Rollback: remove the additive deployment config/scripts/docs and restore route component in local runner; no data rollback required. If `main` advances remotely before push, stop and coordinate; never force-push or overwrite remote work.

### Out of scope
- Cloudflare/GitHub account changes, OAuth authorization, deployment, production credentials, database migration, business logic or API feature changes. Package dependency-version edits and lockfile changes, and concurrent P002 edits, stay local and are excluded from publication.

## 2. Implementation

- **Status:** IMPLEMENTED
- **Files actually changed:** `wrangler.jsonc`, `vite.cloudflare.config.ts`, `apps/api/src/cloudflare.ts`, `apps/api/src/cloudflare.test.ts`, `apps/web/index.html`, `apps/web/src/cloudflare-main.tsx`, `apps/web/src/app/AppRoutes.tsx`, `tools/cloudflare/build.mjs`, `tools/auth/local/main.tsx`, `tools/integration/test-ui.mjs`, `package.json`, `tsconfig.auth.json`, `.gitignore`, `docs/cloudflare-deployment.md`, this record.
- **Summary:** Added a Cloudflare Worker+SPA deployment path using the existing integrated API dispatch, moved the current integrated route table into a shared component, preserved local setup diagnostics, added build/deploy/check scripts, and documented preview setup using existing development service settings.
- **Decisions / deviations:** Cloudflare uses a dedicated adapter to keep `/api/auth/local-status` exclusive to the local runner. Vite `loadEnv` reads local `.env.local` for builds while Workers Builds can provide the same public key through its environment. `keep_vars` retains dashboard-managed origin configuration across deployments. The shared home route drops its developer sprint eyebrow; navigation and user facing instructions otherwise remain the same.

## 3. Review

- **Self-review checklist:** Reviewed API path guard, static fallback delegation, unchanged service construction/dispatch, local-only status exclusion, SPA deep-link route table reuse, secret handling, additive scripts, and preservation of pre-existing working-tree changes.
- **Test evidence:** `npm.cmd run typecheck` passed; `npm.cmd run lint` passed; `npm.cmd test` passed (27 files passed, 2 skipped; 342 tests passed, 13 skipped); `npm.cmd run build:cloudflare` passed (121 modules); `npm.cmd run check:cloudflare` passed (Wrangler 4.153.0 dry-run read four assets; 598.91 KiB upload size). `git diff --check` passed.
- **Manual checks:** Wrangler local preview smoke: `/` and `/student/profile` returned 200 HTML with app content; `/api/me`, `/api/unknown`, and `/api/auth/local-status` without authorization returned 401 JSON. No live service calls were made. Vitest adapter tests with mock assets/dummy bindings separately verified unknown API 404 JSON, local-only route absence after auth dispatch, unauthorized JSON, and SPA deep-link delegation. The first installed browser run exposed an ambiguous `getByLabel('Semester')` locator; adding `{ exact: true }` made the selector target only the form control. The rerun of `PLAYWRIGHT_BROWSERS_PATH=.cache-offerings/playwright node tools/integration/test-ui.mjs --installed` passed all 25 scenarios.
- **Review outcome:** PASS — SELF-REVIEW. The coordinator reviewed the implementation diff. The initial installed UI run exposed an existing ambiguous “Semester” label locator; the exact-label test-only correction was reviewed and the full browser suite passed on rerun.
- **Human reviewer / approval:** User authorized commit/push to `main` after the coordinator's concrete proposal, limited to reviewed deployment changes. Coordinator staged-diff review passed on 2026-10-28; human peer review remains pending. No dashboard change or deployment approval was requested or performed.

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Chore / deployment configuration
- **Added / Changed / Fixed / Removed:** Added Cloudflare Worker configuration, integrated API adapter, SPA build entry and config, shared route table, deployment build helper, deployment documentation, adapter tests, and package scripts. Updated the local runner to use the shared routes and ignored Cloudflare build output. Preserved the local env example's original comments and compatibility with local Wrangler config.
- **Affected routes / tables / consumers:** Deployment adapter consumes current integrated routes; no endpoint changes
- **Breaking changes / migration steps:** None
- **Verification summary:** Typecheck, lint, unit suite, Cloudflare build and Wrangler dry-run passed. Local Worker smoke passed. Installed integration browser suite passed all 25 scenarios with owner overlays installed and Clerk/API mocked. Vitest's 13 skipped tests are the opt-in P004 and P002 real database tests gated on `AUTH_TEST_DATABASE_URL` and `OFFERINGS_TEST_DATABASE_URL`; these credentials were not supplied and no live DB calls were made.
- **Outstanding blockers / follow-up:** Coordinator approved the staged scope; commit/push is in progress. Owner-provided settings report an existing Git connection. After publication, update its root from `/subject-advisors` to `/`, build command from `npm run build` to `npm run build:cloudflare`, deploy command from `npx wrangler deploy` to `npm run deploy:cloudflare`, and add the Clerk public build variable plus runtime preview settings. The dashboard was not independently inspected, changed, or deployed from this task.
- **Final status:** READY_FOR_REVIEW for repository configuration; dashboard settings and preview deployment pending.
