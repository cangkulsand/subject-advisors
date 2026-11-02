import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORT_CSV_HEADER, IMPORT_LIMITS } from '../../../../../packages/shared/src/forecasting/contracts';
import { IMPORT_CENTRE_ALIASES, IMPORT_PROGRAMME_ALIASES } from '../../config/import-aliases';
import { COORDINATOR_HEADER, COORDINATOR_TEMPLATE_ROWS, detectCoordinatorHeader, semesterOrder, type ImportFormatContext } from './coordinator-format';
import { csvLine } from './csv';
import { validateImportCsv, type ImportCatalogue } from './validation';

const subject = (id: number, code: string, creditHours = 3) => ({ curriculumSubjectId: id + 1000, subjectId: id, subjectCode: code, subjectName: code, creditHours, classType: null, includeInOfferingForecast: true });
const catalogue = (overrides: Partial<ImportCatalogue> = {}): ImportCatalogue => ({
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [subject(1, 'SECJ1013'), subject(2, 'SECJ1023'), subject(3, 'SECI1013'), subject(4, 'SECP1513', 4), subject(5, 'SECR1013'), subject(6, 'UHLB1112', 2)] }],
  knownSubjectCodes: new Set(['SECJ1013', 'SECJ1023', 'SECI1013', 'SECP1513', 'SECR1013', 'UHLB1112', 'OLD1013']),
  semesterIds: new Set([1, 2, 3]),
  ...overrides,
});
const context: ImportFormatContext = { programmeCode: 'SECJ', centreCode: 'KL', programmeAliases: IMPORT_PROGRAMME_ALIASES, centreAliases: IMPORT_CENTRE_ALIASES };
const header = COORDINATOR_HEADER.join(',');
/** course, subj, centre, name, matric, email, semester, grade, status */
const line = (...v: string[]) => csvLine([...v, ...Array(9 - v.length).fill('')]);
const base = (over: Partial<Record<'course' | 'subj' | 'centre' | 'name' | 'matric' | 'email' | 'sem' | 'grade' | 'status', string>> = {}) => {
  const o = { course: 'SECJH', subj: 'SECJ1013', centre: 'KUALA LUMPUR', name: 'ALI BIN ABU', matric: 'SX230001ECJHF04', email: 'ali@example.com', sem: '2023/2024 1', grade: 'B+', status: 'A', ...over };
  return line(o.course, o.subj, o.centre, o.name, o.matric, o.email, o.sem, o.grade, o.status);
};
const run = (lines: string[], cat = catalogue(), ctx = context, head = header) => validateImportCsv(new TextEncoder().encode([head, ...lines].join('\n')), cat, ctx);
const record = (outcome: ReturnType<typeof run>, code: string) => outcome.records.find((r) => r.subjectId === ({ SECJ1013: 1, SECJ1023: 2, SECI1013: 3, SECP1513: 4, SECR1013: 5, UHLB1112: 6 } as Record<string, number>)[code]);

describe('header detection', () => {
  it('detects the coordinator header case-insensitively, trimmed, in any order, ignoring extra columns', () => {
    expect(detectCoordinatorHeader(COORDINATOR_HEADER)).not.toBeNull();
    expect(detectCoordinatorHeader([' GRADE', 'supervisor', 'STUMETRICNO', 'stuName', 'centername', 'SUBJCODE', 'COURSECODE'])).toMatchObject({ grade: 0, stuMetricNo: 2, courseCode: 6, semesterMohon: -1, status: -1 });
  });
  it('needs every required column and rejects repeated ones', () => {
    expect(detectCoordinatorHeader(['courseCode', 'subjCode', 'centerName', 'stuname', 'stuMetricNo'])).toBeNull();
    expect(detectCoordinatorHeader([...COORDINATOR_HEADER, 'grade'])).toBeNull();
    expect(detectCoordinatorHeader(IMPORT_CSV_HEADER)).toBeNull();
  });
  it('rejects an unknown header with a message naming both formats', () => {
    const outcome = run([], catalogue(), context, 'a,b,c');
    expect(outcome.report.issues[0]).toMatchObject({ code: 'CSV_HEADER_INVALID' });
    expect(outcome.report.issues[0]!.message).toContain('coordinator export');
  });
  it('accepts a reordered header with an extra column and reports the format', () => {
    const outcome = validateImportCsv(new TextEncoder().encode(['supervisor,grade,stuMetricNo,stuname,centerName,subjCode,courseCode', 'DR X,A,S1,Ali,KL,SECJ1013,SECJ'].join('\n')), catalogue(), context);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.report.format).toBe('COORDINATOR');
    expect(outcome.students.map((s) => s.externalReference)).toEqual(['S1']);
  });
});

describe('mapping rules', () => {
  it('maps a row to the native model and trims values, strips one apostrophe, never stores the e-mail', () => {
    const outcome = run([base({ subj: 'SECJ1013 ', matric: 'SX230001ECJHF04 ', name: "'AFIFAH BINTI ALI ", grade: 'B+ ', centre: 'KUALA LUMPUR ' })]);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.students).toEqual([{ externalReference: 'SX230001ECJHF04', curriculumId: 10, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', studentName: 'AFIFAH BINTI ALI' }]);
    expect(outcome.records).toEqual([{ externalReference: 'SX230001ECJHF04', subjectId: 1, subjectStatus: 'COMPLETED', semesterId: null, recognizedCredits: 3, isSynthetic: false }]);
    expect(JSON.stringify(outcome)).not.toContain('example.com');
  });
  it('maps grades: D+ and above complete, D and below, TD and unknown grades fail, EX and PENGECUALIAN exempt', () => {
    const grades: Array<[string, string]> = [['A+', 'COMPLETED'], ['a', 'COMPLETED'], ['A-', 'COMPLETED'], ['B+', 'COMPLETED'], ['B', 'COMPLETED'], ['B-', 'COMPLETED'], ['C+', 'COMPLETED'], ['C', 'COMPLETED'], ['C-', 'COMPLETED'], ['D+', 'COMPLETED'],
      ['D', 'FAILED'], ['D-', 'FAILED'], ['E', 'FAILED'], ['TS', 'FAILED'], ['HL', 'FAILED'], ['T', 'FAILED'], ['TD', 'FAILED'], ['XYZ', 'FAILED'], ['EX', 'EXEMPTED'], ['pengecualian', 'EXEMPTED']];
    for (const [grade, status] of grades) {
      const outcome = run([base({ grade })]);
      expect(outcome.records[0]?.subjectStatus, grade).toBe(status);
      expect(outcome.records[0]?.recognizedCredits, grade).toBe(status === 'FAILED' ? null : 3);
    }
  });
  it('uses the catalogue credit hours for passed and exempted subjects', () => {
    const outcome = run([base({ subj: 'SECP1513', grade: 'A' }), base({ subj: 'UHLB1112', grade: 'EX', sem: '' })]);
    expect(record(outcome, 'SECP1513')!.recognizedCredits).toBe(4);
    expect(record(outcome, 'UHLB1112')).toMatchObject({ subjectStatus: 'EXEMPTED', recognizedCredits: 2 });
  });
  it('skips blank and NULL grades as in progress', () => {
    const outcome = run([base({ grade: 'NULL' }), base({ subj: 'SECJ1023', grade: '' }), base({ subj: 'SECI1013', grade: 'A' })]);
    expect(outcome.report.coordinatorExport).toMatchObject({ rowsRead: 3, skippedInProgress: 2 });
    expect(outcome.records).toHaveLength(1);
  });
  it('treats status as a property of the student: an N student is skipped with ALL rows, including blank-status exemptions', () => {
    const outcome = run([base({ status: 'N', matric: 'N1' }), base({ subj: 'SECJ1023', grade: 'EX', sem: '', status: '', matric: 'N1' }), base({ subj: 'SECI1013', grade: 'EX', sem: '', status: 'x', matric: 'N1' }), base({ matric: 'OK1' })]);
    expect(outcome.report.coordinatorExport).toMatchObject({ skippedInactive: 3, skippedInactiveStudents: 1 });
    expect(outcome.students.map((s) => s.externalReference)).toEqual(['OK1']);
    expect(outcome.records).toHaveLength(1);
  });
  it('keeps an inactive student inactive wherever the N row sits in the file', () => {
    const outcome = run([base({ grade: 'EX', sem: '', status: '', matric: 'N1' }), base({ subj: 'SECJ1023', status: 'N', matric: 'N1' })]);
    expect(outcome.report.status).toBe('FILE_REJECTED');
    expect(outcome.report.coordinatorExport).toMatchObject({ skippedInactive: 2, skippedInactiveStudents: 1 });
  });
  it('treats students whose rows are all blank, or mixed A and blank, as active, and a missing status column as active', () => {
    const outcome = run([base({ status: '', matric: 'B1' }), base({ subj: 'SECJ1023', status: '', matric: 'B1' }), base({ status: 'A', matric: 'M1' }), base({ subj: 'SECJ1023', grade: 'EX', sem: '', status: '', matric: 'M1' })]);
    expect(outcome.report.coordinatorExport).toMatchObject({ skippedInactive: 0, skippedInactiveStudents: 0, unknownStatusRows: 0 });
    expect(outcome.students.map((s) => s.externalReference)).toEqual(['B1', 'M1']);
    expect(outcome.records).toHaveLength(4);
    const noStatusColumn = validateImportCsv(new TextEncoder().encode('courseCode,subjCode,centerName,stuname,stuMetricNo,grade\nSECJ,SECJ1013,KL,Ali,S1,A'), catalogue(), context);
    expect(noStatusColumn.records).toHaveLength(1);
  });
  it('treats an unknown status as active with a warning that lists the values', () => {
    const outcome = run([base({ status: 'Z', matric: 'U1' }), base({ subj: 'SECJ1023', status: 'z', matric: 'U2' }), base({ status: 'Y', matric: 'U3' })]);
    expect(outcome.students).toHaveLength(3);
    expect(outcome.report.coordinatorExport).toMatchObject({ unknownStatusRows: 3, unknownStatusValues: [{ value: 'Z', count: 2 }, { value: 'Y', count: 1 }] });
    const warning = outcome.report.issues.find((i) => i.code === 'COORDINATOR_STATUS_UNKNOWN')!;
    expect(warning.severity).toBe('WARNING');
    expect(warning.message).toContain('Z (2)');
  });
  it('skips other programmes (exact code or alias) and counts them, not as errors', () => {
    const outcome = run([base({ course: 'SECJH' }), base({ course: 'SECJ', subj: 'SECJ1023' }), base({ course: 'SCSJ', subj: 'SECI1013' }), base({ course: 'SECRH', subj: 'SECP1513' })]);
    expect(outcome.report.coordinatorExport).toMatchObject({ rowsRead: 4, skippedOtherProgramme: 2 });
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.records).toHaveLength(2);
    const secrh = run([base({ course: 'SECRH' })], catalogue(), { ...context, programmeCode: 'SECRH' });
    expect(secrh.records).toHaveLength(1);
  });
  it('maps centre names and codes to the selected centre and skips other centres', () => {
    const outcome = run([base({ centre: 'KUALA LUMPUR' }), base({ centre: 'kl', subj: 'SECJ1023' }), base({ centre: 'JOHOR BAHRU', subj: 'SECI1013' }), base({ centre: 'PULAU PINANG', subj: 'SECP1513' }), base({ centre: 'SOMEWHERE', subj: 'SECR1013' })]);
    expect(outcome.report.coordinatorExport).toMatchObject({ skippedOtherCentre: 3 });
    expect(outcome.records).toHaveLength(2);
    expect(run([base({ centre: 'PULAU PINANG' })], catalogue(), { ...context, centreCode: 'PENANG' }).records).toHaveLength(1);
  });
  it('skips subjects outside the curriculum with one warning listing codes and counts, not row errors', () => {
    const outcome = run([base({ subj: 'ULRS1022' }), base({ subj: 'ULRS1022', matric: 'S2' }), base({ subj: 'OLD1013' }), base({ subj: 'SECJ1023' })]);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.report.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
    expect(outcome.report.coordinatorExport).toMatchObject({ skippedSubjectNotInCurriculum: 3, subjectsNotInCurriculum: [{ code: 'ULRS1022', count: 2 }, { code: 'OLD1013', count: 1 }] });
    const warning = outcome.report.issues.find((i) => i.code === 'COORDINATOR_SUBJECTS_SKIPPED')!;
    expect(warning.severity).toBe('WARNING');
    expect(warning.message).toContain('ULRS1022 (2)');
    expect(outcome.students).toHaveLength(1); // S2 had no usable row
  });
  it('asks for the curriculum version when the programme has several curricula', () => {
    const cat = catalogue();
    cat.curricula.push({ ...cat.curricula[0]!, curriculumId: 11, curriculumVersion: '2025-DEMO' });
    const outcome = run([base()], cat);
    expect(outcome.report.status).toBe('CORRECTION_REQUIRED');
    expect(outcome.report.issues.find((i) => i.severity === 'ERROR')).toMatchObject({ code: 'CURRICULUM_VERSION_REQUIRED', row: 2 });
  });
  it('keeps issue row numbers from the uploaded file', () => {
    const outcome = run([base({ course: 'SCSJ' }), base({ matric: '' })]);
    expect(outcome.report.issues.find((i) => i.severity === 'ERROR')).toMatchObject({ code: 'EXTERNAL_REFERENCE_REQUIRED', row: 3 });
  });
  it('uses one cleaned name per student even when rows spell it differently', () => {
    const outcome = run([base({ name: "'ALI BIN ABU" }), base({ name: 'ALI BIN ABU', subj: 'SECJ1023' })]);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.students[0]!.studentName).toBe('ALI BIN ABU');
  });
});

describe('latest attempt only', () => {
  it('orders semesters by year then number, blank oldest', () => {
    expect(semesterOrder('2023/2024 2')).toBeGreaterThan(semesterOrder('2023/2024 1'));
    expect(semesterOrder('2024/2025 1')).toBeGreaterThan(semesterOrder('2023/2024 3'));
    expect(semesterOrder('')).toBeLessThan(semesterOrder('2000/2001 1'));
  });
  it('keeps the retake over an older failed attempt, in any file order, and counts the dropped one', () => {
    for (const lines of [[base({ grade: 'D', sem: '2023/2024 1' }), base({ grade: 'C', sem: '2024/2025 1' })], [base({ grade: 'C', sem: '2024/2025 1' }), base({ grade: 'D', sem: '2023/2024 1' })]]) {
      const outcome = run(lines);
      expect(outcome.records).toHaveLength(1);
      expect(outcome.records[0]).toMatchObject({ subjectStatus: 'COMPLETED' });
      expect(outcome.report.coordinatorExport!.olderAttemptsDropped).toBe(1);
      expect(outcome.report.issues.some((i) => i.code === 'RETAKE_OUTCOME_UNRESOLVED' || i.code === 'DUPLICATE_ATTEMPT')).toBe(false);
    }
  });
  it('lets a newer attempt win, and a blank semester sorts oldest', () => {
    expect(run([base({ grade: 'A', sem: '2023/2024 1' }), base({ grade: 'E', sem: '2023/2024 2' })]).records[0]!.subjectStatus).toBe('FAILED');
    expect(run([base({ grade: 'A', sem: '' }), base({ grade: 'E', sem: '2020/2021 1' })]).records[0]!.subjectStatus).toBe('FAILED');
  });
  it('lets an exemption replace a failed attempt, but a COMPLETED attempt wins over an exemption', () => {
    const replaced = run([base({ grade: 'E', sem: '2024/2025 1' }), base({ grade: 'EX', sem: '' })]);
    expect(replaced.records).toHaveLength(1);
    expect(replaced.records[0]).toMatchObject({ subjectStatus: 'EXEMPTED', recognizedCredits: 3 });
    const passed = run([base({ grade: 'EX', sem: '' }), base({ grade: 'D+', sem: '2022/2023 1' })]);
    expect(passed.records[0]).toMatchObject({ subjectStatus: 'COMPLETED' });
    expect(passed.report.coordinatorExport!.olderAttemptsDropped).toBe(1);
  });
});

describe('limits', () => {
  it('accepts up to 20,000 raw rows and rejects more', () => {
    const lines = Array.from({ length: IMPORT_LIMITS.maxCoordinatorDataRows }, (_, i) => base({ course: i % 2 ? 'SCSJ' : 'SECJH', matric: 'S' + i }));
    const ok = run(lines);
    expect(ok.report.status).toBe('VALID');
    expect(ok.report.coordinatorExport!.rowsRead).toBe(20_000);
    const tooMany = run([...lines, base({ matric: 'EXTRA' })]);
    expect(tooMany.report.issues[0]).toMatchObject({ code: 'CSV_TOO_MANY_ROWS' });
    expect(tooMany.report.issues[0]!.message).toContain('20,000');
  });
  it('keeps the native limit at 10,000 data rows', () => {
    const nativeRow = (i: number) => csvLine(['S' + i, '2024-DEMO', 'ACTIVE', 'UNKNOWN', '', '', '', '', '', '']);
    const text = (n: number) => new TextEncoder().encode([IMPORT_CSV_HEADER.join(','), ...Array.from({ length: n }, (_, i) => nativeRow(i))].join('\n'));
    expect(validateImportCsv(text(IMPORT_LIMITS.maxDataRows + 1), catalogue()).report.issues[0]).toMatchObject({ code: 'CSV_TOO_MANY_ROWS' });
    expect(validateImportCsv(text(IMPORT_LIMITS.maxDataRows), catalogue()).report.status).toBe('VALID');
  });
  it('rejects a file with no usable rows for the scope but still reports the skip counts', () => {
    const outcome = run([base({ course: 'SCSJ' })]);
    expect(outcome.report.status).toBe('FILE_REJECTED');
    expect(outcome.report.issues[0]!.code).toBe('CSV_NO_DATA_ROWS');
    expect(outcome.report.coordinatorExport).toMatchObject({ rowsRead: 1, skippedOtherProgramme: 1 });
  });
  it('rejects rows whose column count differs from the header', () => {
    expect(run([base() + ',extra']).report.issues[0]).toMatchObject({ code: 'CSV_COLUMN_COUNT', row: 2 });
  });
});

describe('privacy and native format', () => {
  it('never echoes the e-mail address in the report or stored data', () => {
    const outcome = run([base({ email: 'secret.person@example.org', course: 'SCSJ' }), base({ email: 'other.person@example.org', subj: 'ULRS1022' }), base({ email: 'third@example.org', subj: 'NOPE', grade: 'E' })]);
    expect(JSON.stringify(outcome)).not.toMatch(/example\.org|secret\.person/);
  });
  it('leaves native reports without the coordinator fields', () => {
    const outcome = validateImportCsv(new TextEncoder().encode(IMPORT_CSV_HEADER.join(',') + '\n' + csvLine(['S1', '2024-DEMO', 'ACTIVE', 'UNKNOWN', '', '', '', '', '', ''])), catalogue(), context);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.report).not.toHaveProperty('format');
    expect(outcome.report).not.toHaveProperty('coordinatorExport');
  });
  it('validates the shipped template rows', () => {
    const outcome = validateImportCsv(new TextEncoder().encode(COORDINATOR_TEMPLATE_ROWS.map(csvLine).join('\n')), catalogue(), context);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.records.map((r) => r.subjectStatus)).toEqual(['COMPLETED']);
  });
});

describe('synthetic coordinator sample', () => {
  it('imports the documented sample with the documented skip counts', () => {
    const outcome = validateImportCsv(readFileSync('docs/api/examples/forecasting/uc20-import.sample-coordinator.csv'), catalogue(), context);
    expect(outcome.report.status).toBe('VALID');
    expect(outcome.report.coordinatorExport).toEqual({
      rowsRead: 29, skippedOtherProgramme: 2, skippedOtherCentre: 2, skippedInactive: 2, skippedInactiveStudents: 1, unknownStatusRows: 0, unknownStatusValues: [], skippedInProgress: 1, olderAttemptsDropped: 1,
      skippedSubjectNotInCurriculum: 2, subjectsNotInCurriculum: [{ code: 'ULRF2XX2', count: 1 }, { code: 'ULRS1022', count: 1 }],
    });
    expect(outcome.students).toHaveLength(7);
    expect(outcome.records).toHaveLength(19);
    expect(outcome.records.filter((r) => r.subjectStatus === 'EXEMPTED')).toHaveLength(2);
    expect(JSON.stringify(outcome)).not.toContain('example.invalid');
  });
});
