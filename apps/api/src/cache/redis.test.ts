import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReferenceCache, type CacheBindings, type CacheObservation } from './redis';

const enabled: CacheBindings = {
  REDIS_CACHE_ENABLED: 'true',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-secret-token',
  REDIS_CACHE_NAMESPACE: 'dev',
  REDIS_CACHE_DATASET: 'academic-test',
};
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

type FakeClient = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { px: number }): Promise<unknown>;
};
function memoryRedis(seed = new Map<string, unknown>()) {
  const keys: string[] = [];
  const writes: Array<{ key: string; value: unknown; px: number }> = [];
  const get = vi.fn(async <T>(key: string): Promise<T | null> => {
    keys.push(key);
    return (seed.get(key) as T | undefined) ?? null;
  });
  const set = vi.fn(async (key: string, value: unknown, { px }: { px: number }) => {
    writes.push({ key, value, px });
    seed.set(key, value);
    return 'OK';
  });
  const createClient = vi.fn((_config: { url: string; token: string }, _signal: AbortSignal): FakeClient => { void _config; void _signal; return { get: <T>(key: string) => get(key) as Promise<T | null>, set }; });
  return { seed, keys, writes, get, set, createClient };
}

afterEach(() => vi.unstubAllGlobals());

describe('optional Redis reference cache adapter', () => {
  it('bypasses Redis with disabled or incomplete configuration and loads once', async () => {
    for (const bindings of [
      { ...enabled, REDIS_CACHE_ENABLED: 'false' },
      { ...enabled, REDIS_CACHE_ENABLED: undefined },
      { ...enabled, REDIS_CACHE_DATASET: 'not safe/' },
      { ...enabled, UPSTASH_REDIS_REST_URL: 'http://example.upstash.io' },
      { ...enabled, UPSTASH_REDIS_REST_TOKEN: undefined },
    ]) {
      const client = memoryRedis();
      const load = vi.fn(async () => ['from-db']);
      const result = await createReferenceCache(bindings, { createClient: client.createClient })
        .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
      expect(result).toEqual(['from-db']);
      expect(load).toHaveBeenCalledTimes(1);
      expect(client.createClient).not.toHaveBeenCalled();
    }
  });

  it('loads on cold miss, writes a bounded v1 envelope, and returns a warm hit', async () => {
    const client = memoryRedis();
    const load = vi.fn(async () => ['curriculum-a']);
    const cache = createReferenceCache(enabled, { createClient: client.createClient });
    const first = await cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    const second = await cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });

    expect(first).toEqual(['curriculum-a']);
    expect(second).toEqual(['curriculum-a']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.keys).toEqual(['sa:dev:academic-test:v1:reference:curricula', 'sa:dev:academic-test:v1:reference:curricula']);
    expect(client.writes).toHaveLength(1);
    expect(client.writes[0]?.px).toBeGreaterThan(0);
    expect(client.writes[0]?.px).toBeLessThanOrEqual(300_000);
    expect(client.writes[0]?.value).toMatchObject({ version: 1, kind: 'curricula', namespace: 'dev', dataset: 'academic-test', data: ['curriculum-a'] });
  });

  it('treats valid empty arrays as hits and isolates namespace/dataset keys', async () => {
    const client = memoryRedis();
    const bindingsB = { ...enabled, REDIS_CACHE_NAMESPACE: 'test', REDIS_CACHE_DATASET: 'other' };
    const cacheA = createReferenceCache(enabled, { createClient: client.createClient });
    const cacheB = createReferenceCache(bindingsB, { createClient: client.createClient });
    const loadA = vi.fn(async () => [] as string[]);
    const loadB = vi.fn(async () => ['separate']);
    expect(await cacheA.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadA, validate: isStringList })).toEqual([]);
    expect(await cacheA.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadA, validate: isStringList })).toEqual([]);
    expect(await cacheB.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadB, validate: isStringList })).toEqual(['separate']);
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
    expect(client.writes.map(write => write.key)).toEqual([
      'sa:dev:academic-test:v1:reference:semesters',
      'sa:test:other:v1:reference:semesters',
    ]);
  });

  it('rejects unknown or corrupt cached envelopes and reloads once', async () => {
    const key = 'sa:dev:academic-test:v1:reference:curricula';
    const now = Date.now();
    const client = memoryRedis(new Map([[key, {
      version: 88, kind: 'curricula', namespace: 'dev', dataset: 'academic-test',
      loadedAt: now - 1000, expiresAt: now + 10_000, data: ['stale-contract'],
    }]]));
    const load = vi.fn(async () => ['fresh']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['fresh']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(client.seed.get(key)).toMatchObject({ version: 1, data: ['fresh'] });
  });

  it('does not slide expiry on hits and reloads after the original deadline', async () => {
    let clock = 1_800_000_000_000;
    const client = memoryRedis();
    const load = vi.fn(async () => ['one']);
    const cache = createReferenceCache(enabled, { createClient: client.createClient, now: () => clock });
    await cache.getOrLoad({ kind: 'semesters', ttlSeconds: 10, load, validate: isStringList });
    const firstExpiry = (client.writes[0]?.value as { expiresAt: number }).expiresAt;
    clock += 9_000;
    await cache.getOrLoad({ kind: 'semesters', ttlSeconds: 10, load, validate: isStringList });
    expect(client.set).toHaveBeenCalledTimes(1);
    expect((client.seed.get(client.writes[0]!.key) as { expiresAt: number }).expiresAt).toBe(firstExpiry);
    clock = firstExpiry + 1;
    await cache.getOrLoad({ kind: 'semesters', ttlSeconds: 10, load, validate: isStringList });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized cache hits before validating or returning their data', async () => {
    const key = 'sa:dev:academic-test:v1:reference:curricula';
    const now = Date.now();
    const client = memoryRedis(new Map([[key, {
      version: 1, kind: 'curricula', namespace: 'dev', dataset: 'academic-test',
      loadedAt: now - 1000, expiresAt: now + 10_000, data: ['x'.repeat(70 * 1024)],
    }]]));
    const load = vi.fn(async () => ['bounded']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['bounded']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
  });
  it.each(['dataset', 'kind', 'data-shape', 'expired', 'future'])('rejects a cache envelope with invalid %s metadata', async defect => {
    const key = 'sa:dev:academic-test:v1:reference:curricula';
    const now = Date.now();
    const envelope: Record<string, unknown> = {
      version: 1, kind: 'curricula', namespace: 'dev', dataset: 'academic-test',
      loadedAt: now - 1000, expiresAt: now + 10_000, data: ['cached'],
    };
    if (defect === 'dataset') envelope.dataset = 'other';
    if (defect === 'kind') envelope.kind = 'semesters';
    if (defect === 'data-shape') envelope.data = ['valid', 4];
    if (defect === 'expired') envelope.expiresAt = now - 1;
    if (defect === 'future') envelope.loadedAt = now + 5_000;
    const client = memoryRedis(new Map([[key, envelope]]));
    const load = vi.fn(async () => ['fresh']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['fresh']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
  });
  it('does not cache or repeat a loader when Redis read fails', async () => {
    const client = memoryRedis();
    client.get.mockRejectedValueOnce(new Error('private transport detail'));
    const load = vi.fn(async () => ['from-db']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['from-db']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('returns an already loaded Neon value when Redis fill fails without reloading', async () => {
    const client = memoryRedis();
    client.set.mockRejectedValueOnce(new Error('private transport detail'));
    const load = vi.fn(async () => ['from-db']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['from-db']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it('propagates the original Neon error once and never attempts a fill', async () => {
    const client = memoryRedis();
    const databaseError = new Error('database unavailable');
    const load = vi.fn(async () => { throw databaseError; });
    await expect(createReferenceCache(enabled, { createClient: client.createClient })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList })).rejects.toBe(databaseError);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('skips fill when a slow Neon load consumes the entry lifetime', async () => {
    let clock = 1_800_000_000_000;
    const client = memoryRedis();
    const load = vi.fn(async () => { clock += 60_001; return ['loaded-too-slowly']; });
    const result = await createReferenceCache(enabled, { createClient: client.createClient, now: () => clock })
      .getOrLoad({ kind: 'semesters', ttlSeconds: 60, load, validate: isStringList });
    expect(result).toEqual(['loaded-too-slowly']);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('shares one Redis-only budget across concurrent calls and leaves each loader available', async () => {
    const clientCalls: number[] = [];
    const createClient = vi.fn((_config: { url: string; token: string }, signal: AbortSignal): FakeClient => {
      clientCalls.push(1);
      return {
        get: async <T>() => new Promise<T | null>((_resolve, reject) => {
          if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
          else signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        }),
        set: async () => 'OK',
      };
    });
    const cache = createReferenceCache(enabled, { createClient, budgetMs: 20 });
    const loadCurricula = vi.fn(async () => ['c']);
    const loadSemesters = vi.fn(async () => ['s']);
    const [curricula, semesters] = await Promise.all([
      cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load: loadCurricula, validate: isStringList }),
      cache.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadSemesters, validate: isStringList }),
    ]);
    expect(curricula).toEqual(['c']);
    expect(semesters).toEqual(['s']);
    expect(clientCalls).toHaveLength(1);
    expect(loadCurricula).toHaveBeenCalledTimes(1);
    expect(loadSemesters).toHaveBeenCalledTimes(1);
  });
  it('excludes a slow Neon loader from the shared Redis overhead budget', async () => {
    const client = memoryRedis();
    const events: CacheObservation[] = [];
    const load = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 180)); return ['from-db']; });
    const cache = createReferenceCache(enabled, { createClient: client.createClient, budgetMs: 150, observe: event => events.push(event) });
    const result = await cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['from-db']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(events[0]?.lookupDurationMs).toBeGreaterThanOrEqual(170);
    expect(events[0]?.redisDurationMs).toBeLessThan(150);
  });
  it('aborts the real SDK fetch and does not retry after the shared budget timeout', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error('SDK did not forward an AbortSignal');
      const abort = () => reject(new DOMException('aborted', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const load = vi.fn(async () => [] as string[]);
    const result = await createReferenceCache(enabled, { budgetMs: 20 })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the real SDK REST serialization for a mocked cold fill followed by a warm hit', async () => {
    const values = new Map<string, unknown>();
    const commands: unknown[][] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      commands.push(command);
      const name = command[0];
      const key = String(command[1]);
      if (name === 'get') {
        const value = values.get(key);
        return Response.json({ result: value === undefined ? null : JSON.stringify(value) });
      }
      if (name === 'set') {
        const encoded = command[2];
        values.set(key, typeof encoded === 'string' ? JSON.parse(encoded) : encoded);
        return Response.json({ result: 'OK' });
      }
      throw new Error('Unexpected SDK command');
    });
    vi.stubGlobal('fetch', fetchMock);
    const load = vi.fn(async () => ['from-db']);
    const cache = createReferenceCache(enabled);
    await expect(cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList })).resolves.toEqual(['from-db']);
    await expect(cache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList })).resolves.toEqual(['from-db']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(commands.map(command => command[0])).toEqual(['get', 'set', 'get']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('records only aggregate safe outcomes and ignores a failing observer', async () => {
    const client = memoryRedis();
    const events: CacheObservation[] = [];
    const observer = vi.fn((event: CacheObservation) => { events.push(event); throw new Error('observer failure'); });
    const load = vi.fn(async () => ['safe']);
    const result = await createReferenceCache(enabled, { createClient: client.createClient, observe: observer })
      .getOrLoad({ kind: 'curricula', ttlSeconds: 300, load, validate: isStringList });
    expect(result).toEqual(['safe']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'curricula', outcome: 'miss', dbLoads: 1, lookupDurationMs: expect.any(Number), redisDurationMs: expect.any(Number) });
    expect(JSON.stringify(events[0])).not.toContain('test-secret-token');
  });
});
