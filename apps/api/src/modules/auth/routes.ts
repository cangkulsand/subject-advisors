import { authorize } from '../../middleware/auth';
import type { AuthDependencies } from './contracts';
import { AuthError, authErrorResponse, authJson } from './errors';

/** Incoming Worker POSTs may have a stream even when the HTTP payload is empty. */
async function requireEmptyBody(request: Request): Promise<void> {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.byteLength > 0) {
        throw new AuthError(400, 'BODY_NOT_ALLOWED', 'Account initialization does not accept a request body.');
      }
    }
  } finally {
    // Stop on the first nonempty chunk; do not buffer an arbitrary payload.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Returns null for other owners' routes. FOUNDATION registers this adapter. */
export async function handleAuthRequest(request: Request, deps: AuthDependencies): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/me' && path !== '/api/me/initialize') return null;
  try {
    const initialize = path === '/api/me/initialize';
    const method = initialize ? 'POST' : 'GET';
    if (request.method !== method) {
      const response = authErrorResponse(new AuthError(405, 'METHOD_NOT_ALLOWED', 'Use ' + method + ' for this endpoint.'));
      response.headers.set('Allow', method);
      return response;
    }
    if (initialize) await requireEmptyBody(request);
    return authJson({ data: await authorize(request, deps, { initialize }) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
