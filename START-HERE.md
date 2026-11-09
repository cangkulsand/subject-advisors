# P002 v2.1 delivery — start here

This delivery contains the current Subject Advisors source tree, a changed-files overlay for the P002 changes, and lecturer/setup references. It is source code packaged from the supplied latest `main` archive; it does not include `.git` history. The P002 change is `READY_FOR_REVIEW`; peer review and connected development database acceptance remain pending.

## Run the fictional demo

Use Node.js 22.12 or later. From `subject-advisors-idham/`, on Windows PowerShell run:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
node tools/p002/test-ui.mjs --serve
```

Open the URL printed by the preview command. It exercises the P002 routes with a test-only session and 50 fictional students. Proposed picks may be saved in an in-memory fixture while the process runs; restarting clears them. The preview does not create accounts or write to a real database.

For local connected development, `npm.cmd run dev` needs private development Clerk and database variables in ignored `.env.local` and `.dev.vars` files. Obtain credentials and the approved setup instructions from the maintainer. Never commit those settings.

## Apply the changed-files overlay

Start with a clean checkout of the latest team `main`. Back up any local work before switching branches. Create `feature/idham-s1-s2-v21`, extract `changed-files.zip` outside the checkout, read `CHANGESET.json`, and copy only the listed paths into their matching locations. Merge folders and preserve unlisted teammate files. Review `Idham-changes.diff` and `git diff` before staging exact listed paths; do not stage the whole working tree. See `subject-advisors-idham/docs/p002-v21-github.md`.

## Migration and scope

On the supplied main, the existing migrated baseline through 0008 can be followed by additive P002 migration 0010. Version 0009 is not a prerequisite, remains reserved for Package B, and has no placeholder in this delivery. If Package B later introduces 0009, reconcile the combined migration history with the maintainer; do not renumber another owner's history. Only a maintainer-selected, explicitly approved development target with the dedicated `DB_FOUNDATION_URL` may be used for `db:status` or `db:migrate`. Keep existing application-role privileges in view: the additive migration follows the project's `REVOKE PUBLIC` pattern, so the maintainer must verify the runtime role can access the new table through the approved grants. Never run this migration on production or manually reapply baseline SQL.

## Review boundary

UC08 initial demand counts eligible students against the discussed 30-student threshold; Sharhan owns refinement and coordinator changes. UC09 checks individual eligibility from the finalised offerings. UC10 saves a proposed selection. UC11/UC12 ranking and bottleneck recommendations remain Sprint 3. The SRS credit figures are provisional until programme rules are verified; Normal-semester two-credit subjects require an explicit maintained permission. No live migration, deployment, push, or merge is claimed.

## Reference files

- `subject-advisors-idham/docs/p002-v21-setup.md` — setup, migration gate and product limits.
- `subject-advisors-idham/docs/p002-v21-github.md` — branch, overlay, review and draft PR instructions.
- `subject-advisors-idham/docs/p002-v21-verification.md` — actual checks and remaining limitations.
- `verification-results/` — captured stdout for the verification commands described in that report.
- `subject-advisors-idham/docs/p002-v21-requirement-map.md` — SRS v2.1 and discussion traceability.
- `subject-advisors-idham/docs/changes/S2-P002-002-v21-semester-selection.md` — four-stage change record.
- `LECTURER-SUMMARY.md` — presentation script and feature checklist.
