/** Tab/session-scoped private snapshots; catalogue options have a short TTL. */
export const ACADEMIC_CACHE_TTL = 5 * 60 * 1000;
type Entry = { value: unknown; expires: number | null };
const prefix = 'subject-advisors.academic.v1:';
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
function storage(): Storage | undefined { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }
function pruneStorage(keep: (key: string) => boolean) {
  try { const store = storage(); if (store) for (let i = store.length - 1; i >= 0; i--) { const key = store.key(i); if (key?.startsWith(prefix) && !keep(key.slice(prefix.length))) store.removeItem(key); } } catch { /* Storage is optional. */ }
}
/** Preserve this identity's snapshots across reloads; discard other identities. */
export function keepAcademicSession(identity: string) {
  generation++; pending.clear();
  const belongs = (key: string) => { try { return JSON.parse(key)[0] === identity; } catch { return false; } };
  for (const key of entries.keys()) if (!belongs(key)) entries.delete(key);
  pruneStorage(belongs);
}

export function clearAcademicCache() {
  generation++;
  entries.clear();
  pending.clear();
  pruneStorage(() => false);
}

function aborted() { return new DOMException('The request was cancelled.', 'AbortError'); }
/** Cancelling one subscriber must not cancel another page's shared request. */
function subscribe<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal?.addEventListener('abort', cancel, { once: true });
    promise.then(value => { if (!signal?.aborted) resolve(structuredClone(value)); }, reject)
      .finally(() => signal?.removeEventListener('abort', cancel));
  });
}

export function cachedAcademicRead<T>(key: string, load: () => Promise<T>, signal?: AbortSignal, ttl: number | null = null): Promise<T> {
  if (signal?.aborted) return Promise.reject(aborted());
  let cached = entries.get(key);
  if (!cached) {
    try {
      const value: unknown = JSON.parse(storage()?.getItem(prefix + key) ?? 'null');
      if (value && typeof value === 'object' && 'value' in value && 'expires' in value && (value.expires === null || typeof value.expires === 'number')) cached = value as Entry;
    } catch { /* Invalid snapshots are refetched. */ }
  }
  if (cached && (cached.expires === null || cached.expires > Date.now())) { entries.set(key, cached); return subscribe(Promise.resolve(cached.value as T), signal); }
  entries.delete(key);
  try { storage()?.removeItem(prefix + key); } catch { /* Optional storage. */ }
  let request = pending.get(key) as Promise<T> | undefined;
  if (!request) {
    const version = generation;
    request = load().then(value => {
      // A save, logout or account change makes any older read obsolete.
      if (generation !== version) throw aborted();
      const entry = { value: structuredClone(value), expires: ttl === null ? null : Date.now() + ttl };
      entries.set(key, entry);
      try { storage()?.setItem(prefix + key, JSON.stringify(entry)); } catch { /* Memory cache remains usable. */ }
      return value;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
  }
  return subscribe(request, signal);
}
