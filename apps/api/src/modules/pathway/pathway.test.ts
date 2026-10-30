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
