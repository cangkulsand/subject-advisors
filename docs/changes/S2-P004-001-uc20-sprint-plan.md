# S2-P004-001 UC20 Sprint 2 plan

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related use case:** UC20, Provide Academic Data and Generate Class Offering Forecast
- **Branch / PR:** main; no PR requested
- **Reviewer:** Coordinator self-review complete; human peer review pending

## 1. Plan

### Objective and scope

Save the UC20 Sprint 2 plan agreed in the conversation at
`docs/sprint/02/p004/uc20-plan.md`, then commit and push only this documentation
change. The current user-provided UC20 definition governs the plan. Plan creation
stays with the coordinator, as explicitly requested by the user.

This change documents future P004 implementation; it does not implement UC20,
apply migrations, change live data, publish offerings, or implement UC23.

### Expected files and compatibility

- `docs/sprint/02/p004/uc20-plan.md`: scope, sequence, proposed contracts, data and
  forecasting behavior, dependencies, acceptance criteria and verification plan.
- This change record: Plan, Implementation, Review and Changelog evidence.
- No application, API, schema, dependency or deployment changes.
- Preserve all unrelated working-tree and staged changes. Commit only the two
  named documentation paths; do not include other unpublished work.

### Acceptance criteria and verification plan

- The plan preserves the agreed UC20 scope, configurable provisional policies,
  uncertainty, separate snapshots, human review and finalized immutability.
- UC23 updates and comparisons remain future scope.
- All relative repository links resolve and the Markdown has no whitespace errors.
- Inspect the actual documentation diff and the commit's file list.
- Attempt a normal push without force and verify the remote commit if reachable.
- Application tests are unnecessary for this documentation-only change.

### Risks, assumptions and rollback

- CSV, detailed API paths and additive schema fields are implementation proposals,
  not additional institutional requirements.
- Centre access, retention, import vocabulary, demand assumptions and policy
  configuration must be settled during implementation before real-data use.
- Network access may prevent push; report any publication blocker truthfully.
- Rollback is a documentation-only revert. Leave unrelated work intact.

## 2. Implementation

- **Status:** Documentation complete; UC20 feature implementation remains PLANNED.
- **Files actually changed:** This record and `docs/sprint/02/p004/uc20-plan.md`.
- **Summary:** Saved the agreed plan with scope, sequencing, data and rule snapshots,
  conditional demand, capacity proposals, justified review, lifecycle, dependencies,
  access and retention considerations, acceptance criteria and future checks.
- **Deviations:** None.
- **Migrations / environment / shared contracts:** None applied or changed.

## 3. Review

- **Self-review:** Read the saved plan and checked it against the supplied UC20 and
  agreed conversational plan. Scope, existing schema compatibility, provisional
  figures, uncertainty, review/finalization and the UC23 boundary are preserved.
- **Documentation checks:** PowerShell readback, trailing-whitespace check and
  resolution of all relative plan links passed. `git diff --no-index --check --
  /dev/null <path>` reported no whitespace errors for either new document; its
  difference exit code is expected for new files. Git emitted only line-ending
  normalization warnings.
- **Application tests:** Not run; this change only documents future implementation.
- **Human peer review:** Pending.
- **Review outcome:** PASS - SELF-REVIEW for documentation; human approval pending.
- **Publication:** `git fetch origin main` could not connect to GitHub on port 443.
  Local commit and a normal push attempt remain to be performed; do not interpret
  this documentation review as successful remote publication.

## 4. Changelog

- **Date:** 2026-11-01
- **Type:** Docs
- **Actual changes:** Added the UC20 implementation plan under the requested
  `docs/sprint/02/p004/` directory and this mandatory documentation change record.
- **Compatibility:** Documentation only; no runtime or database impact.
- **Verification:** Saved content reviewed, relative links resolved, and whitespace
  checked. Application tests not run because no executable behavior changed.
- **Outstanding:** Human peer review and Git publication; GitHub connectivity failed
  during fetch. UC20 feature implementation is future work.
- **Final status:** READY_FOR_REVIEW
