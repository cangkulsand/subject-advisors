# S3-P003-002 — Sprint 3 planning workspace (freshness, requirement comparison, dependencies view)

- Owner: P003 Sprint 3 (UC14–UC16 completion, FR-E2–E6, FR-F1–F5)
- Status: MERGED to `main` on 2026-11-18 (merge commit fe12c47, branch `p003-sprint3-uc14-uc16`, commit dec5d37); integration lead review and full re-verification passed (see section "Integration review" below)
- Depends on: S3-P003-001 (lead review pass; human pending)
- Scope: `packages/shared/src/planning`, `apps/api/src/modules/planning`,
  `apps/web/src/features/planning`, minimal optional `annotations` prop
  in `apps/web/src/features/pathway/TalentTree.tsx`, integration harness,
  this record. No dependencies, migrations, live services, or UC13
  changes.

## 1. Plan (2026-11-17)

### Problem

The saved what-if can write over a baseline that changed underneath it
(no freshness check); queue jobs are bound to the page lifecycle loosely;
the summary presents a scheduled completion as a confirmed graduation
date without checking configured requirements; there is no synchronized
dependency view for the shown plan; and the move dialog / reset flow
have small accessibility gaps.

### Approach

1. Freshness: `PlanningInput` gains optional `curriculumId`, `recorded`
   (COMPLETED/EXEMPTED + recognizedCredits per mapping id) and
   `baselineVersion`. `planningBaselineVersion()` (WebCrypto SHA-256)
   hashes a canonical, reorder-tolerant copy of the input. GET returns
   the token; PUT accepts an optional token, rejects mismatch with
   `409 PLANNING_BASELINE_CHANGED` before change validation and before
   `scenarios.replace`. Legacy clients without a token keep working.
2. `SaveQueue`: per-job `baselineVersion`, `dispose()` (drops pending,
   ignores late statuses), `onError` stop callback. The page creates
   the queue inside the load effect keyed `api+refresh`, disposes it on
   cleanup, sends the loaded token with every push. A 409 / legacy 422
   shows an out-of-date banner, stops queued writes, disables editing
   and the comparison, and offers a guarded "Refresh plan" (confirm
   before discarding unsaved changes; refresh disabled while saving).
3. Shared `assessPlan(input, plan)` (pure, consumes engine output):
   rows for total credits, compulsory subjects and each configured
   requirement group; recorded figures come from `recorded` only
   (missing detail = unknown, not nominal credits); statuses
   MET/PROJECTED/OUTSTANDING/UNVERIFIED; `complete` only when every row
   is MET/PROJECTED. The summary shows "Cannot confirm yet" when
   assessment is incomplete, labels the earliest value a theoretical
   lower bound, and gains an expandable requirements card; the
   comparison adds per-row baseline vs simulation fulfillment and
   completion and hides the numeric delay when either side is
   incomplete.
4. `PlanDependencies`: Semester plan / Dependencies switch near the
   board; builds a `PathwayGraph` from input subjects and
   MANDATORY/COREQUISITE links, statuses from `recorded` (legacy passed
   = UNKNOWN), and passes optional per-node annotations
   (`{semester, baselineSemester?, changed}`) to `TalentTree` (default
   absent = existing UC17 behavior). Changed nodes get a scoped dashed
   outline; an expandable dependency table lists name-first subjects,
   status, links and shown/baseline semesters.
5. Interaction fixes: Move dialog gains a "Now in" label and
   `aria-describedby` on reasons; unconfigured semester panels say
   "Not set up for moving subjects"; move/retry/toggle controls go to
   44px; "Reset to my plan" confirms via a keyboard-accessible dialog
   (Cancel/Escape = no write, focus returns to the trigger).

### Acceptance

Targeted vitest set green (new hash/API/queue/assessment/adapter cases
plus existing suites), `npm run typecheck` exit 0, mocked Edge harness
`--installed` with new stale-token/reset-dialog/requirements/deps
checks, `assertReadable`, screenshots at 1440/375 plus 320/768/zoom
control smoke, evidence under `.wrangler/m5-sprint3-review/step2`.

## 2. Implementation (2026-11-17)

- `contracts.ts`: optional `curriculumId`, `recorded` and
  `baselineVersion` on `PlanningInput` (additive; old fixtures and the
  P002 recommendation input still compile).
- `baseline-version.ts` (new): canonical, reorder-tolerant SHA-256 of
  the input minus `baselineVersion`; sorts subject arrays, id sets,
  requirements by type+thresholds and limits by year/no/id without
  mutating the caller's object.
- `assessment.ts` (new): pure `assessPlan(input, plan)`; rows `total`,
  `compulsory`, `group-{index}-{TYPE}`; recorded credits unknown only
  when a passed member lacks a `recorded` entry; statuses
  MET/PROJECTED/OUTSTANDING/UNVERIFIED; `complete` gates the summary's
  confirmed completion.
- `repository.ts`: `toPlanningInput` emits `curriculumId` and deduped
  `recorded` (COMPLETED/EXEMPTED, best recognized credits, COMPLETED
  wins ties) using the existing `countsAsPassed` rule; `passed` and
  `earnedCredits` unchanged.
- `routes.ts`: GET `/api/planning/input` wraps the loaded input with
  `planningBaselineVersion`; PUT accepts optional `baselineVersion`
  (`/^[0-9a-f]{64}$/`), returns `409 PLANNING_BASELINE_CHANGED` on
  mismatch before change validation and before `scenarios.replace`;
  legacy missing token still accepted.
- `saved.ts`: `validateSavedBody` accepts the optional token field.
- `client.ts`: `saveScenario(changes, baselineVersion?)` sends the
  token only when present.
- `save-queue.ts`: per-job version on `push`, `dispose()`, and an
  `onError` stop callback (true = drop pending, used for baseline
  changed / legacy 422).
- `PlanningPage.tsx`: effect-owned queue keyed `api+refresh` with
  abort + dispose cleanup; out-of-date banner disables editing,
  hides What-if/Comparison, keeps the draft labelled; guarded
  `Refresh plan` (header + banner, disabled while saving, confirm
  dialog when unsaved changes exist); reset-to-plan confirm dialog;
  summary consumes `assessPlan` ("Cannot confirm yet", theoretical
  lower bound, expandable requirements card); comparison adds the
  requirement fulfillment table and suppresses the numeric delay when
  either assessment is incomplete; Semester plan / Dependencies
  switch beside the Your plan / With your changes toggle.
- `PlanDependencies.tsx` + `dependencies.ts` (new): builds a
  `PathwayGraph` and per-node annotations from the shown plan only;
  `TalentTree` gained an optional `annotations` prop (absent = UC17
  unchanged) feeding the node accessible name, tooltip and Selected
  subject details; dashed outline via scoped CSS; expandable
  dependency table (name first, status, mandatory, co-requisites,
  shown/baseline semesters).
- `PlanBoard.tsx`: Move dialog "Now in" label and `aria-describedby`
  reasons; unconfigured semester panels say "Not set up for moving
  subjects"; 44px move/retry/toggle controls.
- `planning-page.css`: scoped additions only; `--font-size-table` for
  the requirement status chips after the readability guard flagged
  12px table text.

## 3. Review / verification (2026-11-17)

- `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts
  packages/shared/src/planning apps/api/src/modules/planning
  apps/web/src/features/planning apps/api/src/integration/router.test.ts
  packages/shared/src/recommendations` — 199/199 tests, 12 files.
  Log: `.wrangler/m5-sprint3-review/step2/vitest.log`.
- `npm run typecheck` — exit 0. Log: `step2/typecheck.log`.
- `PLAYWRIGHT_CHANNEL=msedge node tools/integration/test-ui.mjs
  --installed` — 78/78 checks PASS (mocked Clerk/API), incl. new
  stale-409 refresh/cancel/recovery, requirement comparison and
  no-fabricated-completion, dependencies sync + changed outline,
  unmount save isolation, reset Cancel/Escape/confirm, move-dialog
  current semester + described reasons, unconfigured panel text, and
  768 + 200%-zoom control smoke. Log: `step2/test-ui.log`.
- Screenshots (initial pass): `step2/shots/` (plan/plan-board at
  1440+375, plan-deps-1440, plan-768, plan-zoom200 plus the existing
  progress/details/graduation/recommend shots).
- Fixture note: the harness `planFixture` `totalCredits` was corrected
  27 -> 21 so the configured total matches what the curriculum can
  actually deliver (12 core + 3 selected elective + 6 university
  compulsory = 21); with 27 the assessment correctly reported
  OUTSTANDING. The `totalCredits:null` case is now covered explicitly
  by the "Cannot confirm yet" / "Cannot compare reliably" check.
- Self-review: `git diff --check` clean; changes confined to the
  scoped paths; no comments added or removed; no live services;
  harness closed its own loopback server.
- Status: READY_FOR_REVIEW (lead review pending; human approval
  pending).

## 4. Lead review round 1 fixes (2026-11-17)

- `assessment.ts`: `completionOf` accumulates only deduplicated planned
  subjects (a duplicated plan row can no longer advance the total
  completion date); `complete` also requires `plan.status !==
  'INCOMPLETE'`; a warning fires whenever ANY passed mapping lacks a
  `recorded` entry; a known subject-count deficiency stays OUTSTANDING
  even when credit figures are unknown (UNVERIFIED reserved for
  missing thresholds / unknown credit info only).
- `save-queue.ts`: `halted` state - an `onError`->true failure clears
  pending+last and refuses every later push/retry while still
  reporting `failed` once; `dispose()` clears `last`; no error/status
  callbacks fire after dispose, including in-flight rejections.
- `PlanningPage`: summary renders the SHOWN plan + assessment with an
  explicit 'Your plan (baseline)' / 'With your changes (simulation)'
  label; DONE keeps the requirements card/warnings and reads
  'Configured requirements met' or 'Cannot confirm yet'; comparison
  gates EACH side's date on that side's assessment ('Cannot confirm
  yet'), not only the delay figure; requirements table gained a Target
  column and the comparison requirement table moved under a collapsed
  'Requirement changes' details; `SaveState` lives in the header
  action row (visible in every view incl. dependencies/DONE); Try
  again is suppressed while outdated and `apply()` refuses; reset and
  refresh confirm dialogs restore focus via a post-unmount pendingFocus
  effect (trigger on Cancel/Escape, stable header Refresh on confirm,
  deferred while the save button is disabled) and `aria-describedby`
  on the dialog lead.
- Labels/comments/CSS: 'Baseline plan' annotation labels, 'Same or
  earlier semester' co-requisite column; FYP/IT assumption line added
  to engine assumptions; every newly added comment removed (verified
  via git diff) and two pre-existing comments restored; toggle and
  dialog use scoped `--pl-*` tokens so dark mode stays readable;
  `.planning-header-actions` wraps at 320.
- Harness: stale-409 (no Try again), requirement/comparison details,
  suppressed dates, deps at 375/320, queued-save unmount isolation,
  reset/move focus, unconfigured panel text, 768 + CSS-zoom-200%
  control geometry, dark-mode dialog/controls, DONE-with-unmet
  summary.

## 5. Final verification (2026-11-17, `.wrangler/m5-sprint3-review/final/`)

- `npm test` - 1841 passed, 65 skipped, 92 files (full suite).
  `npm-test.log`.
- `npm run lint` - 0 errors (2 trivial test-file lint fixes applied:
  unused `_params`, expression statement). `lint.log`.
- `npm run typecheck` - exit 0. `typecheck.log`.
- `npm run build:cloudflare` - exit 0 (pre-existing >500kB chunk-size
  warning only). `build-cloudflare.log`.
- `PLAYWRIGHT_CHANNEL=msedge node tools/integration/test-ui.mjs
  --installed` - 81/81 checks PASS (mocked Clerk/API). `test-ui.log`.
- Screenshots: `final/shots/` - plan/plan-board at 1440+375,
  plan-deps at 1440/375/320, plan-768, plan-zoom200, plan-dark-1440,
  plus progress/details/graduation/recommend at 1440+375.
- `git diff --check` clean; branch `feature/m5-planner-fixes`; no
  generated/env/lock/config changes tracked; no commits.

## 6. Scope limits

- UC13 full graduation eligibility is NOT implemented or verified;
  the summary reports requirement progress, never official graduation
  clearance. Unknown special FYP / industrial-training institutional
  enrollment policies remain open owner inputs (stated in the plan
  assumptions shown to students). Live / real-student acceptance
  remains pending. P002 direct candidate filtering for the new
  semester-type default is a separate cross-module follow-up.
- Status: READY_FOR_REVIEW - final gate green; lead review passed on
  source, regression evidence and final verification; human approval pending.


## Integration review (P004, 2026-11-18)

Reviewed the diff against `main` (ce46833) and re-ran everything on the branch with Chrome: typecheck, lint, check:cloudflare pass; `npm test` 1841 passed (65 skipped); browser checks integration 76, admin 51, coordinator 55, landing 9, auth 12. The changes to integration-lead files (`tools/integration/test-ui.mjs`, `apps/web/src/features/pathway/TalentTree.tsx`) were checked: existing checks are kept (only the save-body and selector updates the new token and summary need), the `totalCredits` fixture change 27 → 21 is correct, and the TalentTree `annotations` prop is optional (UC17 unchanged). The 2-credit Short default matches `docs/database/subject-configuration-rules.md`. Merged as-is with a merge commit; no code changed by the lead.

Notes kept open: a what-if change still waiting to be sent is dropped if the student leaves the page while an earlier save is in flight (the save in flight still completes); the Move dialog now runs one simulation per configured semester (up to 60); not yet tried against live Neon data.
