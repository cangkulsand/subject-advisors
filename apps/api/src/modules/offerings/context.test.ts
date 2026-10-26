import { describe, expect, it, vi } from 'vitest';
import { createOfferingContextReader } from './context';

function fixture() {
  const query = vi.fn(async (sql: string): Promise<Record<string, unknown>[]> => {
    if (sql.includes('JOIN programme')) return [{ student_id: 301, curriculum_id: 401, curriculum_version: 'Fictional v1', programme_name: 'Fictional programme' }];
    if (sql.includes('JOIN subject')) return [{ curriculum_subject_id: 101, subject_code: 'FIX101', subject_name: 'Fictional subject', credit_hours: '3.0' }];
    if (sql.includes('FROM academic_semester')) return [{ semester_id: 201, academic_year: '2026/2027', semester_no: 3 }];
    return [{ curriculum_id: 401 }];
  });
  return { query, reader: createOfferingContextReader(query) };
}
describe('read-only offering context adapter', () => {
  it('scopes profile to verified identity and subjects to that curriculum', async () => {
    const f = fixture(); const result = await f.reader('verified-user-a');
    expect(result).toMatchObject({ studentId: '301', curriculum: { curriculumId: '401' }, subjects: [{ curriculumSubjectId: '101', creditHours: 3 }], semesters: [{ semesterId: '201', semesterNo: 3 }] });
    expect(f.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE p.clerk_user_id = $1'), ['verified-user-a']);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('WHERE cs.curriculum_id = $1'), ['401']);
    expect(f.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE|CREATE)\b/.test(sql))).toBe(true);
  });
  it('returns null for a missing configured profile without creating anything', async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([]);
    expect(await f.reader('unknown')).toBeNull(); expect(f.query).toHaveBeenCalledOnce();
  });
  it('rejects curriculum changes during context composition', async () => {
    const f = fixture();
    const implementation = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => sql.startsWith('SELECT curriculum_id') ? [{ curriculum_id: 402 }] : implementation(sql));
    await expect(f.reader('verified-user-a')).rejects.toMatchObject({ status: 409, code: 'CURRICULUM_CHANGED' });
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
});
