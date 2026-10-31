# S1-INT-032 — Network Security publication and production sync

- **Status:** READY_FOR_REVIEW — staged for coordinator inspection; offline validation and code-scope review passed; human peer review pending; live remote access unavailable
- **Date:** 2026-11-01
- **Sprint:** Sprint 1 integration
- **Owner:** INT / Integration
- **Related UC / FR:** P001 UC03/UC04, P002 UC08, P003 UC17; shared Network Security curriculum reference
- **Branch / PR:** DEV `main`; no commit or PR created
- **Reviewer:** Coordinator actual-diff review passed; human peer review pending

## 1. Plan

### Objective / problem
Prepare the requested Network Security changes in `subject-advisors` for publication to `subject-advisors-prod` and both `main` branches, preserving local history and restricting the change to the reviewed Network Security scope.

### Scope and requirements
- In scope: the exact 46-path allowlist below (33 tracked modifications and 13 untracked additions, including this record); local commit on DEV `main` after coordinator review; local-history-preserving fast-forward of PROD `main` from DEV; offline asset-only build in PROD with all database URL variables removed; ordinary non-force pushes to the requested `main` branches when live remotes are reachable.
- Out of scope: any unlisted path; production database migration/import or data edits; curriculum activation; deployment or Wrangler dry-run; auth/provider operations; dependency updates; changing old migration bytes or checksums; modifying source assets or actual environment files; reset, rebase, force push or deletion.

### Exact staged path allowlist
- `.gitattributes`
- `apps/api/src/modules/offerings/context.test.ts`, `apps/api/src/modules/offerings/context.ts`
- `apps/api/src/modules/pathway/adapter.ts`, `apps/api/src/modules/pathway/contracts.ts`, `apps/api/src/modules/pathway/pathway.test.ts`, `apps/api/src/modules/pathway/repository.ts`
- `apps/api/src/modules/profile/repository.test.ts`, `apps/api/src/modules/profile/repository.ts`
- `apps/api/src/modules/records/repository.test.ts`, `apps/api/src/modules/records/repository.ts`
- `apps/web/src/features/offerings/PrerequisiteDisplay.test.tsx`, `apps/web/src/features/offerings/PrerequisiteDisplay.tsx`, `apps/web/src/features/offerings/category-history-summary.test.ts`, `apps/web/src/features/offerings/category-history-summary.ts`, `apps/web/src/features/offerings/client.ts`, `apps/web/src/features/offerings/display-filter.test.ts`, `apps/web/src/features/offerings/display-filter.ts`, `apps/web/src/features/offerings/offerings.css`, `apps/web/src/features/offerings/prerequisites.ts`, `apps/web/src/features/offerings/response.test.ts`, `apps/web/src/features/offerings/response.ts`
- `apps/web/src/features/pathway/PathwayPage.tsx`, `apps/web/src/features/pathway/TalentTree.tsx`
- `apps/web/src/features/records/subject-groups.test.ts`, `apps/web/src/features/records/subject-groups.ts`
- `db/checks/001_schema_verification.sql`, `db/checks/007_network_security_reference.sql`, `db/engineering-extensions.json`, `db/migrations/0005_network_security_reference_support.sql`, `db/migrations/manifest.json`, `db/reference-data/network-security/english/manifest.json`
- `docs/cachingguide.md`, `docs/changes/DB-FOUNDATION-002-network-security-import-plan.md`, `docs/changes/S1-FOUNDATION-006-network-security-reference-support.md`, `docs/changes/S1-FOUNDATION-007-network-security-reference-import.md`, `docs/changes/S1-INT-031-network-security-curriculum-consumers.md`, `docs/changes/S1-INT-032-network-security-publication-and-production-sync.md`
- `packages/shared/src/curriculum-reference.test.ts`, `packages/shared/src/curriculum-reference.ts`, `packages/shared/src/offerings/offerings.ts`
- `tools/db/cli.mjs`, `tools/db/import-reference.mjs`, `tools/db/import-reference.test.mjs`, `tools/db/migrations.test.mjs`, `tools/db/review.mjs`

### Proposed implementation and publication sequence
1. After coordinator approval of this staged diff, commit only the allowlist on DEV `main`.
2. Fetch from the local DEV repository into PROD and fast-forward local PROD `main` only if its history permits; stop on divergence or unexpected local work. Do not rewrite history.
3. In PROD, run the asset-only Cloudflare build with `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `OFFERINGS_TEST_DATABASE_URL`, and `DB_FOUNDATION_URL` removed. Do not deploy or run a dry-run.
4. Compare local DEV and PROD `main` commit IDs and worktrees. Separately retry live remote fetch/verification; where reachable, push both requested `main` branches with ordinary non-force pushes. Network failure can leave live remotes unverified without undoing safe local history.

### APIs / database / interfaces
Migration 0005 adds nullable curriculum metadata and private import-receipt support. No production-side schema or data operation is part of repository publication.

### Acceptance criteria
- [x] Only the exact 46 listed paths are staged; staged diff passes `git diff --cached --check`. Coordinator staged-diff inspection pending.
- [x] Migration and manifest staged blobs preserve their source bytes and recorded SHA-256 values.
- [ ] After review, the DEV commit and PROD fast-forward preserve local history; local repository equality is recorded separately from live GitHub tip/ancestry verification.
- [ ] The PROD asset-only build passes with DB URL variables removed; no deployment, migration, import, activation or database connection is performed.
- [ ] Ordinary non-force pushes are attempted only when the live remotes are reachable; report success or network blocker accurately. Human peer review remains pending.

### Verification plan
- Before staging, confirm the 46-path working-tree candidate set exactly matches this allowlist.
- Stage explicit paths only; compare the full staged path set against the allowlist, inspect `git diff --cached --stat` and `git diff --cached --check`, and verify migration/manifest blob hashes.
- Following the coordinator gate, perform local DEV commit, fetch DEV locally into PROD and fast-forward only, run the PROD asset-only build with the four DB URL variables removed, compare local commits/status, then attempt ordinary pushes if network permits.

### Risk / assumptions / rollback
- Risks: broad shared API/consumer surface; production local `main` may contain unique commits or work; live remotes were not reachable during preparation. The imported `SECRH` curriculum is INACTIVE; publication does not activate it.
- Assumptions: user explicitly authorized pushing to `main`; coordinator inspection is the required immediate gate; human peer review remains pending and is not represented as complete.
- Rollback: stop before commit if candidate paths differ; stop local sync on divergence; revert a later ordinary commit if needed without changing migration history or data. Never force-update either branch.

## 2. Implementation

- **Status:** STAGED FOR COORDINATOR INSPECTION; no commit created
- **Files actually changed in this mini-task:** This record and the header metadata in `S1-FOUNDATION-007-network-security-reference-import.md`. Both changes are staged with the reviewed 44 other Network Security paths.
- **Summary:** Corrected FOUNDATION007 top-level status/reviewer to match its already-recorded completed development import, inactive curriculum and pending human review. Updated this record with the exact 46-path allowlist and the authorized local commit/sync/build/push sequence. Staged only the explicit allowlist for review.
- **Decisions / deviations from plan:** Live fetches of both GitHub remotes failed because `github.com:443` was unreachable. Cached DEV and PROD `origin/main` refs and both local `HEAD`s were `4b013ee7eba266ad6690d790ebfb5d25d48c1e75`; these cached refs do not verify live tips or ancestry. Local commit, DEV-to-PROD sync, PROD build and pushes have not yet occurred.
- **Migrations / env / shared contracts:** No schema, runtime, dependency, environment or database changes made in this mini-task.

## 3. Review

- **Self-review checklist:** Coordinator reviewed the actual runtime/schema/importer/test diff and found it scoped, compatible and without identified runtime defects. The 46-path allowlist is explicit. Staging verification is recorded below. Human peer review pending. No production database/deployment actions performed.
- **Test evidence:** With `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `OFFERINGS_TEST_DATABASE_URL`, and `DB_FOUNDATION_URL` removed from each child environment: `npm.cmd test` PASS (39 files passed, 2 skipped; 524 tests passed, 13 skipped); `npm.cmd run test:offerings` PASS (13 files passed, 1 skipped; 158 passed, 8 skipped); `npm.cmd run typecheck`, `npm.cmd run typecheck:offerings`, and `tsc -p tsconfig.p001.json --noEmit` PASS; `npm.cmd run lint` and `npm.cmd run lint:db` PASS; `npm.cmd run db:review` PASS (static only, databaseExecution NOT_PERFORMED); `node tools/db/import-reference.mjs validate` PASS (79 subjects, 195 pool credits, 7 categories); importer tests PASS (13/13); migration tests PASS (13/13); `npm.cmd run build:offerings` PASS; `npm.cmd run build:cloudflare` PASS (asset build only; no Wrangler deployment/dry-run). Node syntax checks and `git diff --check` PASS. No database URL was available to these commands.
- **Manual checks:** GitHub fetch failed in both repositories with connection failure to `github.com:443`; no escalation requested. Local cached refs equal local HEADs, but are not proof of current GitHub tips. PROD worktree was initially clean and remains unchanged so far.
- **Path inventory:** 33 modified tracked paths plus 13 untracked paths (12 before INT032) = 46 allowlisted candidate paths. No other path may be staged.
- **Raw-byte evidence:** `.gitattributes` marks migration SQL and reference manifests `-text`; `git check-attr` reports `text: unset` and `whitespace: cr-at-eol,-blank-at-eof`. Source SHA-256: migration `ac58ab7856291e60a7b4175d370c6514679870d03c911cbf2b22e4abc6654cc8`; manifest `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`. Staged blob IDs match working-tree blobs: migration `c66dc560f58ebe3223c3f5296687ef4af76b738f`; manifest `9f9d2cc2744b6b4d6887858ff46328df4de89c59`. Raw SHA-256 values match the source hashes above.
- **Staging evidence:** Exactly 46 allowlisted paths staged; staged path set equals the expected path set. `git diff --cached --check` PASS. Staged diff summary: 46 files changed, 5,773 insertions(+), 38 deletions(-). Migration and manifest staged blob IDs match working-tree blob IDs; source SHA-256 values match the recorded hashes. No unstaged tracked changes remain. The unrelated untracked `docs/changes/S2-P004-001-uc20-sprint-plan.md` and `docs/sprint/02/p004/uc20-plan.md` are excluded and untouched. Coordinator inspection of staged documentation and overall diff is pending.
- **Review outcome:** Code/schema/importer/test scope review PASS. Documentation corrections and staged path/hash checks are complete; coordinator staged-diff inspection pending. Human peer review pending; live remote verification unavailable.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Docs / Chore
- **Added / Changed / Fixed / Removed:** Added the publication and production-sync plan; corrected FOUNDATION007 metadata to `READY_FOR_REVIEW`, coordinator review passed and human review pending; staged the exact reviewed candidate paths for coordinator inspection.
- **Affected routes / tables / consumers:** Documentation update plus staged Network Security reference schema/importer and P001/P002/P003 consumer changes.
- **Breaking changes / migration steps:** None performed. Production migration/import, deployment and activation remain excluded.
- **Verification summary:** Offline suites, typechecks, lint, static database review, manifest validation, importer/migration tests and asset builds passed. Exactly 46 paths staged; `git diff --cached --check` passed; staged migration and manifest blob IDs equal working-tree blob IDs and SHA-256 values remain unchanged.
- **Outstanding blockers / follow-up:** Coordinator inspect staged paths/diff and hashes; then local DEV commit, local-history-preserving fast-forward to PROD, PROD asset-only build, local equality check and ordinary remote pushes if reachable. Live remote verification remains unavailable; human peer review is pending. No production database operation or deployment is planned.
- **Final status:** READY_FOR_REVIEW — staged for coordinator inspection; no commit, local sync or push yet.
