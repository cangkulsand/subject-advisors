import type { OfferingsClient } from '../../../../../packages/shared/src/offerings/offerings';
import { ACADEMIC_CACHE_TTL, cachedAcademicRead, clearAcademicCache } from '../profile/data-cache';
import { AcademicApiError, createAcademicClient } from '../profile/client';
import { accountSessionStamp, clearAccountCache } from '../auth/account-cache';
import { readOfferingAcademicHistory } from './academic-history';
import { readPageData, readSelection } from './response';

export class OfferingApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
function assertSession(expected: string | undefined) {
  if (expected && expected !== accountSessionStamp()) throw new OfferingApiError(401, 'SESSION_CHANGED', 'Your account changed. Please reload before saving.');
}
function isAbort(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
}
/** The integration shell supplies Clerk's getToken and wraps the page in AuthGate. */
export function createOfferingClient(getToken: () => Promise<string | null>, apiBaseUrl = ''): OfferingsClient {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const academicClient = createAcademicClient(getToken, base);

  async function request<T>(path: string, init: RequestInit, decode: (value: unknown) => T, expectedSession: string | undefined): Promise<T> {
    assertSession(expectedSession);
    const token = await getToken();
    assertSession(expectedSession);
    if (!token) { clearAccountCache(); throw new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again to continue.'); }
    const response = await fetch(base + path, {
      ...init, headers: { ...init.headers, Authorization: 'Bearer ' + token },
      credentials: 'omit', cache: 'no-store',
    });
    assertSession(expectedSession);
    if (response.status === 401 || response.status === 403) clearAccountCache();
    // A successful PUT may have committed even if its response cannot be decoded.
    if (response.ok && init.method === 'PUT') clearAcademicCache();
    let body: unknown;
    try { body = await response.json(); }
    catch {
      if (response.status === 401) throw new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again to continue.');
      if (response.status === 403) throw new OfferingApiError(403, 'ACCESS_DENIED', 'You do not have access to this student information. Check your account access, then retry.');
      throw new Error('The offerings response is unavailable. Please retry.');
    }
    assertSession(expectedSession);
    if (response.status === 401 || response.status === 403) {
      if (typeof body === 'object' && body !== null && !Array.isArray(body) &&
          'error' in body && typeof body.error === 'object' && body.error !== null &&
          'code' in body.error && typeof body.error.code === 'string' &&
          'message' in body.error && typeof body.error.message === 'string') {
        throw new OfferingApiError(response.status, body.error.code, body.error.message);
      }
      throw response.status === 401
        ? new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again to continue.')
        : new OfferingApiError(403, 'ACCESS_DENIED', 'You do not have access to this student information. Check your account access, then retry.');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('The offerings response is unavailable. Please retry.');
    if (!response.ok) {
      if ('error' in body && typeof body.error === 'object' && body.error !== null &&
          'code' in body.error && typeof body.error.code === 'string' &&
          'message' in body.error && typeof body.error.message === 'string') {
        throw new OfferingApiError(response.status, body.error.code, body.error.message);
      }
      throw new Error('Offerings could not be loaded or saved. Please retry.');
    }
    if (!('data' in body)) throw new Error('The offerings response is unavailable. Please retry.');
    const result = decode(body.data);
    assertSession(expectedSession);
    return result;
  }

  return {
    async load(semesterId, signal) {
      const sessionStamp = accountSessionStamp();
      const path = '/api/semester-offerings' + (semesterId ? '?semesterId=' + encodeURIComponent(semesterId) : '');
      const key = JSON.stringify([sessionStamp, base, 'p002-context-v3-profile-semester', path]);
      const loadOfferings = () => request(path, { method: 'GET' }, readPageData, sessionStamp);
      const page = sessionStamp
        ? await cachedAcademicRead(key, loadOfferings, signal, ACADEMIC_CACHE_TTL)
        : await request(path, { method: 'GET', signal }, readPageData, sessionStamp);
      assertSession(sessionStamp);

      let academicHistory;
      try {
        academicHistory = readOfferingAcademicHistory(await academicClient<unknown>('/api/academic-records', { signal }));
        assertSession(sessionStamp);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (error instanceof AcademicApiError && (error.status === 401 || error.status === 403)) {
          throw new OfferingApiError(error.status, error.code, error.message);
        }
        assertSession(sessionStamp);
        academicHistory = { status: 'unavailable' as const };
      }
      return { ...page, academicHistory };
    },
    save(input) {
      const sessionStamp = accountSessionStamp();
      return request('/api/semester-offerings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }, readSelection, sessionStamp);
    },
    refresh() { clearAcademicCache(); },
  };
}
