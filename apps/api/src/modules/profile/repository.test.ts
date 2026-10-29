import { describe, expect, it, vi } from 'vitest';
import type { Parameter, Query } from './contracts';
import { createProfileRepository } from './repository';
import { createReferenceCache, type CacheBindings } from '../../cache/redis';
import { createRecordsRepository } from '../records/repository';

const cacheBindings: CacheBindings = {
  REDIS_CACHE_ENABLED: 'true', REDIS_CURRICULUM_CACHE_ENABLED: 'true', UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
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

describe('P001 curriculum-scoped options cache', () => {
  const bundleFor = (curriculumId: number) => ({
    subjects: [{ subjectId: curriculumId * 10, subjectCode: `S${curriculumId}`, subjectName: 'Subject', creditHours: 0,
      subjectCategory: 'Unmodeled category', isCompulsory: 0 }],
    groups: [{ category: 'Unmodeled category', requiredSubjects: null, availableSubjects: 1 }],
  });
  function setup(current: Record<string, number>, now: () => number = Date.now) {
    const cache = referenceCacheHarness(new Map(), now);
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) {
        const id = current[String(parameters[0])]; return id ? [{ curriculumId: id }] : [];
      }
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing' },
      ];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [
        { semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      if (sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')) return bundleFor(Number(parameters[0])).subjects;
      if (sql.includes('WITH category_counts AS')) return bundleFor(Number(parameters[0])).groups;
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    return { cache, query, profiles: createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true }) };
  }

  it('shares a curriculum bundle across students while resolving each association and preserves cold/warm query counts', async () => {
    const setupResult = setup({ 'student-a': 12, 'student-b': 12 });
    const first = await setupResult.profiles.options('student-a');
    const second = await setupResult.profiles.options('student-b');
    expect(first.subjects).toEqual(second.subjects);
    expect(first.subjectGroups).toEqual(second.subjectGroups);
    expect(setupResult.query).toHaveBeenCalledTimes(6); // cold 5; second request association only
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile'))).toHaveLength(2);
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'))).toHaveLength(1);
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('WITH category_counts AS'))).toHaveLength(1);
    expect(setupResult.cache.gets).toContain('sa:test:profile:v1:reference:curriculum-options:12');
    const cached = setupResult.cache.seed.get('sa:test:profile:v1:reference:curriculum-options:12') as { data: Record<string, unknown> };
    expect(Object.keys(cached.data).sort()).toEqual(['curriculumId', 'subjectGroups', 'subjects']);
    expect(JSON.stringify(cached.data)).not.toContain('student-a');
    expect(JSON.stringify(cached.data)).not.toContain('student-b');
    expect(first).not.toHaveProperty('curriculumId');
    expect(Object.keys(first)).toEqual(['curricula', 'subjects', 'semesters', 'subjectGroups']);
  });

  it('isolates different curricula and uses the captured ID for both loaders after an association change during a delayed load', async () => {
    let currentId = 12;
    let releaseSubject!: () => void;
    let startedSubject!: () => void;
    const subjectStarted = new Promise<void>(resolve => { startedSubject = resolve; });
    const subjectRelease = new Promise<void>(resolve => { releaseSubject = resolve; });
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return [{ curriculumId: currentId }];
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [];
      if (sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')) {
        const capturedId = Number(parameters[0]);
        if (capturedId === 12 && !releaseSubjectCalled) {
          releaseSubjectCalled = true; startedSubject(); await subjectRelease;
        }
        return bundleFor(capturedId).subjects;
      }
      if (sql.includes('WITH category_counts AS')) return bundleFor(Number(parameters[0])).groups;
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    let releaseSubjectCalled = false;
    const profiles = createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true });
    const inFlight = profiles.options('student-a');
    await subjectStarted;
    currentId = 34;
    releaseSubject();
    const c1 = await inFlight;
    const c2 = await profiles.options('student-a');
    expect(c1.subjects[0]?.subjectId).toBe(120);
    expect(c2.subjects[0]?.subjectId).toBe(340);
    expect(cache.gets).toContain('sa:test:profile:v1:reference:curriculum-options:12');
    expect(cache.gets).toContain('sa:test:profile:v1:reference:curriculum-options:34');
    const scopedSubjectCalls = query.mock.calls.filter(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'));
    const scopedGroupCalls = query.mock.calls.filter(([sql]) => sql.includes('WITH category_counts AS'));
    expect(scopedSubjectCalls.map(([, params]) => params)).toEqual([[12], [34]]);
    expect(scopedGroupCalls.map(([, params]) => params)).toEqual([[12], [34]]);
    expect(scopedSubjectCalls[0]?.[0]).toContain('WHERE cs.curriculum_id=$1 ORDER BY s.subject_code');
    expect(scopedSubjectCalls[0]?.[0]).not.toContain('student_profile');
  });

  it('returns empty curriculum arrays for a missing profile and still returns global options', async () => {
    const { profiles, query } = setup({});
    const result = await profiles.options('new-student');
    expect(result.subjects).toEqual([]);
    expect(result.subjectGroups).toEqual([]);
    expect(result.curricula).toHaveLength(1);
    expect(result.semesters).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(3); // live association + two global cache loads
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('WITH category_counts AS'))).toBe(false);
  });

  it.each(['extra-field', 'bad-id', 'bad-credit', 'bad-compulsory', 'bad-category', 'bad-required-count'])
  ('reloads a curriculum bundle with invalid %s data', async defect => {
    const cacheKey = 'sa:test:profile:v1:reference:curriculum-options:12';
    const now = Date.now();
    const badSubject = { subjectId: 120, subjectCode: 'S12', subjectName: 'Subject', creditHours: 0, subjectCategory: 'Core', isCompulsory: 0,
      ...(defect === 'extra-field' ? { studentId: 9 } : {}), ...(defect === 'bad-id' ? { subjectId: 0 } : {}),
      ...(defect === 'bad-credit' ? { creditHours: -1 } : {}), ...(defect === 'bad-compulsory' ? { isCompulsory: 2 } : {}),
      ...(defect === 'bad-category' ? { subjectCategory: null } : {}) };
    const badGroup = { category: 'Core', requiredSubjects: defect === 'bad-required-count' ? -1 : null, availableSubjects: 1 };
    const cache = referenceCacheHarness(new Map([[cacheKey, { version: 1, kind: 'curriculum-options', curriculumId: 12,
      namespace: 'test', dataset: 'profile', loadedAt: now - 1000, expiresAt: now + 100_000,
      data: { curriculumId: 12, subjects: [badSubject], subjectGroups: [badGroup] } }]]));
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return [{ curriculumId: 12 }];
      if (sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')) return bundleFor(Number(parameters[0])).subjects;
      if (sql.includes('WITH category_counts AS')) return bundleFor(Number(parameters[0])).groups;
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [];
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true }).options('student-a');
    expect(result.subjects).toEqual(bundleFor(12).subjects);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'))).toHaveLength(1);
    expect(cache.sets.some(({ key }) => key === cacheKey)).toBe(true);
  });

  it('expires the combined curriculum bundle after five minutes without sliding the deadline', async () => {
    let clock = 1_800_000_000_000;
    const setupResult = setup({ 'student-a': 12 }, () => clock);
    const countLoads = () => setupResult.query.mock.calls.filter(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')).length;
    await setupResult.profiles.options('student-a');
    expect(countLoads()).toBe(1);
    const key = 'sa:test:profile:v1:reference:curriculum-options:12';
    const firstExpiry = (setupResult.cache.seed.get(key) as { expiresAt: number }).expiresAt;
    clock += 299_000;
    await setupResult.profiles.options('student-a');
    expect(countLoads()).toBe(1);
    expect((setupResult.cache.seed.get(key) as { expiresAt: number }).expiresAt).toBe(firstExpiry);
    clock = firstExpiry + 1;
    await setupResult.profiles.options('student-a');
    expect(countLoads()).toBe(2);
  });
});

describe('P001 live record eligibility after curriculum cache changes', () => {
  it('rejects a C1-only subject after C1 options were warm and the current database association is C2', async () => {
    let currentCurriculumId = 12;
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return [{ curriculumId: currentCurriculumId }];
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [];
      if (sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')) {
        return parameters[0] === 12
          ? [{ subjectId: 1201, subjectCode: 'C1ONLY', subjectName: 'C1 subject', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1 }]
          : [];
      }
      if (sql.includes('WITH category_counts AS')) return [];
      if (sql.includes('WITH eligible AS')) return []; // No C1 subject is eligible under the live C2 association.
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true });
    const warmedC1 = await profiles.options('student-a');
    expect(warmedC1.subjects[0]?.subjectCode).toBe('C1ONLY');
    currentCurriculumId = 34;
    expect((await profiles.options('student-a')).subjects).toEqual([]);

    const records = createRecordsRepository(query);
    await expect(records.save('student-a', {
      subjectId: 1201, semesterId: null, status: 'COMPLETED', grade: null, recognizedCredits: null, remarks: null,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SUBJECT_OR_CREDITS' });
    const eligibility = query.mock.calls.find(([sql]) => sql.includes('WITH eligible AS'))?.[0] ?? '';
    expect(eligibility).toContain('JOIN public.curriculum_subject cs USING(curriculum_id)');
    expect(eligibility).toContain('WHERE p.clerk_user_id=$1 AND s.subject_id=$2');
    expect(query.mock.calls.find(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'))?.[1]).toEqual([12]);
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
