# Handover to Aisar (P001, M1): Academic progress requirement matching fix

> **Already merged into `main` and pushed (dev and prod) on 2026-11-16, commit `4eaa734`.** Pull `main` to get these files; do not push them again. This folder is for reading and for knowing what you own. Make changes on your own branch off `main` and push that branch.

> **Superseded copy:** the `progress.ts` and `sprint2.test.ts` in this folder are older. The current versions (this fix plus the exemptions fix) are in `aisar-M1-progress-exemptions/`, and in `main`.

Built by P004 (Sharhan) on 2026-11-16 for you to own. Source: branch `feature/s3-progress-requirement-match`, commit
`8293ddb` in the primary repository. Change record: `docs/changes/S3-P004-006-progress-requirement-match.md`.

## The problem

Requirement types are stored as `ELECTIVE_E1` (the reference import upper-cases the category and turns spaces into
underscores), but curriculum subjects carry the category `Elective E1`. `calculateProgress` compared them after
upper-casing only (`ELECTIVE_E1` vs `ELECTIVE E1`), so those requirement groups matched no subject and showed as
**unassessed** on Academic progress. The Graduation plan (M5) already treats them as the same group.

## The fix (your files)

| File | Change |
| --- | --- |
| `apps/api/src/modules/p001-sprint2/progress.ts` | New local `requirementKey()`: upper case, spaces and underscores alike. Used for the requirement type and the subject category. `COMPULSORY` unchanged. |
| `apps/api/src/modules/p001-sprint2/sprint2.test.ts` | One new test: `ELECTIVE_E1` and ` elective  e1 ` both match `Elective E1` and are MET. |

`progress-fix.diff` shows exactly the lines changed (about 6). No API, contract, database or page change. The
Graduation check (UC13) uses `calculateProgress`, so it gets the same fix.

The rule must stay the same as `normaliseRequirementType` in `packages/shared/src/planning/engine.ts` (Harraz, M5),
or Academic progress and the Graduation plan will disagree again. If you change one, tell the integration lead.

## Checks (at handover)

typecheck, lint pass; `npm test` 1696 passed; integration browser checks 59 passed. `tools/p001/test-ui.mjs` was not
run on this machine (its browser is not installed; same on `main`). Not checked against live Neon data.

## Sending changes back

Send your changes as a branch or as files; they are merged into the primary repository (diffed against the current
files, existing behaviour kept), never copied over it.
