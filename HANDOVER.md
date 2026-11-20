# Handover to Aisar (P001, M1): Academic progress counts exemptions saved without remarks

> **Already merged into `main` and pushed (dev and prod) on 2026-11-16, commit `91706bd`.** Pull `main` to get these files; do not push them again. This folder is for reading and for knowing what you own. Make changes on your own branch off `main` and push that branch.

Built by P004 (Sharhan) on 2026-11-16 for you to own. Source: branch `feature/s3-progress-exemptions`, commit `55bf27b`
in the primary repository. Change record: `docs/changes/S3-P004-008-progress-exemptions.md`.

## The problem

Your Subject records page saves "Exempted" immediately and tells the student they can add remarks later. But
`calculateProgress` only accepted an EXEMPTED record **with** remarks. Exemptions saved the normal way were left out:
no credits, the subject still "remaining", and a "records excluded" warning. On the dev/prod database 19 exemptions
have no remarks (14 of the 24 on SECJ), across 5 students. A SECJ student reported it on prod.

## The fix (your files)

| File | Change |
| --- | --- |
| `apps/api/src/modules/p001-sprint2/progress.ts` | EXEMPTED is valid when its credits are between 0 and the subject's credits; remarks no longer required. COMPLETED / FAILED / WITHDRAWN unchanged. |
| `apps/api/src/modules/p001-sprint2/sprint2.test.ts` | One new test: exemptions with no or blank remarks count, no warning. |

`progress-exemptions.diff` shows the exact lines (2 changed, 1 comment, 1 test). The Graduation check uses
`calculateProgress`, so it counts these credits too. The Graduation plan (M5) already uses the same rule (S3-P004-007);
keep the two in step.

## Checks (at handover)

typecheck, lint, check:cloudflare pass; `npm test` 1698 passed; integration browser checks 59 passed; checked against
the database (read-only): 19 of 19 such exemptions now counted. `tools/p001/test-ui.mjs` not run on this machine.

## Sending changes back

Send your changes as a branch or as files; they are merged into the primary repository (diffed against the current
files, existing behaviour kept), never copied over it.
