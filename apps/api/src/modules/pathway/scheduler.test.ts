import { describe, expect, it, vi } from 'vitest';
import { buildProjectedPathway } from './scheduler';
import { handlePathwayRequest } from './routes';
import type { RawPathwayData } from './repository';
import type { AuthDependencies } from '../auth/contracts';

function raw(overrides: Partial<RawPathwayData> = {}): RawPathwayData {
  return {
    curriculumId: 1,
    curriculumVersion: '2026',
    programmeName: 'Bachelor of Test',
    totalCreditRequired: 0,
    subjects: [
      { curriculumSubjectId: 10, isCompulsory: 1, subjectCategory: 'CORE', subjectId: 100, subjectCode: 'SECJ1013', subjectName: 'Programming 1', creditHours: 3 },
      { curriculumSubjectId: 11, isCompulsory: 1, subjectCategory: 'CORE', subjectId: 101, subjectCode: 'SECJ1023', subjectName: 'Programming 2', creditHours: 3 },
      { curriculumSubjectId: 12, isCompulsory: 0, subjectCategory: 'ELECTIVE', subjectId: 102, subjectCode: 'SECJ2013', subjectName: 'Elective A', creditHours: 2 },
    ],
    prerequisites: [
      { prerequisiteId: 1, requirementType: 'MANDATORY', curriculumSubjectId: 11, requiredCurriculumSubjectId: 10 },
    ],
    records: [],
    requirements: [],
    semesterRules: [],
    semesters: [
      { semesterId: 1, academicYear: '2025/2026', semesterNo: 1, semesterType: 'NORMAL', maxSubjects: 3, maxCredits: 10 },
      { semesterId: 2, academicYear: '2025/2026', semesterNo: 2, semesterType: 'NORMAL', maxSubjects: 3, maxCredits: 10 },
      { semesterId: 3, academicYear: '2025/2026', semesterNo: 3, semesterType: 'SHORT', maxSubjects: 3, maxCredits: 6 },
    ],
    ...overrides,
  };
}

describe('UC14 projected pathway scheduler', () => {
  it('excludes completed and exempted subjects', () => {
    const result = buildProjectedPathway(raw({
      records: [{ subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 }],
    }));
    expect(result.remainingSubjects).toBe(2);
    expect(result.remainingCredits).toBe(5);
  });

  it('schedules a mandatory prerequisite in an earlier semester than its dependent', () => {
    const result = buildProjectedPathway(raw());
    const first = result.semesters[0]!;
    expect(first.subjects.map(subject => subject.subjectCode)).toContain('SECJ1013');
    expect(first.subjects.map(subject => subject.subjectCode)).not.toContain('SECJ1023');
    const second = result.semesters[1]!;
    expect(second.subjects.map(subject => subject.subjectCode)).toContain('SECJ1023');
  });

  it('respects the per-semester subject limit', () => {
    const result = buildProjectedPathway(raw({
      semesters: [
        { semesterId: 1, academicYear: '2025/2026', semesterNo: 1, semesterType: 'NORMAL', maxSubjects: 1, maxCredits: 10 },
        { semesterId: 2, academicYear: '2025/2026', semesterNo: 2, semesterType: 'NORMAL', maxSubjects: 1, maxCredits: 10 },
        { semesterId: 3, academicYear: '2025/2026', semesterNo: 3, semesterType: 'SHORT', maxSubjects: 1, maxCredits: 10 },
      ],
    }));
    expect(result.semesters).toHaveLength(3);
    expect(result.semesters.every(semester => semester.subjects.length === 1)).toBe(true);
  });

  it('respects semester-type restrictions', () => {
    const result = buildProjectedPathway(raw({
      semesterRules: [{ ruleId: 1, semesterType: 'SHORT', curriculumSubjectId: 12 }],
    }));
    const shortSemester = result.semesters.find(semester => semester.semesterType === 'SHORT');
    expect(shortSemester?.subjects.map(subject => subject.subjectCode)).toContain('SECJ2013');
  });

  it('treats duplicate attempts as unresolved', () => {
    const result = buildProjectedPathway(raw({
      records: [
        { subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 },
        { subjectId: 100, status: 'FAILED', grade: 'F', recognizedCredits: 0 },
      ],
    }));
    expect(result.remainingSubjects).toBe(3);
  });

  it('reports default-limit assumptions when no semesters are configured', () => {
    const result = buildProjectedPathway(raw({ semesters: [] }));
    expect(result.assumptions.some(assumption => assumption.includes('default limits'))).toBe(true);
  });
});

describe('UC14 projection endpoint', () => {
  function auth(): AuthDependencies {
    return {
      verify: vi.fn(async () => ({ clerkUserId: 'student_a', sessionId: 's', primaryEmail: { address: 'a@graduate.utm.my', verified: true } })),
      access: {
        find: vi.fn(async () => ({ clerkUserId: 'student_a', appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })),
        initializeStudent: vi.fn(),
      },
      profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
    };
  }
  function repository() { return { load: vi.fn(async () => raw()) }; }

  it('returns the projection for an authorized student', async () => {
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/projection'), auth(), repo);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ data: { remainingSubjects: 3 } });
    expect(repo.load).toHaveBeenCalledWith('student_a');
  });

  it('rejects non-GET methods', async () => {
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/projection', { method: 'POST' }), auth(), repository());
    expect(response?.status).toBe(405);
    expect(response?.headers.get('allow')).toBe('GET');
  });

  it('fails closed when the profile is incomplete', async () => {
    const deps = auth();
    deps.profiles = { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) };
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/projection'), deps, repo);
    expect(response?.status).toBe(403);
    expect(repo.load).not.toHaveBeenCalled();
  });

  it('conceals database failures', async () => {
    const failing = { load: vi.fn(async () => { throw new Error('secret-database-url'); }) };
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/projection'), auth(), failing);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('secret-database-url');
  });
});
