# S1-INT-024 — Production Clerk authorized origin

- **Owner:** INT
- **Sprint / use case(s) / FR:** S1 integration / P004 UC01–UC02 authentication configuration
- **Branch / PR:** `main` / no PR
- **Reviewer:** Coordinator (root) — implementation review PASS; human peer review pending
- **Status:** READY_FOR_REVIEW — production configuration applied and verified; human review and user login confirmation pending

## 1. Plan

### Objective / problem

Production reports `Authentication configuration is incomplete.` at `/auth/complete`. The production Clerk verifier rejects configuration when `CLERK_AUTHORIZED_PARTIES` is empty, and the production Worker currently has no binding by that name.

### Scope and requirements

- **In scope:** Add the exact production Worker origin as the sole `CLERK_AUTHORIZED_PARTIES` runtime variable on Worker `subject-advisors-prod` in the Sharhanarean account, then deploy/publish the configuration after user approval and coordinator plan review.
- **Out of scope:** Source code changes or uploads; changing or rotating Clerk keys or `DATABASE_URL`; changing the types/values of any existing bindings; Clerk dashboard changes; wildcard/extra origins; user account/session reads or writes; database operations.

### Proposed implementation

After coordinator review and user approval, use the connected Cloudflare API against account `74fd9e723c44a88dfbdd470c10b119cb`, Worker `subject-advisors-prod`. Immediately before writing, re-read the latest uploaded version, current deployment, script settings and binding names. Proceed only if the latest uploaded version is also the sole version receiving 100% traffic and the existing bindings are still exactly `ASSETS`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `DATABASE_URL`; stop if any of those checks differ or another version/change appeared.

Call the Cloudflare API `PATCH /accounts/{account_id}/workers/scripts/{script_name}/settings` using `multipart/form-data` with one JSON `settings` part. Its `bindings` list will contain `type: "inherit"` entries for every existing binding name (including `ASSETS`) and one `plain_text` binding for the authorized parties value. Inherit each existing binding from `latest`, which the immediate preflight confirms equals the deployed baseline. Append no other bindings. Include a `workers/message` annotation describing S1-INT-024; the only current annotation is server-generated `workers/triggered_by`, which Cloudflare marks read-only and regenerates. The request changes no script modules/content and does not include existing binding values.

The Cloudflare API's legacy script-settings operation documents a newly created version but does not explicitly state in its operation reference whether this PATCH deploys it immediately. Therefore, after PATCH, use GET on settings, versions and deployments to determine the actual result. Verify all five binding names/types and the deployed version's bindings. If the new version is not yet deployed and it is the only newly created version from this operation, explicitly call `POST /accounts/{account_id}/workers/scripts/{script_name}/deployments` with that version at 100%, preserving no other version entries beyond the previous 100% deployment baseline. If PATCH already deployed the new version at 100%, do not deploy again. Stop before any deployment if the new version or binding set is unexpected.

Planned binding addition:

```text
CLERK_AUTHORIZED_PARTIES=https://subject-advisors-prod.sharhanarean.workers.dev
```

Do not send or display existing binding values. Before and after, record only the relevant binding names, types, presence/nonempty booleans, version identifier, and traffic percentage. Keep Worker script source and non-binding settings intact.

Cloudflare's OpenAPI schema permits `inherit` bindings with required `name` and `type`; for the legacy script settings endpoint, an explicit `version_id` only accepts `latest` (an exact version ID is accepted only by the separate Workers API version endpoint). The schema warns that `latest` can differ from the deployed version, hence the required preflight equality check. PATCH requires one of `Workers Scripts Write`, `Workers Admin`, `Workers Editor`, `Individual Workers Admin`, or `Individual Workers Editor` permissions. The API schema marks secret binding text write-only/sensitive; inherited bindings avoid retrieving or copying existing values.

Primary Cloudflare references: [Patch Worker Script and Version Settings API](https://developers.cloudflare.com/api/typescript/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/edit/), [Multipart upload metadata and bindings](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/), [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/), [Deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/), and [new Workers API semantics](https://developers.cloudflare.com/changelog/post/2025-09-03-new-workers-api/).

### API, data, migration and cross-owner impacts

- Runtime Worker binding only; no database, migration, application source, or API contract changes.
- Preserve `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `DATABASE_URL` exactly as currently set; do not emit their values or copy them into the record.
- `CLERK_AUTHORIZED_PARTIES` is a non-secret origin allowlist and must match the request origin exactly (scheme/host, no path or trailing slash).

### Acceptance criteria

- [x] After coordinator review and deployment, `CLERK_AUTHORIZED_PARTIES` is present, nonempty, and matches only `https://subject-advisors-prod.sharhanarean.workers.dev`.
- [x] Existing three bindings remain present and nonempty with no values printed or altered.
- [x] New configuration version receives 100% traffic; Worker source code is unchanged (script ETag equality verified without outputting the ETag value).
- [x] A safe unauthenticated `GET /api/me` with synthetic `Authorization: Bearer configuration-probe` no longer returns `503 AUTH_CONFIGURATION`; it returned `401 SESSION_INVALID` for the invalid synthetic token. No real session or private account data was used.
- [ ] User retries the original sign-in flow to confirm full Clerk login behavior; a synthetic-token probe cannot prove valid user authentication.

### Verification plan

- Before/after Cloudflare settings GET: emit binding metadata only (name/type/presence/nonempty and exact-origin validity boolean), never values.
- Before/after deployment GET: record deployment/version metadata and traffic percentage.
- After deployment, perform the single safe synthetic-bearer GET above and record only status and error code/message category.
- No tests or source builds apply to this configuration-only change.

### Repository receipt / sync plan

After coordinator review of this updated record, commit only `docs/changes/S1-INT-024-production-auth-origin.md`, fast-forward the production checkout to that same commit, and push both `main` branches through the normal non-force workflow. Before pushing, confirm both remote refs are unchanged from the reviewed baselines; afterward verify both local/remote refs match and both worktrees are clean. The user's ongoing publication request covers this receipt/sync. No commit, checkout sync, or push has happened yet; no receipt SHA is needed inside this record.

### Risk / assumptions / rollback

- **Approval gate:** User explicitly approved applying the Clerk authorized origin, and the coordinator reviewed the concrete plan before the production write. Gate satisfied.
- **Risk:** An incorrect origin prevents Clerk verification. The exact HTTPS origin above is confirmed from the production URL and matches source validation rules.
- **Assumption / guard:** The API `inherit` bindings preserve attached values and resources. The request is constrained to binding entries plus annotation and contains no source modules. Preflight requires latest-uploaded and deployed versions to match; verify the response and deployed state afterward and stop on mismatch.
- **Rollback:** If the new version causes a problem, restore the prior 100% deployment by promoting its version; do not remove or alter the inherited existing bindings. If removal of the new binding is needed, prepare and review a second configuration-only change.

## 2. Implementation

- **Status:** COMPLETED — production configuration active
- **Files actually changed:** This change record only; no application source, Wrangler config, or secret files changed.
- **Summary:** With user approval and coordinator plan review, sent one Cloudflare API `PATCH /accounts/74fd9e723c44a88dfbdd470c10b119cb/workers/scripts/subject-advisors-prod/settings` containing inherited entries for `ASSETS`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `DATABASE_URL`, plus the sole new `plain_text` binding `CLERK_AUTHORIZED_PARTIES` set to the exact production origin. The API immediately created and deployed the configuration version; no follow-up deployment write was needed.
- **Before snapshot:** Sole active/latest version `ba02bfe0-b502-49a7-8080-dac0fb0f3579` at 100%, deployment `1f006c79-2730-40fb-8e12-2c7cc28ced9e`. Existing bindings were `ASSETS` (`assets`) plus the three named runtime bindings (`plain_text`); authorized-parties binding was absent.
- **After snapshot:** Version `96dd34a9-dd83-4e73-ae50-842875402eb8` is latest and active at 100%, deployment `1ea562cd-22c5-4631-9cff-6d1745ef0cce`. Exactly five expected bindings are present: `ASSETS` (`assets`), the three pre-existing runtime bindings (`plain_text`), and `CLERK_AUTHORIZED_PARTIES` (`plain_text`, nonempty). No binding values were emitted.
- **Decisions / deviations from plan:** None. The API PATCH created and deployed in one operation; the conditional deployment POST was skipped.
- **Metadata/source preservation:** Compatibility date and flags, usage model, placement, observability, logpush, tags, and tail-consumer count matched the pre-change snapshot. New version’s script ETag equals the baseline version’s ETag; the ETag itself was not output. No source modules were uploaded.
- **Migrations / env / shared contracts:** Production Worker runtime binding only; no database migration, application API, source, or shared-contract changes.

## 3. Review

- **Self-review checklist:** Scope limited to the approved runtime allowlist; four previous bindings inherited; no source modules, secret values, database operations, or other configuration changes; version and deployment verified; non-binding settings and script ETag preserved.
- **Test evidence:** No tests/builds run; this was a configuration-only change with no source edits.
- **Manual checks:** Preflight confirmed expected account/Worker, exactly four existing binding names, latest version equal to sole 100% deployed version. Postflight confirmed exact five bindings, 100% active new version, preserved settings and ETag. Synthetic-bearer `GET /api/me` returned `401 SESSION_INVALID` instead of `503 AUTH_CONFIGURATION`.
- **Defects found and fixes:** Missing production allowlist corrected.
- **Review outcome:** PASS — COORDINATOR REVIEW; human peer review pending
- **Human reviewer / approval:** User approved the exact origin; coordinator (root) reviewed the plan and implementation and passed it. Human peer review is pending.

## 4. Changelog

- **Date:** 2026-10-30
- **Type:** Fixed
- **Added / Changed / Fixed / Removed:** Added the exact production Worker origin to `CLERK_AUTHORIZED_PARTIES`; only this new binding was written.
- **Affected routes / tables / consumers:** Production Clerk authentication verifier; no tables.
- **Breaking changes / migration steps:** None; configuration-only version deployed.
- **Verification summary:** PATCH response succeeded; version `96dd34a9-dd83-4e73-ae50-842875402eb8` now receives 100% traffic. Expected bindings and non-binding settings verified; script ETag preserved. Synthetic-token GET returned 401 `SESSION_INVALID`, confirming the configuration 503 is cleared.
- **Outstanding blockers / follow-up:** Human peer review is pending. User should retry the full Clerk sign-in flow; no real user session was exercised. The three existing bindings are present/nonempty but their values and correctness were not assessed.
- **Final status:** READY_FOR_REVIEW — human peer review and user login confirmation pending
