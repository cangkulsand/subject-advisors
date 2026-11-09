# Historical: Idham revised Sprint 1 and Sprint 2 (7 November 2026)

This document records the earlier reviewed UC08 initial-demand and UC09 eligibility delivery. It predates the P002 v2.1 UC10 plan and is not current evidence for that work. For current setup and branch instructions, see [P002 v2.1 setup](p002-v21-setup.md) and [GitHub handoff](p002-v21-github.md); see [the v2.1 plan](changes/S2-P002-002-v21-semester-selection.md) for current implementation/review status.

Source: `Sprint_1_and_2_Discussion.docx`, discussion with Dr Adilah on 1 November; implementation against the uploaded `subject-advisors-main(1).zip` on 7 November 2026. The user's revised allocation supersedes the older manual-offerings-only P002 section in `docs/sprint1 (1).md` and the earlier PDF workflow.

| Stage | Implemented behavior | Entry point |
| --- | --- | --- |
| Idham / Sprint 1 | Count distinct students who still need each subject and positively satisfy its maintained prerequisites. At least 30 qualifies; uncertainty stays separate. | `/coordinator/initial-demand` |
| Sharhan / Sprint 2 handoff | Export qualified subject IDs, complete counts, accepted batch, exact scope, threshold and source/catalogue/demand fingerprints as JSON. | Download handoff JSON; `GET /api/coordinator/initial-demand` |
| Idham / Sprint 2 | Explain each student's eligibility using their records and the coordinator-confirmed offering set, including adjustments and withdrawals. | `/student/eligibility`; `/student/offerings` opens the same feature |

## Start and demonstrate

From the project root, use the existing lockfile and Node.js >=22.12 (tested with 24.22.1). On Windows PowerShell use `npm.cmd` instead of `npm` if script execution policy blocks npm.

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

For connected local use, retain your private `.env.local` and `.dev.vars` Clerk/Neon settings; see `.env.example`, `.dev.vars.example` and `docs/p004-local.md`. Use the team's existing database through migration 0008. This change adds no migration, package dependency or environment variable. The production factory uses P001's existing profile-aware auth dependency and Neon connection.

For a presentation without credentials or a database:

```sh
node tools/p002/test-ui.mjs --serve
```

Open the two URLs printed by the command. The preview uses the real routes and feature components with test-only authentication and 50 fictional student records; it cannot create accounts, write a database or publish offerings. Press Ctrl+C to stop it. Its other module destinations are not demo implementations. Use separate tabs/private windows when switching demo roles to avoid retaining a role-specific account cache.

Export the fictional cohort and derived example results:

```sh
node tools/p002/export-demo.mjs
```

Files are written to `.wrangler/p002-demo/`. Expected positive counts: Software Design 30 (qualifies), Computer Networks 29 (does not qualify), Database Systems 31 (qualifies). Five students have unknown history; they never inflate demand. All subject names, policies and students in this demo are fictional.

## Coordinator workflow

1. An administrator sets the system current academic semester and assigns the coordinator to the programme/learning centre. The next configured semester is the target; a student's profile semester does not choose it.
2. In Data Imports, create an accepted system snapshot, upload an accepted CSV, or create a combined snapshot. System records can be used without a CSV. Create a fresh snapshot after academic records change.
3. Open Initial Eligible Demand, choose the assigned scope and accepted batch, and inspect qualified, uncertain and below-threshold subjects. Older snapshots can be loaded.
4. Download the full handoff JSON for Sharhan. Its `qualifiedSubjectIds` is the initial candidate list. Counts do not include passed subjects, known unmet prerequisites, catalogue exclusions or subjects disallowed in the target semester type.
5. Sharhan consumes this output in his refinement stage, manages resources and coordinator additions/removals, then uses the existing Offering Decisions confirmation resource. The link to the current forecast workspace preserves the scope and batch as context; it does **not** automatically apply the new candidate subset to that existing engine. Adapting his refinement algorithm is Sharhan's remaining integration responsibility.

Stage 1 requires an ACCEPTED batch, not a FINALIZED forecast. No class allocation/capacity threshold is applied to its counts. The illustrative 25-student fallback and 15-class target in the discussion are not implemented policies. Initial demand is deterministic for the supplied accepted cohort and read catalogue; catalogue edits require a fresh calculation/handoff. Fingerprints are change-detection provenance, not security signatures or permanently versioned catalogue storage.

## Student workflow and source of truth

The server derives programme/curriculum from the authenticated student's profile, obtains the system next semester, reads that exact confirmed offering scope, and evaluates only subjects in the student's curriculum. It reads current confirmation rows, records and prerequisite metadata in one read-only PostgreSQL SELECT, giving these dependent reads one statement snapshot. The API accepts no identity or scope parameters.

Only positive eligibility is labelled Eligible. Completed/exempted subjects, known unmet prerequisites and semester restrictions are Ineligible. Unknown/partial/rejected history, unavailable prerequisite evidence, unsupported free-text conditions, unverified corequisites or missing CGPA evidence remain Uncertain/Needs review. Mandatory AND and structured OR prerequisites and completed-credit conditions reuse the approved engine. A zero-credit exemption can satisfy a course without awarding credits; retakes do not duplicate earned credits. Credits above the catalogue value are not trusted.

A missing confirmation shows an explicit waiting state. Withdrawn subjects disappear on the next refresh. A newer forecast, draft or forecast lifecycle change does not invalidate an existing confirmation. No manual offering list or PDF is used as fallback. The old manual UC08 API/storage remains for compatibility, but the integrated student offerings screen now uses this feature. This delivery adds no student-pick persistence, official registration, automated approval or SMP publication.

## Current integration limitation

The uploaded main's `ScopeProvider` maps all student profiles to centre ID 1 (Kuala Lumpur) until Package B adds and maintains profile-specific learning centres. This implementation follows that existing mapping, displays a campus notice, and never falls back to another centre's confirmation. Multi-centre student deployment requires the profile owner's centre field and a corresponding replacement of this mapping. Coordinator imports still enforce their own exact assigned centre.

The existing student sidebar inactive pink has a known contrast limitation documented in `themeguide.md`; shared palette values are preserved. New feature text and controls pass the mandatory readability guard.

See `docs/p002-verification.md` for actual checks, and the two `docs/changes/S1-P002-012-...` / `S2-P002-001-...` records for plan, implementation, review and changelog. Human peer review and connected development-database acceptance remain pending.
