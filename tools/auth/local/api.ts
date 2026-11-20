import { authErrorResponse, AuthError, type AuthBindings } from '../../../apps/api/src/modules/auth';
import { dispatchIntegratedRequest } from '../../../apps/api/src/integration/router';
import { createIntegratedServices } from '../../../.generated-integration/api';

/** Shared local adapter. Owner modules are registered by prepare:integration. */
export default {
  async fetch(request: Request, env: AuthBindings): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/local-status' && request.method === 'GET') {
      const configured = Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY && env.DATABASE_URL);
      return Response.json({ configured }, { headers: { 'Cache-Control': 'no-store' } });
    }
    try {
      if (path.startsWith('/api/') && !request.headers.get('Authorization')) {
        throw new AuthError(401, 'SESSION_REQUIRED', 'Please sign in to continue.');
      }
      return await dispatchIntegratedRequest(request, createIntegratedServices(env));
    } catch (error) { return authErrorResponse(error); }
  },
};
