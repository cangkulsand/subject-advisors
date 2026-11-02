# S2-INT-002 — P001 Sprint 2 (UC05/UC06) integration

- **Status:** MERGED to `main` (2026-11-02); human peer review pending; one P001 browser check failing (pre-existing on the source branch)
- **Owner:** INT (integration)
- **Sprint / use cases:** Sprint 2, UC05 academic progress, UC06 curriculum/catalogue mapping
- **Feature branch:** `P001-----Sprint-2-(UC-5,-UC6)` (tip `10fba7b`, aisar afiq)
- **Target:** `main` after `2d3fe57` (S2-INT-001)
- **Records carried by the branch:** S2-P001-001 progress and curriculum, S2-P001-002 overlay publication
- **Review:** Coordinator review passed for merge safety; the user requested the merge.

## 1. Plan

- **Requested outcome:** Merge the other programmers' open branches into `main`; this record covers P001.
- **Approach:** `git merge --no-ff --no-commit`, run P001's own checks and the shared check set, commit as a two-parent merge preserving P001 authorship.
- **Impact:** Additive overlay only (33 new files): `apps/api/src/modules/p001-sprint2/`, `apps/web/src/features/p001-sprint2/`, `tools/p001-sprint2/`, its own `tsconfig`/`vite`/`wrangler` configs and hand-off docs. It is **not wired into the shared app router yet**; it runs through its own launcher (`node tools/p001-sprint2/dev.mjs`). Shared-router integration is described in `docs/p001-sprint2-handoff.md` and remains a follow-up.

## 2. Implementation

- Merge applied cleanly; no conflicts and no shared files changed.

## 3. Review

- `node tools/p001-sprint2/check.mjs`: PASS — P001 typecheck, lint, tests, frontend and Worker builds.
- `node tools/p001-sprint2/verify-handoff.mjs`: reports an integrity mismatch on this Windows checkout only because Git converts LF to CRLF (`core.autocrlf=true`); with line endings normalised all 27 text files match the manifest and the 4 PNGs match byte-for-byte. Base files that changed since the overlay was built (e.g. `apps/api/src/integration/router.ts`, profile/records modules, `package.json`) are expected drift from later `main` work and need the owner's compatibility review when the overlay is wired into the shared router.
- `node tools/p001-sprint2/test-ui.mjs`: **FAIL** — 5 checks pass, then the curriculum check times out waiting for the `Curriculum` select. The same failure occurs on the source branch tip `10fba7b` in an isolated checkout, so it is not caused by this merge. Returned to P001 owner.
- Shared checks on the combined `main` candidate (S2-P004-009/010 + P003 + P001): typecheck PASS; lint PASS; `npm test` 62 files passed, 4 skipped, 1061 tests passed, 46 skipped; `npm run test:integration` 9/9; integration UI 35 checks PASS; coordinator UI 41 PASS; admin UI 32 PASS; pathway UI 9 PASS; `npm run build:cloudflare` PASS.

## 4. Changelog

- 2026-11-02 — Type: Chore. Merged P001 Sprint 2 UC05/UC06 overlay into `main` unchanged. Not yet routed in the shared app. Follow-ups for P001: fix the curriculum browser check timeout; wire `/student/progress` and `/admin/curriculum` into the shared router per `docs/p001-sprint2-handoff.md`; refresh the hand-off manifest hashes or make `verify-handoff` line-ending tolerant. Human peer review pending. Status: MERGED.
