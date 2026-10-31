# DB-FOUNDATION-002 — Network Security curriculum reference data

- **Status:** READY_FOR_REVIEW — reference data imported and reconciled; curriculum remains INACTIVE; human peer review pending
- **Date:** 2026-10-31
- **Sprint:** Foundation / shared reference data
- **Owner:** DATABASE_FOUNDATION / integration
- **Related UC / FR:** P001 curriculum/profile options, P002 offerings, P003 pathway/prerequisite display; shared reference catalogue
- **Branch / PR:** Shared development workspace; no deployment or Git commit/push
- **Reviewer:** Coordinator review passed; human peer review pending

## 1. Plan

### Objective / problem

Prepare and import the supplied Bachelor of Computer Science (Computer Networks & Security) with Honours (`SECRH`) reference data without renaming shared subjects or changing the existing Software Engineering curriculum, student profiles, records, offerings, plans, or their references. Keep the new curriculum inactive until the separately pending deployment/activation decision is answered.

### Scope and requirements

- In scope: offline source audit and normalized manifest; additive schema support; backward-compatible curriculum consumers; reviewed dry-run importer; target preview, rollback rehearsal, atomic data import, receipt and replay verification.
- Out of scope: activation, deployment, changes to existing academic/student records, semester availability or graduation assessment. No production target was used.
- The user-confirmed minimum is 128 credits and the chosen curriculum version is `English`. These decisions are settled; neither is a pending approval. `effective_year` remains NULL. The label is user-selected, not an institutional certification.

### Source audit and settled decisions

The detailed source is `reference/Codes_Malay_English_Verified.xlsx`, SHA-256 `023BCCDD2BFD128A9CC67F0F302B6DE44EEDD58DFCCB4164CC7738542FBA40CC` (sheets `Kursus Wajib`, `Kursus Elektif`). “Verified” is part of its filename; no institutional verification is claimed. `D:\sharhan\development\UTM Course Tracking.xlsx` (SHA-256 `E526FEA328EDB49AE5E3796DDD903CEEB032396605E57CA0E0EF4ACE1DF68AD2`) corroborates 128 at `Sheet1!I42`; its `D67` cached value is 50 and was not used to derive the degree total. Historical Markdown `D:\sharhan\development\bachelor_of_computer_science_computer_networks_security_curriculum.md` (SHA-256 `0E2A40F4B4256F63737382CE1196064EACC05FD8CAFB0FA25116F39DA8D291DD`) was used only for exact-code English translations and explicit legacy crosswalk evidence.

The workbook has 86 distinct course entries. Only these seven E3 options are excluded from the new curriculum: `SECJ2363`, `SECJ3303`, `SECJ3483`, `SECJ3563`, `SECJ3603`, `SECJ3623`, and `SECJ4423`. They remain in the shared catalogue. The retained source pool has 79 subjects and 195 pool credits; this is not the 128-credit graduation minimum. E3 comprises compulsory `SECR4114` (4 credits) and `SECR4118` (8 credits). E1/E2/U1/U2 requirements are 7, 5, 1, and 1 selections. Selection arithmetic ranges from 127 to 133 and does not establish graduation eligibility.

The workbook's Wajib SEC core is 21 subjects/62 credits; University Compulsory is 10/19; E1 is 8/22; E2 7/18; E3 2/12; U1 24/48; U2 7/14. The detailed prerequisite expressions, strict credit/CGPA conditions, topic-dependent status, name provenance, category mappings and source locations are in the reviewed [English manifest](../../db/reference-data/network-security/english/manifest.json) (SHA-256 `9dfb303e10af42355ed7b4da92391df1fdd82cb6f1a88e1a6b20c13093511c02`). In particular, `SECR3104` preserves all required courses and the `SECD2613 OR SECJ2203` alternative; `SECR3032` retains the >80-credit condition; training retains >92 credits and CGPA >=2; `SECR4973` remains topic-dependent. Workbook “No” means no fixed course edge shown, not proof of unrestricted eligibility.

English course labels were taken from workbook column C or matched by exact code in the historical Markdown. `UHLB1112` uses column C (“English for Academic Communications”); the B26 difference (“English Communication Skills”) is retained as source evidence. `UHIS1022` (“Philosophy and Current Issues”) and `UKXQ2022` (“Co-curriculum”) are prepared display translations under the English-language preference, not official translations. Shared subject names were not globally renamed.

### Proposed mapping and compatibility decisions (implemented)

- `curriculum_subject.display_name` provides curriculum-specific English labels; shared subject names remain unchanged. `prerequisite_details` stores full expressions, conditions, source flags and topic dependence. The P001/P002/P003 consumers are backward-compatible and fail closed on malformed or unresolved prerequisite structures; OR alternatives are not flattened into mandatory edges.
- Source category names and compulsory flags are preserved. Existing University Compulsory entries retain the current UI's “Other” display behavior; they were not relabeled Core or Elective. E3 category handling and `SECR3032` display treatment are implemented. No semester availability or offering-forecast classification is inferred.
- Numeric category requirements remain distinct from the 80-credit PSM-I and 92-credit training entry thresholds. The application does not assess graduation eligibility.

## 2. Implementation

- **Status:** Imported and reconciled on the approved development target; `SECRH` curriculum remains INACTIVE and unselectable pending deployment/activation approval.
- **Schema:** Forward migration `0005_network_security_reference_support.sql` is applied. Migration SHA-256: `ac58ab7856291e60a7b4175d370c6514679870d03c911cbf2b22e4abc6654cc8`. Canonical migrations `0000`–`0005` are applied; none pending. The existing 26-entity/171-column SRS source contract remains intact; 0005 adds two nullable curriculum-subject columns and private `migration_meta.reference_data_imports` metadata. See [schema support record](S1-FOUNDATION-006-network-security-reference-support.md).
- **Target:** Exact approved Neon development project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`. The old SECJ programme 5 / curriculum 1 (version `1`, 131 credits, effective year 2020, status NULL) was preserved. No account, profile, student record, saved plan, or offering data was written.
- **Imported curriculum:** Programme ID 7 (`SECRH`, ACTIVE); curriculum ID 3 (`English`, 128 credits, effective year NULL, INACTIVE). Imported 79 curriculum mappings; 61 shared subjects were reused by exact code/credit and 18 subjects inserted. The 7 required-category rows and 26 unambiguous mandatory edges were inserted. OR and conditional rules remain in full JSON metadata. E3 has both training courses compulsory. No existing global subject names/credits were overwritten.
- **Post-import state:** 96 global subjects; 157 curriculum mappings; 12 requirements; 55 subject_prerequisite rows (29 existing, 26 new); 1 private import receipt. Existing SECJ mappings (78) still have NULL in both new metadata columns. Receipt: `.wrangler/reference-import/committed/2026-10-31T10-11-10.071Z-3c36c3da-eced-47f8-bd66-e80df2a19b72/receipt.json`, SHA-256 `1b23ff59cf4ad10e917c4e0becc910745ba0dee2c5e1930e5b09043ca6e0fca1`.
- **Preview/replay evidence:** Approved preview SHA-256 `603006a2045f4e463afb39d1eaf8d1979000f0a821a24e016b390c9ffa4cd0a1`; manifest SHA-256 above. Fresh post-commit replay SHA-256 `0a0e0e1fd16931b662993aa4b82f085febd7b3812fc02f62538776acf0e5209d`, `replayNoop=true`, zero conflicts. Rollback rehearsal passed before commit and left counts/digest unchanged. The first apply helper call stopped before any database write and before invoking the committing importer after duplicate evidence-file creation; the reviewed retry committed successfully.
- **Detailed records:** [schema support](S1-FOUNDATION-006-network-security-reference-support.md), [importer and receipt](S1-FOUNDATION-007-network-security-reference-import.md), and [consumer compatibility](S1-INT-031-network-security-curriculum-consumers.md).

## 3. Review

- **Self-review checklist:** Scope stayed within the approved reference data, schema and consumer work. Shared subjects retain global names/credits; only the new curriculum received 79 mappings. No student or account data was read or written by the import. No course availability, eligibility engine, graduation decision or official curriculum status was invented.
- **Verification evidence:** Coordinator-reported full `npm test`: 39 files passed, 2 skipped; 524 tests passed, 13 skipped. Full typecheck and Cloudflare build passed. Migration and importer suites each passed 13 tests; `lint:db` and changed-app lint passed. Target-bound rollback rehearsal, atomic apply, no-op replay and post-commit read-only verification passed. Full details are recorded in the linked mini-task records.
- **Review outcome:** Coordinator review and post-commit verification passed. Human peer review remains pending. Git commit/push and deployment have not occurred.
- **Remaining decision:** An asynchronous approval question is pending on whether to deploy the tested application and activate `SECRH`, or keep the curriculum inactive. No activation or deployment is authorized by this record. Keep the imported curriculum INACTIVE until that answer and required operational steps are complete.

## 4. Changelog

- **Date:** 2026-10-31
- **Type:** Changed / Added / Tests
- **Actual changes:** Reconciled the original offline plan with the implemented schema, consumers, importer, committed inactive curriculum, receipt and post-import verification. Preserved the complete source audit and linked detailed implementation records.
- **Compatibility/impact:** Curriculum-specific display names avoid shared subject renames; nullable schema extensions preserve old rows; consumer reads support both old and new schemas. `SECRH` is present but its curriculum is not selectable while INACTIVE.
- **Verification:** Manifest validation, importer/migration tests, lint, full test/typecheck/build, rollback rehearsal, target verify and replay all passed as recorded above and in linked records.
- **Outstanding items:** Human peer review and the user's pending deployment/activation decision. Semester availability, official source certification and graduation assessment remain unspecified; none is asserted here.
- **Final status:** READY_FOR_REVIEW — reference data imported and reconciled; curriculum inactive; human peer review and activation/deployment decision pending.
