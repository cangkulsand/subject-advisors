import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '../auth/errors';
import { createOfferingContextReader } from './context';

function fixture() {
  const query = vi.fn(async (sql: string, _parameters: unknown[] = []): Promise<Record<string, unknown>[]> => {
    void _parameters;
    if (sql.includes('JOIN programme')) return [{ student_id: 301, curriculum_id: 401, current_semester_id: 201, curriculum_version: 'Fictional v1', total_credit_required: 131, programme_name: 'Fictional programme' }];
    if (sql.includes('JOIN subject')) return [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Elective U1', is_compulsory: 0, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: '3.0' }];
    if (sql.includes('FROM subject_prerequisite')) return [];
    if (sql.includes('FROM academic_semester')) return [{ semester_id: 201, academic_year: '2026/2027', semester_no: 3 }];
    return [{ curriculum_id: 401, current_semester_id: 201 }];
  });
  return { query, reader: createOfferingContextReader(query) };
}
describe('read-only offering context adapter', () => {
  it('scopes profile to verified identity and subjects to that curriculum', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a');
    expect(result).toMatchObject({ studentId: '301', currentSemesterId: '201', curriculum: { curriculumId: '401', totalCreditRequired: 131 }, subjects: [{ curriculumSubjectId: '101', subjectId: '501', subjectCategory: 'Elective U1', isCompulsory: 0, creditHours: 3 }], semesters: [{ semesterId: '201', semesterNo: 3 }] });
    expect(f.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE p.clerk_user_id = $1'), ['verified-user-a']);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('WHERE cs.curriculum_id = $1'), ['401']);
    const subjectSql = f.query.mock.calls.find(([sql]) => sql.includes('JOIN subject'))?.[0] ?? '';
    expect(subjectSql).toContain('cs.subject_id'); expect(subjectSql).toContain('cs.subject_category'); expect(subjectSql).toContain('cs.is_compulsory');
    expect(subjectSql).not.toMatch(/\bs\.subject_category\b/);
    expect(f.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE|CREATE)\b/.test(sql))).toBe(true);
  });
  it.each([0, '0', -1, '131.5', 'bad', 2147483648])('rejects invalid configured curriculum credit requirement %j', async totalCreditRequired => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN programme')
      ? [{ student_id: 301, curriculum_id: 401, current_semester_id: 201, curriculum_version: 'Fictional v1', total_credit_required: totalCreditRequired, programme_name: 'Fictional programme' }]
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
  it('explicitly disabled enrichment performs no prerequisite query', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a', { includePrerequisites: false });
    expect(result?.subjects[0]?.prerequisites).toBeUndefined();
    expect(f.query.mock.calls.filter(([sql]) => sql.includes('FROM subject_prerequisite'))).toHaveLength(0);
  });
  it('batches and maps all direct requirement types from the full catalogue', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('JOIN subject')) return [
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
      if (sql.includes('JOIN subject')) return [
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
    duplicate.query.mockImplementation(async (sql: string, parameters) => sql.includes('FROM subject_prerequisite') ? [edge, edge] : sql.includes('JOIN subject') ? [
      { curriculum_subject_id: 101, subject_id: 501, subject_code: 'FIX101', subject_name: 'Source', credit_hours: 3 },
      { curriculum_subject_id: 102, subject_id: 502, subject_code: 'FIX102', subject_name: 'Target', credit_hours: 3 },
    ] : duplicateBase(sql, parameters));
    expect((await duplicate.reader('verified-user-a', { includePrerequisites: true }))?.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
    const failed = fixture(); const base = failed.query.getMockImplementation()!;
    failed.query.mockImplementation(async (sql, parameters) => { if (sql.includes('FROM subject_prerequisite')) throw new Error('optional metadata failure'); return base(sql, parameters); });
    expect(await failed.reader('verified-user-a', { includePrerequisites: true })).toMatchObject({ studentId: '301', subjects: [{ code: 'FIX101', prerequisites: { status: 'unavailable' } }] });
  });
  it('keeps an optional failure unavailable but still rejects a changed semester on the final recheck', async () => {
    const f = fixture(); const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM subject_prerequisite')) throw new Error('optional metadata unavailable');
      if (sql.startsWith('SELECT curriculum_id, current_semester_id')) return [{ curriculum_id: 401, current_semester_id: 202 }];
      return base(sql, parameters);
    });
    await expect(f.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ status: 409, code: 'PROFILE_SEMESTER_CHANGED' });
  });
  it('propagates essential context and final recheck failures after opting into enrichment', async () => {
    const coreFailure = fixture();
    coreFailure.query.mockRejectedValue(new Error('core catalogue unavailable'));
    await expect(coreFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toThrow('core catalogue unavailable');
    const recheckFailure = fixture(); const base = recheckFailure.query.getMockImplementation()!;
    recheckFailure.query.mockImplementation(async (sql, parameters) => {
      if (sql.startsWith('SELECT curriculum_id, current_semester_id')) throw new Error('profile recheck unavailable');
      return base(sql, parameters);
    });
    await expect(recheckFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toThrow('profile recheck unavailable');
  });
  it('rejects curriculum changes during context composition', async () => {
    const f = fixture();
    const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.startsWith('SELECT curriculum_id, current_semester_id') ? [{ curriculum_id: 402, current_semester_id: 201 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toMatchObject({ status: 409, code: 'CURRICULUM_CHANGED' });
  });
  it('still rechecks profile after prerequisite enrichment and propagates auth errors', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, parameters) => sql.startsWith('SELECT curriculum_id, current_semester_id')
      ? [{ curriculum_id: 402, current_semester_id: 201 }]
      : implementation(sql, parameters));
    await expect(f.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ code: 'CURRICULUM_CHANGED' });
    const authFailure = fixture(); const base = authFailure.query.getMockImplementation()!;
    authFailure.query.mockImplementation(async (sql, parameters) => {
      if (sql.includes('FROM subject_prerequisite')) throw new AuthError(403, 'ACCESS_DENIED', 'Denied.');
      return base(sql, parameters);
    });
    await expect(authFailure.reader('verified-user-a', { includePrerequisites: true })).rejects.toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
  });
  it('requires the saved semester and rejects a concurrent semester change', async () => {
    const missing = fixture(); const original = missing.query.getMockImplementation()!;
    missing.query.mockImplementation(async (sql: string) => sql.includes('JOIN programme')
      ? [{ student_id: 301, curriculum_id: 401, current_semester_id: null, curriculum_version: 'Fictional v1', total_credit_required: 131, programme_name: 'Fictional programme' }]
      : original(sql));
    await expect(missing.reader('verified-user-a')).rejects.toMatchObject({ code: 'PROFILE_SETUP_REQUIRED' });
    const changed = fixture(); const implementation = changed.query.getMockImplementation()!;
    changed.query.mockImplementation(async (sql: string) => sql.startsWith('SELECT curriculum_id, current_semester_id')
      ? [{ curriculum_id: 401, current_semester_id: 202 }]
      : implementation(sql));
    await expect(changed.reader('verified-user-a')).rejects.toMatchObject({ code: 'PROFILE_SEMESTER_CHANGED' });
  });
  it.each([0, 4, '3'])('rejects invalid configured semester number %j', async semesterNo => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('FROM academic_semester') ? [{ semester_id: 'id', academic_year: '2026/2027', semester_no: semesterNo }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured semester');
  });
  it('fails rather than assuming an empty catalogue when a reference query fails', async () => {
    const f = fixture(); f.query.mockRejectedValue(new Error('catalogue unavailable'));
    await expect(f.reader('verified-user-a')).rejects.toThrow('catalogue unavailable');
  });
  it.each([0, -1, 'bad', 2147483648])('rejects invalid underlying subject ID %j', async subjectId => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') ? [{ curriculum_subject_id: 101, subject_id: subjectId, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid PostgreSQL integer identifier');
  });
  it('rejects malformed curriculum category rather than classifying it', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') ? [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 12, is_compulsory: 0, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured subject category');
  });
  it('rejects malformed curriculum compulsory metadata', async () => {
    const f = fixture(); const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.includes('JOIN subject') ? [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Core', is_compulsory: 2, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: 3 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toThrow('Invalid configured compulsory flag');
  });
});
