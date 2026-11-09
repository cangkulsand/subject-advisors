# S2 P002 002 v2.1 eligibility and semester selection

Status: READY_FOR_REVIEW. Date: 2026-11-09. Owner: Idham / P002. Human reviewer: pending.

## 1. Plan

Implement the user's revised Sprint 1 and Sprint 2 scope against the uploaded latest main, discussion and SRS/SDD v2.1. The latest main and discussion are byte-identical to the earlier upload; reuse the reviewed P002 first filter and confirmed-eligibility code, then complete the newly verified UC10 requirement. The sprint table assigns UC09 and UC10 to Sprint 2; UC11/12 intelligent ranking and bottlenecks remain Sprint 3.

Discussion takes priority for the source of offerings: the first eligible demand threshold remains 30 distinct students; Sharhan refines and the coordinator confirms; students use the confirmed next-semester list rather than re-entering availability. Document older conflicting UC08 wording instead of claiming that PDF/manual availability remains authoritative.

Add proposed plan selection, totals, save/reload/edit/clear/cancel, explicit eligibility/uncertainty explanations, corequisite combination checks and maintained semester constraints. Use configured semester caps (the specification's 3-subject / 10-normal / 6-short numbers remain provisional in its overview, with configured exceptions). Two-credit Normal-semester allowance requires explicit maintained NORMAL permission; do not infer FYP exceptions from a code suffix. Sequential mandatory prerequisites must already be passed, not merely co-selected. Exemptions and failed/withdrawn outcomes follow verified main semantics.

Use existing academic_plan/plan_subject for downstream compatibility and an additive P002 metadata table for exact student/semester uniqueness, revision and confirmation provenance. Save server-side after fresh auth and full validation, with atomic source/revision guards and transaction rollback. No writer trusts client eligibility, credits, student identity or programme/centre. No mutation of academic records, live database, GitHub remote, existing confirmations, programme management or Sharhan resource algorithm.

Expected areas: shared P002 eligibility/selection policy; student-eligibility reader/client/UI; new selection API/repository, additive migration and manifest/extension metadata; minimal router registration; tests and fictional preview; branch/merge/setup and lecturer summary. Keep package/lock and other owners' modules unchanged. The inherited centre-1 mapping remains explicit until the profile owner provides a supported centre field.

Acceptance: positive 29/30/31 first filter, saved own-student plan persists and is reloadable, valid concurrent corequisites accepted and missing concurrent dependencies rejected, invalid/stale/withdrawn/over-limit plans preserve prior data, session/source/plan concurrency is guarded, all new UI readable at mobile widths. Run full typecheck/lint/tests/build/integration plus focused policy/SQL/UI checks. Offline SQL parsing and isolated local PostgreSQL if available; never run migrations on the user's live database. Package exact diff against uploaded main with branch instructions and lecturer explanation.

Rollback: reverse the added overlay on a feature branch; remove only P002 metadata via reviewed future rollback if deployed, preserving original academic plans/records. Review actual delegated diffs before dependent changes.

## 2. Implementation

Implemented the P002 v2.1 eligibility and proposed semester-selection flow, including the additive metadata migration, actual eligibility reader, atomic plan writer and route, shared eligibility/selection policies, real feature UI, test-only fictional preview, and focused policy, route, integration and database tests. Reused the reviewed November 7 initial-demand implementation as the source base and integrated the finalised student eligibility flow against the supplied application baseline.

**Changed areas:** `apps/api/src/modules/student-eligibility/`; P002/student route and app shell registration; `apps/web/src/features/student-eligibility/`; coordinator initial-demand integration; shared P002 forecasting policy and selection contracts; `db/migrations/0010_p002_semester_selection.sql` and manifest/extension metadata; focused integration preparation, DB tooling, UI, and isolated database tests; P002 delivery/setup/verification documentation. No deleted files or package manifest/lockfile changes. The complete exact file list is in the delivery `CHANGESET.json`.

**Review fix:** isolated PostgreSQL exposed a SQL constant-folding issue in the selection guard sentinel. The guard was corrected, then the full 11-scenario PGlite integration completed successfully.

**Migrations / env / shared contracts:** additive migration 0010; 0009 remains reserved for Package B and is not included or renumbered. Local DB CLI use still requires an approved explicit target and `DB_FOUNDATION_URL`. No database migration was run against Neon or production. `package.json` and `package-lock.json` remain unchanged.

## 3. Review

- **Self-review checklist:** Passed locally for owner scope, planned behavior, server-side identity and eligibility validation, transaction/source/revision guards, preservation on invalid/stale writes, student isolation, migration additive behavior, mobile readability, no committed credentials, and overlay compatibility. No baseline source files were removed; package and lock files are unchanged.
- **Test evidence:** `npm test` 1,462 passed / 59 inherited database skips across 74 passing and 5 skipped files; typecheck, lint, API build, local build and 10 integration-preparation tests passed. P002-focused ESLint, static DB review, 23 DB-tooling tests and 30 UI checks passed. Isolated PGlite/PostgreSQL 18.6 exercised 11 persistence and failure scenarios. Cloudflare asset build with a test-only key passed; Vite reported a non-fatal 663.68 kB JS chunk warning. See `docs/p002-v21-verification.md` for exact limits.
- **Manual checks:** desktop and mobile views were visually inspected; all four UI widths passed readability/no-overflow checks.
- **Defects found and fixes:** PGlite uncovered a PostgreSQL constant-folding issue in the SQL selection guard sentinel; the guard was corrected and isolated integration passed afterward.
- **Review outcome:** PASS — SELF-REVIEW; READY_FOR_REVIEW.
- **Human reviewer / approval:** Pending. Connected Neon development acceptance, deployment, push, and merge were not performed.

## 4. Changelog

2026-11-09: Added v2.1 student eligibility/selection implementation, additive migration 0010, integration tests, UI preview, and setup/GitHub/verification documentation. Verification passed locally; 59 inherited database tests remain skipped, and isolated PGlite covered 11 database scenarios. No live migration or deployment. Human peer review and connected Neon development acceptance remain outstanding. Final status: READY_FOR_REVIEW.
