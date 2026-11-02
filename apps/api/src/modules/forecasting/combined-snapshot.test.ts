import { describe, expect, it, vi } from 'vitest';
import { IMPORT_CSV_HEADER } from '../../../../../packages/shared/src/forecasting/contracts';
import { interimScopeProvider, type ScopeProvider } from '../../config/interim-scope';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow, PortalStudentSelection, ProgrammeCatalogue, StoreImportInput } from './contracts';
import { normaliseMatric, normaliseName } from './combined-snapshot';
import { handleForecastingRequest } from './routes';

const COORDINATOR = 'user_coord';
const BASE = 'https://test.invalid/api/coordinator/';
const catalogue: ProgrammeCatalogue = {
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [
    { curriculumSubjectId: 1101, subjectId: 101, subjectCode: 'DEMO101', subjectName: 'Demo', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true },
    { curriculumSubjectId: 1102, subjectId: 102, subjectCode: 'DEMO102', subjectName: 'Demo two', creditHours: 3, classType: null, includeInOfferingForecast: true },
  ] }],
  prerequisites: [], knownSubjectCodes: new Set(['DEMO101', 'DEMO102']), semesterIds: new Set([1, 2, 3]),
};
const semesters = [1, 2, 3].map((n) => ({ semesterId: n, academicYear: '2026/2027', semesterNumber: n as 1 | 2 | 3 }));

/** Matric numbers: Alya A100, Jay B200, Nora none, Dee and Eli share DUP1 (not unique), Sam (suspended, not selected) S900. */
const selection = (): PortalStudentSelection => ({
  students: [
    { studentId: 1, studentName: 'Alya Rahman', matricNo: 'A100', curriculumId: 10, eligible: true },
    { studentId: 2, studentName: 'Suspended Sam', matricNo: 'S900', curriculumId: 10, eligible: false },
    { studentId: 3, studentName: 'Nora (no records)', matricNo: null, curriculumId: 10, eligible: true },
    { studentId: 4, studentName: 'Johor Jay', matricNo: 'B200', curriculumId: 10, eligible: true },
    { studentId: 5, studentName: 'Dee', matricNo: 'DUP1', curriculumId: 10, eligible: true },
    { studentId: 6, studentName: 'Eli', matricNo: ' dup1 ', curriculumId: 10, eligible: true },
  ],
  records: [
    { studentId: 1, subjectId: 101, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 },
    { studentId: 4, subjectId: 101, status: 'FAILED', semesterId: 1, recognizedCredits: 0 },
    { studentId: 5, subjectId: 102, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 },
  ],
  otherProgrammeStudents: 2,
});

function fixture(options: { roles?: ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[]; scopes?: ScopeProvider; data?: PortalStudentSelection } = {}) {
  const roles = options.roles ?? ['COORDINATOR'];
  const batches: ImportBatchRow[] = [];
  const stored: StoreImportInput[] = [];
  let data = options.data ?? selection();
  const repository = {
    semesters: vi.fn(async () => semesters),
    catalogue: vi.fn(async (programmeId: number) => programmeId === 5 ? catalogue : null),
    systemStudents: vi.fn(async () => data),
    findAcceptedByFingerprint: vi.fn(async (scope, fingerprint) => batches.find((b) => b.status === 'ACCEPTED' && b.programmeId === scope.programmeId && b.learningCentreId === scope.learningCentreId && b.targetSemesterId === scope.targetSemesterId && b.sourceFingerprint === fingerprint) ?? null),
    storeImport: vi.fn(async (input: StoreImportInput) => {
      stored.push(input);
      const batch: ImportBatchRow = {
        importBatchId: batches.length + 1, programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId,
        status: input.outcome, sourceDate: input.sourceDate, sourceLabel: input.sourceLabel, providedBy: input.actor, sourceFingerprint: input.sourceFingerprint,
        acceptedAt: input.outcome === 'ACCEPTED' ? '2026-11-02T10:00:00.000Z' : null, acceptedBy: input.outcome === 'ACCEPTED' ? input.actor : null, summary: input.summary,
      };
      batches.push(batch);
      return batch;
    }),
    listAccepted: vi.fn(async () => batches.filter((b) => b.status === 'ACCEPTED').reverse()),
    getBatch: vi.fn(async (id: number) => batches.find((b) => b.importBatchId === id) ?? null),
    findByValidationId: vi.fn(async (id: string) => batches.find((b) => b.summary.validationId === id) ?? null),
    listStudents: vi.fn(async (id: number) => {
      const rows = stored[id - 1]?.students ?? [];
      return rows.map((s, index) => ({ importedStudentId: index + 1, externalReference: s.externalReference, studentName: s.studentName, curriculumVersion: '2024-DEMO', cohortStatus: s.cohortStatus, historyCompleteness: s.historyCompleteness }));
    }),
    acceptValidated: vi.fn(async (id: number, actor: string) => {
      const batch = batches.find((b) => b.importBatchId === id);
      if (!batch || batch.status !== 'VALIDATED') return null;
      batch.status = 'ACCEPTED'; batch.acceptedAt = '2026-11-02T11:00:00.000Z'; batch.acceptedBy = actor;
      batch.summary = { ...batch.summary, internal: { ...batch.summary.internal, subsetAcknowledgedBy: actor } };
      return batch;
    }),
  } as unknown as ForecastingRepository;
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository, runs: {} as ForecastingDependencies['runs'], offerings: {} as ForecastingDependencies['offerings'],
    scopes: options.scopes ?? interimScopeProvider, now: () => new Date('2026-11-02T12:00:00.000Z'),
  };
  return { deps, repository, batches, stored, setData: (next: PortalStudentSelection) => { data = next; } };
}

const fields = { programmeId: '5', learningCentreId: '1', targetSemesterId: '2', sourceDate: '2026-10-30', sourceLabel: 'Combined export' };
const row = (reference: string, name: string, extra = { code: 'DEMO101', status: 'COMPLETED', semester: '1', credits: '3' }) =>
  [reference, '2024-DEMO', 'ACTIVE', 'COMPLETE', extra.code, extra.status, extra.semester, extra.credits, 'false', name].join(',');
const csvOf = (...rows: string[]) => IMPORT_CSV_HEADER.join(',') + '\n' + rows.join('\n') + '\n';
/** a100 = Alya by matric (skipped), NEW1 genuinely new, NEW2 has Alya's name but another reference, S900 is the suspended student's matric (not selected), DUP1 is a shared matric. */
const overlapCsv = csvOf(row('a100', 'Alya R.'), row('NEW1', 'Brand New'), row('NEW2', ' ALYA   rahman '), row('S900', 'Sam Other'), row('DUP1', 'Dee Again'));
function form(csv: string, overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) if (value !== undefined) data.append(key, value);
  data.append('file', new File([csv], 'import.csv', { type: 'text/csv' }));
  return data;
}
const send = (deps: ForecastingDependencies, path: string, init: RequestInit = {}) =>
  handleForecastingRequest(new Request(BASE + path, { headers: { Authorization: 'Bearer test-only', ...(init.headers as Record<string, string>) }, ...init }), deps) as Promise<Response>;
const combined = (deps: ForecastingDependencies, csv: string, overrides?: Record<string, string | undefined>) =>
  send(deps, 'forecast-imports/combined-snapshots', { method: 'POST', body: form(csv, overrides) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => await response.json() as { data: Record<string, any>; error: Record<string, any> };

describe('normalisation', () => {
  it('compares matric numbers trimmed and case-insensitively, names whitespace- and case-insensitively', () => {
    expect(normaliseMatric('  a100 ')).toBe('a100');
    expect(normaliseName(' ALYA   rahman ')).toBe('alya rahman');
  });
});

describe('POST forecast-imports/combined-snapshots', () => {
  it('builds one ACCEPTED COMBINED snapshot: system wins on a matric match, name-only matches stay with a warning', async () => {
    const { deps, stored, batches } = fixture();
    const response = await combined(deps, overlapCsv);
    expect(response.status).toBe(201);
    const { data } = await body(response);
    expect(data).toMatchObject({ source: 'COMBINED', snapshotStatus: 'ACCEPTED_IMMUTABLE', sourceLabel: 'Combined export' });
    expect(stored).toHaveLength(1);
    const input = stored[0]!;
    expect(input.outcome).toBe('ACCEPTED');
    // System students (selected: 1, 3, 4, 5, 6) first, then the CSV students that are not in the system.
    expect(input.students.map((s) => s.externalReference)).toEqual(['PORTAL-1', 'PORTAL-3', 'PORTAL-4', 'PORTAL-5', 'PORTAL-6', 'NEW1', 'NEW2', 'S900', 'DUP1']);
    expect(input.students.find((s) => s.externalReference === 'a100')).toBeUndefined();
    expect(input.records.some((r) => r.externalReference === 'a100')).toBe(false);
    expect(input.records.filter((r) => r.externalReference === 'NEW1')).toHaveLength(1);
    // History: system COMPLETE / UNKNOWN as in MT8, CSV as given.
    expect(input.students.find((s) => s.externalReference === 'PORTAL-3')!.historyCompleteness).toBe('UNKNOWN');
    expect(input.students.find((s) => s.externalReference === 'PORTAL-1')!.historyCompleteness).toBe('COMPLETE');
    expect(input.students.find((s) => s.externalReference === 'NEW1')!.historyCompleteness).toBe('COMPLETE');
    expect(input.summary.internal).toMatchObject({ source: 'COMBINED', sourceByReference: { 'PORTAL-1': 'SYSTEM', 'PORTAL-3': 'SYSTEM', NEW1: 'CSV', NEW2: 'CSV', S900: 'CSV', DUP1: 'CSV' } });
    expect(input.summary.internal.sourceByReference).not.toHaveProperty('a100');
    // The matric numbers themselves are never stored.
    expect(JSON.stringify(input)).not.toContain('B200');
    expect(JSON.stringify(input)).not.toMatch(/"matric/i);
    // Coverage.
    const report = data.validationReport;
    expect(report.coverage).toMatchObject({ studentsFound: 5, studentsWithRecords: 3, studentsWithoutRecords: 2, excluded: { otherProgramme: 2, inactiveAccess: 1 } });
    expect(report.combined).toEqual({
      csv: { rows: 5, students: 5, rejectedRows: 0 }, students: 9, csvSkippedAlreadyInSystem: ['a100'],
      possibleDuplicates: [{ csvReference: 'NEW2', systemReferences: ['PORTAL-1'] }],
    });
    expect(report.counts).toMatchObject({ uniqueStudents: 9, rejectedRows: 0 });
    const warnings = report.issues.filter((i: { code: string }) => ['POSSIBLE_DUPLICATE_STUDENT', 'CSV_STUDENTS_ALREADY_IN_SYSTEM'].includes(i.code));
    expect(warnings.map((i: { code: string; severity: string }) => i.code + ':' + i.severity)).toEqual(['CSV_STUDENTS_ALREADY_IN_SYSTEM:WARNING', 'POSSIBLE_DUPLICATE_STUDENT:WARNING']);
    expect(batches[0]!.summary.source).toBe('COMBINED');
    expect(JSON.stringify(report)).not.toContain('"internal"');
  });

  it('does not match a shared (non-unique) or empty matric number, and an unselected student never matches', async () => {
    const { deps, stored } = fixture();
    await combined(deps, csvOf(row('DUP1', 'Someone'), row('s900', 'Someone else'), row('PORTAL-5', 'Dee')));
    const refs = stored[0]!.students.map((s) => s.externalReference);
    expect(refs).toContain('DUP1');
    expect(refs).toContain('s900');
    // A CSV reference equal to a system PORTAL reference is the same student: skipped, not a unique-key collision.
    expect(refs.filter((r) => r.toLowerCase() === 'portal-5')).toEqual(['PORTAL-5']);
  });

  it('works when the system has no students: the CSV students alone, still a COMBINED snapshot', async () => {
    const { deps, stored } = fixture({ data: { students: [], records: [], otherProgrammeStudents: 0 } });
    const response = await combined(deps, csvOf(row('NEW1', 'Brand New')));
    expect(response.status).toBe(201);
    expect(stored[0]!.students.map((s) => s.externalReference)).toEqual(['NEW1']);
    expect((await body(response)).data.source).toBe('COMBINED');
  });

  it('replays the same inputs (200) and creates a new snapshot when the CSV or the system data changed', async () => {
    const { deps, stored, setData } = fixture();
    expect((await combined(deps, overlapCsv)).status).toBe(201);
    const again = await combined(deps, overlapCsv, { sourceLabel: 'A different label', sourceDate: '2026-10-31' });
    expect(again.status).toBe(200);
    expect((await body(again)).data.importBatchId).toBe(1);
    expect(stored).toHaveLength(1);
    expect((await combined(deps, overlapCsv + row('NEW9', 'Another') + '\n')).status).toBe(201);
    const changed = selection();
    changed.records.push({ studentId: 4, subjectId: 102, status: 'COMPLETED', semesterId: 2, recognizedCredits: 3 });
    setData(changed);
    expect((await combined(deps, overlapCsv)).status).toBe(201);
    expect(stored).toHaveLength(3);
    // The same CSV bytes as a plain CSV import never collide with the combined fingerprint.
    expect(new Set(stored.map((s) => s.sourceFingerprint)).size).toBe(3);
  });

  it('follows the CSV correction pattern: 422 + ETag + report with coverage, then the existing subset acceptance builds the combined snapshot', async () => {
    const { deps, stored, batches } = fixture();
    const csv = csvOf(row('a100', 'Alya R.'), row('NEW1', 'Brand New'), row('BAD', 'Bad Student', { code: 'NOPE', status: 'COMPLETED', semester: '1', credits: '3' }));
    const response = await combined(deps, csv);
    expect(response.status).toBe(422);
    const etag = response.headers.get('ETag')!;
    const { error } = await body(response);
    expect(error.code).toBe('IMPORT_CORRECTION_REQUIRED');
    expect(error.report).toMatchObject({ status: 'CORRECTION_REQUIRED', subsetAcknowledgementRequired: true, source: 'COMBINED' });
    expect(error.report.combined).toMatchObject({ csvSkippedAlreadyInSystem: ['a100'], csv: { rows: 3, rejectedRows: 1 } });
    expect(error.report.issues.some((i: { code: string }) => i.code === 'UNKNOWN_SUBJECT_CODE')).toBe(true);
    expect(batches[0]!.status).toBe('VALIDATED');
    expect(stored[0]!.students.map((s) => s.externalReference)).toContain('PORTAL-1');
    expect(stored[0]!.students.find((s) => s.externalReference === 'BAD')!.historyCompleteness).toBe('PARTIAL');
    const revision = error.report.validationRevision as string;
    expect(etag).toBe('"' + revision + '"');
    const accept = (ifMatch: string | null) => send(deps, `forecast-imports/${error.report.validationId}/subset-acceptances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
      body: JSON.stringify({ programmeId: 5, learningCentreId: 1, targetSemesterId: 2, validationRevision: revision, acknowledgeRejectedRows: true }),
    });
    expect((await accept(null)).status).toBe(400);
    expect((await accept('"sha256:stale"')).status).toBe(412);
    const accepted = await accept(etag);
    expect(accepted.status).toBe(201);
    const { data } = await body(accepted);
    expect(data).toMatchObject({ source: 'COMBINED', snapshotStatus: 'ACCEPTED_IMMUTABLE' });
    expect(data.validationReport.acceptedSnapshot).toMatchObject({ importBatchId: 1 });
    // Retry after success is idempotent; nothing was stored twice.
    expect((await accept(etag)).status).toBe(201);
    expect(stored).toHaveLength(1);
  });

  it('rejects an unreadable file (nothing stored as students) and a header mismatch with the file-rejected envelope', async () => {
    const { deps, stored } = fixture();
    const response = await combined(deps, 'wrong,header\n1,2\n');
    expect(response.status).toBe(422);
    expect((await body(response)).error.code).toBe('IMPORT_FILE_REJECTED');
    expect(response.headers.get('ETag')).toBeNull();
    expect(stored[0]!.outcome).toBe('REJECTED');
    expect(stored[0]!.students).toEqual([]);
  });

  it('exposes the source per student on the roster read', async () => {
    const { deps } = fixture();
    await combined(deps, overlapCsv);
    const roster = await body(await send(deps, 'forecast-imports/1/students?limit=100', { method: 'GET' }));
    const sourceOf = Object.fromEntries(roster.data.items.map((s: { externalReference: string; source: string }) => [s.externalReference, s.source]));
    expect(sourceOf).toMatchObject({ 'PORTAL-1': 'SYSTEM', 'PORTAL-3': 'SYSTEM', NEW1: 'CSV', NEW2: 'CSV', DUP1: 'CSV' });
    const detail = await body(await send(deps, 'forecast-imports/1', { method: 'GET' }));
    expect(detail.data.source).toBe('COMBINED');
    const list = await body(await send(deps, 'forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2', { method: 'GET' }));
    expect(list.data.items[0].source).toBe('COMBINED');
  });

  it.each([['STUDENT'], ['SYSTEM_ADMIN']] as const)('denies %s before reading any data', async (role) => {
    const { deps, repository } = fixture({ roles: [role] });
    const response = await combined(deps, overlapCsv);
    expect(response.status).toBe(403);
    expect(repository.systemStudents).not.toHaveBeenCalled();
    expect(repository.storeImport).not.toHaveBeenCalled();
  });

  it('refuses unassigned scopes, enforces the target semester and the POST method', async () => {
    const closed = fixture({ scopes: { ...interimScopeProvider, isScopeAssigned: vi.fn(async () => false) } });
    const denied = await combined(closed.deps, overlapCsv);
    expect(denied.status).toBe(403);
    expect(closed.repository.systemStudents).not.toHaveBeenCalled();
    const { deps, repository } = fixture();
    expect((await combined(deps, overlapCsv, { targetSemesterId: '3' })).status).toBe(422);
    expect((await combined(deps, overlapCsv, { sourceLabel: '' })).status).toBe(400);
    expect((await combined(deps, overlapCsv, { surprise: 'x' })).status).toBe(400);
    expect(repository.storeImport).not.toHaveBeenCalled();
    const get = await send(deps, 'forecast-imports/combined-snapshots', { method: 'GET' });
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST');
  });
});

describe('combined snapshot with a coordinator export (S2-P004-010)', () => {
  const head = 'courseCode,subjCode,centerName,stuname,stuMetricNo,eMail,SemesterMohon,grade,status';
  const crow = (matric: string, name: string, grade = 'A', course = 'SECJH') => [course, 'DEMO101', 'KUALA LUMPUR', name, matric, 'x@example.org', '2024/2025 1', grade, 'A'].join(',');
  it('matches coordinator matrics against system matric numbers and reports the format', async () => {
    const { deps, stored } = fixture();
    const response = await combined(deps, [head, crow('A100', 'ALYA R'), crow('NEW1', 'BRAND NEW'), crow('NEW2', 'ANOTHER', 'A', 'SCSJ')].join('\n'));
    expect(response.status).toBe(201);
    const { data } = await body(response);
    expect(data.source).toBe('COMBINED');
    expect(data.validationReport).toMatchObject({ format: 'COORDINATOR', coordinatorExport: { rowsRead: 3, skippedOtherProgramme: 1 }, combined: { csvSkippedAlreadyInSystem: ['A100'] } });
    expect(stored[0]!.students.map((s) => s.externalReference)).toEqual(['PORTAL-1', 'PORTAL-3', 'PORTAL-4', 'PORTAL-5', 'PORTAL-6', 'NEW1']);
    expect(JSON.stringify(data)).not.toContain('example.org');
  });
});
