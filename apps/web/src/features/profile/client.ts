import { accountSessionStamp, clearAccountCache, profileSavedForSession } from '../auth/account-cache';
import { ACADEMIC_CACHE_TTL, cachedAcademicRead, clearAcademicCache } from './data-cache';
export class AcademicApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
type RequestOptions = { method?: 'GET' | 'PUT' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal };
export type AcademicClient = <T>(path: string, options?: RequestOptions) => Promise<T>;
const cachedPaths = new Set(['/api/profile', '/api/profile/options', '/api/academic-records']);
export function createAcademicClient(getToken: () => Promise<string | null>, baseUrl = ''): AcademicClient {
  const base = baseUrl.replace(/\/+$/, '');
  return <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const sessionStamp = accountSessionStamp();
    const method = options.method ?? 'GET';
    const cacheable = Boolean(sessionStamp) && method === 'GET' && cachedPaths.has(path);
    async function request(): Promise<T> {
      const token = await getToken();
      const assertSession = () => {
        if (sessionStamp && sessionStamp !== accountSessionStamp()) throw new AcademicApiError(401, 'SESSION_CHANGED', 'Your account changed. Please reload before saving.');
      };
      assertSession();
      if (!token) { clearAccountCache(); throw new AcademicApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Please sign in again.'); }
      const response = await fetch(base + path, {
        method, signal: cacheable ? undefined : options.signal,
        headers: { Authorization: 'Bearer ' + token, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'omit', cache: 'no-store',
      });
      assertSession();
      if (response.status === 401 || response.status === 403) clearAccountCache();
      // Invalidate even if the saved response cannot be decoded: the server may have committed it.
      if (response.ok && method !== 'GET') clearAcademicCache();
      const value: unknown = await response.json();
      assertSession();
      if (value && typeof value === 'object') {
        if (response.ok && 'data' in value) {
          if (path === '/api/profile' && method === 'PUT') profileSavedForSession(base, sessionStamp);
          return value.data as T;
        }
        if ('error' in value && value.error && typeof value.error === 'object' && 'message' in value.error && 'code' in value.error) {
          throw new AcademicApiError(response.status, String(value.error.code), String(value.error.message));
        }
      }
      throw new AcademicApiError(response.status, 'INVALID_RESPONSE', 'Academic data could not be loaded. Please retry.');
    }
    return cacheable ? cachedAcademicRead(JSON.stringify([sessionStamp, base, path]), request, options.signal, path === '/api/profile/options' ? ACADEMIC_CACHE_TTL : null) : request();
  };
}
export function errorMessage(error: unknown): string {
  return error instanceof AcademicApiError ? error.message : 'Unable to reach academic data. Your changes have not been confirmed. Please retry.';
}
