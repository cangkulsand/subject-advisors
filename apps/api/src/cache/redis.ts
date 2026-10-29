import { Redis } from '@upstash/redis/cloudflare';

export type ReferenceCacheKind = 'curricula' | 'semesters';

export interface CacheBindings {
  REDIS_CACHE_ENABLED?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  REDIS_CACHE_NAMESPACE?: string;
  REDIS_CACHE_DATASET?: string;
}

export type CacheOutcome =
  | 'hit'
  | 'miss'
  | 'invalid-payload'
  | 'disabled'
  | 'unconfigured'
  | 'invalid-request'
  | 'read-error'
  | 'timeout'
  | 'budget-exhausted'
  | 'fill-error'
  | 'fill-skipped-expired'
  | 'invalid-source'
  | 'database-error';

export interface CacheObservation {
  kind: ReferenceCacheKind;
  outcome: CacheOutcome;
  /** End-to-end lookup duration, including Neon load time. */
  lookupDurationMs: number;
  /** Sum of actual Redis command time only; excludes Neon work and queue wait. */
  redisDurationMs: number;
  dbLoads: 0 | 1;
}

interface RedisCommands {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { px: number }): Promise<unknown>;
}

interface RedisConfig {
  url: string;
  token: string;
  namespace: string;
  dataset: string;
}

export interface ReferenceCacheOptions {
  /** Aggregate observation only. Observer failures never affect cache behavior. */
  observe?: (event: CacheObservation) => void;
  /** Test seam for deterministic expiry checks. */
  now?: () => number;
  /** Test seam. Production default is 200 ms; values above 200 are clamped. */
  budgetMs?: number;
  /** Test seam for SDK command behavior. Called lazily for each Redis command. */
  createClient?: (config: Pick<RedisConfig, 'url' | 'token'>, signal: AbortSignal) => RedisCommands;
  /** Test seam for elapsed Redis-overhead accounting. */
  monotonicNow?: () => number;
}

interface CacheEnvelope {
  version: 1;
  kind: ReferenceCacheKind;
  namespace: string;
  dataset: string;
  loadedAt: number;
  expiresAt: number;
  data: unknown;
}

type CacheOperationResult<T> = {
  ok: true;
  value: T;
  durationMs: number;
} | {
  ok: false;
  reason: 'timeout' | 'error' | 'budget-exhausted';
  durationMs: number;
}

const MAX_COMPONENT_LENGTH = 48;
const MAX_TOKEN_LENGTH = 2048;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_TTL_SECONDS = 3600;
const DEFAULT_BUDGET_MS = 200;
const COMPONENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;

function component(value: string | undefined): value is string {
  return typeof value === 'string' && value.length <= MAX_COMPONENT_LENGTH && COMPONENT.test(value);
}

function redisConfig(bindings: CacheBindings): RedisConfig | null {
  if (bindings.REDIS_CACHE_ENABLED !== 'true') return null;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token,
    REDIS_CACHE_NAMESPACE: namespace, REDIS_CACHE_DATASET: dataset } = bindings;
  if (typeof url !== 'string' || url.length > 2048 || typeof token !== 'string' ||
      token.length === 0 || token.length > MAX_TOKEN_LENGTH || /[\r\n\u0000-\u001f]/.test(token) ||
      !component(namespace) || !component(dataset)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  } catch { return null; }
  return { url, token, namespace, dataset };
}

function defaultClient(config: Pick<RedisConfig, 'url' | 'token'>, signal: AbortSignal): RedisCommands {
  const client = new Redis({
    url: config.url,
    token: config.token,
    signal: () => signal,
    retry: { retries: 0 },
    enableAutoPipelining: false,
    enableTelemetry: false,
  });
  return {
    get: <T>(key: string) => client.get<T>(key),
    set: (key: string, value: unknown, options: { px: number }) => client.set(key, value, options),
  };
}

function validEnvelope(value: unknown, expected: {
  kind: ReferenceCacheKind; namespace: string; dataset: string; now: number; ttlMs: number;
  validate: (data: unknown) => boolean;
}): value is CacheEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Partial<CacheEnvelope>;
  if (envelope.version !== 1 || envelope.kind !== expected.kind || envelope.namespace !== expected.namespace ||
      envelope.dataset !== expected.dataset || !Number.isFinite(envelope.loadedAt) || !Number.isFinite(envelope.expiresAt)) return false;
  const loadedAt = envelope.loadedAt as number;
  const expiresAt = envelope.expiresAt as number;
  if (loadedAt > expected.now || expiresAt <= expected.now || expiresAt <= loadedAt ||
      expiresAt - loadedAt > expected.ttlMs) return false;
  try { return expected.validate(envelope.data); } catch { return false; }
}

function byteSize(value: unknown): number | null {
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? null : new TextEncoder().encode(encoded).byteLength;
  } catch { return null; }
}

/**
 * Creates request-scoped cache state. It validates configuration immediately but creates
 * an SDK client and sends no network request until an authorized caller invokes getOrLoad.
 */
export function createReferenceCache(bindings: CacheBindings, options: ReferenceCacheOptions = {}) {
  const config = redisConfig(bindings);
  const now = options.now ?? Date.now;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const budgetMs = Math.max(1, Math.min(DEFAULT_BUDGET_MS, Math.floor(options.budgetMs ?? DEFAULT_BUDGET_MS)));
  const clientFactory = options.createClient ?? defaultClient;
  let spentMs = 0;
  let redisQueue: Promise<void> = Promise.resolve();

  async function command<T>(operation: (client: RedisCommands) => Promise<T>): Promise<CacheOperationResult<T>> {
    const pending = redisQueue.then(async (): Promise<CacheOperationResult<T>> => {
      if (!config) return { ok: false, reason: 'error', durationMs: 0 };
      const remaining = budgetMs - spentMs;
      if (remaining <= 0) return { ok: false, reason: 'budget-exhausted', durationMs: 0 };
      const startedAt = monotonicNow();
      let timedOut = false;
      let result: { ok: true; value: T } | { ok: false; reason: 'timeout' | 'error' };
      const controller = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.max(1, Math.ceil(remaining)));
      try {
        const client = clientFactory({ url: config.url, token: config.token }, controller.signal);
        result = { ok: true, value: await operation(client) };
      } catch {
        result = { ok: false, reason: timedOut ? 'timeout' : 'error' };
      } finally {
        clearTimeout(timer);
        const durationMs = Math.max(0, monotonicNow() - startedAt);
        spentMs = timedOut ? budgetMs : Math.min(budgetMs, spentMs + durationMs);
      }
      return { ...result!, durationMs: Math.max(0, monotonicNow() - startedAt) };
    });
    redisQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  return {
    async getOrLoad<T>(input: {
      kind: ReferenceCacheKind;
      ttlSeconds: number;
      load: () => Promise<T>;
      validate: (data: unknown) => data is T;
    }): Promise<T> {
      const startedAt = monotonicNow();
      let dbLoads: 0 | 1 = 0;
      let redisDurationMs = 0;
      let outcome: CacheOutcome = 'database-error';
      const finish = (next: CacheOutcome) => { outcome = next; };
      try {
        if (bindings.REDIS_CACHE_ENABLED !== 'true') {
          finish('disabled');
          dbLoads = 1;
          return await input.load();
        }
        if (!config) {
          finish('unconfigured');
          dbLoads = 1;
          return await input.load();
        }
        const ttlMs = input.ttlSeconds * 1000;
        if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > MAX_TTL_SECONDS) {
          finish('invalid-request');
          dbLoads = 1;
          return await input.load();
        }
        const key = `sa:${config.namespace}:${config.dataset}:v1:reference:${input.kind}`;
        const read = await command(client => client.get<unknown>(key));
        redisDurationMs += read.durationMs;
        if (!read.ok) {
          finish(read.reason === 'budget-exhausted' ? 'budget-exhausted' : read.reason === 'timeout' ? 'timeout' : 'read-error');
          dbLoads = 1;
          return await input.load();
        }
        if (read.value !== null) {
          const currentTime = now();
          const cachedSize = byteSize(read.value);
          if (cachedSize !== null && cachedSize <= MAX_PAYLOAD_BYTES && validEnvelope(read.value, {
            kind: input.kind, namespace: config.namespace, dataset: config.dataset,
            now: currentTime, ttlMs, validate: input.validate,
          })) {
            finish('hit');
            return read.value.data as T;
          }
          finish('invalid-payload');
        } else {
          finish('miss');
        }

        const loadedAt = now();
        dbLoads = 1;
        const data = await input.load();
        let validData = false;
        try { validData = input.validate(data); } catch { validData = false; }
        if (!validData) {
          finish('invalid-source');
          return data;
        }
        const expiresAt = loadedAt + ttlMs;
        const remainingTtlMs = Math.floor(expiresAt - now());
        if (remainingTtlMs < 1) {
          finish('fill-skipped-expired');
          return data;
        }
        const envelope: CacheEnvelope = {
          version: 1, kind: input.kind, namespace: config.namespace, dataset: config.dataset,
          loadedAt, expiresAt, data,
        };
        const size = byteSize(envelope);
        if (size === null || size > MAX_PAYLOAD_BYTES) {
          finish('invalid-source');
          return data;
        }
        const write = await command(client => client.set(key, envelope, { px: remainingTtlMs }));
        redisDurationMs += write.durationMs;
        if (!write.ok) {
          finish(write.reason === 'budget-exhausted' ? 'budget-exhausted' : write.reason === 'timeout' ? 'timeout' : 'fill-error');
          return data;
        }
        return data;
      } catch (error) {
        finish('database-error');
        throw error;
      } finally {
        try {
          options.observe?.({
            kind: input.kind,
            outcome,
            lookupDurationMs: Math.max(0, monotonicNow() - startedAt),
            redisDurationMs,
            dbLoads,
          });
        } catch { /* Telemetry must not affect reads. */ }
      }
    },
  };
}

export type ReferenceCache = ReturnType<typeof createReferenceCache>;
