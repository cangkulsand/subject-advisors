import { describe, expect, it, vi } from 'vitest';
import { createPlanningRepository, startSemester, toPlanningInput, type PlanningRows } from './repository';
import { handlePlanningRequest, type PlanningDependencies } from './routes';
import type { Database } from '../p001-sprint2/repository';

const semesters: PlanningRows['semesters'] = [
  { semesterId: 3, academicYear: '2026/2027', semesterNo: 1, maxSubjects: 3, maxCredits: 10, isCurrent: true },
  { semesterId: 1, academicYear: '2025/2026', semesterNo: 3, maxSubjects: 3, maxCredits: 6, isCurrent: false },
  { semesterId: 4, academicYear: '2026/2027', semesterNo: 2, maxSubjects: 4, maxCredits: 12, isCurrent: false },
];
const rows = (extra: Partial<PlanningRows> = {}): PlanningRows => ({
  profile: { curriculumId: 1, programmeId: 5, learningCentreId: 2, programmeName: 'Software Engineering', curriculumVersion: '2024', totalCredits: 120 },
  subjects: [
    { curriculumSubjectId: 11, subjectId: 101, subjectCode: 'SECJ1013', subjectName: 'Programming Technique I', creditHours: 3, category: 'Core', compulsory: true },
    { curriculumSubjectId: 12, subjectId: 102, subjectCode: 'SECJ1023', subjectName: 'Programming Technique II', creditHours: 3, category: 'Core', compulsory: true },
    { curriculumSubjectId: 13, subjectId: 103, subjectCode: 'UHLB1112', subjectName: 'English 1', creditHours: 2, category: 'University Compulsory', compulsory: true },
  ],
  rules: [{ curriculumSubjectId: 11, semesterType: 'NORMAL' }, { curriculumSubjectId: 13, semesterType: 'SHORT' }, { curriculumSubjectId: 13, semesterType: 'SHORT' }],
  prerequisites: [{ curriculumSubjectId: 12, requiredCurriculumSubjectId: 11 }],
  records: [{ subjectId: 101, status: 'FAILED', recognizedCredits: 0 }, { subjectId: 101, status: 'COMPLETED', recognizedCredits: 3 }, { subjectId: 999, status: 'COMPLETED', recognizedCredits: 3 }],
  requirements: [{ requirementType: 'CORE', requiredSubjects: 2, requiredCredits: 6 }],
  semesters,
  decisions: [{ subjectId: 102, status: 'APPROVED' }, { subjectId: 103, status: 'REMOVED' }],
  ...extra,
});

describe('startSemester', () => {
  it('is the configured semester after the current one, in academic order', () => {
    expect(startSemester(semesters)?.semesterId).toBe(4);
    expect(startSemester(semesters.map(s => ({ ...s, isCurrent: false })))).toBeNull();
    expect(startSemester([{ ...semesters[0]! }])).toBeNull();
  });
});

describe('toPlanningInput', () => {
  it('maps rows to the engine input', () => {
    const input = toPlanningInput(rows());
    expect(input.passed).toEqual([11]); // any COMPLETED attempt counts; records outside the curriculum are ignored
    expect(input.earnedCredits).toBe(3);
    expect(input.subjects.map(s => [s.subjectCode, s.semesterTypes, s.prerequisites])).toEqual([
      ['SECJ1013', ['NORMAL'], []], ['SECJ1023', [], [11]], ['UHLB1112', ['SHORT'], []],
    ]);
    expect(input.start).toEqual({ academicYear: '2026/2027', semesterNo: 2 });
    expect(input.approvedFirst).toEqual([12]);
    expect(input.limits).toHaveLength(3);
    expect(input).toMatchObject({ programmeName: 'Software Engineering', totalCredits: 120, requirements: [{ requirementType: 'CORE' }] });
  });
  it('has no approved list when the coordinator decided nothing, or there is no start semester', () => {
    expect(toPlanningInput(rows({ decisions: [] })).approvedFirst).toBeNull();
    const noCurrent = toPlanningInput(rows({ semesters: semesters.map(s => ({ ...s, isCurrent: false })) }));
    expect(noCurrent).toMatchObject({ start: null, approvedFirst: null });
  });
});

describe('createPlanningRepository', () => {
  it('returns null without a profile and queries decisions for the start semester', async () => {
    const empty: Database = { query: vi.fn(async () => []), transaction: vi.fn() };
    expect(await createPlanningRepository(empty).load('u')).toBeNull();
    const query = vi.fn(async (text: string) => {
      if (text.includes('FROM public.student_profile sp')) return [{ curriculum_id: 1, learning_centre_id: 2, programme_id: 5, curriculum_version: '2024', total_credit_required: 120, programme_name: 'SE' }];
      if (text.includes('FROM public.academic_semester')) return [{ semester_id: 3, academic_year: '2026/2027', semester_no: 1, max_subjects: 3, max_credits: 10, is_current: true }, { semester_id: 4, academic_year: '2026/2027', semester_no: 2, max_subjects: 3, max_credits: 10, is_current: false }];
      if (text.includes('FROM public.offering_decision')) return [{ subject_id: 101, status: 'APPROVED' }];
      if (text.includes('FROM public.curriculum_subject cs JOIN public.subject')) return [{ curriculum_subject_id: 11, subject_id: 101, subject_code: 'SECJ1013', subject_name: 'PT1', credit_hours: 3, subject_category: 'Core', is_compulsory: 1 }];
      return [];
    });
    const input = await createPlanningRepository({ query, transaction: vi.fn() }).load('student_a');
    expect(input).toMatchObject({ start: { academicYear: '2026/2027', semesterNo: 2 }, approvedFirst: [11], subjects: [{ subjectCode: 'SECJ1013', compulsory: true }] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM public.offering_decision'), [5, 2, 4]);
  });
});

function deps(role: 'STUDENT' | 'COORDINATOR' = 'STUDENT') {
  const repository = { load: vi.fn(async () => toPlanningInput(rows())) };
  const d: PlanningDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: 'student_a', sessionId: 'test', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } })),
      access: { find: vi.fn(async () => ({ clerkUserId: 'student_a', appRole: role, accessStatus: 'ACTIVE' as const, roles: [role] })), initializeStudent: vi.fn() },
      profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
    },
    repository,
  };
  return { d, repository };
}
const req = (path: string, method = 'GET') => new Request('https://example.test' + path, { method });

describe('planning route', () => {
  it('ignores other paths', async () => { expect(await handlePlanningRequest(req('/api/other'), deps().d)).toBeNull(); });
  it('GET returns the input for the signed-in student', async () => {
    const { d, repository } = deps();
    const res = (await handlePlanningRequest(req('/api/planning/input'), d))!;
    expect(res.status).toBe(200);
    expect(repository.load).toHaveBeenCalledWith('student_a');
    expect(await res.json()).toEqual({ data: toPlanningInput(rows()) });
  });
  it('rejects non-students and other methods', async () => {
    expect((await handlePlanningRequest(req('/api/planning/input'), deps('COORDINATOR').d))!.status).toBe(403);
    const post = (await handlePlanningRequest(req('/api/planning/input', 'POST'), deps().d))!;
    expect(post.status).toBe(405); expect(post.headers.get('Allow')).toBe('GET');
  });
  it('asks for a profile when there is no curriculum', async () => {
    const { d, repository } = deps(); repository.load.mockResolvedValue(null as never);
    const res = (await handlePlanningRequest(req('/api/planning/input'), d))!;
    expect(res.status).toBe(403); expect(await res.json()).toMatchObject({ error: { code: 'PROFILE_SETUP_REQUIRED' } });
  });
  it('hides database errors', async () => {
    const { d, repository } = deps(); repository.load.mockRejectedValue(new Error('connection refused postgres://secret'));
    const res = (await handlePlanningRequest(req('/api/planning/input'), d))!;
    expect(res.status).toBe(503); expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
