# S1-INT-032 — Network Security publication and production sync

- **Status:** BLOCKED — live GitHub publication unavailable; local Network Security sync complete; human peer review pending
- **Date:** 2026-11-01
- **Sprint:** Sprint 1 integration
- **Owner:** INT / Integration
- **Related UC / FR:** P001 UC03/UC04, P002 UC08, P003 UC17; shared Network Security curriculum reference
- **Branch / PR:** PROD `main` equaled scoped commit `b73090964a1e25cbcbb8c72f4f3319cac2ade90f` at the local-sync checkpoint; receipt prepared as a separate documentation-only change, coordinator receipt review pending
- **Reviewer:** Coordinator actual-diff review passed; human peer review pending

## 1. Plan

### Objective / problem
Prepare the requested Network Security publication and record its actual outcome in the PROD repository at `subject-advisors-prod`.

### Scope and requirements
- In scope: PROD-only publication receipt for the reviewed 46-path change, documenting scoped DEV commit, local PROD fast-forward, asset-only validation, concurrent unrelated Sprint 2 source advancement, and failed remote pushes. This receipt itself is staged only in PROD for coordinator review.
- Out of scope: any unlisted path; production database migration/import or data edits; curriculum activation; deployment or Wrangler dry-run; auth/provider operations; dependency updates; changing old migration bytes or checksums; modifying source assets or actual environment files; reset, rebase, force push or deletion.

### Reviewed implementation path allowlist
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
1. Completed: committed only the reviewed allowlist on DEV `main` as `b73090964a1e25cbcbb8c72f4f3319cac2ade90f` (tree `a08d409f6047788d261a94e3fb970d071474718c`, parent `4b013ee7eba266ad6690d790ebfb5d25d48c1e75`).
2. Completed: fetched the local DEV repository from the PROD working directory and fast-forwarded clean PROD `main` from `4b013ee7eba266ad6690d790ebfb5d25d48c1e75` to scoped commit `b73090964a1e25cbcbb8c72f4f3319cac2ade90f`; no history was rewritten.
3. Completed in PROD: `npm.cmd run build:cloudflare` passed as an asset-only build with `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `OFFERINGS_TEST_DATABASE_URL`, and `DB_FOUNDATION_URL` removed. No deployment/dry-run.
4. Scoped PROD commit/tree are verified. DEV `main` subsequently advanced to unrelated Sprint 2 commit `7f1d9d6206c435cecaad0b41ca97b12a66185aa3` (parent is the scoped commit); it is preserved in DEV and excluded from PROD. Thus current DEV/PROD branch heads intentionally differ, while scoped commit `b73090964a1e25cbcbb8c72f4f3319cac2ade90f` is PROD `main` and an ancestor of DEV `main`. Ordinary non-force pushes of only that scoped commit to both `origin/main` refs were attempted and failed because `github.com:443` was unreachable; live remote tips remain unverified.

### APIs / database / interfaces
Migration 0005 adds nullable curriculum metadata and private import-receipt support. No production-side schema or data operation is part of repository publication.

### Acceptance criteria
- [x] The reviewed 46-path implementation candidate was staged exclusively and passed coordinator review; the staged diff passed `git diff --cached --check`. The current receipt is a separate documentation-only change.
- [x] Migration and manifest committed blobs preserve their source bytes and recorded SHA-256 values.
- [x] The reviewed DEV commit and PROD fast-forward preserve local history. The scoped commit is PROD `main` and an ancestor of DEV `main`; current heads differ because DEV later received the unrelated S2 commit, excluded from PROD.
- [x] The PROD asset-only build passed with all four DB URL variables removed; no deployment, migration, import, activation or database connection was performed.
- [x] Ordinary non-force pushes of the scoped commit were attempted for both origins and failed on network connectivity to `github.com:443`; live remote tips are unverified. Human peer review remains pending.
- [ ] Live GitHub publication succeeds and current remote tips are verified; this remains pending because the exact scoped pushes could not reach `github.com:443`.

### Verification plan
- Before staging, confirm the 46-path working-tree candidate set exactly matches this allowlist.
- Stage explicit paths only; compare the full staged path set against the allowlist, inspect `git diff --cached --stat` and `git diff --cached --check`, and verify migration/manifest blob hashes.
- Completed: DEV scoped commit, local DEV-to-PROD fetch/fast-forward, PROD asset-only build with DB URL variables removed, local commit/tree/hash comparisons, and ordinary non-force push attempts. Do not copy DEV S2 commit `7f1d9d6206c435cecaad0b41ca97b12a66185aa3` to PROD.

### Risk / assumptions / rollback
- Risks: broad shared API/consumer surface; production local `main` may contain unique commits or work; live remotes were not reachable during preparation. The imported `SECRH` curriculum is INACTIVE; publication does not activate it.
- Assumptions: user explicitly authorized pushing to `main`; coordinator inspection is the required immediate gate; human peer review remains pending and is not represented as complete.
- Rollback: stop before commit if candidate paths differ; stop local sync on divergence; revert a later ordinary commit if needed without changing migration history or data. Never force-update either branch.

## 2. Implementation

- **Status:** PROD LOCAL SYNC PASS; external GitHub publication BLOCKED
- **Files actually changed in this mini-task:** This record only, in the PROD repository; prepared as a separate documentation-only change for coordinator receipt review.
- **Summary:** Recorded the scoped commit and local production sync, passed PROD asset build, unchanged migration/manifest hashes, concurrent DEV-only Sprint 2 commit exclusion, and failed non-force pushes. The original 46-path change is committed in DEV and PROD; only this final receipt remains staged.
- **Decisions / deviations from plan:** The DEV scoped commit is `b73090964a1e25cbcbb8c72f4f3319cac2ade90f` (tree `a08d409f6047788d261a94e3fb970d071474718c`, parent `4b013ee7eba266ad6690d790ebfb5d25d48c1e75`). At the local-sync checkpoint PROD `main` equaled that commit/tree. DEV `main` advanced afterward to unrelated S2 commit `7f1d9d6206c435cecaad0b41ca97b12a66185aa3`; that commit and its S2 files remain in DEV only. Scoped commit is an ancestor of current DEV; branch-head equality is intentionally not claimed. Pushes to both origins were attempted using exact scoped-commit refspecs and failed with `github.com:443` connection errors; live remote tips are unverified.
- **Migrations / env / shared contracts:** No schema, runtime, dependency, environment or database changes were made by this documentation-only receipt.

## 3. Review

- **Self-review checklist:** Coordinator reviewed the actual runtime/schema/importer/test diff and found it scoped, compatible and without identified runtime defects. The 46-path allowlist is explicit. Staging verification is recorded below. Human peer review pending. No production database/deployment actions performed.
- **Test evidence:** Prior offline validation remains applicable: `npm.cmd test` PASS (39 files passed, 2 skipped; 524 passed, 13 skipped); offerings suite PASS (13 files passed, 1 skipped; 158 passed, 8 skipped); auth/offerings/P001 typechecks PASS; lint and lint:db PASS; static DB review PASS (no database execution); importer validation and tests PASS (79 subjects; 13/13 tests); migration tests PASS (13/13); offerings build PASS; `npm.cmd run build:cloudflare` in PROD PASS (asset-only, all DB URL variables removed). No test suite was rerun for this documentation-only receipt.
- **Manual checks:** Verified local DEV commit parent/tree, PROD `main` exact scoped commit/tree, local fast-forward, and scoped commit ancestry in both repositories. PROD asset build passed. Both exact scoped non-force pushes failed with `github.com:443` connection errors; no live remote tip/ancestry verification was possible.
- **Path inventory:** The reviewed commit contains exactly the 46-path allowlist (33 modified tracked files and 13 additions including INT032). No DEV S2 paths were copied to PROD.
- **Raw-byte evidence:** `.gitattributes` marks migration SQL and reference manifests `-text`; `git check-attr` reports `text: unset` and `whitespace: cr-at-eol,-blank-at-eof`. Source SHA-256: migration `ac58ab7856291e60a7b4175d370c6514679870d03c911cbf2b22e4abc6654cc8`; manifest `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`. PROD commit blobs are migration `c66dc560f58ebe3223c3f5296687ef4af76b738f` and manifest `9f9d2cc2744b6b4d6887858ff46328df4de89c59`, matching the reviewed staged blobs and raw source hashes.
- **Staging evidence:** During receipt preparation, only `docs/changes/S1-INT-032-network-security-publication-and-production-sync.md` was staged in PROD; `git diff --cached --check` passed. Coordinator receipt review pending.
- **Review outcome:** Local Network Security commit/sync and asset build PASS. Live publication to GitHub is BLOCKED by network unavailability; remote tips are unverified. Human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Docs / Chore
- **Added / Changed / Fixed / Removed:** Updated the PROD-only receipt with actual local publication and build outcomes, concurrent S2 branch-head divergence, preserved source-only S2 commit, and both failed remote push attempts.
- **Affected routes / tables / consumers:** Documentation update plus staged Network Security reference schema/importer and P001/P002/P003 consumer changes.
- **Breaking changes / migration steps:** None performed. Production migration/import, deployment and activation remain excluded.
- **Verification summary:** Scoped commit `b73090964a1e25cbcbb8c72f4f3319cac2ade90f` (tree `a08d409f6047788d261a94e3fb970d071474718c`, parent `4b013ee7eba266ad6690d790ebfb5d25d48c1e75`) is PROD `main`; PROD asset-only build passed. SHA-256 migration `ac58ab7856291e60a7b4175d370c6514679870d03c911cbf2b22e4abc6654cc8`; manifest `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`. Both exact scoped non-force pushes failed because GitHub port 443 is unreachable.
- **Outstanding blockers / follow-up:** Retry exact scoped commit pushes when GitHub is reachable and verify live remote tips; human peer review remains pending. The PROD-only receipt is prepared as a separate documentation-only change for coordinator review. No production database operation, activation or deployment occurred.
- **Final status:** BLOCKED — local Network Security sync PASS; GitHub publication remains blocked by network connectivity; human peer review pending.
