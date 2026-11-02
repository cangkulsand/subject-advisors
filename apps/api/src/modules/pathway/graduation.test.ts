import { describe, expect, it, vi } from 'vitest';
import { buildGraduationEligibility } from './graduation';
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
    prerequisites: [],
    records: [],
    requirements: [],
    semesterRules: [],
    semesters: [],
    ...overrides,
  };
}

describe('UC13 graduation eligibility engine', () => {
  it('counts only completed and exempted credits', () => {
    const result = buildGraduationEligibility(raw({
      records: [
        { subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 },
        { subjectId: 102, status: 'EXEMPTED', grade: null, recognizedCredits: 2 },
        { subjectId: 101, status: 'FAILED', grade: 'F', recognizedCredits: 0 },
      ],
    }));
    expect(result.totalCreditsRecognized).toBe(5);
  });

  it('treats duplicate attempts as unresolved', () => {
    const result = buildGraduationEligibility(raw({
      totalCreditRequired: 3,
      records: [
        { subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 },
        { subjectId: 100, status: 'FAILED', grade: 'F', recognizedCredits: 0 },
      ],
    }));
    expect(result.totalCreditsRecognized).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('reports unmet total credits', () => {
    const result = buildGraduationEligibility(raw({
      totalCreditRequired: 6,
      records: [{ subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 }],
    }));
    expect(result.eligible).toBe(false);
    expect(result.outstanding).toContain('Total credits: 3/6');
  });

  it('checks a compulsory subject-count requirement', () => {
    const result = buildGraduationEligibility(raw({
      requirements: [{ requirementId: 1, requirementType: 'COMPULSORY', requiredCredits: null, requiredSubjects: 2 }],
      records: [{ subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 }],
    }));
    expect(result.requirements[0]).toMatchObject({ satisfiedSubjects: 1, met: false });
  });

  it('checks an elective credit requirement', () => {
    const result = buildGraduationEligibility(raw({
      requirements: [{ requirementId: 1, requirementType: 'ELECTIVE', requiredCredits: 2, requiredSubjects: null }],
      records: [{ subjectId: 102, status: 'COMPLETED', grade: 'A', recognizedCredits: 2 }],
    }));
    expect(result.requirements[0]).toMatchObject({ satisfiedCredits: 2, met: true });
  });

  it('is eligible when total credits and requirements are met', () => {
    const result = buildGraduationEligibility(raw({
      totalCreditRequired: 5,
      requirements: [{ requirementId: 1, requirementType: 'COMPULSORY', requiredCredits: null, requiredSubjects: 1 }],
      records: [
        { subjectId: 100, status: 'COMPLETED', grade: 'A', recognizedCredits: 3 },
        { subjectId: 102, status: 'EXEMPTED', grade: null, recognizedCredits: 2 },
      ],
    }));
    expect(result.eligible).toBe(true);
  });
});

describe('UC13 graduation endpoint', () => {
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

  it('returns eligibility for an authorized student', async () => {
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graduation'), auth(), repo);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ data: { eligible: true } });
    expect(repo.load).toHaveBeenCalledWith('student_a');
  });

  it('rejects non-GET methods', async () => {
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graduation', { method: 'POST' }), auth(), repository());
    expect(response?.status).toBe(405);
    expect(response?.headers.get('allow')).toBe('GET');
  });

  it('fails closed when the profile is incomplete', async () => {
    const deps = auth();
    deps.profiles = { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) };
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graduation'), deps, repo);
    expect(response?.status).toBe(403);
    expect(repo.load).not.toHaveBeenCalled();
  });

  it('conceals database failures', async () => {
    const failing = { load: vi.fn(async () => { throw new Error('secret-database-url'); }) };
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graduation'), auth(), failing);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('secret-database-url');
  });
});
