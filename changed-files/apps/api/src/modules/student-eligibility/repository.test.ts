import { parse } from 'libpg-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '../auth/errors';
import { DEFAULT_STUDENT_CENTRE_ID } from '../forecasting/scope-provider';
import { fingerprint } from '../../../../../packages/shared/src/forecasting/engine/hash';
import { P002_ELIGIBILITY_POLICY_VERSION } from '../../../../../packages/shared/src/forecasting/p002-eligibility-policy';
import { createStudentEligibilityReader, OWN_ELIGIBILITY_SQL, type EligibilityQuery } from './repository';
import { handleStudentEligibilityRequest, STUDENT_ELIGIBILITY_PATH, type StudentEligibilityDependencies } from './routes';

const subject = {
  curriculum_subject_id: 301, curriculum_id: 33, subject_id: 401, subject_code: 'CS401',
  subject_name: 'Snapshot subject', credit_hours: 0, class_type: 'LECTURE', include_in_offering_forecast: true,
  prerequisite_details: null,
};
const semesters = [
  { semester_id: 4, academic_year: '2026/2027', semester_no: 1, is_current: true, semester_type: 'NORMAL', max_subjects: 5, max_credits: 15 },
  // A deliberately nonconsecutive configured semester: target selection follows the system semester order.
  { semester_id: 91, academic_year: '2028/2029', semester_no: 3, is_current: false, semester_type: 'SHORT', max_subjects: 2, max_credits: 6 },
];
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    student_id: 22, curriculum_id: 33, programme_id: 12, curriculum_version: '2026', programme_name: 'Fictional programme', total_credit_required: 120,
    semesters, subjects: [subject, { ...subject, subject_id: 402, curriculum_subject_id: 302, subject_code: 'CS402', credit_hours: 3 }, { ...subject, subject_id: 403, curriculum_subject_id: 303, subject_code: 'CS403', credit_hours: 3 }], links: [], rules: [], requirements: [], records: [], confirmations: [
      { confirmation_id: 701, semester_id: 91, revision: 3, updated_at: '2026-11-06T12:00:00.000Z', pick_deadline: '2026-11-20T12:00:00.000Z', offerings: [
        { confirmed_offering_id: 801, subject_id: 401, status: 'CONFIRMED' },
      ] },
    ], ...overrides,
  };
}
function queryFor(head: Record<string, unknown> | undefined) {
  return vi.fn<EligibilityQuery>(async () => head ? [head] : []);
}

describe('student eligibility single-statement own-profile snapshot', () => {
  it('parses the statement and binds the verified user and centre without SQL interpolation', async () => {
    await expect(parse(OWN_ELIGIBILITY_SQL)).resolves.toBeDefined();
    const query = queryFor(snapshot());
    const result = await createStudentEligibilityReader(query).readOwnEligibility("clerk'; DROP TABLE public.student_profile; --");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toBe(OWN_ELIGIBILITY_SQL);
    expect(query.mock.calls[0]![1]).toEqual(["clerk'; DROP TABLE public.student_profile; --", DEFAULT_STUDENT_CENTRE_ID]);
    expect(DEFAULT_STUDENT_CENTRE_ID).toBe(1);
    expect(result.input?.curriculum.curriculumId).toBe(33);
    expect(OWN_ELIGIBILITY_SQL).toContain('WHERE p.clerk_user_id = $1');
    expect(OWN_ELIGIBILITY_SQL).toContain('c.programme_id');
    expect(OWN_ELIGIBILITY_SQL).toContain('c.curriculum_version');
    expect(OWN_ELIGIBILITY_SQL).toContain('c.total_credit_required');
    expect(OWN_ELIGIBILITY_SQL).not.toMatch(/forecast_run|forecast_status|manual_selection|manual_override/i);
    expect(OWN_ELIGIBILITY_SQL).not.toMatch(/p\.semester_id|profile_current_semester/i);
  });

  it('requires a profile linked to the verified identity', async () => {
    const query = queryFor(undefined);
    await expect(createStudentEligibilityReader(query).readOwnEligibility('clerk-own')).rejects.toMatchObject({
      status: 409, code: 'PROFILE_SETUP_REQUIRED',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires exactly one own-profile SQL row before returning an internal snapshot', async () => {
    const query = vi.fn<EligibilityQuery>(async () => [snapshot(), snapshot({ student_id: 23 })]);
    await expect(createStudentEligibilityReader(query).readOwnEligibility('clerk-own')).rejects.toThrow('Duplicate eligibility owner rows');
  });

  it.each([
    ['missing', semesters.filter(row => !row.is_current)],
    ['duplicate', [...semesters, { ...semesters[0], semester_id: 5 }]],
  ])('rejects a %s system current semester', async (_kind, rows) => {
    const query = queryFor(snapshot({ semesters: rows }));
    await expect(createStudentEligibilityReader(query).readOwnEligibility('clerk-own')).rejects.toMatchObject({
      status: 409, code: 'CURRENT_SEMESTER_UNAVAILABLE',
    });
  });

  it('uses the next configured system semester rather than a student profile semester', async () => {
    const result = await createStudentEligibilityReader(queryFor(snapshot())).readOwnEligibility('clerk-own');
    expect(result.input?.scope).toEqual({ programmeId: 12, learningCentreId: 1, targetSemesterId: 91 });
    expect(result.input?.target).toMatchObject({ semesterId: 91, semesterType: 'SHORT', maxSubjects: 2, maxCredits: 6 });
    expect(result.scopeLabels?.targetSemesterLabel).toBe('2028/2029 · Semester 3 (Short semester)');
  });

  it('returns the exact own programme/centre/target scope when no confirmation exists', async () => {
    const result = await createStudentEligibilityReader(queryFor(snapshot({ confirmations: [] }))).readOwnEligibility('clerk-own');
    expect(result).toMatchObject({ input: null, emptyScope: { programmeId: 12, learningCentreId: 1, targetSemesterId: 91 } });
    expect(result.internal).toMatchObject({ studentId: 22, sourceSnapshot: { student_id: 22 }, sourceRevision: expect.stringMatching(/^fp1:/) });
  });

  it('uses the persisted confirmation snapshot even if forecasts are newer', async () => {
    const query = queryFor(snapshot());
    const result = await createStudentEligibilityReader(query).readOwnEligibility('clerk-own');
    expect(result.input).toMatchObject({ confirmationId: 701, confirmationRevision: 3, confirmedAt: '2026-11-06T12:00:00.000Z' });
    const sql = query.mock.calls[0]![0];
    expect(sql).toContain('public.offering_confirmation');
    expect(sql).toContain('public.confirmed_offering');
    expect(sql).not.toMatch(/forecast_run|forecast_status|manual_selection|manual_override/i);
  });

  it('reads academic history on each fresh statement and maps withdrawn records to zero-credit failed history', async () => {
    const query = vi.fn<EligibilityQuery>(async () => [snapshot({ records: [
      { subject_id: 401, status: 'WITHDRAWN', semester_id: 4, recognized_credits: 3 },
    ] })]);
    const reader = createStudentEligibilityReader(query);
    const first = await reader.readOwnEligibility('clerk-own');
    query.mockImplementationOnce(async () => [snapshot({ records: [
      { subject_id: 401, status: 'WITHDRAWN', semester_id: 4, recognized_credits: 3 },
      { subject_id: 402, status: 'COMPLETED', semester_id: null, recognized_credits: 0 },
    ] })]);
    const second = await reader.readOwnEligibility('clerk-own');
    expect(first.input?.student.records).toEqual([{ subjectId: 401, status: 'FAILED', semesterId: 4, recognizedCredits: 0 }]);
    expect(second.input?.student.records).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preserves completed, exempted, withdrawn and zero-credit records; no rows means unknown history', async () => {
    const records = [
      { subject_id: 401, status: 'COMPLETED', semester_id: null, recognized_credits: 0 },
      { subject_id: 402, status: 'EXEMPTED', semester_id: 4, recognized_credits: 3 },
      { subject_id: 403, status: 'WITHDRAWN', semester_id: 4, recognized_credits: 3 },
    ];
    const withRows = await createStudentEligibilityReader(queryFor(snapshot({ records }))).readOwnEligibility('clerk-own');
    expect(withRows.input?.student).toMatchObject({ historyCompleteness: 'COMPLETE', records: [
      { status: 'COMPLETED', recognizedCredits: 0 }, { status: 'EXEMPTED', recognizedCredits: 3 },
      { status: 'FAILED', recognizedCredits: 0 },
    ] });
    expect(withRows.input?.curriculum.subjects[0]?.creditHours).toBe(0);
    const empty = await createStudentEligibilityReader(queryFor(snapshot({ records: [] }))).readOwnEligibility('clerk-own');
    expect(empty.input?.student).toMatchObject({ historyCompleteness: 'UNKNOWN', records: [] });
  });

  it('keeps a confirmation with zero offerings as a confirmed own-curriculum empty list', async () => {
    const result = await createStudentEligibilityReader(queryFor(snapshot({ confirmations: [
        { confirmation_id: 701, semester_id: 91, revision: 4, updated_at: '2026-11-06T12:00:00Z', pick_deadline: '2026-11-20T12:00:00Z', offerings: [] },
    ] }))).readOwnEligibility('clerk-own');
    expect(result.emptyScope).toBeUndefined();
    expect(result.input).toMatchObject({ scope: { programmeId: 12, learningCentreId: 1, targetSemesterId: 91 }, confirmedSubjects: [] });
  });

  it.each([
    ['mandatory prerequisite link', { ...snapshot(), links: [{ prerequisite_id: null, curriculum_subject_id: 301, required_curriculum_subject_id: 302, requirement_type: 'MANDATORY' }] }],
    ['corequisite link', { ...snapshot(), links: [{ prerequisite_id: 2, curriculum_subject_id: 301, required_curriculum_subject_id: null, requirement_type: 'COREQUISITE' }] }],
    ['conditional prerequisite details', { ...snapshot(), subjects: [{ ...subject, prerequisite_details: '{malformed' }] }],
  ])('returns 503 for malformed %s', async (_label, head) => {
    const deps: StudentEligibilityDependencies = {
      auth: {
        verify: vi.fn(async () => ({ clerkUserId: 'clerk-own', sessionId: 'session', primaryEmail: { address: 'own@graduate.utm.my', verified: true } })),
        access: { find: vi.fn(async (clerkUserId) => ({ clerkUserId, appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
        profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
      },
      reader: createStudentEligibilityReader(queryFor(head)),
    };
    const response = await handleStudentEligibilityRequest(new Request(`https://test.invalid${STUDENT_ELIGIBILITY_PATH}`, {
      headers: { Authorization: 'Bearer test-only' },
    }), deps);
    expect(response?.status).toBe(503);
    expect(await response!.text()).not.toMatch(/malformed|prerequisite|SQL/i);
  });

  it('uses a 409 when the system has no configured next semester', async () => {
    const onlyCurrent = [semesters[0]];
    await expect(createStudentEligibilityReader(queryFor(snapshot({ semesters: onlyCurrent }))).readOwnEligibility('clerk-own'))
      .rejects.toMatchObject({ status: 409, code: 'NO_NEXT_SEMESTER' } satisfies Partial<AuthError>);
  });
});

it('maps valid mandatory and corequisite links without treating them as invalid configuration', async () => {
  const result = await createStudentEligibilityReader(queryFor(snapshot({ links: [
    { prerequisite_id: 1, curriculum_subject_id: 301, required_curriculum_subject_id: 302, requirement_type: 'MANDATORY' },
    { prerequisite_id: 2, curriculum_subject_id: 301, required_curriculum_subject_id: 303, requirement_type: 'COREQUISITE' },
  ] }))).readOwnEligibility('clerk-own');
  expect(result.input?.curriculum.subjects[0]?.prerequisiteLinks).toEqual([
    { prerequisiteId: 1, curriculumSubjectId: 301, requiredCurriculumSubjectId: 302, requirementType: 'MANDATORY' },
    { prerequisiteId: 2, curriculumSubjectId: 301, requiredCurriculumSubjectId: 303, requirementType: 'COREQUISITE' },
  ]);
});
it('does not inflate recognized credits above the curriculum catalogue', async () => {
  const result = await createStudentEligibilityReader(queryFor(snapshot({ records: [{ subject_id: 402, status: 'EXEMPTED', semester_id: null, recognized_credits: 999 }] }))).readOwnEligibility('clerk-own');
  expect(result.input?.student.records[0]?.recognizedCredits).toBeNull();
});

it('returns a JSON snapshot envelope with a revision that changes with academic records and confirmation state', async () => {
  const reader = createStudentEligibilityReader(queryFor(snapshot()));
  const original = await reader.readOwnEligibility('clerk-own');
  const withRecord = await createStudentEligibilityReader(queryFor(snapshot({ records: [
    { subject_id: 401, status: 'COMPLETED', semester_id: 4, recognized_credits: 3 },
  ] }))).readOwnEligibility('clerk-own');
  const changedConfirmation = await createStudentEligibilityReader(queryFor(snapshot({ confirmations: [
    { confirmation_id: 701, semester_id: 91, revision: 4, updated_at: '2026-11-07T12:00:00.000Z', pick_deadline: '2026-11-21T12:00:00Z', offerings: [] },
  ] }))).readOwnEligibility('clerk-own');
  expect(original.internal?.sourceRevision).not.toBe(withRecord.internal?.sourceRevision);
  expect(original.internal?.sourceRevision).not.toBe(changedConfirmation.internal?.sourceRevision);
  expect(original.internal?.sourceSnapshot).toEqual(snapshot());
  expect(original.internal?.sourceRevision).toBe(fingerprint({ policyVersion: P002_ELIGIBILITY_POLICY_VERSION, snapshot: snapshot() }));
  expect(original.internal?.studentId).toBe(22);
  expect(original.input?.pickDeadline).toBe('2026-11-20T12:00:00.000Z');
});
