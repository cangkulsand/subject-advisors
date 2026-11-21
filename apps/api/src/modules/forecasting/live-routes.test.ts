import { describe, expect, it, vi } from 'vitest';
import type { EngineCapacityRule, EngineCurriculum } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { LiveForecast, LiveSubjectStudents } from '../../../../../packages/shared/src/forecasting/live';
import type { ForecastingDependencies, ForecastingRepository, PortalStudentSelection, ProgrammeCatalogue } from './contracts';
import { handleForecastingRequest } from './routes';
import type { EngineInputRows } from './runs-contracts';
import { fakeRunsRepository } from './runs-testing';
import type { ScopeProvider } from './scope-provider';
import { assignedTo, testScopeProvider } from './scope-provider.test-support';

const BASE = 'https://test.invalid/api/coordinator/';
const QUERY = '?programmeId=5&learningCentreId=1';
const A = 101; const B = 102;

const engineSubject = (id: number, code: string) => ({
  curriculumSubjectId: 1000 + id, curriculumId: 10, subjectId: id, subjectCode: code, subjectName: 'Subject ' + code, creditHours: 3, classType: 'LECTURE' as const,
  includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [], conditionalPrerequisites: { status: 'UNAVAILABLE' as const, reason: 'none' },
});
const curriculum: EngineCurriculum = {
  curriculumId: 10, curriculumVersion: '2024-DEMO', totalCreditsRequired: 30, catalogueFingerprint: 'fp', requirements: [], subjectSemesterRules: [],
  subjects: [engineSubject(A, 'LEC101'), engineSubject(B, 'LEC102')],
};
const capacityRules: EngineCapacityRule[] = [
  { capacityRuleId: 1, scopeKind: 'GLOBAL', classType: 'LECTURE', minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 45, exceptionMaximum: 50, isActive: true },
];
const inputs: EngineInputRows = { target: { semesterId: 2, semesterType: 'NORMAL', maxSubjects: 6, maxCredits: 20 }, snapshot: { students: [], rejectedRowsByStudent: {} }, curricula: [curriculum], capacityRules };
const catalogue: ProgrammeCatalogue = {
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [
    { curriculumSubjectId: 1101, subjectId: A, subjectCode: 'LEC101', subjectName: 'Subject LEC101', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true },
    { curriculumSubjectId: 1102, subjectId: B, subjectCode: 'LEC102', subjectName: 'Subject LEC102', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true },
  ] }],
  prerequisites: [], knownSubjectCodes: new Set(['LEC101', 'LEC102']), semesterIds: new Set([1, 2, 3]),
};
/** Student 1 passed A; student 2 has a record (complete history) and has not passed A; student 3 has no records (uncertain). */
const selection = (): PortalStudentSelection => ({
  students: [1, 2, 3].map((studentId) => ({ studentId, studentName: 'Student ' + studentId, curriculumId: 10, eligible: true })),
  records: [
    { studentId: 1, subjectId: A, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 },
    { studentId: 2, subjectId: B, status: 'FAILED', semesterId: 1, recognizedCredits: 0 },
  ],
  otherProgrammeStudents: 0,
});
const semesters = [1, 2, 3].map((n) => ({ semesterId: n, academicYear: '2026/2027', semesterNumber: n as 1 | 2 | 3 }));

function fixture(options: { scopes?: ScopeProvider; selection?: PortalStudentSelection; currentSemesterId?: number | null } = {}) {
  const fake = fakeRunsRepository(inputs);
  const storeImport = vi.fn();
  const createRun = vi.spyOn(fake.repository, 'createRun');
  const base = options.scopes ?? testScopeProvider;
  const scopes: ScopeProvider = { ...base, currentSemesterId: async () => (options.currentSemesterId === undefined ? 1 : options.currentSemesterId) };
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: 'user_coord', sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: 'COORDINATOR' as const, roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: {
      catalogue: vi.fn(async () => catalogue), systemStudents: vi.fn(async () => options.selection ?? selection()), semesters: vi.fn(async () => semesters), storeImport,
    } as unknown as ForecastingRepository,
    runs: fake.repository,
    decisions: {} as ForecastingDependencies['decisions'],
    scopes,
    now: () => new Date('2026-11-21T10:00:00.000Z'),
  };
  return { deps, storeImport, createRun };
}
const call = (deps: ForecastingDependencies, path: string, init?: RequestInit) => handleForecastingRequest(new Request(BASE + path, init), deps) as Promise<Response>;
const dataOf = async <T>(response: Response) => (await response.json() as { data: T }).data;
const errorOf = async (response: Response) => (await response.json() as { error: { code: string } }).error;

describe('live forecast (S3-P004-032)', () => {
  it('returns engine subjects for the assigned scope without storing anything', async () => {
    const { deps, storeImport, createRun } = fixture();
    const response = await call(deps, 'forecast-live' + QUERY);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const data = await dataOf<LiveForecast>(response);
    expect(data).toMatchObject({ programmeId: 5, learningCentreId: 1, targetSemesterId: 2, calculatedAt: '2026-11-21T10:00:00.000Z', studentsInScope: 3 });
    const a = data.subjects.find((subject) => subject.subjectId === A)!;
    expect(a).toMatchObject({ subjectCode: 'LEC101', supportedEligibleCount: 1, uncertainStudentCount: 1, excluded: false, semesterTypeExcluded: false });
    expect(a.breakdown).toMatchObject({ inCurriculum: 3, alreadyPassed: 1, supported: 1, uncertain: 1 });
    expect(storeImport).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
    expect(deps.repository.catalogue).not.toHaveBeenCalled(); // the catalogue comes from catalogueInputs only (review: fewer subrequests)
  });

  it('rejects an unassigned scope', async () => {
    const { deps } = fixture({ scopes: assignedTo([7, 1]) });
    const response = await call(deps, 'forecast-live' + QUERY);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe('SCOPE_NOT_ASSIGNED');
  });

  it('with no students returns an empty list', async () => {
    const { deps } = fixture({ selection: { students: [], records: [], otherProgrammeStudents: 0 } });
    const response = await call(deps, 'forecast-live' + QUERY);
    expect(response.status).toBe(200);
    expect(await dataOf<LiveForecast>(response)).toMatchObject({ studentsInScope: 0, subjects: [] });
  });

  it('without a target semester answers TARGET_SEMESTER_UNAVAILABLE', async () => {
    const { deps } = fixture({ currentSemesterId: null });
    const response = await call(deps, 'forecast-live' + QUERY);
    expect((await errorOf(response)).code).toBe('TARGET_SEMESTER_UNAVAILABLE');
  });

  it('students match the table count', async () => {
    const { deps } = fixture();
    const forecast = await dataOf<LiveForecast>(await call(deps, 'forecast-live' + QUERY));
    const response = await call(deps, `forecast-live/subjects/${A}/students` + QUERY);
    expect(response.status).toBe(200);
    const students = await dataOf<LiveSubjectStudents>(response);
    expect(students.summary.counted).toBe(forecast.subjects.find((subject) => subject.subjectId === A)!.supportedEligibleCount);
    expect(students).toMatchObject({ subjectId: A, subjectCode: 'LEC101' });
    expect(students.students).toHaveLength(3);
  });

  it('answers RUN_SUBJECT_NOT_FOUND for a subject outside the curriculum', async () => {
    const { deps } = fixture();
    const response = await call(deps, 'forecast-live/subjects/999/students' + QUERY);
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe('RUN_SUBJECT_NOT_FOUND');
  });

  it('is GET only', async () => {
    const { deps } = fixture();
    const response = await call(deps, 'forecast-live' + QUERY, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
  });

  it('rejects unknown query parameters', async () => {
    const { deps } = fixture();
    expect((await call(deps, 'forecast-live' + QUERY + '&snapshot=2')).status).toBe(400);
  });
});
