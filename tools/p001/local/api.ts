import { handleAuthRequest, authErrorResponse, authJson, type AuthBindings } from '../../../apps/api/src/modules/auth';
import { createP001Dependencies, handleP001Request } from '../../../apps/api/src/modules/profile';
export default {
  async fetch(request: Request, env: AuthBindings): Promise<Response> {
    try {
      const deps = createP001Dependencies(env);
      return await handleAuthRequest(request, deps.auth) ?? await handleP001Request(request, deps) ??
        authJson({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
    } catch (error) { return authErrorResponse(error); }
  },
};
