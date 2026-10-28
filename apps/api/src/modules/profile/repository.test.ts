import { describe, expect, it, vi } from 'vitest';
import type { Parameter, Query } from './contracts';
import { createProfileRepository } from './repository';

describe('P001 profile options subject metadata', () => {
  it('reads subject category and compulsory metadata through the verified owner curriculum scope', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('cs.subject_category AS "subjectCategory"')) {
        expect(parameters).toEqual(['verified-student']);
        return [{ subjectId: 5, subjectCode: 'DEMO101', subjectName: 'Demo subject', creditHours: 3, subjectCategory: 'Industrial Training', isCompulsory: 1 }];
      }
      if (sql.includes('category_counts AS')) {
        expect(parameters).toEqual(['verified-student']);
        return [
          { category: 'Elective E1', requiredSubjects: 4, availableSubjects: 5 },
          { category: 'Elective E2', requiredSubjects: null, availableSubjects: 9 },
          { category: 'Core', requiredSubjects: null, availableSubjects: 31 },
        ];
      }
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query).options('verified-student');
    expect(result.subjects).toEqual([{ subjectId: 5, subjectCode: 'DEMO101', subjectName: 'Demo subject', creditHours: 3, subjectCategory: 'Industrial Training', isCompulsory: 1 }]);
    expect(result.subjectGroups).toEqual([
      { category: 'Elective E1', requiredSubjects: 4, availableSubjects: 5 },
      { category: 'Elective E2', requiredSubjects: null, availableSubjects: 9 },
      { category: 'Core', requiredSubjects: null, availableSubjects: 31 },
    ]);
    const subjectQuery = query.mock.calls.find(([sql]) => sql.includes('cs.subject_category AS "subjectCategory"'))?.[0];
    expect(subjectQuery).toContain('FROM public.student_profile p JOIN public.curriculum_subject cs USING(curriculum_id)');
    expect(subjectQuery).toContain('WHERE p.clerk_user_id=$1 ORDER BY s.subject_code');
    expect(subjectQuery).toContain('cs.is_compulsory AS "isCompulsory"');
  });

  it('aggregates category membership and requirement rows separately without multiplying counts', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void parameters; return sql.includes('category_counts AS') ? [] : []; });
    await createProfileRepository(query as Query).options('verified-student');
    const groupQuery = query.mock.calls.find(([sql]) => sql.includes('category_counts AS'))?.[0] ?? '';
    expect(groupQuery).toContain('SELECT curriculum_id FROM public.student_profile WHERE clerk_user_id=$1');
    expect(groupQuery).toContain('count(*)::integer AS "availableSubjects"');
    expect(groupQuery).toContain('GROUP BY cs.curriculum_id,cs.subject_category');
    expect(groupQuery).toContain('GROUP BY cr.curriculum_id,cr.requirement_type');
    expect(groupQuery).toContain('count(*)=count(cr.required_subjects) AND count(DISTINCT cr.required_subjects)=1');
    expect(groupQuery).toContain('THEN min(cr.required_subjects)::integer ELSE NULL END');
    expect(groupQuery).toContain('LEFT JOIN requirement_counts rc');
    expect(query.mock.calls.find(([sql]) => sql.includes('category_counts AS'))?.[1]).toEqual(['verified-student']);
  });
});

describe('P001 current semester persistence', () => {
  it('returns only the configured total from the verified student profile curriculum', async () => {
    const query = vi.fn(async () => [{ studentId: 9, studentName: 'Student', matricNo: null, curriculumId: 4,
      currentSemesterId: 22, totalCreditRequired: 131, weeklyWorkingHours: 0, availableStudyHours: 8,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional' }]) as unknown as Query & ReturnType<typeof vi.fn>;
    const found = await createProfileRepository(query).find('verified-student');
    expect(found?.totalCreditRequired).toBe(131);
    expect(query.mock.calls[0]![0]).toContain('c.total_credit_required AS "totalCreditRequired"');
    expect(query.mock.calls[0]![0]).toContain('WHERE p.clerk_user_id=$1');
    expect(query.mock.calls[0]![1]).toEqual(['verified-student']);
  });
  it('does not return a malformed configured credit total as profile data', async () => {
    const query = vi.fn(async () => [{ studentId: 9, studentName: 'Student', curriculumId: 4, totalCreditRequired: 12.5,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }]) as unknown as Query;
    await expect(createProfileRepository(query).find('verified-student')).rejects.toThrow('Invalid profile curriculum total');
  });
  it('validates configured current semester in the profile upsert and returns it', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('WITH saved AS') ? [{ studentId: 9, studentName: 'Student', matricNo: null,
      curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional' }] : []) as unknown as Query & ReturnType<typeof vi.fn>;
    const saved = await createProfileRepository(query).save('verified-student', {
      studentName: 'Student', matricNo: null, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8,
    });
    expect(saved.currentSemesterId).toBe(22);
    const [sql, parameters] = query.mock.calls[0]!;
    expect(sql).toContain('current_semester_id'); expect(sql).toContain('JOIN public.academic_semester s ON s.semester_id=$5');
    expect(sql).toContain('current_semester_id=EXCLUDED.current_semester_id');
    expect(parameters).toEqual(['verified-student', 'Student', null, 4, 22, 0, 8]);
  });
  it('rejects an unconfigured semester without accepting it as a valid profile', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT semester_id FROM public.academic_semester') ? [] : []) as unknown as Query;
    await expect(createProfileRepository(query).save('verified-student', {
      studentName: 'Student', matricNo: null, curriculumId: 4, currentSemesterId: 99, weeklyWorkingHours: 0, availableStudyHours: 8,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SEMESTER' });
  });
});
