import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '../auth/errors';
import { createOfferingContextReader } from './context';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const semesters = (target: { opens: string | null; closes: string | null } = { opens: '2026-11-01T00:00:00.000Z', closes: null }, current = 201) => [
  { semester_id: 201, academic_year: '2026/2027', semester_no: 1, is_current: current === 201, max_subjects: 6, max_credits: 18, selection_opens_at: null, selection_closes_at: null },
  { semester_id: 202, academic_year: '2026/2027', semester_no: 2, is_current: current === 202, max_subjects: 6, max_credits: 18, selection_opens_at: target.opens, selection_closes_at: target.closes },
];
const profileRow = { student_id: 301, curriculum_id: 401, learning_centre_id: 601, programme_id: 501, curriculum_version: 'Fictional v1', total_credit_required: 131, programme_name: 'Fictional programme', centre_name: 'Kuala Lumpur' };
function fixture() {
  const query = vi.fn(async (sql: string, _parameters: unknown[] = []): Promise<Record<string, unknown>[]> => {
    void _parameters;
    if (sql.includes('JOIN programme')) return [{ ...profileRow }];
    if (sql.includes('FROM offering_pick_withdrawal')) return [];
    if (sql.includes('FROM offering_decision')) return [{ subject_id: 501 }, { subject_id: 502 }, { subject_id: 503 }];
    if (sql.includes('JOIN subject')) return [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Elective U1', is_compulsory: 0, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: '3.0' }];
    if (sql.includes('FROM subject_prerequisite')) return [];
    if (sql.includes('FROM academic_record')) return [{ subject_id: 501, status: 'COMPLETED', recognized_credits: '3' }, { subject_id: 502, status: 'FAILED', recognized_credits: 0 }];
    if (sql.includes('FROM academic_semester')) return semesters();
    return [{ curriculum_id: 401, learning_centre_id: 601 }];
  });
  return { query, reader: createOfferingContextReader(query, () => NOW) };
}
describe('read-only offering context adapter', () => {
  it('scopes profile to verified identity and subjects to that curriculum', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a');
    expect(result).toMatchObject({ studentId: '301', currentSemesterId: '202', programmeId: '501', learningCentreId: '601', curriculum: { curriculumId: '401', totalCreditRequired: 131 },
      subjects: [{ curriculumSubjectId: '101', subjectId: '501', subjectCategory: 'Elective U1', isCompulsory: 0, creditHours: 3 }],
      semesters: [{ semesterId: '201', semesterNo: 1 }, { semesterId: '202', semesterNo: 2 }],
      window: { status: 'OPEN', targetSemesterId: '202', learningCentreName: 'Kuala Lumpur' }, limits: { maxSubjects: 6, maxCredits: 18 } });
    expect(f.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE p.clerk_user_id = $1'), ['verified-user-a']);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('WHERE cs.curriculum_id = $1'), ['401']);
    const subjectSql = f.query.mock.calls.find(([sql]) => sql.includes('JOIN subject'))?.[0] ?? '';
    expect(subjectSql).toContain('cs.subject_id'); expect(subjectSql).toContain('cs.subject_category'); expect(subjectSql).toContain('cs.is_compulsory');
    expect(subjectSql).toContain("COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS subject_name");
    expect(subjectSql).toContain("to_jsonb(cs)->'prerequisite_details' AS prerequisite_details");
    expect(subjectSql).not.toMatch(/\bs\.subject_category\b/);
    expect(f.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE|CREATE)\b/.test(sql))).toBe(true);
  });
  it('targets the next semester after the admin current semester and ignores the profile semester', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    // The profile would say semester 201; the admin current semester is 201 too, so the target is 202.
    f.query.mockImplementation(async (sql, parameters) => sql.includes('JOIN programme') ? [{ ...profileRow, current_semester_id: 201 }] : base(sql, parameters));
    const result = await f.reader('verified-user-a');
    expect(result).toMatchObject({ currentSemesterId: '202', window: { targetSemesterId: '202' } });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('current_semester_id'))).toBe(false);
    // Admin moves forward: the target follows, whatever the profile says.
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM academic_semester') ? [...semesters(undefined, 202), { semester_id: 203, academic_year: '2026/2027', semester_no: 3, is_current: false, max_subjects: 4, max_credits: 10, selection_opens_at: null, selection_closes_at: null }] : base(sql, parameters));
    expect(await f.reader('verified-user-a')).toMatchObject({ currentSemesterId: '203', window: { status: 'NOT_SCHEDULED', targetSemesterId: '203' }, limits: { maxSubjects: 4, maxCredits: 10 }, subjects: [] });
    // No later semester: NO_NEXT_SEMESTER and no target id.
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM academic_semester') ? semesters(undefined, 202) : base(sql, parameters));
    const none = await f.reader('verified-user-a');
    expect(none).toMatchObject({ window: { status: 'NO_NEXT_SEMESTER', targetSemesterId: null }, subjects: [] });
    expect(none?.currentSemesterId).toBeUndefined();
  });
  it('returns NO_LEARNING_CENTRE when the profile has no centre', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('JOIN programme') ? [{ ...profileRow, learning_centre_id: null, centre_name: null }]
      : sql.startsWith('SELECT curriculum_id, learning_centre_id') ? [{ curriculum_id: 401, learning_centre_id: null }] : base(sql, parameters));
    const result = await f.reader('verified-user-a');
    expect(result).toMatchObject({ learningCentreId: null, subjects: [], window: { status: 'NO_LEARNING_CENTRE', targetSemesterId: '202', learningCentreName: null } });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('SELECT d.subject_id FROM offering_decision'))).toBe(false);
  });
  it('returns NOT_OPEN with the opening date before selection opens and lists no subjects', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM academic_semester') ? semesters({ opens: '2026-11-20T00:00:00.000Z', closes: '2026-12-01T00:00:00.000Z' }) : base(sql, parameters));
    expect(await f.reader('verified-user-a')).toMatchObject({ subjects: [], window: { status: 'NOT_OPEN', selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z' } });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('SELECT d.subject_id FROM offering_decision'))).toBe(false);
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM academic_semester') ? semesters({ opens: null, closes: null }) : base(sql, parameters));
    expect(await f.reader('verified-user-a')).toMatchObject({ subjects: [], window: { status: 'NOT_SCHEDULED', selectionOpensAt: null } });
  });
  it('returns CLOSED after the closing time and still lists the approved subjects', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM academic_semester') ? semesters({ opens: '2026-11-01T00:00:00.000Z', closes: '2026-11-09T00:00:00.000Z' }) : base(sql, parameters));
    expect(await f.reader('verified-user-a')).toMatchObject({ window: { status: 'CLOSED' }, subjects: [{ code: 'FIX101' }] });
  });
  it('lists only approved subjects of the student\'s curriculum when open', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM offering_pick_withdrawal')) return [];
      if (sql.includes('FROM offering_decision')) return [{ subject_id: 501 }, { subject_id: 999 }];
      if (sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal')) return [
        { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Approved', credit_hours: 3 },
        { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Pending', credit_hours: 3 },
      ];
      return base(sql, parameters);
    });
    const result = await f.reader('verified-user-a');
    expect(result?.subjects.map(subject => subject.code)).toEqual(['FIX101']);
    expect(result?.prerequisiteCatalogue?.map(subject => subject.code)).toEqual(['FIX101', 'FIX102']);
    const decisionCall = f.query.mock.calls.find(([sql]) => sql.includes('SELECT d.subject_id FROM offering_decision'))!;
    expect(decisionCall[1]).toEqual(['501', '601', '202']);
  });
  it('keeps prerequisites of an offered subject resolvable when the required subject is not offered', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM offering_pick_withdrawal')) return [];
      if (sql.includes('FROM offering_decision')) return [{ subject_id: 501 }];
      if (sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal')) return [
        { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Offered', credit_hours: 3 },
        { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Not offered', credit_hours: 3 },
      ];
      if (sql.includes('FROM subject_prerequisite')) return [{ curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 }];
      return base(sql, parameters);
    });
    const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.subjects).toHaveLength(1);
    expect(result?.subjects[0]?.prerequisites).toEqual({ status: 'available', items: [{ requiredCurriculumSubjectId: '102', requirementType: 'MANDATORY' }] });
  });
  it('returns withdrawn subjects for the student, newest first', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('FROM offering_pick_withdrawal') ? [
      { subject_id: 501, subject_code: 'FIX101', subject_name: 'Older', withdrawn_at: '2026-11-08T10:00:00.000Z' },
      { subject_id: 502, subject_code: 'FIX102', subject_name: 'Newer', withdrawn_at: '2026-11-09T10:00:00.000Z' },
    ] : base(sql, parameters));
    const result = await f.reader('verified-user-a');
    expect(result?.withdrawnSubjects).toEqual([
      { subjectId: '502', code: 'FIX102', name: 'Newer', withdrawnAt: '2026-11-09T10:00:00.000Z' },
      { subjectId: '501', code: 'FIX101', name: 'Older', withdrawnAt: '2026-11-08T10:00:00.000Z' },
    ]);
    expect(f.query.mock.calls.find(([sql]) => sql.includes('FROM offering_pick_withdrawal'))![1]).toEqual(['301', '202', '501', '601']);
  });
  it('re-approved subject hides the note: the withdrawal query excludes subjects APPROVED again in the student scope', async () => {
    const f = fixture();
    await f.reader('verified-user-a');
    const [sql, parameters] = f.query.mock.calls.find(([text]) => text.includes('FROM offering_pick_withdrawal'))!;
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM offering_decision d WHERE d\.subject_id = w\.subject_id AND d\.status = 'APPROVED'\s+AND d\.programme_id = \$3 AND d\.learning_centre_id = \$4 AND d\.semester_id = \$2\)/);
    expect(parameters).toEqual(['301', '202', '501', '601']);
  });
  it.each([0, '0', -1, '131.5', 'bad', 2147483648])('rejects invalid configured curriculum credit requirement %j', async totalCreditRequired => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN programme')
      ? [{ student_id: 301, curriculum_id: 401, learning_centre_id: 601, programme_id: 501, curriculum_version: 'Fictional v1', total_credit_required: totalCreditRequired, programme_name: 'Fictional programme', centre_name: 'Kuala Lumpur' }]
      : implementation(sql));
    if (totalCreditRequired === 0 || totalCreditRequired === '0') {
      expect((await f.reader('verified-user-a'))?.curriculum.totalCreditRequired).toBe(0);
    } else await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured curriculum credit requirement');
  });
  it('returns null for a missing configured profile without creating anything', async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([]);
    expect(await f.reader('unknown')).toBeNull(); expect(f.query).toHaveBeenCalledOnce();
  });
  it('keeps the default context unchanged and does not query optional prerequisites', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a');
    expect(result?.subjects[0]?.prerequisites).toBeUndefined();
    expect(f.query.mock.calls.filter(([sql]) => sql.includes('FROM subject_prerequisite'))).toHaveLength(0);
  });
  it('returns known-empty prerequisites only when explicitly requested', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.subjects[0]?.prerequisites).toEqual({ status: 'available', items: [] });
    expect(f.query.mock.calls.filter(([sql]) => sql.includes('FROM subject_prerequisite'))).toHaveLength(1);
    expect(f.query.mock.calls.find(([sql]) => sql.includes('FROM subject_prerequisite'))).toEqual([
      expect.stringContaining('WHERE src.curriculum_id = $1'), ['401'],
    ]);
  });
  it('reads the student academic history for eligibility, only when prerequisites are requested', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.history).toEqual({ status: 'available', records: [
      { subjectId: '501', status: 'COMPLETED', recognizedCredits: 3 }, { subjectId: '502', status: 'FAILED', recognizedCredits: 0 },
    ] });
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('SELECT subject_id, status, recognized_credits FROM academic_record WHERE student_id = $1'), ['301']);
    const plain = fixture(); expect((await plain.reader('verified-user-a'))?.history).toBeUndefined();
  });
  it('marks history unavailable, without failing the context, when the records query fails', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => { if (sql.includes('FROM academic_record')) throw new Error('records down'); return base(sql, parameters); });
    expect(await f.reader('verified-user-a', { includePrerequisites: true })).toMatchObject({ studentId: '301', history: { status: 'unavailable' } });
  });
  it('passes validated full AND/OR curriculum details alongside legacy direct edges', async () => {
    const f = fixture();
    const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal') ? [
      { curriculum_subject_id: 101, subject_id: 501, subject_category: 'Core', is_compulsory: 1, subject_code: 'SECD2613', subject_name: 'System analysis', credit_hours: 3 },
      { curriculum_subject_id: 102, subject_id: 502, subject_category: 'Core', is_compulsory: 1, subject_code: 'SECR3104', subject_name: 'Applications development', credit_hours: 4,
        prerequisite_details: { expression: { operator: 'allOf', operands: [
          { operator: 'course', code: 'SECD2613' }, { operator: 'anyOf', operands: [
            { operator: 'course', code: 'SECD2613' }, { operator: 'course', code: 'SECD2523' },
          ] },
        ] }, fixedCourseEdgesShown: true, sourcePrerequisiteStatus: 'Yes', sourceCells: { E: 'E4', K: 'K19' },
          conditions: [{ type: 'cgpa', operator: '>=', value: 2, sourceCell: 'K19' }], conditionNote: 'Alternative code note.' } },
      { curriculum_subject_id: 103, subject_id: 503, subject_category: 'Core', is_compulsory: 1, subject_code: 'SECD2523', subject_name: 'Database', credit_hours: 3 },
    ] : implementation(sql, parameters));
    const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.subjects[1]?.prerequisites).toMatchObject({ status: 'available', details: {
      expression: { operator: 'allOf', operands: [ { operator: 'course', code: 'SECD2613' }, { operator: 'anyOf' } ] },
      conditionNote: 'Alternative code note.', conditions: [{ type: 'cgpa', operator: '>=', value: 2 }],
    } });
    expect(result?.subjects[1]?.prerequisites?.status === 'available' && result.subjects[1].prerequisites.details)
      .not.toHaveProperty('sourceCells');
    expect(result?.subjects[1]?.prerequisites?.status === 'available' && result.subjects[1].prerequisites.details?.conditions[0])
      .not.toHaveProperty('sourceCell');
  });
  it('marks malformed non-null prerequisite details unavailable instead of known-empty', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal')
      ? [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Core', is_compulsory: 1, subject_code: 'FIX101', subject_name: 'Legacy name', credit_hours: 3,
          prerequisite_details: { expression: { operator: 'course', code: 'OUTSIDE999' }, fixedCourseEdgesShown: true, sourcePrerequisiteStatus: 'Yes', sourceCells: { E: 'E2' }, conditions: [], conditionNote: null } }]
      : implementation(sql, parameters));
    expect((await f.reader('verified-user-a', { includePrerequisites: true }))?.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
  });
  it('explicitly disabled enrichment performs no prerequisite query', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a', { includePrerequisites: false });
    expect(result?.subjects[0]?.prerequisites).toBeUndefined();
    expect(f.query.mock.calls.filter(([sql]) => sql.includes('FROM subject_prerequisite'))).toHaveLength(0);
  });
  it('batches and maps all direct requirement types from the full catalogue', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal')) return [
        { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Source', credit_hours: 3 },
        { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Target', credit_hours: 3 },
      ];
      if (sql.includes('FROM subject_prerequisite')) return [
        { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 },
        { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'RECOMMENDED', source_curriculum_id: 401, required_curriculum_id: 401 },
        { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'COREQUISITE', source_curriculum_id: 401, required_curriculum_id: 401 },
      ];
      return implementation(sql, parameters);
    });
    const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.subjects[0]?.prerequisites).toEqual({ status: 'available', items: [
      { requiredCurriculumSubjectId: '102', requirementType: 'MANDATORY' },
      { requiredCurriculumSubjectId: '102', requirementType: 'RECOMMENDED' },
      { requiredCurriculumSubjectId: '102', requirementType: 'COREQUISITE' },
    ] });
    expect(result?.subjects[1]?.prerequisites).toEqual({ status: 'available', items: [] });
    expect(f.query.mock.calls.filter(([sql]) => sql.includes('FROM subject_prerequisite'))).toHaveLength(1);
  });
  it.each([
    { curriculum_subject_id: 0, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 },
    { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'UNKNOWN', source_curriculum_id: 401, required_curriculum_id: 401 },
    { curriculum_subject_id: 999, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 },
    { curriculum_subject_id: 101, required_curriculum_subject_id: 999, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 },
    { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 402, required_curriculum_id: 401 },
    { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 402 },
    { curriculum_subject_id: 101, required_curriculum_subject_id: 101, requirement_type: 'MANDATORY', source_curriculum_id: 401, required_curriculum_id: 401 },
  ])('degrades malformed prerequisite rows to unavailable: %j', async row => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal')) return [
        { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Source', credit_hours: 3 },
        { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Target', credit_hours: 3 },
      ];
      if (sql.includes('FROM subject_prerequisite')) return [row];
      return implementation(sql, parameters);
    });
    const result = await f.reader('verified-user-a', { includePrerequisites: true });
    expect(result?.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
  });
  it('degrades duplicate exact edges and optional query failures without losing core context', async () => {
    const duplicate = fixture();
    const edge = { curriculum_subject_id: 101, required_curriculum_subject_id: 102, requirement_type: 'RECOMMENDED', source_curriculum_id: 401, required_curriculum_id: 401 };
    const duplicateBase = duplicate.query.getMockImplementation()!;
    duplicate.query.mockImplementation(async (sql: string, parameters) => sql.includes('FROM subject_prerequisite') ? [edge, edge] : sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal') ? [
      { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Source', credit_hours: 3 },
      { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Target', credit_hours: 3 },
    ] : duplicateBase(sql, parameters));
    expect((await duplicate.reader('verified-user-a', { includePrerequisites: true }))?.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
    const failed = fixture(); const base = failed.query.getMockImplementation()!;
    failed.query.mockImplementation(async (sql, parameters) => { if (sql.includes('FROM subject_prerequisite')) throw new Error('optional metadata failure'); return base(sql, parameters); });
    expect(await failed.reader('verified-user-a', { includePrerequisites: true })).toMatchObject({ studentId: '301', subjects: [{ code: 'FIX101', prerequisites: { status: 'unavailable' } }] });
  });
  it('keeps an optional failure unavailable but still rejects a changed learning centre on the final recheck', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM subject_prerequisite')) throw new Error('optional metadata unavailable');
      if (sql.startsWith('SELECT curriculum_id, learning_centre_id')) return [{ curriculum_id: 401, learning_centre_id: 699 }];
      return base(sql, parameters);
    });
    await expect(f.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ status: 409, code: 'PROFILE_CHANGED' });
  });
  it('propagates essential context and final recheck failures after opting into enrichment', async () => {
    const coreFailure = fixture();
    coreFailure.query.mockRejectedValue(new Error('core catalogue unavailable'));
    await expect(coreFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toThrow('core catalogue unavailable');
    const recheckFailure = fixture(); const base = recheckFailure.query.getMockImplementation()!;
    recheckFailure.query.mockImplementation(async (sql, parameters) => {
      if (sql.startsWith('SELECT curriculum_id, learning_centre_id')) throw new Error('profile recheck unavailable');
      return base(sql, parameters);
    });
    await expect(recheckFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toThrow('profile recheck unavailable');
  });
  it('rejects curriculum changes during context composition', async () => {
    const f = fixture();
    const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.startsWith('SELECT curriculum_id, learning_centre_id') ? [{ curriculum_id: 402, learning_centre_id: 601 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toMatchObject({ status: 409, code: 'CURRICULUM_CHANGED' });
  });
  it('still rechecks profile after prerequisite enrichment and propagates auth errors', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.startsWith('SELECT curriculum_id, learning_centre_id')
      ? [{ curriculum_id: 402, learning_centre_id: 601 }]
      : implementation(sql, parameters));
    await expect(f.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ code: 'CURRICULUM_CHANGED' });
    const authFailure = fixture(); const base = authFailure.query.getMockImplementation()!;
    authFailure.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM subject_prerequisite')) throw new AuthError(403, 'ACCESS_DENIED', 'Denied.');
      return base(sql, parameters);
    });
    await expect(authFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
  });
  it('does not require a profile semester and rejects a concurrent learning centre change', async () => {
    const changed = fixture(); const implementation = changed.query.getMockImplementation()!;
    changed.query.mockImplementation(async (sql: string, parameters) => sql.startsWith('SELECT curriculum_id, learning_centre_id')
      ? [{ curriculum_id: 401, learning_centre_id: 602 }]
      : implementation(sql, parameters));
    await expect(changed.reader('verified-user-a')).rejects.toMatchObject({ code: 'PROFILE_CHANGED' });
  });
  it.each([0, 4, '3'])('rejects invalid configured semester number %j', async semesterNo => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('FROM academic_semester') ? [{ semester_id: 'id', academic_year: '2026/2027', semester_no: semesterNo, is_current: true, max_subjects: 6, max_credits: 18 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured semester');
  });
  it('fails rather than assuming an empty catalogue when a reference query fails', async () => {
    const f = fixture(); f.query.mockRejectedValue(new Error('catalogue unavailable'));
    await expect(f.reader('verified-user-a')).rejects.toThrow('catalogue unavailable');
  });
  it.each([0, -1, 'bad', 2147483648])('rejects invalid underlying subject ID %j', async subjectId => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal') ? [{ curriculum_subject_id: 101, subject_id: subjectId, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid PostgreSQL integer identifier');
  });
  it('rejects malformed curriculum category rather than classifying it', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal') ? [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 12, is_compulsory: 0, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured subject category');
  });
  it('rejects malformed curriculum compulsory metadata', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') && !sql.includes('offering_pick_withdrawal') ? [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Core', is_compulsory: 2, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured compulsory flag');
  });
});
