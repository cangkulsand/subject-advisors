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
