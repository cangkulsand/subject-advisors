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

function configureQuery() {
  const query = vi.fn(async () => [] as Record<string, unknown>[]);
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

  it('logs only whitelisted aggregate cache observations when enabled', async () => {
    configureQuery();
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
      REDIS_CACHE_NAMESPACE: 'local',
      REDIS_CACHE_DATASET: 'test-data',
      UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-upstash-secret',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await dependencies.profiles.options('student-a');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requests.map(command => command[0])).toEqual(['get', 'get', 'set', 'set']);
    expect(info).toHaveBeenCalledTimes(2);
    const events = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['dbLoads', 'event', 'kind', 'lookupDurationMs', 'outcome', 'redisDurationMs'].sort());
      expect(event).toMatchObject({ event: 'reference_cache', outcome: 'miss', dbLoads: 1 });
      expect(typeof event.lookupDurationMs).toBe('number');
      expect(typeof event.redisDurationMs).toBe('number');
      expect(JSON.stringify(event)).not.toContain('test-upstash-secret');
      expect(JSON.stringify(event)).not.toContain('cache.test.upstash.io');
      expect(JSON.stringify(event)).not.toContain('test-data');
    }
  });
});
