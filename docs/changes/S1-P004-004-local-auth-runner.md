# S1-P004-004-local-auth-runner — Run P004 locally

- **Status:** READY_FOR_REVIEW (live-service acceptance remains PARTIAL)
- **Date:** 2026-10-24
- **Sprint / owner:** Sprint 1 / P004
- **Related UC / FR:** UC01/FR-A1 and UC02/FR-A2
- **Branch / PR:** None; no Git repository
- **Reviewer:** Human peer review pending

## 1. Plan

### Objective / problem
The user requested local setup and run instructions. Auth modules existed, but no dev
entry point or local browser route registration existed. Provide one npm dev command
for the P004 auth flow on localhost using Vite and Wrangler.

### Scope and requirements
In scope: local auth preview entry points, dev launcher, configuration templates,
minimal auth route registration, setup/error states and run documentation.
Out of scope: other programmers' features, shared FOUNDATION production app, deployments,
production Neon operations, Git publishing and role provisioning.

### Proposed implementation
Files: tools/auth/local/*, tools/auth/dev.mjs, tools/auth/smoke-local.mjs,
vite.auth.config.ts, wrangler.auth.jsonc, .env.example, .dev.vars.example,
package scripts/dependencies, docs/p004-local.md, handoff updates and this record.
Use existing P004 components/middleware. Vite proxies /api to local Wrangler.
Clerk/Neon credentials stay in ignored local files; no auth bypass or fake DB.
Use pinned cached Vite/Wrangler versions because registry installation was unavailable.

### Acceptance criteria
- [x] npm run dev starts frontend and Worker on loopback.
- [x] Browser shows an actionable setup page without credentials.
- [x] Auth routes are registered; direct private API requests fail closed.
- [x] Local frontend builds, Worker starts, tests/typecheck/lint stay green.
- [x] Credential files are denied by Vite.
- [ ] Real Clerk/Neon signup/persistence/logout acceptance after development credentials.

### Verification plan
Existing checks, local frontend build, Wrangler runtime startup and browser/API smoke.
Record real-service gaps separately.

### Risk / assumptions / rollback
Clerk dev keys and a development Neon URL are needed for actual login/persistence.
No external service writes are required for launcher validation.
Shared package/config additions are limited to dev tooling. Remove local entry points,
scripts and configuration to revert; retain existing auth modules and access migration.

## 2. Implementation

- Added tools/auth/local/index.html, main.tsx, preview.css, api.ts and generated worker-env.d.ts.
- Added tools/auth/dev.mjs, tools/auth/smoke-local.mjs, vite.auth.config.ts, wrangler.auth.jsonc.
- Added .env.example and .dev.vars.example; created ignored blank local files only when absent.
- Added docs/p004-local.md and updated p004-auth-handoff.md.
- Shared edits: package.json scripts/pinned Vite and Wrangler dependencies; tsconfig.auth.json
  includes local sources/Vite types; ESLint includes local code and ignores generated types;
  .gitignore allows only the secret-free .dev.vars.example template.
- Local frontend routes mount existing auth components. /api/me endpoints use existing
  middleware. /api/auth/local-status returns configuration presence only, never values
  and never a false live-connectivity claim.
- Vite binds to 127.0.0.1:5173; Wrangler binds to 127.0.0.1:8787. Logs and registry stay
  under ignored .wrangler. Launcher handles child-process cleanup and preserves settings.
- Runtime deviation: initially used today's 2026-10-24 compatibility date, but cached
  workerd supports at most 2026-10-13. This local-only config uses 2026-10-13 after
  observing the runtime error. Upgrade cached runtime before advancing the date.
- No external resources created, production writes, migration application, Git changes
  or deployment. Development secrets still must be supplied locally.

## 3. Review

- **Scope / contracts:** Existing P004 modules unchanged; preview is isolated under tools/auth.
  Other programmer features remain unavailable placeholders.
- **Security / validation:** Private requests denied without bearer session. Local settings
  stay server-side; Vite denies .env and .dev.vars paths. Provider failures remain closed.
- **Verification:**
  - npm.cmd run types:local — PASS; regenerated after config changes.
  - npm.cmd run typecheck — PASS.
  - npm.cmd run lint — PASS.
  - npm.cmd test — 41 PASS, 5 Neon integration tests SKIPPED.
  - npm.cmd run build:local — PASS.
  - npm.cmd run dev — running locally after fixes.
  - node tools/auth/smoke-local.mjs — PASS: real local Worker, proxy, 401 guards,
    404 boundary, secret-file 403 responses, mobile browser setup screen without JS errors.
- **Failures resolved:** Runtime date mismatch; restricted global Wrangler log/registry
  directories redirected locally. A smoke check initially returned 502 while the Worker
  failed to start, then passed after those fixes.
- **Remaining environment warning:** Wrangler cannot fetch optional Request.cf metadata
  through this environment's network restrictions; local Worker startup/smoke still pass.
- **Not verified:** Live Clerk verification emails/login/logout, Neon migration/persistence.
  No real keys or connection string were supplied.
- **Review outcome:** PASS — SELF-REVIEW for local launcher.
- **Human reviewer / approval:** Pending; no approval/merge claimed.

## 4. Changelog

- **Date / ID / owner:** 2026-10-24 / S1-P004-004-local-auth-runner / P004.
- **Type:** Added, Changed, Fixed, Docs, Tests.
- **Actual changes:** Local P004 browser/Worker entry points, npm dev command, configuration
  templates, secure local proxy/file restrictions, setup page and run guide.
- **Impact:** Minimal shared dev scripts/config; no database migration changes.
- **Verification:** Real local runtime/browser smoke and build/typecheck/lint/unit tests pass;
  live external service acceptance remains pending.
- **Follow-up:** Add selected Clerk app development keys and a Neon development URL locally,
  apply P004 migration on that development branch, then verify real auth.
- **Final status:** READY_FOR_REVIEW; local preview runnable; live auth acceptance PARTIAL.
