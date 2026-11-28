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
    { curriculumSubjectId: 11, subjectId: 101, subjectCode: 'SECJ1013', subjectName: 'Programming Technique I', creditHours: 3, category: 'Core', compulsory: true, inOfferingForecast: true },
    { curriculumSubjectId: 12, subjectId: 102, subjectCode: 'SECJ1023', subjectName: 'Programming Technique II', creditHours: 3, category: 'Core', compulsory: true, inOfferingForecast: true },
    { curriculumSubjectId: 13, subjectId: 103, subjectCode: 'UHLB1112', subjectName: 'English 1', creditHours: 2, category: 'University Compulsory', compulsory: true, inOfferingForecast: true },
  ],
  rules: [{ curriculumSubjectId: 11, semesterType: 'NORMAL' }, { curriculumSubjectId: 13, semesterType: 'SHORT' }, { curriculumSubjectId: 13, semesterType: 'SHORT' }],
  prerequisites: [{ curriculumSubjectId: 12, requiredCurriculumSubjectId: 11 }],
  records: [{ subjectId: 101, status: 'FAILED', recognizedCredits: 0, remarks: null }, { subjectId: 101, status: 'COMPLETED', recognizedCredits: 3, remarks: null }, { subjectId: 999, status: 'COMPLETED', recognizedCredits: 3, remarks: null }],
  requirements: [{ requirementType: 'CORE', requiredSubjects: 2, requiredCredits: 6 }],
  semesters,
  decisions: [{ subjectId: 102, status: 'APPROVED' }, { subjectId: 103, status: 'REMOVED' }],
  ...extra,
});

describe('startSemester', () => {
  it('is the semester after the current one, with its row when configured', () => {
    expect(startSemester(semesters)).toEqual({ academicYear: '2026/2027', semesterNo: 2, semesterId: 4 });
    expect(startSemester(semesters.map(s => ({ ...s, isCurrent: false })))).toBeNull();
    expect(startSemester([{ ...semesters[0]! }])).toEqual({ academicYear: '2026/2027', semesterNo: 2, semesterId: null });
    expect(startSemester([{ ...semesters[0]!, semesterNo: 3 }])).toEqual({ academicYear: '2027/2028', semesterNo: 1, semesterId: null });
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
  it('maps mandatory, co-requisite and recommended links to the right fields', () => {
    const input = toPlanningInput(rows({ prerequisites: [
      { curriculumSubjectId: 12, requiredCurriculumSubjectId: 11 },
      { curriculumSubjectId: 12, requiredCurriculumSubjectId: 13, requirementType: 'MANDATORY' },
      { curriculumSubjectId: 11, requiredCurriculumSubjectId: 13, requirementType: 'COREQUISITE' },
      { curriculumSubjectId: 12, requiredCurriculumSubjectId: 13, requirementType: 'RECOMMENDED' },
    ] }));
    const byCode = (code: string) => input.subjects.find(s => s.subjectCode === code)!;
    expect(byCode('SECJ1023').prerequisites).toEqual([11, 13]);
    expect(byCode('SECJ1013').corequisites).toEqual([13]);
    expect(byCode('SECJ1023').corequisites).toBeUndefined();
    expect(byCode('UHLB1112').prerequisites).toEqual([]);
  });
  it('counts COMPLETED with full credits and EXEMPTED as the Subject records page saves them (remarks optional)', () => {
    const records = [
      { subjectId: 101, status: 'COMPLETED', recognizedCredits: 0, remarks: null },
      { subjectId: 102, status: 'EXEMPTED', recognizedCredits: 3, remarks: null },
      { subjectId: 103, status: 'EXEMPTED', recognizedCredits: 2, remarks: 'MUET band 4' },
    ];
    const input = toPlanningInput(rows({ records }));
    expect(input.passed).toEqual([12, 13]);
    expect(input.earnedCredits).toBe(5);
  });
  it('still ignores exemptions with impossible credits', () => {
    const input = toPlanningInput(rows({ records: [{ subjectId: 102, status: 'EXEMPTED', recognizedCredits: 9, remarks: null }] }));
    expect(input.passed).toEqual([]);
  });
  it('allows subjects outside the offering forecast (projects, industrial training) without a coordinator decision', () => {
    const project = { curriculumSubjectId: 14, subjectId: 104, subjectCode: 'SECJ3032', subjectName: 'Software Engineering Project I', creditHours: 2, category: 'Core', compulsory: true, inOfferingForecast: false };
    expect(toPlanningInput(rows({ subjects: [...rows().subjects, project] })).approvedFirst).toEqual([12, 14]);
    expect(toPlanningInput(rows({ subjects: [...rows().subjects, project], decisions: [] })).approvedFirst).toBeNull();
  });

  it('plans from the computed next semester when the admin has not created it yet, without coordinator decisions', () => {
    const input = toPlanningInput(rows({ semesters: [semesters[0]!] }));
    expect(input).toMatchObject({ start: { academicYear: '2026/2027', semesterNo: 2 }, approvedFirst: null });
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
      if (text.includes('FROM public.curriculum_subject cs JOIN public.subject')) return [{ curriculum_subject_id: 11, subject_id: 101, subject_code: 'SECJ1013', subject_name: 'PT1', credit_hours: 3, subject_category: 'Core', is_compulsory: 1, include_in_offering_forecast: true }, { curriculum_subject_id: 14, subject_id: 104, subject_code: 'SECJ4118', subject_name: 'Industrial Training', credit_hours: 8, subject_category: 'Core', is_compulsory: 1, include_in_offering_forecast: false }];
      return [];
    });
    const input = await createPlanningRepository({ query, transaction: vi.fn() }).load('student_a');
    // Hotfix 2026-11-28 (owner): the plan no longer depends on the coordinator's offering decisions; any subject may be planned.
    expect(input).toMatchObject({ start: { academicYear: '2026/2027', semesterNo: 2 }, approvedFirst: null, subjects: [{ subjectCode: 'SECJ1013', compulsory: true }, { subjectCode: 'SECJ4118' }] });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('FROM public.offering_decision'), expect.anything());
  });
  it('reads mandatory and co-requisite links with one parameterized query', async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes('FROM public.student_profile sp')) return [{ curriculum_id: 1, learning_centre_id: 2, programme_id: 5, curriculum_version: '2024', total_credit_required: 120, programme_name: 'SE' }];
      if (text.includes('FROM public.subject_prerequisite')) return [{ curriculum_subject_id: 11, required_curriculum_subject_id: 12, requirement_type: 'COREQUISITE' }];
      if (text.includes('FROM public.academic_semester')) return [{ semester_id: 3, academic_year: '2026/2027', semester_no: 1, max_subjects: 3, max_credits: 10, is_current: true }];
      if (text.includes('FROM public.curriculum_subject cs JOIN public.subject')) return [{ curriculum_subject_id: 11, subject_id: 101, subject_code: 'A', subject_name: 'A', credit_hours: 3, subject_category: 'Core', is_compulsory: 1 }, { curriculum_subject_id: 12, subject_id: 102, subject_code: 'B', subject_name: 'B', credit_hours: 3, subject_category: 'Core', is_compulsory: 1 }];
      return [];
    });
    const input = await createPlanningRepository({ query, transaction: vi.fn() }).load('student_a');
    const call = query.mock.calls.find(([text]) => String(text).includes('FROM public.subject_prerequisite')) as unknown as [string, unknown[]];
    expect(String(call[0])).toContain("p.requirement_type IN ('MANDATORY', 'COREQUISITE')");
    expect(String(call[0])).toContain('cs.curriculum_id = $1');
    expect(call[1]).toEqual([1]);
    expect(input?.subjects.find(s => s.curriculumSubjectId === 11)?.corequisites).toEqual([12]);
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
    scenarios: { read: vi.fn(), replace: vi.fn(), remove: vi.fn() },
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
    const body = await res.json() as { data: ReturnType<typeof toPlanningInput> };
    expect(body.data).toMatchObject(toPlanningInput(rows()));
    expect(body.data.baselineVersion).toMatch(/^[0-9a-f]{64}$/);
  });
  it('checks sign-in before the method', async () => {
    const { d } = deps(); (d.auth.verify as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error('no session'), { status: 401 }));
    const res = (await handlePlanningRequest(req('/api/planning/input', 'POST'), d))!;
    expect(res.status).not.toBe(405);
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
