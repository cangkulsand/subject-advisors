import {
  HISTORY_COMPLETENESS, IMPORT_CSV_HEADER, IMPORT_CSV_LEGACY_HEADER, IMPORT_LIMITS, IMPORTED_SUBJECT_STATUSES,
} from '../../../../../packages/shared/src/forecasting/contracts';
import type {
  ClassType, CompletenessChange, HistoryCompleteness, ImportCounts, ImportIssueCode, ImportValidationReport, ValidationIssue,
} from '../../../../../packages/shared/src/forecasting/contracts';
import { CsvFileError, decodeCsvBytes, parseCsv } from './csv';

export interface CatalogueSubject {
  curriculumSubjectId: number; subjectId: number; subjectCode: string; subjectName: string;
  creditHours: number; classType: ClassType; includeInOfferingForecast: boolean;
}
export interface CatalogueCurriculum { curriculumId: number; curriculumVersion: string; effectiveYear: number | null; subjects: CatalogueSubject[] }
/** Configured data one validation run needs. All lookups are exact (no fuzzy matching, no catalogue creation). */
export interface ImportCatalogue {
  programmeId: number;
  curricula: CatalogueCurriculum[];
  /** Every canonical subject code in the catalogue, to tell "unknown" from "not in this curriculum". */
  knownSubjectCodes: ReadonlySet<string>;
  semesterIds: ReadonlySet<number>;
}
export interface StudentToStore { externalReference: string; curriculumId: number; cohortStatus: string; historyCompleteness: HistoryCompleteness; studentName: string | null }
export interface RecordToStore {
  externalReference: string; subjectId: number; subjectStatus: (typeof IMPORTED_SUBJECT_STATUSES)[number];
  semesterId: number | null; recognizedCredits: number | null; isSynthetic: boolean;
}
export type ValidationReportBody = Omit<ImportValidationReport, 'validationId' | 'validationRevision' | 'acceptedSnapshot'>;
export interface ValidationOutcome {
  report: ValidationReportBody;
  students: StudentToStore[];
  records: RecordToStore[];
  rejectedRowsByStudent: Record<string, number>;
  dataRows: number;
}

const INT32_MAX = 2_147_483_647;
const ACTIONS: Record<ImportIssueCode, string> = {
  CSV_ENCODING_INVALID: 'Save the file as UTF-8 CSV and upload it again.',
  CSV_MALFORMED: 'Fix the quoting or line endings at this row and upload again.',
  CSV_EMPTY: 'Upload the CSV template filled with data.',
  CSV_HEADER_INVALID: 'Use the downloaded template header exactly, in the same column order.',
  CSV_COLUMN_COUNT: 'Give every row exactly nine columns (quote values that contain commas).',
  CSV_TOO_MANY_ROWS: 'Split the file so it has at most 10,000 data rows.',
  CSV_NO_DATA_ROWS: 'Add at least one student row below the header.',
  EXTERNAL_REFERENCE_REQUIRED: 'Provide the opaque external reference for this row.',
  EXTERNAL_REFERENCE_TOO_LONG: 'Use an external reference of at most 100 characters.',
  CURRICULUM_VERSION_REQUIRED: 'Provide the curriculum version; the programme has more than one.',
  CURRICULUM_VERSION_UNKNOWN: 'Use a curriculum version configured for the selected programme.',
  COHORT_STATUS_REQUIRED: 'Provide the source cohort status token.',
  COHORT_STATUS_TOO_LONG: 'Use a cohort status token of at most 20 characters.',
  STUDENT_NAME_INVALID: 'Use a student name of at most 255 characters without control characters, or leave it blank.',
  HISTORY_COMPLETENESS_INVALID: 'Use COMPLETE, PARTIAL or UNKNOWN.',
  STUDENT_METADATA_CONFLICT: 'Make the curriculum version, cohort status and history completeness identical on every row of this student.',
  ATTEMPT_INCOMPLETE: 'Fill subject_code, subject_status and is_synthetic, or leave all five attempt fields blank.',
  UNKNOWN_SUBJECT_CODE: 'Use an exact catalogue subject code; unknown codes are never created.',
  SUBJECT_NOT_IN_CURRICULUM: "Use a subject that belongs to this student's curriculum, or correct the curriculum version.",
  UNMAPPED_SUBJECT_STATUS: 'Provide a source-supported mapped status or omit and correct this attempt.',
  SEMESTER_ID_INVALID: 'Use a positive whole-number semester ID or leave it blank.',
  SEMESTER_NOT_FOUND: 'Use a configured semester ID or leave it blank.',
  RECOGNIZED_CREDITS_INVALID: 'Use a nonnegative whole number or leave it blank.',
  RECOGNIZED_CREDITS_EXCEEDS_SUBJECT: "Recognized credits cannot exceed the subject's catalogue credits.",
  RECOGNIZED_CREDITS_NOT_ALLOWED: 'FAILED and IN_PROGRESS attempts allow only blank or 0 recognized credits.',
  IS_SYNTHETIC_INVALID: 'Use exactly true or false.',
  DUPLICATE_ATTEMPT: 'Keep one attempt per subject and semester (one undated attempt per subject).',
  RETAKE_OUTCOME_UNRESOLVED: "Keep this student's result for the subject uncertain until a retake rule is configured.",
  HISTORY_UNKNOWN: 'Eligibility for these students stays uncertain.',
  HISTORY_PARTIAL: 'Eligibility for these students may be uncertain.',
  SYNTHETIC_ATTEMPT: 'Confirm synthetic attempts are intended.',
  SEMESTER_UNKNOWN: 'Dated attempts give better evidence.',
  CREDIT_EVIDENCE_MISSING: 'Credit-based conditions stay uncertain for these attempts.',
  STALE_SOURCE_THRESHOLD_NOT_CONFIGURED: 'No action needed for this import; an administrator may configure a staleness threshold.',
  ISSUES_TRUNCATED: 'Fix the listed findings and upload again to see the rest.',
};

export function emptyCounts(): ImportCounts {
  return { studentRows: 0, uniqueStudents: 0, validAttempts: 0, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 0 };
}
const issue = (severity: 'ERROR' | 'WARNING', code: ImportIssueCode, row: number | null, field: string | null, message: string): ValidationIssue =>
  ({ severity, code, row, field, message, correctiveAction: ACTIONS[code] });

function fileRejected(code: ImportIssueCode, message: string, row: number | null = null, studentRows = 0): ValidationOutcome {
  return {
    report: { status: 'FILE_REJECTED', counts: { ...emptyCounts(), studentRows }, issues: [issue('ERROR', code, row, null, message)], completenessChanges: [], subsetAcknowledgementRequired: false },
    students: [], records: [], rejectedRowsByStudent: {}, dataRows: studentRows,
  };
}

interface Row { row: number; ref: string; version: string; cohort: string; history: string; code: string; status: string; semester: string; credits: string; synthetic: string; name: string }

/** Validates one CSV upload against the programme catalogue. Pure and deterministic. */
export function validateImportCsv(bytes: Uint8Array, catalogue: ImportCatalogue): ValidationOutcome {
  let records;
  try {
    const parsed = parseCsv(decodeCsvBytes(bytes), IMPORT_LIMITS.maxDataRows + 1);
    if (parsed.truncated) return fileRejected('CSV_TOO_MANY_ROWS', 'The file has more than 10,000 data rows.');
    records = parsed.records;
  } catch (error) {
    if (error instanceof CsvFileError) return fileRejected(error.code, error.message, error.row);
    throw error;
  }
  const header = records[0];
  if (!header) return fileRejected('CSV_EMPTY', 'The file is empty.');
  const names = header.fields.map((field) => field.trim());
  // The current template, or the earlier nine-column header (student names then stay blank).
  const expected = [IMPORT_CSV_HEADER, IMPORT_CSV_LEGACY_HEADER].find((candidate) => names.length === candidate.length && names.every((name, index) => name === candidate[index]));
  if (!expected) return fileRejected('CSV_HEADER_INVALID', 'The header must be exactly: ' + IMPORT_CSV_HEADER.join(',') + '.', 1);
  const body = records.slice(1);
  if (!body.length) return fileRejected('CSV_NO_DATA_ROWS', 'The file has a header but no data rows.');
  const rows: Row[] = [];
  for (const record of body) {
    if (record.fields.length !== expected.length) {
      return fileRejected('CSV_COLUMN_COUNT', 'Expected ' + expected.length + ' columns but found ' + record.fields.length + '.', record.row, body.length);
    }
    const [ref, version, cohort, history, code, status, semester, credits, synthetic, name = ''] = record.fields.map((field) => field.trim()) as [string, string, string, string, string, string, string, string, string, string?];
    rows.push({ row: record.row, ref, version, cohort, history, code, status, semester, credits, synthetic, name });
  }

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const rejectedRows = new Set<number>();
  const reject = (row: number, code: ImportIssueCode, field: string | null, message: string) => { rejectedRows.add(row); errors.push(issue('ERROR', code, row, field, message)); };

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.ref) { reject(row.row, 'EXTERNAL_REFERENCE_REQUIRED', 'external_reference', 'external_reference is required.'); continue; }
    const list = groups.get(row.ref);
    if (list) list.push(row); else groups.set(row.ref, [row]);
  }

  const students: StudentToStore[] = [];
  const stored: RecordToStore[] = [];
  const changes: CompletenessChange[] = [];
  const rejectedRowsByStudent: Record<string, number> = {};
  let partialStudents = 0;
  let unknownStudents = 0;
  let syntheticAttempts = 0;
  let undatedAttempts = 0;
  let creditMissing = 0;

  for (const [ref, group] of groups) {
    const first = group[0]!;
    const rejectGroup = () => { for (const row of group) rejectedRows.add(row.row); };
    if (ref.length > IMPORT_LIMITS.maxExternalReferenceLength) {
      errors.push(issue('ERROR', 'EXTERNAL_REFERENCE_TOO_LONG', first.row, 'external_reference', 'external_reference is longer than 100 characters.'));
      rejectGroup(); continue;
    }
    let conflict = false;
    for (const [key, field] of [['version', 'curriculum_version'], ['cohort', 'cohort_status'], ['history', 'history_completeness'], ['name', 'student_name']] as const) {
      const different = group.find((row) => row[key] !== first[key]);
      if (different) {
        conflict = true;
        errors.push(issue('ERROR', 'STUDENT_METADATA_CONFLICT', different.row, field, field + ' differs between rows of the same student; no value is chosen.'));
      }
    }
    if (conflict) { rejectGroup(); continue; }
    let groupError = false;
    const studentError = (code: ImportIssueCode, field: string, message: string) => { groupError = true; errors.push(issue('ERROR', code, first.row, field, message)); };
    let curriculum: CatalogueCurriculum | undefined;
    if (!first.version) {
      if (catalogue.curricula.length === 1) curriculum = catalogue.curricula[0];
      else studentError('CURRICULUM_VERSION_REQUIRED', 'curriculum_version', 'curriculum_version is required because the programme has ' + (catalogue.curricula.length ? 'several curriculum versions' : 'no configured curriculum') + '.');
    } else {
      curriculum = catalogue.curricula.find((item) => item.curriculumVersion === first.version);
      if (!curriculum) studentError('CURRICULUM_VERSION_UNKNOWN', 'curriculum_version', first.version + ' is not a configured curriculum version for this programme.');
    }
    if (!first.cohort) studentError('COHORT_STATUS_REQUIRED', 'cohort_status', 'cohort_status is required.');
    else if (first.cohort.length > IMPORT_LIMITS.maxCohortStatusLength) studentError('COHORT_STATUS_TOO_LONG', 'cohort_status', 'cohort_status is longer than 20 characters.');
    if (first.name.length > IMPORT_LIMITS.maxStudentNameLength || /[\u0000-\u001f\u007f]/.test(first.name)) studentError('STUDENT_NAME_INVALID', 'student_name', 'student_name must be at most 255 characters without control characters.');
    if (!(HISTORY_COMPLETENESS as readonly string[]).includes(first.history)) studentError('HISTORY_COMPLETENESS_INVALID', 'history_completeness', 'history_completeness must be COMPLETE, PARTIAL or UNKNOWN.');
    if (groupError || !curriculum) { rejectGroup(); continue; }

    const subjects = new Map(curriculum.subjects.map((subject) => [subject.subjectCode, subject] as const));
    const valid: Array<{ row: Row; record: RecordToStore }> = [];
    let rejectedForStudent = 0;
    for (const row of group) {
      const noAttempt = !row.code && !row.status && !row.semester && !row.credits && !row.synthetic;
      if (noAttempt) continue;
      const before = errors.length;
      const fail = (code: ImportIssueCode, field: string, message: string) => { errors.push(issue('ERROR', code, row.row, field, message)); };
      for (const [value, field] of [[row.code, 'subject_code'], [row.status, 'subject_status'], [row.synthetic, 'is_synthetic']] as const) {
        if (!value) fail('ATTEMPT_INCOMPLETE', field, field + ' is required when any attempt field is filled.');
      }
      let subject: CatalogueSubject | undefined;
      if (row.code) {
        subject = subjects.get(row.code);
        if (!subject) {
          if (catalogue.knownSubjectCodes.has(row.code)) fail('SUBJECT_NOT_IN_CURRICULUM', 'subject_code', row.code + ' is not in curriculum ' + curriculum.curriculumVersion + '.');
          else fail('UNKNOWN_SUBJECT_CODE', 'subject_code', row.code + ' is not a catalogue subject code.');
        }
      }
      const status = (IMPORTED_SUBJECT_STATUSES as readonly string[]).includes(row.status) ? row.status as RecordToStore['subjectStatus'] : null;
      if (row.status && !status) fail('UNMAPPED_SUBJECT_STATUS', 'subject_status', row.status + ' is not a canonical imported subject status.');
      let semesterId: number | null = null;
      if (row.semester) {
        if (!/^[1-9]\d*$/.test(row.semester) || Number(row.semester) > INT32_MAX) fail('SEMESTER_ID_INVALID', 'record_semester_id', 'record_semester_id must be a positive whole number.');
        else if (!catalogue.semesterIds.has(Number(row.semester))) fail('SEMESTER_NOT_FOUND', 'record_semester_id', 'Semester ' + row.semester + ' is not configured.');
        else semesterId = Number(row.semester);
      }
      let credits: number | null = null;
      if (row.credits) {
        if (!/^\d+$/.test(row.credits) || Number(row.credits) > INT32_MAX) fail('RECOGNIZED_CREDITS_INVALID', 'recognized_credits', 'recognized_credits must be a nonnegative whole number.');
        else {
          credits = Number(row.credits);
          if ((status === 'FAILED' || status === 'IN_PROGRESS') && credits > 0) fail('RECOGNIZED_CREDITS_NOT_ALLOWED', 'recognized_credits', status + ' attempts cannot carry positive recognized credits.');
          else if (subject && credits > subject.creditHours) fail('RECOGNIZED_CREDITS_EXCEEDS_SUBJECT', 'recognized_credits', "recognized_credits exceed the subject's " + subject.creditHours + ' catalogue credits.');
        }
      }
      if (row.synthetic && row.synthetic !== 'true' && row.synthetic !== 'false') fail('IS_SYNTHETIC_INVALID', 'is_synthetic', 'is_synthetic must be exactly true or false.');
      if (errors.length > before || !subject || !status) { rejectedRows.add(row.row); rejectedForStudent += 1; continue; }
      valid.push({ row, record: { externalReference: ref, subjectId: subject.subjectId, subjectStatus: status, semesterId, recognizedCredits: credits, isSynthetic: row.synthetic === 'true' } });
    }
    // Same subject in the same semester (or two undated attempts) conflict; no winner is chosen, so all are rejected.
    const bySlot = new Map<string, typeof valid>();
    for (const item of valid) {
      const slot = item.record.subjectId + '|' + (item.record.semesterId ?? 'undated');
      const list = bySlot.get(slot);
      if (list) list.push(item); else bySlot.set(slot, [item]);
    }
    const kept: typeof valid = [];
    for (const list of bySlot.values()) {
      if (list.length === 1) { kept.push(list[0]!); continue; }
      for (const item of list) {
        reject(item.row.row, 'DUPLICATE_ATTEMPT', 'subject_code', item.row.code + ' has ' + (item.record.semesterId === null ? 'more than one undated attempt' : 'conflicting attempts in the same semester') + '.');
        rejectedForStudent += 1;
      }
    }
    kept.sort((a, b) => a.row.row - b.row.row);
    const perSubject = new Map<string, number>();
    for (const item of kept) perSubject.set(item.row.code, (perSubject.get(item.row.code) ?? 0) + 1);
    for (const [code, count] of perSubject) {
      if (count > 1) warnings.push(issue('WARNING', 'RETAKE_OUTCOME_UNRESOLVED', null, 'subject_code', 'The repeated ' + code + ' attempts of ' + ref + ' have no configured precedence rule.'));
    }
    for (const item of kept) {
      stored.push(item.record);
      if (item.record.isSynthetic) syntheticAttempts += 1;
      if (item.record.semesterId === null) undatedAttempts += 1;
      if (item.record.recognizedCredits === null && (item.record.subjectStatus === 'COMPLETED' || item.record.subjectStatus === 'EXEMPTED')) creditMissing += 1;
    }
    const declared = first.history as HistoryCompleteness;
    let final: HistoryCompleteness = declared;
    if (rejectedForStudent > 0) {
      rejectedRowsByStudent[ref] = rejectedForStudent;
      if (declared === 'COMPLETE') { final = 'PARTIAL'; changes.push({ externalReference: ref, before: 'COMPLETE', after: 'PARTIAL', rejectedRows: rejectedForStudent }); }
    }
    if (final === 'PARTIAL') partialStudents += 1;
    if (final === 'UNKNOWN') unknownStudents += 1;
    students.push({ externalReference: ref, curriculumId: curriculum.curriculumId, cohortStatus: first.cohort, historyCompleteness: final, studentName: first.name || null });
  }

  const aggregate = (count: number, code: ImportIssueCode, field: string, text: string) => {
    if (count > 0) warnings.push(issue('WARNING', code, null, field, count + ' ' + text));
  };
  aggregate(unknownStudents, 'HISTORY_UNKNOWN', 'history_completeness', 'student(s) have unknown history.');
  aggregate(partialStudents, 'HISTORY_PARTIAL', 'history_completeness', 'student(s) have partial history.');
  aggregate(syntheticAttempts, 'SYNTHETIC_ATTEMPT', 'is_synthetic', 'attempt(s) are marked synthetic.');
  aggregate(undatedAttempts, 'SEMESTER_UNKNOWN', 'record_semester_id', 'attempt(s) have no semester.');
  aggregate(creditMissing, 'CREDIT_EVIDENCE_MISSING', 'recognized_credits', 'completed or exempted attempt(s) have no recognized-credit evidence.');
  warnings.push(issue('WARNING', 'STALE_SOURCE_THRESHOLD_NOT_CONFIGURED', null, null, 'No source-age threshold is configured, so the source date is not checked for staleness.'));

  const byRow = (a: ValidationIssue, b: ValidationIssue) => (a.row ?? Number.MAX_SAFE_INTEGER) - (b.row ?? Number.MAX_SAFE_INTEGER);
  errors.sort(byRow);
  const all = [...errors, ...warnings];
  const issues = all.length > IMPORT_LIMITS.maxIssues
    ? [...all.slice(0, IMPORT_LIMITS.maxIssues), issue('WARNING', 'ISSUES_TRUNCATED', null, null, (all.length - IMPORT_LIMITS.maxIssues) + ' further finding(s) are not listed; counts remain complete.')]
    : all;
  const hasErrors = errors.length > 0;
  return {
    report: {
      status: hasErrors ? 'CORRECTION_REQUIRED' : 'VALID',
      counts: { studentRows: rows.length, uniqueStudents: students.length, validAttempts: stored.length, rejectedRows: rejectedRows.size, partialStudents, unknownHistoryStudents: unknownStudents },
      issues, completenessChanges: changes,
      subsetAcknowledgementRequired: hasErrors && students.length > 0,
    },
    students, records: stored, rejectedRowsByStudent, dataRows: rows.length,
  };
}
