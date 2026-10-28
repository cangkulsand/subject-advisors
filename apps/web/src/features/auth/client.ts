import type { Me, ApiResult } from './contracts';
export class AuthApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const ACCOUNT_ACCESS_TIMEOUT_MS = 15_000;
export async function loadAccount(
  getToken: () => Promise<string | null>,
  apiBaseUrl = '',
  initialize = false,
  signal?: AbortSignal,
): Promise<Me> {
  const controller = new AbortController();
  const timeoutError = new AuthApiError(503, 'ACCOUNT_CHECK_TIMEOUT', 'Account access is taking too long. Check your connection, then retry.');
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectExternalAbort: (reason: unknown) => void = () => undefined;
  const externallyAborted = signal
    ? new Promise<never>((_resolve, reject) => { rejectExternalAbort = reject; })
    : undefined;
  const onExternalAbort = () => {
    const reason = signal?.reason ?? new DOMException('The account check was cancelled.', 'AbortError');
    controller.abort(reason);
    rejectExternalAbort(reason);
  };
  if (signal?.aborted) onExternalAbort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timed = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
      reject(timeoutError);
    }, ACCOUNT_ACCESS_TIMEOUT_MS);
  });
  const request = async (): Promise<Me> => {
    const token = await getToken();
    if (controller.signal.aborted) {
      if (timedOut) throw timeoutError;
      throw controller.signal.reason ?? new DOMException('The account check was cancelled.', 'AbortError');
    }
    if (!token) throw new AuthApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Please sign in again.');
    const response = await fetch(apiBaseUrl.replace(/\/$/, '') + (initialize ? '/api/me/initialize' : '/api/me'), {
      method: initialize ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    });
    const body: ApiResult<Me> = await response.json();
    if (!response.ok) {
      if ('error' in body) throw new AuthApiError(response.status, body.error.code, body.error.message);
      throw new Error('Account access is unavailable.');
    }
    if (!('data' in body)) throw new Error('Account access is unavailable.');
    const me = body.data;
    // Rolling deployment: an old backend can describe only its single legacy role.
    // Never fall back when any new contract field is present but malformed.
    if (me && typeof me === 'object' && !Object.hasOwn(me,'roles') && !Object.hasOwn(me,'availableRoles') && !Object.hasOwn(me,'studentProfileState')) {
      return { ...me, roles: [me.appRole], availableRoles: [me.appRole],
        studentProfileState: me.appRole === 'STUDENT' ? me.profileState : 'NOT_APPLICABLE' };
    }
    return me;
  };

  try {
    return await Promise.race([request(), timed, ...(externallyAborted ? [externallyAborted] : [])]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
