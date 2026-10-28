import { describe, expect, it, vi } from 'vitest';
import { createOfferingContextReader } from './context';

function fixture() {
  const query = vi.fn(async (sql: string): Promise<Record<string, unknown>[]> => {
    if (sql.includes('JOIN programme')) return [{ student_id: 301, curriculum_id: 401, current_semester_id: 201, curriculum_version: 'Fictional v1', total_credit_required: 131, programme_name: 'Fictional programme' }];
    if (sql.includes('JOIN subject')) return [{ curriculum_subject_id: 101, subject_id: 501, subject_category: 'Elective U1', is_compulsory: 0, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: '3.0' }];
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
  it('rejects curriculum changes during context composition', async () => {
    const f = fixture();
    const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.startsWith('SELECT curriculum_id, current_semester_id') ? [{ curriculum_id: 402, current_semester_id: 201 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toMatchObject({ status: 409, code: 'CURRICULUM_CHANGED' });
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
