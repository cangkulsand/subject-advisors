export class AcademicApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export type AcademicClient = <T>(path: string, options?: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown; signal?: AbortSignal }) => Promise<T>;
export function createAcademicClient(getToken: () => Promise<string | null>, baseUrl = ''): AcademicClient {
  return async <T>(path: string, options: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> => {
    const token = await getToken();
    if (!token) throw new AcademicApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Please sign in again.');
    const response = await fetch(baseUrl.replace(/\/$/, '') + path, {
      method: options.method ?? 'GET', signal: options.signal,
      headers: { Authorization: 'Bearer ' + token, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'omit', cache: 'no-store',
    });
    const value: unknown = await response.json();
    if (value && typeof value === 'object') {
      if (response.ok && 'data' in value) return value.data as T;
      if ('error' in value && value.error && typeof value.error === 'object' && 'message' in value.error && 'code' in value.error) {
        throw new AcademicApiError(response.status, String(value.error.code), String(value.error.message));
      }
    }
    throw new AcademicApiError(response.status, 'INVALID_RESPONSE', 'Academic data could not be loaded. Please retry.');
  };
}
export function errorMessage(error: unknown): string {
  return error instanceof AcademicApiError ? error.message : 'Unable to reach academic data. Your changes have not been confirmed. Please retry.';
}
