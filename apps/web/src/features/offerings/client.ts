import type { OfferingsClient } from '../../../../../packages/shared/src/offerings/offerings';
import { readPageData, readSelection } from './response';

export class OfferingApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
/** The integration shell supplies Clerk's getToken and wraps the page in AuthGate. */
export function createOfferingClient(getToken: () => Promise<string | null>, apiBaseUrl = ''): OfferingsClient {
  async function request<T>(path: string, init: RequestInit, decode: (value: unknown) => T): Promise<T> {
    const token = await getToken();
    if (!token) throw new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again to continue.');
    const response = await fetch(apiBaseUrl.replace(/\/$/, '') + path, {
      ...init, headers: { ...init.headers, Authorization: 'Bearer ' + token },
      credentials: 'omit', cache: 'no-store',
    });
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) throw new Error('The offerings response is unavailable. Please retry.');
    if (!response.ok) {
      if ('error' in body && typeof body.error === 'object' && body.error !== null &&
          'code' in body.error && typeof body.error.code === 'string' &&
          'message' in body.error && typeof body.error.message === 'string') {
        throw new OfferingApiError(response.status, body.error.code, body.error.message);
      }
      throw new Error('Offerings could not be loaded or saved. Please retry.');
    }
    if (!('data' in body)) throw new Error('The offerings response is unavailable. Please retry.');
    return decode(body.data);
  }
  return {
    load: (semesterId, signal) => request('/api/semester-offerings' +
      (semesterId ? '?semesterId=' + encodeURIComponent(semesterId) : ''), { method: 'GET', signal }, readPageData),
    save: input => request('/api/semester-offerings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }, readSelection),
  };
}
