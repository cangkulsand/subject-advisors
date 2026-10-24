import { authErrorResponse, authJson, AuthError, createAuthDependencies, handleAuthRequest } from '../../../apps/api/src/modules/auth';

/** Local P004 adapter only; no academic APIs or production router are implemented here. */
export default {
  async fetch(request: Request, env: LocalAuthEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/local-status' && request.method === 'GET') {
      const configured = Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY && env.DATABASE_URL);
      return Response.json({ configured }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path !== '/api/me' && path !== '/api/me/initialize') {
      return authJson({ error: { code: 'NOT_FOUND', message: 'This route is not part of the local auth preview.' } }, 404);
    }
    try {
      if (!request.headers.get('Authorization')) {
        throw new AuthError(401, 'SESSION_REQUIRED', 'Please sign in to continue.');
      }
      const response = await handleAuthRequest(request, createAuthDependencies(env));
      return response ?? authJson({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
    } catch (error) { return authErrorResponse(error); }
  },
};
