import type { Me, ApiResult } from './contracts';
export class AuthApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export async function loadAccount(
  getToken: () => Promise<string | null>,
  apiBaseUrl = '',
  initialize = false,
  signal?: AbortSignal,
): Promise<Me> {
  const token = await getToken();
  if (!token) throw new AuthApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Please sign in again.');
  const response = await fetch(apiBaseUrl.replace(/\/$/, '') + (initialize ? '/api/me/initialize' : '/api/me'), {
    method: initialize ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token },
    credentials: 'omit', cache: 'no-store', signal,
  });
  const body: ApiResult<Me> = await response.json();
  if (!response.ok) {
    if ('error' in body) throw new AuthApiError(response.status, body.error.code, body.error.message);
    throw new Error('Account access is unavailable.');
  }
  if (!('data' in body)) throw new Error('Account access is unavailable.');
  return body.data;
}
