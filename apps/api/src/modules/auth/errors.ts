import type { ApiResult } from './contracts';
export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
export function authJson<T>(body: ApiResult<T>, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
}
export function authErrorResponse(error: unknown): Response {
  const safe = error instanceof AuthError ? error :
    new AuthError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable. Please retry.');
  // Never serialize/log SDK errors, database errors, tokens or connection strings.
  return authJson({ error: { code: safe.code, message: safe.message } }, safe.status);
}
