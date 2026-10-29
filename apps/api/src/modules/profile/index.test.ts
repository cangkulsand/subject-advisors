import { afterEach, describe, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createP001Dependencies } from './index';

vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));

const baseEnv = {
  CLERK_SECRET_KEY: 'test-clerk-secret',
  CLERK_PUBLISHABLE_KEY: 'test-clerk-publishable',
  CLERK_AUTHORIZED_PARTIES: 'https://web.test',
  DATABASE_URL: 'postgres://unused.test/profile',
};

function configureQuery(resolve: (sql: string, parameters: unknown[]) => Record<string, unknown>[] = () => []) {
  const query = vi.fn(async (sql: string, parameters: unknown[]) => resolve(sql, parameters));
  vi.mocked(neon).mockReturnValue({ query } as unknown as ReturnType<typeof neon>);
  return query;
}

afterEach(() => vi.unstubAllGlobals());

describe('P001 optional Redis composition', () => {
  it('constructs lazily and performs no Redis I/O or logs when disabled', async () => {
    const query = configureQuery();
    const fetchMock = vi.fn();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    const dependencies = createP001Dependencies({ ...baseEnv, REDIS_CACHE_ENABLED: 'false' });
    expect(fetchMock).not.toHaveBeenCalled();
    await dependencies.profiles.options('student-a');

    expect(query).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('selects the curriculum path only with both flags and complete configuration', async () => {
    const scenarios = [
      { name: 'feature flag missing', env: { REDIS_CACHE_ENABLED: 'true' }, expectedAssociation: false, expectedRedis: true },
      { name: 'feature flag false', env: { REDIS_CACHE_ENABLED: 'true', REDIS_CURRICULUM_CACHE_ENABLED: 'false' }, expectedAssociation: false, expectedRedis: true },
      { name: 'master flag false', env: { REDIS_CACHE_ENABLED: 'false', REDIS_CURRICULUM_CACHE_ENABLED: 'true' }, expectedAssociation: false, expectedRedis: false },
      { name: 'incomplete config', env: { REDIS_CACHE_ENABLED: 'true', REDIS_CURRICULUM_CACHE_ENABLED: 'true', UPSTASH_REDIS_REST_TOKEN: undefined }, expectedAssociation: false, expectedRedis: false },
      { name: 'both flags and complete config', env: { REDIS_CACHE_ENABLED: 'true', REDIS_CURRICULUM_CACHE_ENABLED: 'true' }, expectedAssociation: true, expectedRedis: true },
    ];
    for (const scenario of scenarios) {
      const query = configureQuery();
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const command = JSON.parse(String(init?.body)) as unknown[];
        return command[0] === 'get' ? Response.json({ result: null }) : Response.json({ result: 'OK' });
      });
      vi.stubGlobal('fetch', fetchMock);
      const dependencies = createP001Dependencies({
        ...baseEnv,
        UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'test-token',
        REDIS_CACHE_NAMESPACE: 'local',
        REDIS_CACHE_DATASET: 'profile',
        ...scenario.env,
      });
      await dependencies.profiles.options('student-a');
      expect(query.mock.calls.some(([sql]) => sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')),
        scenario.name).toBe(scenario.expectedAssociation);
      expect(query).toHaveBeenCalledTimes(scenario.expectedAssociation ? 3 : 4);
      expect(fetchMock).toHaveBeenCalledTimes(scenario.expectedRedis ? 4 : 0);
      vi.unstubAllGlobals();
    }
  });

  it('logs only whitelisted aggregate cache observations when enabled', async () => {
    const query = configureQuery(sql => sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')
      ? [{ curriculumId: 12 }]
      : []);
    const values = new Map<string, unknown>();
    const requests: unknown[][] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      requests.push(command);
      const key = String(command[1]);
      if (command[0] === 'get') {
        const value = values.get(key);
        return Response.json({ result: value === undefined ? null : JSON.stringify(value) });
      }
      if (command[0] === 'set') {
        const encoded = command[2];
        values.set(key, typeof encoded === 'string' ? JSON.parse(encoded) : encoded);
        return Response.json({ result: 'OK' });
      }
      throw new Error('Unexpected SDK command');
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    const dependencies = createP001Dependencies({
      ...baseEnv,
      REDIS_CACHE_ENABLED: 'true',
      REDIS_CURRICULUM_CACHE_ENABLED: 'true',
      REDIS_CACHE_NAMESPACE: 'local',
      REDIS_CACHE_DATASET: 'test-data',
      UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-upstash-secret',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const cold = await dependencies.profiles.options('student-a');
    const warm = await dependencies.profiles.options('student-a');

    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(requests.filter(command => command[0] === 'get')).toHaveLength(6);
    expect(requests.filter(command => command[0] === 'set')).toHaveLength(3);
    expect(query).toHaveBeenCalledTimes(6); // cold 5, warm 1 live association read
    expect(query.mock.calls.filter(([sql]) => sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile'))).toHaveLength(2);
    const optionsKey = 'sa:local:test-data:v1:reference:curriculum-options:12';
    expect(requests.some(command => command[0] === 'set' && command[1] === optionsKey)).toBe(true);
    expect(values.get(optionsKey)).toMatchObject({ kind: 'curriculum-options', curriculumId: 12,
      data: { curriculumId: 12, subjects: [], subjectGroups: [] } });
    expect(Object.keys(cold)).toEqual(['curricula', 'subjects', 'semesters', 'subjectGroups']);
    expect(Object.keys(warm)).toEqual(['curricula', 'subjects', 'semesters', 'subjectGroups']);
    expect(cold).not.toHaveProperty('curriculumId');
    expect(warm).not.toHaveProperty('curriculumId');
    expect(info).toHaveBeenCalledTimes(6);
    const events = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(events.some(event => event.kind === 'curriculum-options' && event.outcome === 'miss')).toBe(true);
    expect(events.some(event => event.kind === 'curriculum-options' && event.outcome === 'hit')).toBe(true);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['dbLoads', 'event', 'kind', 'lookupDurationMs', 'outcome', 'redisDurationMs'].sort());
      expect(event.event).toBe('reference_cache');
      expect(['miss', 'hit']).toContain(event.outcome);
      expect(event.dbLoads).toBeGreaterThanOrEqual(0);
      expect(typeof event.lookupDurationMs).toBe('number');
      expect(typeof event.redisDurationMs).toBe('number');
      expect(JSON.stringify(event)).not.toContain('test-upstash-secret');
      expect(JSON.stringify(event)).not.toContain('cache.test.upstash.io');
      expect(JSON.stringify(event)).not.toContain('test-data');
    }
  });
});
