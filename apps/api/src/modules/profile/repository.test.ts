import { describe, expect, it, vi } from 'vitest';
import type { Parameter, Query } from './contracts';
import { createProfileRepository } from './repository';
import { createReferenceCache, type CacheBindings } from '../../cache/redis';
import { createRecordsRepository } from '../records/repository';

/** S3-P004-037: a save sends an intake year; new profiles probe their programme's offered curricula (here: the one curriculum). */
const INTAKE_YEAR = new Date().getUTCFullYear();
const offeredProbe = (sql: string, curriculumId: number) =>
  sql.includes('FROM public.curriculum o JOIN public.programme g') ? [{ curriculumId, curriculumVersion: 'V1', effectiveYear: null }] : null;

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
    expect(subjectQuery).toContain("COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS \"subjectName\"");
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
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('caches only global curriculum and semester references across users while keeping owner queries live', async () => {
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
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
    expect(studentA.currentAcademicYear).toBeNull();
    expect(studentA.currentSemester).toBeNull();
    expect(Object.keys(studentA)).toEqual(['curricula', 'subjects', 'semesters', 'currentSemester', 'currentAcademicYear', 'subjectGroups', 'learningCentres']);
    // Cold options loads the catalogue queries; warm options still reads the live marker, the centres and both owner scopes.
    expect(query).toHaveBeenCalledTimes(10);
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
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
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
        programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120, ...(defect === 'extra-field' ? { matricNo: 'must-not-appear' } : {}) }],
    }]]));
    const query = vi.fn(async (sql: string) => sql.includes('SELECT c.curriculum_id AS "curriculumId"') ? [
      { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
    ] : [] as Record<string, unknown>[] ) as unknown as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query, cache.cache).options('student-a');
    expect(result.curricula).toEqual([{ curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 }]);
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
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
      ];
      if (sql.includes('SELECT semester_id AS "semesterId"')) return [
        { semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      if (sql.includes('FROM public.learning_centre WHERE learning_centre_id=$1')) return [{ learning_centre_id: 1 }];
      if (sql.includes('FROM public.academic_semester a WHERE a.is_current=true')) return [{ semesterId: 30, academicYear: 'configured', semesterNo: 1, semesterType: 'NORMAL' }];
      return offeredProbe(sql, 10) ?? [];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache);
    await profiles.options('student-a');
    const cacheReadsBeforeSave = cache.gets.length;
    await expect(profiles.save('student-a', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 10, currentSemesterId: 30,
      weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_CURRICULUM' });
    expect(query.mock.calls.some(([sql]) => sql.includes('JOIN public.academic_semester s ON s.semester_id=$5'))).toBe(true);
    expect(query.mock.calls.some(([sql, parameters]) => sql.includes('SELECT semester_id AS "semesterId" FROM public.academic_semester WHERE semester_id=$1') && parameters[0] === 30)).toBe(true);
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
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
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
    expect(setupResult.query).toHaveBeenCalledTimes(10); // cold 7 incl. centres and live marker; warm request 3 live reads (association, centres, marker)
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile'))).toHaveLength(2);
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('FROM public.curriculum_subject cs JOIN public.subject s'))).toHaveLength(1);
    expect(setupResult.query.mock.calls.filter(([sql]) => sql.includes('WITH category_counts AS'))).toHaveLength(1);
    expect(setupResult.cache.gets).toContain('sa:test:profile:v1:reference:curriculum-options:12');
    const cached = setupResult.cache.seed.get('sa:test:profile:v1:reference:curriculum-options:12') as { data: Record<string, unknown> };
    expect(Object.keys(cached.data).sort()).toEqual(['curriculumId', 'subjectGroups', 'subjects']);
    expect(JSON.stringify(cached.data)).not.toContain('student-a');
    expect(JSON.stringify(cached.data)).not.toContain('student-b');
    expect(first).not.toHaveProperty('curriculumId');
    expect(first.currentAcademicYear).toBeNull();
    expect(Object.keys(first)).toEqual(['curricula', 'subjects', 'semesters', 'currentSemester', 'currentAcademicYear', 'subjectGroups', 'learningCentres']);
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
    expect(query).toHaveBeenCalledTimes(5); // live association + centres + live marker + two global cache loads
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
    const query = vi.fn(async (sql: string) => offeredProbe(sql, 4) ?? (sql.includes('INSERT INTO public.student_profile') ? [{ studentId: 9, studentName: 'Student', matricNo: null, learningCentreId: 1,
      curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional' }] : [])) as unknown as Query & ReturnType<typeof vi.fn>;
    const saved = await createProfileRepository(query).save('verified-student', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    });
    expect(saved.currentSemesterId).toBe(22);
    expect(saved.learningCentreId).toBe(1);
    const [sql, parameters] = query.mock.calls.find(([text]) => text.includes('INSERT INTO public.student_profile'))!;
    expect(sql).toContain('JOIN public.learning_centre lc ON lc.learning_centre_id=$8 AND (lc.is_active OR lc.learning_centre_id=$9)');
    expect(sql).toContain('learning_centre_id=EXCLUDED.learning_centre_id');
    expect(sql).toContain('current_semester_id'); expect(sql).toContain('JOIN public.academic_semester s ON s.semester_id=$5');
    expect(sql).toContain('SELECT semester_id FROM public.academic_semester WHERE is_current=true FOR SHARE');
    expect(sql).toContain('s.semester_id=cp.semester_id');
    expect(sql).toContain('current_semester_id=EXCLUDED.current_semester_id');
    expect(parameters).toEqual(['verified-student', 'Student', null, 4, 22, 0, 8, 1, null, INTAKE_YEAR]);
  });
  it('rejects an unconfigured semester without accepting it as a valid profile', async () => {
    const query = vi.fn(async (sql: string) => offeredProbe(sql, 4) ?? (sql.includes('FROM public.learning_centre WHERE learning_centre_id=$1') ? [{ learning_centre_id: 1 }] : [])) as unknown as Query;
    await expect(createProfileRepository(query).save('verified-student', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 4, currentSemesterId: 99, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SEMESTER' });
  });
  it('rejects profile saves when the admin has not configured a current academic year', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT semester_id AS "semesterId" FROM public.academic_semester WHERE semester_id=$1')) return [{ semesterId: 99 }];
      if (sql.includes('FROM public.learning_centre WHERE learning_centre_id=$1')) return [{ learning_centre_id: 1 }];
      return offeredProbe(sql, 4) ?? [];
    }) as unknown as Query;
    await expect(createProfileRepository(query).save('student', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 4, currentSemesterId: 99, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    })).rejects.toMatchObject({ status: 503, code: 'ACADEMIC_SEMESTER_UNAVAILABLE' });
  });
  it('rejects a different semester in the same year even when it remains configured', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT semester_id AS "semesterId" FROM public.academic_semester WHERE semester_id=$1')) return [{ semesterId: 30 }];
      if (sql.includes('FROM public.academic_semester a WHERE a.is_current=true')) return [{ semesterId: 31 }];
      if (sql.includes('FROM public.learning_centre WHERE learning_centre_id=$1')) return [{ learning_centre_id: 1 }];
      return offeredProbe(sql, 4) ?? [];
    }) as unknown as Query;
    await expect(createProfileRepository(query).save('student', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 4, currentSemesterId: 30, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    })).rejects.toMatchObject({ status: 409, code: 'ACADEMIC_SEMESTER_MISMATCH' });
  });
  it('keeps the exact current semester eligible for the existing curriculum validation', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT semester_id AS "semesterId" FROM public.academic_semester WHERE semester_id=$1')) return [{ semesterId: 30 }];
      if (sql.includes('FROM public.academic_semester a WHERE a.is_current=true')) return [{ semesterId: 30 }];
      if (sql.includes('FROM public.learning_centre WHERE learning_centre_id=$1')) return [{ learning_centre_id: 1 }];
      return offeredProbe(sql, 4) ?? [];
    }) as unknown as Query;
    await expect(createProfileRepository(query).save('student', {
      studentName: 'Student', matricNo: null, learningCentreId: 1, curriculumId: 4, currentSemesterId: 30, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR,
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_CURRICULUM' });
  });
});

describe('P001 live admin current-semester options', () => {
  it('reads the exact semester independently on warm cached-options requests and retains semester history', async () => {
    const cache = referenceCacheHarness();
    let currentSemester = { semesterId: 30, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' as const };
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return [{ curriculumId: 12 }];
      if (sql.includes('SELECT c.curriculum_id AS "curriculumId"')) return [
        { curriculumId: 10, curriculumVersion: 'V1', programmeId: 20, programmeCode: 'CS', programmeName: 'Computing', effectiveYear: 2022, totalCreditRequired: 120 },
      ];
      if (sql.includes('FROM public.academic_semester ORDER BY')) return [
        { semesterId: 30, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' },
        { semesterId: 32, academicYear: '2026/2027', semesterNo: 2, semesterType: 'NORMAL' },
        { semesterId: 31, academicYear: '2027/2028', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      if (sql.includes('FROM public.academic_semester a WHERE a.is_current=true')) return [{ ...currentSemester }];
      if (sql.includes('FROM public.curriculum_subject cs JOIN public.subject s')) return [];
      if (sql.includes('WITH category_counts AS')) return [];
      void parameters;
      return [];
    }) as Query & ReturnType<typeof vi.fn>;
    const profiles = createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true });
    const first = await profiles.options('student-a');
    currentSemester = { semesterId: 32, academicYear: '2026/2027', semesterNo: 2, semesterType: 'NORMAL' };
    const second = await profiles.options('student-a');

    expect(first.currentSemester).toEqual({ semesterId: 30, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' });
    expect(second.currentSemester).toEqual({ semesterId: 32, academicYear: '2026/2027', semesterNo: 2, semesterType: 'NORMAL' });
    expect(first.currentAcademicYear).toBe(second.currentAcademicYear);
    expect(second.semesters.map(semester => semester.semesterId)).toEqual([30, 32, 31]);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM public.academic_semester a WHERE a.is_current=true'))).toHaveLength(2);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM public.academic_semester ORDER BY'))).toHaveLength(1);
    expect(cache.gets).toContain('sa:test:profile:v1:reference:semesters');
    expect(cache.gets).not.toContainEqual(expect.stringContaining('current'));
  });
  it('returns a null current marker and complete historical semesters when none is configured', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.academic_semester ORDER BY')) return [
        { semesterId: 1, academicYear: '2025/2026', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      return [];
    }) as unknown as Query;
    const result = await createProfileRepository(query).options('new-student');
    expect(result.currentSemester).toBeNull();
    expect(result.currentAcademicYear).toBeNull();
    expect(result.semesters).toHaveLength(1);
  });
  it('returns a live current year on the uncached options path for a profile owner', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.academic_semester a WHERE a.is_current=true')) return [{ semesterId: 21, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' }];
      if (sql.includes('FROM public.academic_semester ORDER BY')) return [
        { semesterId: 20, academicYear: '2025/2026', semesterNo: 2, semesterType: 'NORMAL' },
        { semesterId: 21, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' },
      ];
      return [];
    }) as unknown as Query;
    const result = await createProfileRepository(query).options('student');
    expect(result.currentSemester).toEqual({ semesterId: 21, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL' });
    expect(result.currentAcademicYear).toBe('2026/2027');
    expect(result.semesters.map(({ academicYear }) => academicYear)).toEqual(['2025/2026', '2026/2027']);
  });
});

describe('P001 learning centre (S2-P004-023)', () => {
  const row = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22,
    weeklyWorkingHours: 0, availableStudyHours: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional' };
  const input = { studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 2, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: 2024 };
  const now = () => new Date('2026-11-10T00:00:00Z');
  const isWindow = (sql: string) => sql.includes('AS "selectionOpensAt"');
  function repo(opts: { saved: number | null; window: Record<string, unknown>[]; upsert?: Record<string, unknown>[] }) {
    const query = vi.fn(async (sql: string) => {
      if (isWindow(sql)) return opts.window;
      const probe = offeredProbe(sql, 4); if (probe) return probe;
      if (sql.includes('INSERT INTO public.student_profile')) return opts.upsert ?? [{ ...row, learningCentreId: input.learningCentreId }];
      if (sql.includes('SELECT learning_centre_id AS "learningCentreId",curriculum_id')) return opts.saved === null ? [] : [{ learningCentreId: opts.saved, curriculumId: 4 }];
      if (sql.includes('FROM public.student_profile p')) return [{ ...row, learningCentreId: opts.saved }];
      return [];
    }) as unknown as Query & ReturnType<typeof vi.fn>;
    return { query, repository: createProfileRepository(query, undefined, { now }) };
  }
  const opened = [{ selectionOpensAt: '2026-11-01T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z' }];
  const planned = [{ selectionOpensAt: '2026-12-01T00:00:00.000Z', selectionClosesAt: null }];

  it('find returns learningCentreId and learningCentreLocked from the next semester window', async () => {
    const open = await repo({ saved: 1, window: opened }).repository.find('s');
    expect(open).toMatchObject({ learningCentreId: 1, learningCentreLocked: true });
    expect(await repo({ saved: 1, window: planned }).repository.find('s')).toMatchObject({ learningCentreLocked: false });
    expect(await repo({ saved: 1, window: [] }).repository.find('s')).toMatchObject({ learningCentreLocked: false });
    expect(await repo({ saved: 1, window: [{ selectionOpensAt: null, selectionClosesAt: null }] }).repository.find('s')).toMatchObject({ learningCentreLocked: false });
    const closed = [{ selectionOpensAt: '2026-10-01T00:00:00.000Z', selectionClosesAt: '2026-11-05T00:00:00.000Z' }];
    expect(await repo({ saved: 1, window: closed }).repository.find('s')).toMatchObject({ learningCentreLocked: true });
  });
  it('find never locks a profile without a centre and skips the window query', async () => {
    const { query, repository } = repo({ saved: null, window: opened });
    expect(await repository.find('s')).toMatchObject({ learningCentreId: null, learningCentreLocked: false });
    expect(query.mock.calls.some(([sql]) => isWindow(sql))).toBe(false);
  });
  it('window query looks at the semester after the admin current semester', async () => {
    const { query, repository } = repo({ saved: 1, window: opened });
    await repository.find('s');
    const sql = query.mock.calls.find(([text]) => isWindow(text))![0];
    expect(sql).toContain('c.is_current AND (s.academic_year, s.semester_no) > (c.academic_year, c.semester_no)');
  });
  it('lock allows the first centre and blocks a change while selection is open', async () => {
    const first = repo({ saved: null, window: opened });
    await expect(first.repository.save('s', input)).resolves.toMatchObject({ learningCentreId: 2 });
    expect(first.query.mock.calls.some(([sql]) => isWindow(sql))).toBe(false);
    const changed = repo({ saved: 1, window: opened });
    await expect(changed.repository.save('s', input)).rejects.toMatchObject({ status: 409, code: 'PROFILE_CENTRE_LOCKED' });
    expect(changed.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO public.student_profile'))).toBe(false);
  });
  it('saving the same centre while locked succeeds and stays locked', async () => {
    const same = repo({ saved: 1, window: opened, upsert: [{ ...row, learningCentreId: 1 }] });
    await expect(same.repository.save('s', { ...input, learningCentreId: 1 })).resolves.toMatchObject({ learningCentreId: 1, learningCentreLocked: true });
  });
  it('a change before selection opens is saved', async () => {
    await expect(repo({ saved: 1, window: planned }).repository.save('s', input)).resolves.toMatchObject({ learningCentreId: 2, learningCentreLocked: false });
  });
  it('save rejects an inactive centre with INVALID_LEARNING_CENTRE', async () => {
    const { repository } = repo({ saved: null, window: [], upsert: [] });
    await expect(repository.save('s', input)).rejects.toMatchObject({ status: 400, code: 'INVALID_LEARNING_CENTRE' });
  });
  it('options lists active learning centres', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('FROM public.learning_centre') ? [
      { learningCentreId: 1, centreCode: 'JB', centreName: 'Johor Bahru' }, { learningCentreId: 2, centreCode: 'KL', centreName: 'Kuala Lumpur' }] : []) as unknown as Query & ReturnType<typeof vi.fn>;
    const options = await createProfileRepository(query).options('s');
    expect(options.learningCentres).toEqual([{ learningCentreId: 1, centreCode: 'JB', centreName: 'Johor Bahru' }, { learningCentreId: 2, centreCode: 'KL', centreName: 'Kuala Lumpur' }]);
    const sql = query.mock.calls.find(([text]) => text.includes('FROM public.learning_centre'))![0];
    expect(sql).toContain('WHERE is_active OR learning_centre_id=(SELECT learning_centre_id FROM public.student_profile WHERE clerk_user_id=$1)');
    expect(sql).toContain('ORDER BY centre_code');
  });
});

describe('P001 programme lock (S2-P004-026)', () => {
  const row = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22,
    weeklyWorkingHours: 0, availableStudyHours: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional' };
  const input = { studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR };
  function repo(opts: { saved: number | null; current?: number | null; upsert?: Record<string, unknown>[] }) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS "selectionOpensAt"')) return [];
      const probe = offeredProbe(sql, 4); if (probe) return probe;
      if (sql.includes('INSERT INTO public.student_profile')) return opts.upsert ?? [row];
      if (sql.includes('SELECT learning_centre_id AS "learningCentreId",curriculum_id')) return opts.saved === null ? [] : [{ learningCentreId: 1, curriculumId: opts.saved }];
      if (sql.startsWith('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return opts.current == null ? [] : [{ curriculumId: opts.current }];
      return [];
    }) as unknown as Query & ReturnType<typeof vi.fn>;
    return { query, repository: createProfileRepository(query) };
  }
  it('creating a profile chooses the programme', async () => {
    const { repository, query } = repo({ saved: null });
    await expect(repository.save('s', input)).resolves.toMatchObject({ curriculumId: 4 });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO public.student_profile'))).toBe(true);
  });
  it('an existing profile rejects a different curriculum with PROFILE_PROGRAMME_LOCKED before any write', async () => {
    const { repository, query } = repo({ saved: 4 });
    await expect(repository.save('s', { ...input, curriculumId: 7 })).rejects.toMatchObject({ status: 409, code: 'PROFILE_PROGRAMME_LOCKED' });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO public.student_profile'))).toBe(false);
  });
  it('re-sending the saved curriculum succeeds', async () => {
    await expect(repo({ saved: 4 }).repository.save('s', input)).resolves.toMatchObject({ curriculumId: 4 });
  });
  it('the upsert never rewrites curriculum_id of an existing profile', async () => {
    const { repository, query } = repo({ saved: 4 });
    await repository.save('s', input);
    const sql = query.mock.calls.find(([text]) => text.includes('INSERT INTO public.student_profile'))![0];
    const update = sql.slice(sql.indexOf('DO UPDATE SET'), sql.indexOf('WHERE public.student_profile'));
    expect(update).not.toContain('curriculum_id');
    expect(sql).toContain('WHERE public.student_profile.curriculum_id=EXCLUDED.curriculum_id');
  });
  it('an administrator change between the check and the write is still rejected', async () => {
    const { repository } = repo({ saved: 4, current: 7, upsert: [] });
    await expect(repository.save('s', input)).rejects.toMatchObject({ status: 409, code: 'PROFILE_PROGRAMME_LOCKED' });
  });
});

describe('P001 intake year and curriculum (S3-P004-037)', () => {
  const now = () => new Date('2026-11-25T00:00:00Z');
  const row = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 1, curriculumId: 3, currentSemesterId: 22,
    weeklyWorkingHours: 0, availableStudyHours: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    curriculumVersion: 'V1', programmeCode: 'SECRH', programmeName: 'Fictional', totalCreditRequired: 131, intakeYear: 2022 };
  const input = { studentName: 'Student', matricNo: 'A22EC0001', learningCentreId: 1, curriculumId: 3, currentSemesterId: 22,
    weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: 2024 };
  const isProbe = (sql: string) => sql.includes('WHERE o.programme_id=(SELECT programme_id FROM public.curriculum WHERE curriculum_id=$1)');
  const offered = [
    { curriculumId: 8, curriculumVersion: 'V2', effectiveYear: 2026 },
    { curriculumId: 3, curriculumVersion: 'V1', effectiveYear: 2022 },
  ];
  function repo(opts: { saved?: { curriculumId: number; intakeYear: number | null } | null; offered?: Record<string, unknown>[] } = {}) {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => {
      if (sql.includes('AS "selectionOpensAt"')) return [];
      if (isProbe(sql)) return opts.offered ?? offered;
      if (sql.includes('INSERT INTO public.student_profile')) return [{ ...row, curriculumId: parameters[3], intakeYear: opts.saved?.intakeYear ?? parameters[9] }];
      if (sql.includes('SELECT learning_centre_id AS "learningCentreId",curriculum_id')) return opts.saved ? [{ learningCentreId: 1, ...opts.saved }] : [];
      return [];
    }) as unknown as Query & ReturnType<typeof vi.fn>;
    return { query, repository: createProfileRepository(query, undefined, { now }) };
  }
  const inserted = (query: ReturnType<typeof vi.fn>) => query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.student_profile'));
  const curriculaKey = 'sa:test:profile:v1:reference:curricula';
  const cachedCurricula = (data: unknown[]) => {
    const at = Date.now();
    return new Map<string, unknown>([[curriculaKey, { version: 1, kind: 'curricula', namespace: 'test', dataset: 'profile', loadedAt: at - 1000, expiresAt: at + 100_000, data }]]);
  };

  it('options offer only active curricula with subjects, with effective year and credits, newest first per programme', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT c.curriculum_id AS "curriculumId"') ? [
      { curriculumId: 3, curriculumVersion: 'V1', programmeId: 2, programmeCode: 'SECRH', programmeName: 'Fictional', effectiveYear: 2022, totalCreditRequired: 131 },
    ] : []) as unknown as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query).options('s');
    expect(result.curricula).toEqual([{ curriculumId: 3, curriculumVersion: 'V1', programmeId: 2, programmeCode: 'SECRH', programmeName: 'Fictional', effectiveYear: 2022, totalCreditRequired: 131 }]);
    const sql = query.mock.calls.find(([text]) => String(text).includes('SELECT c.curriculum_id AS "curriculumId"'))![0] as string;
    expect(sql).toContain('c.effective_year AS "effectiveYear"');
    expect(sql).toContain('c.total_credit_required AS "totalCreditRequired"');
    expect(sql).toContain('EXISTS (SELECT 1 FROM public.curriculum_subject cs WHERE cs.curriculum_id=c.curriculum_id)');
    expect(sql).toContain('ORDER BY g.programme_code,c.effective_year DESC NULLS LAST,c.curriculum_version');
  });
  it('reloads a cached curriculum list in the old shape (no effective year or credits)', async () => {
    const cache = referenceCacheHarness(cachedCurricula([{ curriculumId: 3, curriculumVersion: 'V1', programmeId: 2, programmeCode: 'SECRH', programmeName: 'Fictional' }]));
    const fresh = { curriculumId: 3, curriculumVersion: 'V1', programmeId: 2, programmeCode: 'SECRH', programmeName: 'Fictional', effectiveYear: null, totalCreditRequired: 131 };
    const query = vi.fn(async (sql: string) => sql.includes('SELECT c.curriculum_id AS "curriculumId"') ? [fresh] : []) as unknown as Query & ReturnType<typeof vi.fn>;
    const result = await createProfileRepository(query, cache.cache).options('s');
    expect(result.curricula).toEqual([fresh]);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('SELECT c.curriculum_id AS "curriculumId"'))).toHaveLength(1);
    expect(cache.sets.map(({ key }) => key)).toContain(curriculaKey);
  });
  it.each([['bad effective year', { effectiveYear: 2022.5 }], ['missing credits', { totalCreditRequired: undefined }], ['negative credits', { totalCreditRequired: -1 }]])
  ('rejects cached curriculum rows with %s', async (_label, defect) => {
    const cache = referenceCacheHarness(cachedCurricula([{ curriculumId: 3, curriculumVersion: 'V1', programmeId: 2, programmeCode: 'SECRH', programmeName: 'Fictional', effectiveYear: 2022, totalCreditRequired: 131, ...defect }]));
    const query = vi.fn(async () => [] as Record<string, unknown>[]) as unknown as Query & ReturnType<typeof vi.fn>;
    expect((await createProfileRepository(query, cache.cache).options('s')).curricula).toEqual([]);
  });
  it('find and save return the intake year', async () => {
    const query = vi.fn(async () => [row]) as unknown as Query & ReturnType<typeof vi.fn>;
    const found = await createProfileRepository(query, undefined, { now }).find('s');
    expect(found?.intakeYear).toBe(2022);
    expect(query.mock.calls[0]![0]).toContain('p.intake_year AS "intakeYear"');
    const legacy = vi.fn(async () => [{ ...row, intakeYear: undefined }]) as unknown as Query;
    expect((await createProfileRepository(legacy, undefined, { now }).find('s'))?.intakeYear).toBeNull();
    const malformed = vi.fn(async () => [{ ...row, intakeYear: '2022' }]) as unknown as Query;
    await expect(createProfileRepository(malformed, undefined, { now }).find('s')).rejects.toThrow('Invalid profile intake year');
  });
  it('a new profile saves the intake year with the curriculum the rule picks', async () => {
    const { repository, query } = repo();
    await expect(repository.save('s', input)).resolves.toMatchObject({ curriculumId: 3, intakeYear: 2024 });
    const probe = query.mock.calls.find(([sql]) => isProbe(String(sql)))!;
    expect(probe[1]).toEqual([3]);
    expect(probe[0]).toContain('EXISTS (SELECT 1 FROM public.curriculum_subject cs WHERE cs.curriculum_id=o.curriculum_id)');
    expect(probe[0]).toContain("coalesce(upper(o.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE'");
    const [sql, parameters] = query.mock.calls.find(([text]) => String(text).includes('INSERT INTO public.student_profile'))!;
    expect(sql).toContain('available_study_hours,intake_year)');
    expect(sql).toContain('intake_year=COALESCE(public.student_profile.intake_year,EXCLUDED.intake_year)');
    expect(sql).toContain('p.intake_year AS "intakeYear"');
    expect(parameters).toEqual(['s', 'Student', 'A22EC0001', 3, 22, 0, 8, 1, null, 2024]);
  });
  it.each([undefined, null, 2013, 2027, 2024.5, '2024'])('a new profile with intake year %s is rejected with INVALID_INTAKE_YEAR before any write', async intakeYear => {
    const { repository, query } = repo();
    await expect(repository.save('s', { ...input, intakeYear: intakeYear as unknown as number }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_INTAKE_YEAR', message: 'Select your intake year.' });
    expect(inserted(query)).toBe(false);
  });
  it('a new profile accepts both ends of the intake year range', async () => {
    await expect(repo({ offered: [offered[1]!] }).repository.save('s', { ...input, intakeYear: 2014 })).resolves.toMatchObject({ intakeYear: 2014 });
    await expect(repo().repository.save('s', { ...input, curriculumId: 8, intakeYear: 2026 })).resolves.toMatchObject({ curriculumId: 8, intakeYear: 2026 });
  });
  it('a new profile rejects a curriculum the intake year does not lead to, with no INSERT', async () => {
    const { repository, query } = repo();
    await expect(repository.save('s', { ...input, curriculumId: 8, intakeYear: 2024 }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_CURRICULUM', message: 'Select an available configured curriculum.' });
    expect(inserted(query)).toBe(false);
  });
  it('a new profile rejects a curriculum without subjects or not offered, with no INSERT', async () => {
    const { repository, query } = repo({ offered: [offered[1]!] });
    await expect(repository.save('s', { ...input, curriculumId: 8, intakeYear: 2026 })).rejects.toMatchObject({ status: 400, code: 'INVALID_CURRICULUM' });
    expect(inserted(query)).toBe(false);
    const none = repo({ offered: [] });
    await expect(none.repository.save('s', input)).rejects.toMatchObject({ status: 400, code: 'INVALID_CURRICULUM' });
    expect(inserted(none.query)).toBe(false);
  });
  it('a new profile may pick any curriculum the rule leaves to the student', async () => {
    const tie = [{ curriculumId: 3, curriculumVersion: 'V1', effectiveYear: 2022 }, { curriculumId: 4, curriculumVersion: 'V1b', effectiveYear: 2022 }];
    await expect(repo({ offered: tie }).repository.save('s', { ...input, curriculumId: 4 })).resolves.toMatchObject({ curriculumId: 4 });
    const later = [{ curriculumId: 3, curriculumVersion: 'V1', effectiveYear: 2025 }, { curriculumId: 8, curriculumVersion: 'V2', effectiveYear: 2026 }];
    await expect(repo({ offered: later }).repository.save('s', { ...input, curriculumId: 8, intakeYear: 2020 })).resolves.toMatchObject({ curriculumId: 8 });
  });
  it('an existing profile rejects a different intake year with PROFILE_INTAKE_LOCKED and no curriculum probe', async () => {
    const { repository, query } = repo({ saved: { curriculumId: 3, intakeYear: 2022 } });
    await expect(repository.save('s', { ...input, intakeYear: 2023 }))
      .rejects.toMatchObject({ status: 409, code: 'PROFILE_INTAKE_LOCKED', message: 'Your intake year is set. Contact the admin to change it.' });
    expect(inserted(query)).toBe(false);
    expect(query.mock.calls.some(([sql]) => isProbe(String(sql)))).toBe(false);
  });
  it('an existing profile re-saves the same intake year without a curriculum re-check, even outside the pick range', async () => {
    const { repository, query } = repo({ saved: { curriculumId: 8, intakeYear: 2001 }, offered: [] });
    await expect(repository.save('s', { ...input, curriculumId: 8, intakeYear: 2001 })).resolves.toMatchObject({ curriculumId: 8, intakeYear: 2001 });
    expect(query.mock.calls.some(([sql]) => isProbe(String(sql)))).toBe(false);
  });
  it('an existing profile without an intake year may set it once, within the range', async () => {
    const { repository, query } = repo({ saved: { curriculumId: 8, intakeYear: null }, offered: [] });
    await expect(repository.save('s', { ...input, curriculumId: 8, intakeYear: 2020 })).resolves.toMatchObject({ intakeYear: 2020 });
    expect(query.mock.calls.some(([sql]) => isProbe(String(sql)))).toBe(false);
    const parameters = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.student_profile'))![1];
    expect(parameters[9]).toBe(2020);
    const outOfRange = repo({ saved: { curriculumId: 8, intakeYear: null } });
    await expect(outOfRange.repository.save('s', { ...input, curriculumId: 8, intakeYear: 2030 })).rejects.toMatchObject({ status: 400, code: 'INVALID_INTAKE_YEAR' });
    expect(inserted(outOfRange.query)).toBe(false);
  });
});

describe('P001 matric lock and in-use check (S3-P004-039)', () => {
  const row = { studentId: 9, studentName: 'Student', matricNo: 'SX232315ECJHF04', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22,
    weeklyWorkingHours: 0, availableStudyHours: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional', intakeYear: INTAKE_YEAR };
  const input = { studentName: 'Student', matricNo: 'SX232315ECJHF04', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR };
  function repo(opts: { saved?: string | null; exists?: boolean; taken?: boolean }) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS "selectionOpensAt"')) return [];
      const probe = offeredProbe(sql, 4); if (probe) return probe;
      if (sql.includes('AS "takenBy"')) return opts.taken ? [{ takenBy: 77 }] : [];
      if (sql.includes('INSERT INTO public.student_profile')) return [row];
      if (sql.includes('SELECT learning_centre_id AS "learningCentreId",curriculum_id')) return opts.exists === false ? [] : [{ learningCentreId: 1, curriculumId: 4, intakeYear: INTAKE_YEAR, matricNo: opts.saved ?? null }];
      return [];
    }) as unknown as Query & ReturnType<typeof vi.fn>;
    return { query, repository: createProfileRepository(query) };
  }
  const inserted = (query: ReturnType<typeof vi.fn>) => query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.student_profile'));
  it('a saved matric number cannot be changed by the student', async () => {
    const { repository, query } = repo({ saved: 'SX232315ECJHF04' });
    await expect(repository.save('s', { ...input, matricNo: 'SX232316ECJHF04' }))
      .rejects.toMatchObject({ status: 409, code: 'PROFILE_MATRIC_LOCKED', message: 'Your matric number is set. Contact the admin to change it.' });
    expect(inserted(query)).toBe(false);
  });
  it('a lowercase or spaced saved number does not trip the lock', async () => {
    await expect(repo({ saved: 'sx2203 ecrhs04' }).repository.save('s', { ...input, matricNo: 'SX2203ECRHS04' })).resolves.toMatchObject({ studentId: 9 });
  });
  it('a profile without a matric number may set it once', async () => {
    await expect(repo({ saved: null }).repository.save('s', { ...input, matricNo: 'SX2302ECRHF04' })).resolves.toMatchObject({ studentId: 9 });
  });
  it('a number another student uses is refused, compared normalised and excluding the student', async () => {
    const { repository, query } = repo({ exists: false, taken: true });
    await expect(repository.save('s', input))
      .rejects.toMatchObject({ status: 409, code: 'PROFILE_MATRIC_TAKEN', message: 'This matric number is already used by another student. Check it, or contact the admin.' });
    expect(inserted(query)).toBe(false);
    const [sql, parameters] = query.mock.calls.find(([text]) => String(text).includes('AS "takenBy"'))!;
    expect(sql).toContain("upper(regexp_replace(matric_no,'[[:space:]]','','g'))=$1");
    expect(sql).toContain('clerk_user_id<>$2');
    expect(parameters).toEqual(['SX232315ECJHF04', 's']);
  });
});

describe('P001 matric lock in SQL (S3-P004-039 review)', () => {
  it('the upsert never overwrites a saved matric number, even if an admin changed it after the check', async () => {
    const row = { studentId: 9, studentName: 'Student', matricNo: 'SX1', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', curriculumVersion: 'V1', programmeCode: 'X', programmeName: 'Fictional', intakeYear: INTAKE_YEAR };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO public.student_profile')) return [row];
      if (sql.includes('SELECT learning_centre_id AS "learningCentreId",curriculum_id')) return [{ learningCentreId: 1, curriculumId: 4, intakeYear: INTAKE_YEAR, matricNo: 'SX1234' }];
      return [];
    }) as unknown as Query & ReturnType<typeof vi.fn>;
    await createProfileRepository(query).save('s', { studentName: 'Student', matricNo: 'SX1234', learningCentreId: 1, curriculumId: 4, currentSemesterId: 22, weeklyWorkingHours: 0, availableStudyHours: 8, intakeYear: INTAKE_YEAR });
    const sql = String(query.mock.calls.find(([text]) => String(text).includes('INSERT INTO public.student_profile'))![0]);
    expect(sql).toContain("matric_no=CASE WHEN coalesce(btrim(public.student_profile.matric_no),'')='' THEN EXCLUDED.matric_no ELSE public.student_profile.matric_no END");
  });
});
