import { AuthError, authErrorResponse, type AuthBindings } from './modules/auth';
import { dispatchIntegratedRequest } from './integration/router';
import { createIntegratedServices } from '../../../.generated-integration/api';

interface CloudflareEnv extends AuthBindings { ASSETS: { fetch(request: Request): Promise<Response> } }

/** Deployment adapter for the integrated application; local-only diagnostics stay in local/api.ts. */
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) {
      try {
        if (!request.headers.get('Authorization')) throw new AuthError(401, 'SESSION_REQUIRED', 'Please sign in to continue.');
        return await dispatchIntegratedRequest(request, createIntegratedServices(env));
      } catch (error) { return authErrorResponse(error); }
    }
    return env.ASSETS.fetch(request);
  },
};
