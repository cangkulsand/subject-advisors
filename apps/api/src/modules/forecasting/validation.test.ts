import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORT_CSV_HEADER, IMPORT_LIMITS } from '../../../../../packages/shared/src/forecasting/contracts';
import { csvLine } from './csv';
import { validateImportCsv, type ImportCatalogue } from './validation';

const subject = (id: number, code: string, creditHours = 3) => ({ curriculumSubjectId: id + 1000, subjectId: id, subjectCode: code, subjectName: code, creditHours, classType: null, includeInOfferingForecast: true });
const catalogue = (overrides: Partial<ImportCatalogue> = {}): ImportCatalogue => ({
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [subject(101, 'DEMO101'), subject(102, 'DEMO102'), subject(103, 'DEMO103', 4)] }],
  knownSubjectCodes: new Set(['DEMO101', 'DEMO102', 'DEMO103', 'OTHER900']),
  semesterIds: new Set([1, 2, 3, 1001, 1002]),
  ...overrides,
});
const header = IMPORT_CSV_HEADER.join(',');
const row = (...values: string[]) => csvLine([...values, ...Array(10 - values.length).fill('')]);
const run = (lines: string[], cat = catalogue()) => validateImportCsv(new TextEncoder().encode([header, ...lines].join('\n')), cat);
const errorCodes = (outcome: ReturnType<typeof run>) => outcome.report.issues.filter((i) => i.severity === 'ERROR').map((i) => [i.code, i.row]);
const read = (path: string) => readFileSync('docs/api/examples/forecasting/' + path);

describe('documented examples', () => {
  it('accepts the valid example with only non-blocking warnings', () => {
    const outcome = validateImportCsv(read('uc20-import.valid.example.csv'), catalogue());
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.report.counts).toEqual({ studentRows: 2, uniqueStudents: 2, validAttempts: 1, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 1 });
    expect(outcome.students.map((s) => s.studentName)).toEqual(['Demo Valid One', null]);
    expect(outcome.report.issues.every((i) => i.severity === 'WARNING')).toBe(true);
    expect(outcome.report.subsetAcknowledgementRequired).toBe(false);
    expect(outcome.records).toEqual([{ externalReference: 'DEMO-VALID-001', subjectId: 101, subjectStatus: 'COMPLETED', semesterId: 1001, recognizedCredits: 3, isSynthetic: true }]);
  });
  it('matches the documented correction report for the correction example', () => {
    const expected = JSON.parse(readFileSync('docs/api/examples/forecasting/expected-validation.json', 'utf8')).error.report;
    const outcome = validateImportCsv(read('uc20-import.example.csv'), catalogue());
    expect(outcome.report.status).toBe(expected.status);
    expect(outcome.report.counts).toEqual(expected.counts);
    expect(outcome.report.completenessChanges).toEqual(expected.completenessChanges);
    expect(outcome.report.subsetAcknowledgementRequired).toBe(expected.subsetAcknowledgementRequired);
    type Expected = { severity: string; code: string; row: number; field: string };
    const errors = outcome.report.issues.filter((i) => i.severity === 'ERROR').map((i) => ({ code: i.code, row: i.row, field: i.field }));
    expect(errors).toEqual((expected.issues as Expected[]).filter((i) => i.severity === 'ERROR').map((i) => ({ code: i.code, row: i.row, field: i.field })));
    expect(outcome.report.issues.some((i) => i.code === 'RETAKE_OUTCOME_UNRESOLVED' && i.row === null && i.message.includes('DEMO101'))).toBe(true);
    expect(outcome.students.map((s) => [s.externalReference, s.historyCompleteness])).toEqual([['DEMO-001', 'PARTIAL'], ['DEMO-002', 'UNKNOWN'], ['DEMO-003', 'UNKNOWN']]);
    expect(outcome.records).toHaveLength(2);
    expect(outcome.rejectedRowsByStudent).toEqual({ 'DEMO-001': 1, 'DEMO-003': 1 });
  });
  it('rejects the template alone (no data rows)', () => {
    const outcome = validateImportCsv(read('uc20-import.template.csv'), catalogue());
    expect(outcome.report.status).toBe('FILE_REJECTED');
    expect(outcome.report.issues[0]!.code).toBe('CSV_NO_DATA_ROWS');
  });
});

describe('file-level rejection', () => {
  const reject = (text: string, bytes?: Uint8Array) => validateImportCsv(bytes ?? new TextEncoder().encode(text), catalogue());
  it('rejects empty files, wrong headers, malformed CSV, encodings and column counts', () => {
    expect(reject('').report.issues[0]!.code).toBe('CSV_EMPTY');
    expect(reject('external_reference,curriculum_version\nx,y').report.issues[0]!.code).toBe('CSV_HEADER_INVALID');
    expect(reject(IMPORT_CSV_HEADER.slice().reverse().join(',') + '\n').report.issues[0]!.code).toBe('CSV_HEADER_INVALID');
    expect(reject(header + '\n"unterminated').report.issues[0]).toMatchObject({ code: 'CSV_MALFORMED', row: 2 });
    expect(reject('', new Uint8Array([0xff, 0xff])).report.issues[0]!.code).toBe('CSV_ENCODING_INVALID');
    expect(reject(header + '\nDEMO-1,2024-DEMO,ACTIVE').report.issues[0]).toMatchObject({ code: 'CSV_COLUMN_COUNT', row: 2 });
  });
  it('accepts a BOM, CRLF and padded headers', () => {
    const text = '﻿' + header.split(',').map((h) => ' ' + h + ' ').join(',') + '\r\n' + row('S1', '2024-DEMO', 'ACTIVE', 'UNKNOWN') + '\r\n';
    expect(reject(text).report.status).toBe('VALID');
  });
  it('still accepts the earlier nine-column header and leaves names empty', () => {
    const legacy = IMPORT_CSV_HEADER.slice(0, 9).join(',') + '\nS1,2024-DEMO,ACTIVE,UNKNOWN,,,,,';
    const outcome = reject(legacy);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.students[0]!.studentName).toBeNull();
    expect(reject(legacy.replace('S1,2024-DEMO,ACTIVE,UNKNOWN,,,,,', 'S1,2024-DEMO,ACTIVE,UNKNOWN,,,,,,')).report.issues[0]!.code).toBe('CSV_COLUMN_COUNT');
  });
  it('rejects more than 10,000 data rows', () => {
    const lines = Array.from({ length: IMPORT_LIMITS.maxDataRows + 1 }, (_, i) => row('S' + i, '2024-DEMO', 'ACTIVE', 'UNKNOWN'));
    expect(run(lines).report.issues[0]!.code).toBe('CSV_TOO_MANY_ROWS');
    expect(run(lines.slice(0, IMPORT_LIMITS.maxDataRows)).report.status).toBe('VALID');
  });
});

describe('student and attempt rules', () => {
  it('flags unknown vs out-of-curriculum subject codes and keeps the student as PARTIAL', () => {
    const outcome = run([
      row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'OTHER900', 'COMPLETED', '1', '3', 'false'),
      row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'NOPE', 'COMPLETED', '1', '3', 'false'),
      row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'DEMO101', 'COMPLETED', '1', '3', 'false'),
    ]);
    expect(errorCodes(outcome)).toEqual([['SUBJECT_NOT_IN_CURRICULUM', 2], ['UNKNOWN_SUBJECT_CODE', 3]]);
    expect(outcome.students[0]!.historyCompleteness).toBe('PARTIAL');
    expect(outcome.report.completenessChanges).toEqual([{ externalReference: 'S1', before: 'COMPLETE', after: 'PARTIAL', rejectedRows: 2 }]);
    expect(outcome.records).toHaveLength(1);
    expect(outcome.report.subsetAcknowledgementRequired).toBe(true);
  });
  it('never upgrades PARTIAL or UNKNOWN when history rows are rejected', () => {
    const outcome = run([
      row('P', '2024-DEMO', 'ACTIVE', 'PARTIAL', 'NOPE', 'COMPLETED', '', '', 'true'),
      row('U', '2024-DEMO', 'ACTIVE', 'UNKNOWN', 'NOPE', 'COMPLETED', '', '', 'true'),
    ]);
    expect(outcome.students.map((s) => s.historyCompleteness)).toEqual(['PARTIAL', 'UNKNOWN']);
    expect(outcome.report.completenessChanges).toEqual([]);
    expect(outcome.rejectedRowsByStudent).toEqual({ P: 1, U: 1 });
  });
  it('rejects the whole student group on conflicting metadata without choosing a winner', () => {
    const outcome = run([
      row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'DEMO101', 'COMPLETED', '1', '', 'true'),
      row('S1', '2024-DEMO', 'GRADUATED', 'PARTIAL', 'DEMO102', 'COMPLETED', '1', '', 'true'),
    ]);
    expect(errorCodes(outcome)).toEqual([['STUDENT_METADATA_CONFLICT', 3], ['STUDENT_METADATA_CONFLICT', 3]]);
    expect(outcome.students).toEqual([]);
    expect(outcome.report.counts).toMatchObject({ studentRows: 2, uniqueStudents: 0, rejectedRows: 2 });
    expect(outcome.report.subsetAcknowledgementRequired).toBe(false);
  });
  it('requires an explicit curriculum version when several exist and resolves a blank one when exactly one exists', () => {
    const cat = catalogue({ curricula: [...catalogue().curricula, { curriculumId: 11, curriculumVersion: '2025-DEMO', effectiveYear: 2025, subjects: [] }] });
    expect(errorCodes(run([row('S1', '', 'ACTIVE', 'UNKNOWN')], cat))).toEqual([['CURRICULUM_VERSION_REQUIRED', 2]]);
    expect(errorCodes(run([row('S1', '9999', 'ACTIVE', 'UNKNOWN')]))).toEqual([['CURRICULUM_VERSION_UNKNOWN', 2]]);
    expect(run([row('S1', '', 'ACTIVE', 'UNKNOWN')]).students[0]!.curriculumId).toBe(10);
  });
  it('validates references, cohort status and history completeness', () => {
    expect(errorCodes(run([row('', '2024-DEMO', 'ACTIVE', 'UNKNOWN')]))).toEqual([['EXTERNAL_REFERENCE_REQUIRED', 2]]);
    expect(errorCodes(run([row('x'.repeat(101), '2024-DEMO', 'ACTIVE', 'UNKNOWN')]))).toEqual([['EXTERNAL_REFERENCE_TOO_LONG', 2]]);
    expect(run([row('é'.repeat(100), '2024-DEMO', 'ACTIVE', 'UNKNOWN')]).report.status).toBe('VALID');
    expect(errorCodes(run([row('S', '2024-DEMO', '', 'UNKNOWN')]))).toEqual([['COHORT_STATUS_REQUIRED', 2]]);
    expect(errorCodes(run([row('S', '2024-DEMO', 'X'.repeat(21), 'UNKNOWN')]))).toEqual([['COHORT_STATUS_TOO_LONG', 2]]);
    expect(errorCodes(run([row('S', '2024-DEMO', 'ACTIVE', 'complete')]))).toEqual([['HISTORY_COMPLETENESS_INVALID', 2]]);
  });
  it('stores an optional trimmed student name and validates it as student-level metadata', () => {
    const named = (name: string) => run([row('S', '2024-DEMO', 'ACTIVE', 'UNKNOWN', '', '', '', '', '', name)]);
    expect(named('  Ayu Binti Ali  ').students[0]!.studentName).toBe('Ayu Binti Ali');
    expect(named('').students[0]!.studentName).toBeNull();
    expect(named('N'.repeat(255)).report.status).toBe('VALID');
    expect(errorCodes(named('N'.repeat(256)))).toEqual([['STUDENT_NAME_INVALID', 2]]);
    expect(errorCodes(named('Bad\u0007Name'))).toEqual([['STUDENT_NAME_INVALID', 2]]);
    const conflict = run([row('S', '2024-DEMO', 'ACTIVE', 'UNKNOWN', '', '', '', '', '', 'A'), row('S', '2024-DEMO', 'ACTIVE', 'UNKNOWN', '', '', '', '', '', 'B')]);
    expect(errorCodes(conflict)).toEqual([['STUDENT_METADATA_CONFLICT', 3]]);
  });
  it('validates attempt fields', () => {
    const attempt = (...v: string[]) => errorCodes(run([row('S', '2024-DEMO', 'ACTIVE', 'COMPLETE', ...v)])).map(([c]) => c);
    expect(attempt('DEMO101', 'COMPLETED', '', '', '')).toEqual(['ATTEMPT_INCOMPLETE']);
    expect(attempt('', '', '5', '', 'true')).toEqual(['ATTEMPT_INCOMPLETE', 'ATTEMPT_INCOMPLETE', 'SEMESTER_NOT_FOUND']);
    expect(attempt('DEMO101', 'WITHDRAWN', '', '', 'true')).toEqual(['UNMAPPED_SUBJECT_STATUS']);
    expect(attempt('DEMO101', 'COMPLETED', '0', '', 'true')).toEqual(['SEMESTER_ID_INVALID']);
    expect(attempt('DEMO101', 'COMPLETED', '2147483648', '', 'true')).toEqual(['SEMESTER_ID_INVALID']);
    expect(attempt('DEMO101', 'COMPLETED', '999', '', 'true')).toEqual(['SEMESTER_NOT_FOUND']);
    expect(attempt('DEMO101', 'COMPLETED', '1', '-1', 'true')).toEqual(['RECOGNIZED_CREDITS_INVALID']);
    expect(attempt('DEMO101', 'COMPLETED', '1', '3.5', 'true')).toEqual(['RECOGNIZED_CREDITS_INVALID']);
    expect(attempt('DEMO101', 'COMPLETED', '1', '4', 'true')).toEqual(['RECOGNIZED_CREDITS_EXCEEDS_SUBJECT']);
    expect(attempt('DEMO101', 'FAILED', '1', '1', 'true')).toEqual(['RECOGNIZED_CREDITS_NOT_ALLOWED']);
    expect(attempt('DEMO101', 'IN_PROGRESS', '1', '0', 'true')).toEqual([]);
    expect(attempt('DEMO101', 'COMPLETED', '1', '3', 'TRUE')).toEqual(['IS_SYNTHETIC_INVALID']);
    expect(attempt('demo101', 'COMPLETED', '1', '3', 'true')).toEqual(['UNKNOWN_SUBJECT_CODE']);
  });
  it('rejects conflicting same-semester and duplicate undated attempts and allows different-semester repeats', () => {
    const base = ['S', '2024-DEMO', 'ACTIVE', 'COMPLETE'];
    const outcome = run([
      row(...base, 'DEMO101', 'FAILED', '1', '', 'false'), row(...base, 'DEMO101', 'COMPLETED', '1', '3', 'false'),
      row(...base, 'DEMO102', 'COMPLETED', '', '3', 'false'), row(...base, 'DEMO102', 'COMPLETED', '', '3', 'false'),
      row(...base, 'DEMO103', 'FAILED', '1', '', 'false'), row(...base, 'DEMO103', 'COMPLETED', '2', '4', 'false'),
    ]);
    expect(errorCodes(outcome)).toEqual([['DUPLICATE_ATTEMPT', 2], ['DUPLICATE_ATTEMPT', 3], ['DUPLICATE_ATTEMPT', 4], ['DUPLICATE_ATTEMPT', 5]]);
    expect(outcome.records.map((r) => r.subjectId)).toEqual([103, 103]);
    expect(outcome.report.issues.filter((i) => i.code === 'RETAKE_OUTCOME_UNRESOLVED')).toHaveLength(1);
  });
  it('keeps blank credits and semesters as null, never zero or guessed', () => {
    const outcome = run([row('S', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'DEMO101', 'COMPLETED', '', '', 'true')]);
    expect(outcome.records[0]).toMatchObject({ semesterId: null, recognizedCredits: null, isSynthetic: true });
    const codes = outcome.report.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['SEMESTER_UNKNOWN', 'CREDIT_EVIDENCE_MISSING', 'SYNTHETIC_ATTEMPT', 'STALE_SOURCE_THRESHOLD_NOT_CONFIGURED']));
  });
  it('compares external references case-sensitively', () => {
    expect(run([row('abc', '2024-DEMO', 'ACTIVE', 'UNKNOWN'), row('ABC', '2024-DEMO', 'ACTIVE', 'UNKNOWN')]).report.counts.uniqueStudents).toBe(2);
  });
  it('caps the listed findings but keeps counts exact', () => {
    const lines = Array.from({ length: 700 }, (_, i) => row('S' + i, '2024-DEMO', 'ACTIVE', 'COMPLETE', 'NOPE', 'COMPLETED', '', '', 'true'));
    const outcome = run(lines);
    expect(outcome.report.issues).toHaveLength(IMPORT_LIMITS.maxIssues + 1);
    expect(outcome.report.issues.at(-1)!.code).toBe('ISSUES_TRUNCATED');
    expect(outcome.report.counts.rejectedRows).toBe(700);
    expect(outcome.report.counts.partialStudents).toBe(700);
  });
});
