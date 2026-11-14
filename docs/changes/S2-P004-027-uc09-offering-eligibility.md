# S2-P004-027 — UC09 offering eligibility (student subject picking)

- **Status:** MERGED to `main` (2026-11-14); human peer review pending
- **Date:** 2026-11-14
- **Sprint:** Sprint 2
- **Owner:** P002 (UC09 / FR-C2, FR-C5); built by P004
- **Related UC / FR:** UC09 / FR-C2, FR-C5; UC24 prerequisites (P003); UC20 simplified offering flow (S2-P004-017 to S2-P004-024)
- **Branch / PR:** `feature/s2-uc09-eligibility`; merged into `main` on 2026-11-14 (merge commit c1f426d); no PR
- **Reviewer:** Pending

## 1. Plan

Problem: students could pick any approved subject even when its prerequisites or corequisites were not met. Design: `docs/superpowers/specs/2026-11-14-uc09-offering-eligibility-design.md`; plan: `docs/superpowers/plans/2026-11-14-uc09-offering-eligibility.md`.

Decided rules (one shared evaluator, used by the API and the web page):
- Only UC24 `MANDATORY` / `COREQUISITE` prerequisite links and the imported `completedCredits` condition can block a pick.
- Topic-dependent rules, an imported "any of" group that does not match the links, and unavailable academic history or prerequisites give "Check with your coordinator": the subject stays pickable.
- CGPA is hidden from students (owner decision, 2026-11-14): CGPA is not stored anywhere (no table, no CSV column), so `hideCgpaRules` in `packages/shared/src/curriculum-reference.ts` drops imported CGPA conditions, and any condition note that mentions CGPA, before the offerings page and the student pathway see them. SECR4114/SECR4118 (industrial training) are then checked on completed credits (> 92) only. The coordinator forecast is unchanged and still reports CGPA as missing evidence; the database keeps the imported rule.
- `RECOMMENDED` links are advisory only.
- Status labels: Eligible / Check with your coordinator / Not eligible (with reasons).
- Prerequisites are edited by the System Admin only, in UC24. Coordinators only approve or remove offered subjects; they do not edit eligibility rules.
- Verified on development data: the SECRH imported links contain only fixed "all of" edges, so "any of" groups (for example SECR3104: SECD2613 or SECJ2203) are non-blocking.

Out of scope: editing prerequisites, coordinator overrides, any database change. No migration. Rollback: revert the branch commits.

## 2. Implementation

- **Shared:** `packages/shared/src/offerings/eligibility.ts` (+ `eligibility.test.ts`, 12 tests): `evaluateOfferingEligibility`, statuses ELIGIBLE / CHECK / NOT_ELIGIBLE and reasons. An imported-rule reason is added only when no blocking reason already exists.
- **API:** `PUT /api/semester-offerings` now returns `409 OFFERING_NOT_ELIGIBLE` ("<CODE> cannot be picked: <reason>.") for a pick that evaluates NOT_ELIGIBLE. It is checked after the approved-subject and pick-limit checks. Prerequisites and academic history are now loaded for PUT (history is server-only, from `academic_record`; a failed or malformed load means "unavailable" and is treated as Check). The GET response is unchanged. Files: `context.ts`, `contracts.ts`, `routes.ts` and tests.
- **Web (`OfferingsPage.tsx`, `offerings.css`):** status label and reasons in the table and the saved/review list; an ineligible checkbox is disabled unless the subject is already picked; Confirm and save is blocked with "Remove subjects you are not eligible for before saving."; a records-unavailable notice links to `/student/records`. A 409 `OFFERING_NOT_ELIGIBLE` message appears in the review error panel (same path as `PICK_LIMIT_EXCEEDED`; it does not trigger a reload).
- **Tests and harness:** `testing/eligibility-fixtures.ts`, `ui-harness.tsx` scenarios (eligibility, saved, no-records, 409), `eligibility-display.test.tsx`, `tools/offerings/test-ui.mjs` (new checks; now honours `PLAYWRIGHT_CHANNEL`). The offerings "rich" fixture's saved picks changed to 507, 509, 512 because DEMO204's unmet corequisite DEMO209 now blocks saving; its keyboard check uses DEMO202 because DEMO201 is now disabled.
- **Docs:** `README.md`, `docs/offerings/integration.md`. The SRS/SDD document in `docs/System Documents/` was deliberately NOT updated (owner instruction).

## 3. Review

- `npm run typecheck`: pass
- `npm run lint`: pass (0 warnings)
- `npm test`: 71 files passed, 6 skipped; 1613 tests passed, 65 skipped
- `npm run test:integration`: 11 passed, 0 failed
- `npm run build`: pass
- `npm run check:cloudflare`: pass (dry run, 1157.83 KiB upload / 244.75 KiB gzip)
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui:offerings`: 57 browser checks passed

Not verified: no database was used; the academic-history query was only unit-tested with stubs and the eligibility rules were checked against dev data by reading, not through a deployed run. Concerns: saved completed/exempted subjects are still evaluated (same on server and web); the 409 message is only shown in the review error panel, not in select mode.

## 4. Changelog

- 2026-11-14 - Merged: `feature/s2-uc09-eligibility` into `main` (merge commit c1f426d). Checks on merged main: typecheck, lint, unit tests (1616 passed, 65 skipped), integration 11/11, db-tooling 26/26, build, check:cloudflare, offerings UI (57), UC24 UI (14), admin UI (50). Status: MERGED; human peer review pending.
- 2026-11-14 - Type: Changed. CGPA rules are hidden from students: CGPA is not stored, so imported CGPA conditions (and notes mentioning CGPA) no longer appear on the offerings page or the student pathway, and no longer make a subject "Check with your coordinator" or pathway-unknown. The coordinator forecast keeps reporting CGPA as missing evidence. Checks: typecheck, lint, unit tests (1616 passed, 65 skipped).
- 2026-11-14 - Type: Added. UC09 offering eligibility: students see Eligible / Check with your coordinator / Not eligible with reasons on offerings, and `PUT /api/semester-offerings` rejects ineligible picks with `409 OFFERING_NOT_ELIGIBLE`. Compatibility: no migration; GET response unchanged; PUT may now reject picks that were previously accepted (unmet mandatory prerequisite/corequisite or credits). Outstanding: human peer review; SRS/SDD not updated by owner instruction.
