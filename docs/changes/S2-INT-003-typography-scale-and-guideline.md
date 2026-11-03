# S2-INT-003 — Shared typography scale, readability guideline and automated guard

- **Status:** MERGED to `main` (2026-11-03); human peer review pending
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** `feature/s2-typography-guideline` (from `feature/p004-s2-admin-email-domains`); no PR
- **Reviewer:** Coordinator review

## 1. Plan

User request: "my eyes hurt reading the table" - the coordinator tables were already enlarged (S2-P004-009 UI revision). Apply the same concept to every screen and add a mandatory guideline plus an automated guard.

- One type scale defined once in `apps/web/src/app/typography.css` (`:root`), imported by the entry (`cloudflare-main.tsx`) and by every shell/feature stylesheet owner so isolated harnesses also get it (bundlers de-duplicate). Feature CSS only consumes `var(--font-size-*)`.
- Minimums: nothing below 12px; table body 14px; table headers 13px; labels 13px; controls 14px and 44px tall; muted text AA (`--color-muted-text`).
- Subject tables show name first, code second (muted) where a simple swap.
- Guideline: `docs/themeguide.md` section 5.1 "Typography and readability (mandatory)", linked from `AGENTS.md`, `CONTRIBUTING.md` and the `docs/implementationguide.md` review checklist.
- Guard: `tools/ui/readability.mjs` (`assertReadable`) wired into the admin, coordinator, integration, pathway and P001 Sprint 2 UI harnesses.

## 2. Implementation

- **Tokens** (`apps/web/src/app/typography.css`): `--font-size-small` 12, `-label` 13, `-table-head` 13, `-table` 14, `-control` 14, `-body` 15, `-subject-name` 15, `-subject-code` 13, `-metric` 20, `--line-height-table` 1.5, `--line-height-body` 1.55, `--control-min-height` 44px, `--color-muted-text` #555 (dark theme #bca2ac in `.student-dark`).
- **Coordinator** (`coordinator.css`): refactored to tokens; 11px labels/captions moved to 12-13px; reason lists 14px. Otherwise no visual change.
- **Admin** (`admin.css`): all tables (`.admin-table-scroll`) 14px body / 13px headers / tabular-nums; labels and legends 13px; form text and helper copy 14px; pagination and row actions 44px high; invitation dates, group rows and row headers 14px; every 9-11px size became 12px minimum.
- **Student**: `student-shell.css` (base 14px token, kbd), `offerings.css` (table 14/13, subject name before code, prerequisite note 14px; `OfferingsPage.tsx` markup swap), `subject-records-table.css`, `profile.css`, toasts, landing, auth, pathway CSS (labels/captions raised to 12px+; graph zoom unchanged), `sprint2.css` (token for helper text).
- **Guard**: scans visible text via a TreeWalker; fails below 12px, table body below 14px, table headers below 13px. Ignores `aria-hidden`, hidden, `svg`, visually-hidden. Inline chips and secondary lines in cells (pills, ids, code, buttons, status notes, details/pre) only need 12px. `READABILITY_COLLECT=1` lists all offenders instead of throwing. `tools/ui` added to the `lint` script.
- **Docs**: themeguide 5.1, AGENTS.md bullet, CONTRIBUTING.md paragraph, implementationguide checklist item.

Follow-on request on the same branch: shared table toolbar, recorded in [S2-INT-004](S2-INT-004-shared-table-toolbar.md).

### Notes for other owners (styling-only edits)

- **P001** (`profile.css`, `subject-records-table.css`, `sprint2.css`) and **P003** (`pathway.css`): font-size values only; no markup or logic changes. The pathway graph node layout was not redesigned.
- **P002** (`offerings.css`, `OfferingsPage.tsx`): subject cell now renders name (strong) then code (muted span); cell/header sizes tokenised.
- The pre-existing `tools/p001-sprint2/test-ui.mjs` curriculum check (`getByLabel('Curriculum')` timeout) still fails on this branch and was not touched.
- Records tables and landing were converted by token substitution and covered by the guard only where a harness renders them.

## 3. Review

Self-review checklist: scope limited to styling, the one markup swap, docs and tooling; no contracts or API changes; no secrets. Commands run:

- `npm run typecheck` - pass; `npm run lint` - pass; `npm test` - 1366 passed, 59 skipped; `npm run test:integration` - pass.
- `npm run test:ui:admin` - 44 checks pass (guard on); `npm run test:ui:coordinator` - 47 pass; `node tools/integration/test-ui.mjs --installed` - 35 pass; `node tools/pathway/test-ui.mjs` - 9 pass.
- `node tools/p001-sprint2/test-ui.mjs` - 5 pages pass the guard, then the known curriculum check fails (pre-existing).
- `npm run build:cloudflare` - pass.
- Screenshots opened: admin users 1280, admin semesters 1440, coordinator forecast detail, admin users 375, offerings desktop.

## 4. Changelog

- 2026-11-03 — Type: UI/Docs. Added shared typography tokens, mandatory readability guideline (themeguide 5.1) and `tools/ui/readability.mjs` guard; raised table, label, control and badge text sizes across admin, coordinator, student, auth, landing and module screens; subject name now precedes code in the offerings table. Landing, auth and records screens changed by token substitution only (not visually reviewed). Status: MERGED.
