# S2-P004-009 — UC20 data source toggle and combined snapshot (MT9)

- **Status:** DONE (committed on feature branch)
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 data provision (Package 3), follows MT8 of [S2-P004-007](S2-P004-007-uc20-forecast-and-confirmation-build.md) and the data-source decision in [S2-P004-006](S2-P004-006-confirmed-offerings-rule.md). S2-P004-008 is reserved for the admin academic-setup package.
- **Branch / PR:** `feature/p004-s2-uc20-data-source-toggle`; no PR
- **Reviewer:** Coordinator review

## 1. Plan

### Objective / problem

Product owner decisions (2026-11-02): the coordinator chooses the data source per forecast, on `/coordinator/imports`, with a three-option toggle. It is a coordinator choice, not an admin setting.

- **Students in the system** (default): the MT8 system snapshot.
- **CSV import**: the existing upload / validate / subset-accept flow.
- **Both**: one COMBINED snapshot = the system students (same selection and mapping as MT8) plus the uploaded-CSV students who are not already in the system. One snapshot, one forecast.

The single-source flows must behave exactly as now. No migration.

### Design

- **Toggle.** A radio group (`role="radiogroup"` semantics through real `<input type="radio">` in a `fieldset`/`legend`, styled as a segmented control). The mode is kept in the URL query (`source=system|csv|both`, absent means system) next to the scope. Each mode renders only its own card; the accepted-imports list and the import detail are shown in every mode.
- **Duplicate rule ("Both").** The SYSTEM record always wins; the CSV student is skipped.
  - Match key: CSV `external_reference` equals the system student's `matric_no`, compared trimmed and case-insensitively, and only when that matric_no is non-empty and unique among the selected system students (a matric shared by two selected system students never matches).
  - A CSV reference equal to a system `PORTAL-<id>` reference (case-insensitive) is the same student and is skipped as well (it would otherwise collide on the per-batch unique reference).
  - If a CSV `student_name` equals a system student's name after normalisation (trim, collapse whitespace, case-fold) but the references differ, the student is INCLUDED and a `POSSIBLE_DUPLICATE_STUDENT` WARNING is reported. Never merged on name.
  - Matric numbers are used only in memory for matching; they are not stored in the snapshot (MT8 privacy rule unchanged), only the effect (skipped references) is.
- **Endpoint.** `POST /api/coordinator/forecast-imports/combined-snapshots`, multipart (`file` + `programmeId`, `learningCentreId`, `targetSemesterId`, `sourceDate`, `sourceLabel`), the same reader and limits as the CSV upload.
  - Valid CSV: 201 with an ACCEPTED `AcceptedImport` (`source: 'COMBINED'`).
  - Same fingerprint in the same scope: 200 replay.
  - Rows to correct: 422 `IMPORT_CORRECTION_REQUIRED` with the report and an ETag, exactly like the CSV flow.
- **Subset acceptance (choice).** The existing `POST /forecast-imports/{validationId}/subset-acceptances` is reused unchanged. The combined batch is stored as VALIDATED with the final combined students and records already in it (system selection frozen at that moment, CSV rejected groups left out); accepting only flips VALIDATED to ACCEPTED, guarded by the same uploader check, scope, `If-Match` revision and acknowledgement. A parallel endpoint would need a second multipart round-trip or a server-side copy of the file and would add nothing; the revision already covers the fingerprint, so the accepted data is exactly what was validated.
- **Source model.** `ImportSource = 'CSV' | 'SYSTEM' | 'COMBINED'` (`validation_summary.source` and `internal.source = 'COMBINED'`). `validation_summary.internal.sourceByReference` maps every retained reference to `'SYSTEM' | 'CSV'`. The roster read returns `source` per student (`'SYSTEM' | 'CSV'`): from the map for COMBINED, all SYSTEM for a system snapshot, all CSV otherwise.
- **History.** System students: COMPLETE with records, UNKNOWN without (as MT8). CSV students: as given (rejected-row downgrade as in the CSV flow).
- **Fingerprint.** sha256 of the CSV bytes' hash, the MT8 system-data fingerprint, the scope, and the in-memory matric match table (reference plus normalised matric of the unique-matric system students). Independent of date, label and actor. The same inputs replay.
- **Coverage.** `validationReport.coverage` (system part, as MT8) plus `validationReport.combined`: `csv {rows, students, rejectedRows}`, `students` (total), `csvSkippedAlreadyInSystem` (references), `possibleDuplicates [{csvReference, systemReferences}]`.
- **Runs.** Generate, review, finalize and confirm are unchanged. `ForecastRunDetail.dataSource` reads `COMBINED`; the run screen shows "Combined: student-entered records + CSV import".
- **Code.** New `apps/api/src/modules/forecasting/combined-snapshot.ts` (pure merge and summary); `routes.ts` glue; `repository.ts` reads `matric_no`; `import-source.ts`.

### Docs

OpenAPI, package-1-contracts (data sources), uc20-plan section 3, S2-P004-006 "Decided 2026-11-02" note, this record.

### Tests and verification

Route tests with fakes (happy path, matric skip, name warning, correction then subset, replay, scope and role), gated DB test on a disposable local Postgres, client tests, browser harness (toggle, per-mode cards, combined flow, mobile 320/375), then typecheck, lint, `npm test`, `test:integration`, `build:cloudflare`, `test:ui:coordinator`, `test:ui:admin`.

## 2. Implementation

- **Shared contracts** (`packages/shared/src/forecasting/contracts.ts`): `ImportSource` gains `COMBINED`; `StudentSource`; `CombinedSnapshotCoverage`; `ImportValidationReport.combined`; `ImportedStudentSummary.source`; `StoredValidationInternals.source` may be `COMBINED` and carries `sourceByReference`; warning codes `POSSIBLE_DUPLICATE_STUDENT`, `CSV_STUDENTS_ALREADY_IN_SYSTEM`.
- **API** (`apps/api/src/modules/forecasting/`): new `combined-snapshot.ts` (pure matching, fingerprint, summary); `routes.ts` `combinedSnapshot` and the route; `system-snapshot.ts` keeps the in-memory matric per system reference; `repository.ts` reads `student_profile.matric_no` (read-only, never stored); `import-source.ts` (`sourceOf`, `studentSourceOf`); `runs-view.ts` (`dataSource` COMBINED); `validation.ts` exports `issue` and the two new corrective actions. No migration.
- **Endpoint:** `POST /api/coordinator/forecast-imports/combined-snapshots` (multipart). Subset acceptance reuses `POST .../{validationId}/subset-acceptances` (see Plan for why).
- **Web:** `ImportsPage.tsx` radio-group toggle (`source=csv|both` in the URL, default system, kept across scope changes, roster links and back link), one card per mode, combined coverage in the result, report, import detail and roster (Source column); `client.ts` `uploadCombined`; `ForecastsPage.tsx` "Combined: student-entered records + CSV import."; `coordinator.css` segmented control; ScopePicker `keep` prop.
- **Docs:** OpenAPI (new operation, `COMBINED`, `StudentSource`, `CombinedSnapshotCoverage`, roster `source`), package-1-contracts, uc20-plan section 3, S2-P004-006 "Decided 2026-11-02 (MT9)".
- **Known limitation:** the CSV warnings that aggregate counts (for example "N students have unknown history") are computed on the whole CSV before the merge, so they may include CSV students later skipped as already in the system. The report counts and coverage are computed after the merge.

## 3. Review

- **Tests added:** `combined-snapshot.test.ts` (11 route tests: happy path, matric skip with system winning, non-unique and unselected matrics, PORTAL reference skip, name-only warning, no system students, replay and changes, 422 + ETag + If-Match then subset acceptance, rejected file, roster source, role and scope); run-detail `COMBINED` source; client `uploadCombined`; gated DB test; browser checks (toggle keyboard + per-mode cards + URL, combined flow with coverage and roster, correction + subset, mobile 320 and 375).
- **Gated DB test** (`FORECASTING_TEST_DATABASE_URL`): disposable Postgres 18 container `uc20-mt9-pg` (port 55449, migrations 0000-0007 via `tools/db/cli.mjs`), removed afterwards. Forecasting folder with the database: 8 files, 158 tests passed, including the new combined test (matric overlap skipped, name overlap kept, per-student source map, roster source, replay, 422 then subset acceptance, generate-run, student tables unchanged). Neon was not touched.
- **Without the database:** `npm run typecheck` pass; `npm run lint` pass (0 warnings); `npm test` 945 passed / 46 skipped (baseline 933 / 45); `npm run test:integration` 9 pass / 0 fail; `npm run build:cloudflare` pass; `npm run test:ui:coordinator` 36 checks pass (31 before); `npm run test:ui:admin` 32 checks pass.
- **Screenshots** (`.wrangler/coordinator-review/`, viewed): `imports-toggle-desktop.png`, `imports-combined-desktop.png`, `imports-combined-mobile.png` (375), `imports-toggle-mobile-320.png`. A first desktop view showed the fieldset legend straddling the card border; fixed (legend floated inside the card) and re-viewed.

- **Coordinator review (2026-11-02):** passed. Reran typecheck, lint, `npm test` 945 passed / 46 skipped, test:integration 9/0, `test:ui:coordinator` 36 PASS, `test:ui:admin` 32 PASS, build:cloudflare OK; viewed `imports-combined-desktop.png`. No SQL changed; Neon development unchanged.

### UI revision (one card + radio buttons)

User feedback: group the setup in one card, and use radio buttons only for the data source (programme and learning centre stay dropdowns).

- Data Imports: one "Forecast data setup" card holds the scope (Programme and Learning centre selects plus the read-only target semester, in the original 3-column grid), the data source radio group and the action area of the chosen source (Create snapshot, or the CSV / combined form), separated by thin dividers. The redundant Programme/Learning centre boxes in the system section were removed. Snapshot result, validation report, Accepted imports and the import detail stay as separate cards.
- Class Offering Forecast: one "Forecast scope" card holds the scope selects and the Forecasts list. The run detail view is unchanged.
- Radio style: the existing tile look is kept for the data source only, but each tile now shows a large (22px) native radio circle with a filled brand dot when checked. They are real `input type=radio` in a `fieldset`/`legend` (one tab stop, arrow keys, whole tile clickable, focus ring). URL behaviour (`replace`, `skipUnsaved`, `keep`, `?source=`) is unchanged.
- Code: `ScopeFields` (card-less selects grid) is shared by `ScopePicker` (which only wraps it in its card, still used by Offering Decisions, unchanged) and by the Imports and Forecasts setup cards; `RadioGroup` is used for the data source only. The import workspace is no longer keyed by scope, so focus survives a scope change; its results reset when the scope or source changes.
- Tests: `tools/coordinator/test-ui.mjs` keeps the selects for scope and the radios for the data source; screenshots refreshed in `.wrangler/coordinator-review/`.

- Forecast detail: the "Excluded subjects" and "Not offered in this semester type" cards are removed from the page (JSX and their CSS); the data is unchanged and those subjects were already filtered out of the Subjects table. The Subjects table is paged client-side, 20 per page, with the admin pager look ("N subjects · Page x of y", Previous/Next, hidden when one page is enough). Page state lives in the table, so row actions and reloads keep the page. After a finalize attempt with unreviewed subjects, the table jumps to the page of the first pending subject so the highlight is visible.
- Forecast detail Subjects table: client-side search (code or name), filters (class type, decision, flags: below minimum / below optimal / configuration required / has uncertain students), a "Sort by" select (subject code A-Z default, potential demand, uncertain, near graduation, proposed sections) and "Clear filters", in an `admin-filters` toolbar. Sorting is by the select only (no sortable column headers). Any filter or sort change returns to page 1; the pager reads "N of M subjects"; an empty result shows "No subjects match these filters" with a clear button. The Subjects summary tile stays the unfiltered count. After a failed finalize, filters and sort are reset and the table jumps to the page of the first pending subject.

## 4. Changelog

- **Added.** Data source toggle on `/coordinator/imports` (Students in the system default, CSV import, Both); `POST /api/coordinator/forecast-imports/combined-snapshots`; COMBINED snapshots (system students plus CSV students not already in the system, system wins on matric match, same-name warning); per-student `source` on the roster read; combined coverage; run detail data source "Combined: student-entered records + CSV import."
- **Changed.** `ImportSource` is `CSV | SYSTEM | COMBINED`; the CSV card is no longer labelled a fallback. Single-source flows are unchanged.
- **Docs.** OpenAPI, package-1-contracts, uc20-plan section 3, S2-P004-006.
- UI revision: Data Imports and Class Offering Forecast now use one setup card; the data source uses large radio tiles, programme and learning centre stay dropdowns.
- UI revision: forecast detail no longer shows the excluded / not-offered cards, and its Subjects table is paged (20 per page).
- UI revision: forecast detail Subjects table has search, class type / decision / flag filters and sorting (client-side only).
