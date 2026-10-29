import { describe, expect, it, vi } from 'vitest';
import type { Parameter, Query } from './contracts';
import { createProfileRepository } from './repository';
import { createReferenceCache, type CacheBindings } from '../../cache/redis';

const cacheBindings: CacheBindings = {
  REDIS_CACHE_ENABLED: 'true', UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-secret', REDIS_CACHE_NAMESPACE: 'test', REDIS_CACHE_DATASET: 'profile',
};
function referenceCacheHarness(seed = new Map<string, unknown>(), now: () => number = Date.now) {
  const gets: string[] = [];
  const sets: Array<{ key: string; value: unknown; px: number }> = [];
  const get = vi.fn(async <T>(key: string): Promise<T | null> => {
    gets.push(key);
    return (seed.get(key) as T | undefined) ?? null;
  });
  const set = vi.fn(async (key: string, value: unknown, { px }: { px: number }) => {
    sets.push({ key, value, px }); seed.set(key, value); return 'OK';
  });
  const createClient = vi.fn((_config: { url: string; token: string }, _signal: AbortSignal) => {
    void _config; void _signal;
    return { get: <T>(key: string) => get(key) as Promise<T | null>, set };
  });
  return { cache: createReferenceCache(cacheBindings, { createClient, now }), gets, sets, get, set, seed, createClient };
}

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
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('caches only global curriculum and semester references across users while keeping owner queries live', async () => {
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' },
      ];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [
        { semesterId: 30, academicYear: 'whatever is configured', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      if (sql.includes('cs.subject_category AS "subjectCategory"')) return [
        { subjectId: parameters[0] === 'student-a' ? 101 : 202, subjectCode: 'SUB', subjectName: 'Subject', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1 },
      ];
      if (sql.includes('category_counts AS')) return [
        { category: String(parameters[0]), requiredSubjects: null, availableSubjects: 1 },
      ];
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache);

    const studentA = await profiles.options('student-a');
    const studentB = await profiles.options('student-b');

    expect(studentA.curricula).toEqual(studentB.curricula);
    expect(studentA.semesters).toEqual(studentB.semesters);
    expect(studentA.subjects[0]?.subjectId).toBe(101);
    expect(studentB.subjects[0]?.subjectId).toBe(202);
    expect(studentA.subjectGroups?.[0]?.category).toBe('student-a');
    expect(studentB.subjectGroups?.[0]?.category).toBe('student-b');
    expect(Object.keys(studentA)).toEqual(['curricula', 'subjects', 'semesters', 'subjectGroups']);
    // Mock query-count evidence: cold options loads four SQL queries; warm options loads only the two owner-scoped queries.
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT c.curriculum_id AS "curriculumId"'))).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT semester_id AS "semesterId"'))).toHaveLength(1);
    const subjectCalls = query.mock.calls.filter(([sql]) => sql.includes('cs.subject_category AS "subjectCategory"'));
    const groupCalls = query.mock.calls.filter(([sql]) => sql.includes('category_counts AS'));
    expect(subjectCalls.map(([, parameters]) => parameters)).toEqual([['student-a'], ['student-b']]);
    expect(groupCalls.map(([, parameters]) => parameters)).toEqual([['student-a'], ['student-b']]);
    expect(cache.gets).toEqual([
      'sa:test:profile:v1:reference:curricula', 'sa:test:profile:v1:reference:semesters',
      'sa:test:profile:v1:reference:curricula', 'sa:test:profile:v1:reference:semesters',
    ]);
    expect(cache.sets.map(({ key, px }) => [key, px > 0])).toEqual([
      ['sa:test:profile:v1:reference:curricula', true], ['sa:test:profile:v1:reference:semesters', true],
    ]);
  });

  it('applies the repository curriculum and semester TTLs independently', async () => {
    let clock = 1_800_000_000_000;
    const cache = referenceCacheHarness(new Map(), () => clock);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' },
      ];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [
        { semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      return [] as Record<string, unknown>[];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache);
    const countReads = (marker: string) => query.mock.calls.filter(([sql]) => sql.includes(marker)).length;

    await profiles.options('student-a');
    expect(countReads('SELECT c.curriculum_id AS "curriculumId"')).toBe(1);
    expect(countReads('SELECT semester_id AS "semesterId"')).toBe(1);
    clock += 61_000;
    await profiles.options('student-a');
    expect(countReads('SELECT c.curriculum_id AS "curriculumId"')).toBe(1);
    expect(countReads('SELECT semester_id AS "semesterId"')).toBe(2);
    clock = 1_800_000_000_000 + 301_000;
    await profiles.options('student-a');
    expect(countReads('SELECT c.curriculum_id AS "curriculumId"')).toBe(2);
    expect(countReads('SELECT semester_id AS "semesterId"')).toBe(3);
  });

  it.each(['extra-field', 'invalid-id'])('rejects cached curriculum rows with an independent %s defect', async defect => {
    const curriculumKey = 'sa:test:profile:v1:reference:curricula';
    const now = Date.now();
    const cache = referenceCacheHarness(new Map([[curriculumKey, {
      version: 1, kind: 'curricula', namespace: 'test', dataset: 'profile', loadedAt: now - 1000,
      expiresAt: now + 100_000, data: [{ curriculumId: defect === 'invalid-id' ? 0 : 10, curriculumVersion: 'V1', programmeId: 20,
        programmeCode: 'CS', programmeName: 'Computing', ...(defect === 'extra-field' ? { matricNo: 'must-not-appear' } : {}) }],
    }]]));
    const query = vi.fn(async (sql: string) => sql.includes('SELECT c.curriculum_id AS "curriculumId"') ? [
      { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' },
    ] : [] as Record<string, unknown>[] ) as unknown as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query, cache.cache).options('student-a');
    expect(result.curricula).toEqual([{ curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' }]);
    expect(JSON.stringify(result.curricula)).not.toContain('must-not-appear');
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT c.curriculum_id AS "curriculumId"'))).toHaveLength(1);
  });

  it('rejects cached semester number/type pairs that violate the database enum contract', async () => {
    const semesterKey = 'sa:test:profile:v1:reference:semesters';
    const now = Date.now();
    const cache = referenceCacheHarness(new Map([[semesterKey, {
      version: 1, kind: 'semesters', namespace: 'test', dataset: 'profile', loadedAt: now - 1000,
      expiresAt: now + 20_000, data: [{ semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'SHORT' }],
    }]]));
    const query = vi.fn(async (sql: string) => sql.includes('SELECT semester_id AS "semesterId"') ? [
      { semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' },
    ] : [] as Record<string, unknown>[]) as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query, cache.cache).options('student-a');
    expect(result.semesters).toEqual([{ semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' }]);
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT semester_id AS "semesterId"'))).toHaveLength(1);
    expect(cache.sets.map(({ key }) => key)).toContain(semesterKey);
  });

  it('rejects a cached semester option at save time using live Neon validation', async () => {
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' },
      ];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [
        { semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache);
    await profiles.options('student-a');
    const cacheReadsBeforeSave = cache.gets.length;
    await expect(profiles.save('student-a', {
      studentName: 'Student', matricNo: null, curriculumId: 10, currentSemesterId: 30,
      weeklyWorkingHours: 0, availableStudyHours: 8,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SEMESTER' });
    expect(query.mock.calls.some(([sql]) => sql.includes('JOIN public.academic_semester s ON s.semester_id=$5'))).toBe(true);
    expect(query.mock.calls.some(([sql, parameters]) => sql.includes('SELECT semester_id FROM public.academic_semester WHERE semester_id=$1') && parameters[0] === 30)).toBe(true);
    expect(cache.gets).toHaveLength(cacheReadsBeforeSave);
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
