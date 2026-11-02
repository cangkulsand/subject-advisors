# S2-P004-010 — UC20 CSV import accepts the coordinator export format

- **Status:** DONE (committed on feature branch)
- **Date:** 2026-11-02
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** UC20 data provision (Package 3); follows [S2-P004-009](S2-P004-009-uc20-data-source-toggle.md) (data source toggle) and [S2-P004-007](S2-P004-007-uc20-forecast-and-confirmation-build.md) (CSV import).
- **Branch / PR:** `feature/p004-s2-uc20-coordinator-csv` (from `feature/p004-s2-uc20-data-source-toggle`); no PR
- **Reviewer:** Coordinator review

## 1. Plan

### Objective / problem

Product owner decision (2026-11-02): the UC20 CSV import must also accept the coordinators' own export (`courseCode, subjCode, centerName, stuname, stuMetricNo, eMail, SemesterMohon, grade, status`), auto-detected from the header row, for both the CSV-only upload and the "Both" upload. The standard template keeps working unchanged. No migration.

### Decisions (product owner, 2026-11-02)

1. **Programme.** The export holds all programmes. Rows whose `courseCode` is not the selected `programme_code` (or a configured alias) are skipped and counted. Aliases live in the interim config (`INTERIM_PROGRAMME_ALIASES = { SECJH: 'SECJ' }`; SECRH maps to itself). Programmes not in the system (SCSEH, SCSJ, SCSR, SCSV ...) are skipped until the subject/degree/faculty registration module exists.
2. **Centre.** `centerName` maps through `INTERIM_CENTRE_ALIASES` (`KUALA LUMPUR` to KL, `JOHOR BAHRU` to JB, `PULAU PINANG` to PENANG) or the centre code itself; other centres are skipped and counted.
3. **Status** (per student, corrected 2026-11-02 after the coordinator reran the real export): status belongs to the student (`stuMetricNo`). Any `N` row makes the student inactive across the whole file and ALL their rows are skipped, including exemption rows with a blank status (the exemptions sheet has no status column; per-row logic brought inactive students back with exemption-only histories). Rows and distinct students are counted. Blank inherits; an all-blank student or a file without a `status` column is active. A value other than `A`/`N`/blank counts as active with a `COORDINATOR_STATUS_UNKNOWN` warning.
4. **Grade.** `A+` to `D+` COMPLETED (credits = catalogue credit hours); `D`, `D-`, `E`, `TS`, `HL`, `T`, `TD` and any other non-blank grade FAILED (0 credits); blank or `NULL` in progress, row skipped and counted (short semester KIV); `EX` / `PENGECUALIAN` EXEMPTED (credits = catalogue credit hours).
5. **Latest attempt only** per student and subject by `SemesterMohon` (`YYYY/YYYY N`; blank oldest); an exemption replaces a non-passed attempt, a COMPLETED attempt wins over an exemption; `record_semester_id` is not set.
6. **Subjects not in the curriculum / unknown codes** are skipped with one WARNING listing codes and counts (KIV), not a row error. The standard format keeps its errors.
7. **Mapping** to the internal model: `external_reference` = `stuMetricNo`, `student_name` = `stuname` (trimmed, one leading apostrophe stripped), blank `curriculum_version`, cohort `ACTIVE`, history `COMPLETE`, not synthetic. `eMail` is ignored: never read, stored or echoed.
8. **Limits.** 20,000 raw data rows for the coordinator format (real export about 11,000); the standard format stays at 10,000; 5 MiB and the 500-issue cap unchanged.
9. **Report** shows the detected format and the skip counts; rendered as a "Coordinator export" summary on the validation report, snapshot result and import detail.
10. **Template and help.** The upload card says both formats are accepted and offers two downloads (coordinator template, standard CSV template).

### Design

- New `apps/api/src/modules/forecasting/coordinator-format.ts` (pure): `detectCoordinatorHeader`, `normaliseCoordinatorRows` (filters, grade mapping, latest-attempt selection, credits from the catalogue), `semesterOrder`, template rows. It returns native-model rows that keep the original CSV row number.
- `validation.ts` `validateImportCsv(bytes, catalogue, context?)` detects the format (standard header first, then coordinator), applies the format-specific row limit, normalises coordinator rows and then runs the unchanged per-student validation. `fileRejected` can carry the export summary (no usable rows for the scope gives `CSV_NO_DATA_ROWS` with the counts).
- `routes.ts` builds the context (programme code, centre code, aliases) from the `ScopeProvider` for both the CSV upload and the combined snapshot; the template route takes `?format=native|coordinator`. `combined-snapshot.ts` carries `format` and `coordinatorExport` into the combined report. Combined matching by matric is unchanged.
- `ScopeProvider` gains `importAliases()` (interim config values).

## 2. Implementation

- **Shared contracts:** `IMPORT_LIMITS.maxCoordinatorDataRows` (20,000); `ImportFileFormat`; `CoordinatorExportSummary`; optional `format` and `coordinatorExport` on `ImportValidationReport` (absent on standard reports); warning code `COORDINATOR_SUBJECTS_SKIPPED` (also removed a duplicated entry in `IMPORT_WARNING_CODES`).
- **API:** files above plus `apps/api/src/config/interim-scope.ts` (aliases, `importAliases()`). Header-invalid message and corrective actions mention both formats; the column-count and too-many-rows messages are generic.
- **Web:** `client.template(format)`, `ImportsPage.tsx` two template buttons, help text, `CoordinatorExportSummaryList`.
- **Docs:** `docs/api/forecasting-uc20.openapi.json` (template `format` parameter and examples, `ImportFileFormat`, `CoordinatorExportSummary`, report fields, format and limit text), `docs/sprint/02/p004/package-1-contracts.md` (new "Coordinator export format" section, endpoint table), `uc20-plan.md` note, synthetic sample `docs/api/examples/forecasting/uc20-import.sample-coordinator.csv` (28 rows, 7 retained students).
- **Known limitations:** with several curricula in a programme coordinator rows need an explicit version (existing `CURRICULUM_VERSION_REQUIRED`), which the export cannot supply. A passed attempt older than a newer failed attempt loses to the newer one (latest attempt rule). The `SEMESTER_UNKNOWN` warning counts all coordinator records because no semester is stored.

## 3. Review

- **Tests added:** `coordinator-format.test.ts` (header detection, every mapping rule, latest-attempt and exemption logic, limits 20,000 / 10,000, e-mail never in output, native report unchanged, documented sample counts); route tests (template formats, coordinator upload, replay, 422 with row numbers, centre alias); combined route test; client template test; browser check "a coordinator export report shows the detected format and skip counts" and template downloads in the harness.
- **Results (local):** `npm run typecheck` pass; `npm run lint` pass (0 warnings); `npm test` 982 passed / 46 skipped (re-run after the per-student status fix); `npm run test:integration` 9 pass / 0 fail; `npm run test:ui:coordinator` 41 checks pass; `npm run test:ui:admin` 32 checks pass; `npm run build:cloudflare` pass.
- **Screenshot** (viewed): `.wrangler/coordinator-review/imports-coordinator-report-desktop.png` shows the CSV card with "Download coordinator template" and "Download CSV template", the both-formats help text, and a validation report with a "Coordinator export" tile list (rows read 11204, other programme 8120, other centre 2450, inactive 31, in progress 212, older attempts 164, subject not in curriculum 187), the codes line, and the `COORDINATOR_SUBJECTS_SKIPPED` warning.
- Real student data was not used; the sample is synthetic.

## 4. Changelog

- **Added.** The UC20 CSV import (CSV-only and "Both") accepts the coordinators' own export, auto-detected from the header: other programmes/centres, inactive and in-progress rows are skipped and counted, grades map to completed/failed/exempted, only the latest attempt per student and subject is used, subjects outside the curriculum are skipped with a warning, the e-mail column is ignored. Up to 20,000 rows for this format. Validation report shows the detected format and skip counts. Coordinator template download (`forecast-import-template?format=coordinator`) next to the standard one. Interim programme and centre aliases in `interim-scope.ts`.
- **Changed.** Upload help text says both formats are accepted; header-invalid message names both formats.
- **Docs.** OpenAPI, package-1-contracts, uc20-plan, synthetic coordinator sample.
