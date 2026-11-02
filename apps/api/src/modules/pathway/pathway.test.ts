import { describe, expect, it, vi } from 'vitest';
import { buildPathwayGraph } from './adapter';
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
      { prerequisiteId: 2, requirementType: 'RECOMMENDED', curriculumSubjectId: 12, requiredCurriculumSubjectId: 10 },
    ],
    records: [],
    requirements: [],
    semesterRules: [],
    semesters: [],
    ...overrides,
  };
}

describe('UC17 pathway graph adapter', () => {
  it('marks completed and exempted subjects distinctly', () => {
    const graph = buildPathwayGraph(raw({
      records: [
        { subjectId: 100, status: 'COMPLETED', grade: 'A-', recognizedCredits: 3 },
        { subjectId: 102, status: 'EXEMPTED', grade: null, recognizedCredits: 0 },
      ],
    }));
    const byCode = new Map(graph.nodes.map(node => [node.subjectCode, node]));
    expect(byCode.get('SECJ1013')?.status).toBe('COMPLETED');
    expect(byCode.get('SECJ1013')?.grade).toBe('A-');
    expect(byCode.get('SECJ2013')?.status).toBe('EXEMPTED');
    expect(byCode.get('SECJ2013')?.recognizedCredits).toBe(0);
  });

  it('locks a subject with an unmet mandatory prerequisite and leaves others remaining', () => {
    const graph = buildPathwayGraph(raw());
    const byCode = new Map(graph.nodes.map(node => [node.subjectCode, node]));
    expect(byCode.get('SECJ1013')?.status).toBe('REMAINING');
    expect(byCode.get('SECJ1023')?.status).toBe('LOCKED');
    expect(byCode.get('SECJ2013')?.status).toBe('REMAINING');
  });

  it('unlocks a subject once its mandatory prerequisite is satisfied', () => {
    const graph = buildPathwayGraph(raw({
      records: [{ subjectId: 100, status: 'COMPLETED', grade: 'B', recognizedCredits: 3 }],
    }));
    const byCode = new Map(graph.nodes.map(node => [node.subjectCode, node]));
    expect(byCode.get('SECJ1023')?.status).toBe('REMAINING');
  });

  it('treats failed and withdrawn records as outstanding, not completed', () => {
    const graph = buildPathwayGraph(raw({
      records: [{ subjectId: 100, status: 'FAILED', grade: 'F', recognizedCredits: 0 }],
    }));
    const byCode = new Map(graph.nodes.map(node => [node.subjectCode, node]));
    expect(byCode.get('SECJ1013')?.status).toBe('REMAINING');
    expect(byCode.get('SECJ1023')?.status).toBe('LOCKED');
  });

  it.each([
    ['COMPLETED', 'FAILED'],
    ['FAILED', 'COMPLETED'],
    ['EXEMPTED', 'WITHDRAWN'],
    ['WITHDRAWN', 'EXEMPTED'],
    ['COMPLETED', 'EXEMPTED'],
    ['EXEMPTED', 'COMPLETED'],
  ])('marks duplicate attempts %s + %s unresolved and does not unlock prerequisites', (first, second) => {
    const graph = buildPathwayGraph(raw({
      records: [first, second].map(status => ({
        subjectId: 100, status, grade: status === 'COMPLETED' ? 'A' : null,
        recognizedCredits: status === 'COMPLETED' ? 3 : 0,
      })),
    }));
    const byCode = new Map(graph.nodes.map(node => [node.subjectCode, node]));
    expect(byCode.get('SECJ1013')).toMatchObject({ status: 'UNKNOWN', grade: null, recognizedCredits: null });
    expect(byCode.get('SECJ1023')?.status).toBe('LOCKED');
  });

  it('emits directed edges for prerequisites and distinguishes mandatory from recommended', () => {
    const graph = buildPathwayGraph(raw());
    expect(graph.edges).toHaveLength(2);
    const mandatory = graph.edges.find(edge => edge.requirementType === 'MANDATORY');
    expect(mandatory).toMatchObject({ source: '10', target: '11' });
    const recommended = graph.edges.find(edge => edge.requirementType === 'RECOMMENDED');
    expect(recommended).toMatchObject({ source: '10', target: '12' });
  });

  it('drops prerequisite edges whose endpoints are not in the curriculum node set', () => {
    const graph = buildPathwayGraph(raw({
      prerequisites: [
        { prerequisiteId: 9, requirementType: 'MANDATORY', curriculumSubjectId: 11, requiredCurriculumSubjectId: 999 },
      ],
    }));
    expect(graph.edges).toHaveLength(0);
  });

  it('uses anyOf details without turning alternatives into mandatory graph edges', () => {
    const graph = buildPathwayGraph(raw({
      subjects: [
        { curriculumSubjectId: 10, isCompulsory: 1, subjectCategory: 'CORE', subjectId: 100, subjectCode: 'SECJ1013', subjectName: 'Programming 1', creditHours: 3 },
        { curriculumSubjectId: 11, isCompulsory: 1, subjectCategory: 'CORE', subjectId: 101, subjectCode: 'SECJ1023', subjectName: 'Programming 2', creditHours: 3,
          prerequisiteDetails: { expression: { operator: 'anyOf', operands: [{ operator: 'course', code: 'SECJ1013' }, { operator: 'course', code: 'SECJ2013' }] },
            fixedCourseEdgesShown: true, sourcePrerequisiteStatus: 'Yes', sourceCells: { E: 'E4' }, conditions: [], conditionNote: null } },
        { curriculumSubjectId: 12, isCompulsory: 0, subjectCategory: 'ELECTIVE', subjectId: 102, subjectCode: 'SECJ2013', subjectName: 'Elective A', creditHours: 2 },
      ],
      records: [{ subjectId: 100, status: 'COMPLETED', grade: 'B', recognizedCredits: 3 }],
    }));
    const target = graph.nodes.find(node => node.subjectCode === 'SECJ1023');
    expect(target).toMatchObject({ status: 'REMAINING', prerequisiteSummary: 'SECJ1013 OR SECJ2013' });
    expect(graph.edges.some(edge => edge.target === target?.id)).toBe(false);
  });

  it('keeps direct allOf edges while suppressing the two OR alternatives from the legacy edge table', () => {
    const base = raw();
    base.subjects.push({ curriculumSubjectId: 13, isCompulsory: 0, subjectCategory: 'ELECTIVE', subjectId: 103, subjectCode: 'SECJ3013', subjectName: 'Elective B', creditHours: 3 });
    base.subjects[1]!.prerequisiteDetails = { expression: { operator: 'allOf', operands: [
      { operator: 'course', code: 'SECJ1013' }, { operator: 'anyOf', operands: [
        { operator: 'course', code: 'SECJ2013' }, { operator: 'course', code: 'SECJ3013' },
      ] },
    ] }, fixedCourseEdgesShown: true, sourcePrerequisiteStatus: 'Yes', sourceCells: { E: 'E4' }, conditions: [], conditionNote: null };
    base.prerequisites = [
      { prerequisiteId: 1, requirementType: 'MANDATORY', curriculumSubjectId: 11, requiredCurriculumSubjectId: 10 },
      { prerequisiteId: 2, requirementType: 'MANDATORY', curriculumSubjectId: 11, requiredCurriculumSubjectId: 12 },
      { prerequisiteId: 3, requirementType: 'MANDATORY', curriculumSubjectId: 11, requiredCurriculumSubjectId: 13 },
    ];
    expect(buildPathwayGraph(base).edges).toEqual([{ id: '1', source: '10', target: '11', requirementType: 'MANDATORY' }]);
  });

  it('keeps condition-dependent and invalid new details unknown without a completed target record', () => {
    const subjects = raw().subjects.map(subject => subject.curriculumSubjectId !== 11 ? subject : ({ ...subject,
      prerequisiteDetails: { expression: null, fixedCourseEdgesShown: false, sourcePrerequisiteStatus: 'Yes', sourceCells: { K: 'K19' },
        conditions: [{ type: 'cgpa', operator: '>=', value: 2, sourceCell: 'K19' }], conditionNote: 'CGPA requirement.' } as NonNullable<RawPathwayData['subjects'][number]['prerequisiteDetails']>,
    }));
    expect(buildPathwayGraph(raw({ subjects })).nodes.find(node => node.subjectCode === 'SECJ1023')?.status).toBe('UNKNOWN');
    const invalid = subjects.map(subject => subject.curriculumSubjectId !== 11 ? subject : ({ ...subject,
      prerequisiteDetails: { expression: { operator: 'course', code: 'OUTSIDE123' }, fixedCourseEdgesShown: true,
        sourcePrerequisiteStatus: 'Yes', sourceCells: { E: 'E4' }, conditions: [], conditionNote: null } as NonNullable<RawPathwayData['subjects'][number]['prerequisiteDetails']>,
    }));
    expect(buildPathwayGraph(raw({ subjects: invalid })).nodes.find(node => node.subjectCode === 'SECJ1023')?.status).toBe('UNKNOWN');
  });
});

describe('UC17 pathway endpoint', () => {
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

  it('returns the graph for an authorized student with a complete profile', async () => {
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graph'), auth(), repo);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ data: { curriculumId: 1, demo: false } });
    expect(repo.load).toHaveBeenCalledWith('student_a');
  });

  it('delegates other routes to their owners', async () => {
    expect(await handlePathwayRequest(new Request('https://api.test/api/profile'), auth(), repository())).toBeNull();
  });

  it('rejects non-GET methods', async () => {
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graph', { method: 'POST' }), auth(), repository());
    expect(response?.status).toBe(405);
    expect(response?.headers.get('allow')).toBe('GET');
  });

  it('fails closed when the profile is incomplete', async () => {
    const deps = auth();
    deps.profiles = { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) };
    const repo = repository();
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graph'), deps, repo);
    expect(response?.status).toBe(403);
    expect(repo.load).not.toHaveBeenCalled();
  });

  it('conceals database failures', async () => {
    const failing = { load: vi.fn(async () => { throw new Error('secret-database-url'); }) };
    const response = await handlePathwayRequest(new Request('https://api.test/api/pathway/graph'), auth(), failing);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('secret-database-url');
  });
});
