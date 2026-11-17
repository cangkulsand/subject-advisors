# Handover to Idham (P002, M4): Subject recommendations, bottlenecks and alternatives (UC11–UC12)

> **Already merged into `main` and pushed (dev and prod) on 2026-11-16, commit `b0e05f4`.** Pull `main` to get these files; do not push them again. This folder is for reading and for knowing what you own. Make changes on your own branch off `main` and push that branch.

Built by P004 (Sharhan) on 2026-11-16 for you to own. Source: branch `feature/s3-recommendations`, commit `fd68f04`
in the primary repository. Change record: `docs/changes/S3-P004-005-subject-recommendations.md`. Design:
`docs/superpowers/specs/2026-11-16-subject-recommendations-design.md`.

## Your files (you own these)

| Folder | What it is |
| --- | --- |
| `packages/shared/src/recommendations/` | `recommend(input)`: ranks every valid combination for the next semester by planning the rest of the degree around it; reasons, alternatives, bottleneck warnings. Pure. |
| `apps/web/src/features/recommendations/` | Student page `/student/recommendations` "Recommendations". |

## Dependency from Harraz (M5): read only

`_dependency-from-harraz-read-only/` holds the copies your code needs to run: the planning engine
(`packages/shared/src/planning/`), `apps/web/src/features/planning/client.ts` (loads `GET /api/planning/input`) and
`planning-page.css` (shared page styles). **Harraz owns these. Do not edit them;** ask Harraz for any change. There is no
new API for recommendations: it reuses `GET /api/planning/input`.

The page also uses files that already exist in every copy of the repository: `apps/web/src/app/navigation.tsx`
(`AppLink`), `apps/web/src/app/typography.css` and `apps/web/src/features/profile/client.ts` (`errorMessage`).

## Kept by the integration lead (do not replace these files; the lines are already in the main repository)

- `apps/web/src/app/AppRoutes.tsx`, `StudentRoutes.tsx`, `StudentShell.tsx`: `/student/recommendations` and the
  "Recommendations" menu item (after Semester offerings).
- `tools/integration/test-ui.mjs`: 5 Recommendations browser checks.
- `README.md`: Sprint 3 row.

## Please confirm or change (marked **(call)** in the design)

1. Saving a combination as a proposed plan is not built; the page links to Semester offerings (picks are saved there)
   and to the Graduation plan.
2. Workload preferences / strategies (Fastest, Balanced, Lighter) are not built.
3. Only the elective choices the plan already makes are recommended; other options of the same group are not offered.
4. Ranking: earliest projected completion, then longest prerequisite chains started, then compulsory, credits, code.
5. Your follow-up from S2: the Semester offerings page still uses a hard-coded Normal/Short rule
   (`display-filter.ts`); the planning engine reads `subject_semester_rule`.

## Checks (at handover)

typecheck, lint, check:cloudflare pass; `npm test` 1695 passed; integration browser checks 59 passed. Tested with mock
data only, not live Neon data.

## Sending changes back

Send your changes as a branch or as files; they are merged into the primary repository (diffed against the current
files, existing behaviour kept), never copied over it.
