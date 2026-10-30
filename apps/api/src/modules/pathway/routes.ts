import { authorize } from '../../middleware/auth';
import type { AuthDependencies } from '../auth/contracts';
import { AuthError, authErrorResponse, authJson } from '../auth/errors';
import { buildPathwayGraph } from './adapter';
import type { PathwayRepository } from './repository';

/**
 * Read-only UC17 endpoint. Returns null for other owners' routes so the shared
 * dispatcher can continue. Student identity and profile completion are enforced
 * before any curriculum/record data is read.
 */
export async function handlePathwayRequest(
  request: Request,
  auth: AuthDependencies,
  repository: PathwayRepository,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/pathway/graph') return null;
  try {
    if (request.method !== 'GET') {
      const response = authErrorResponse(new AuthError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.'));
      response.headers.set('Allow', 'GET');
      return response;
    }
    const me = await authorize(request, auth, { roles: ['STUDENT'], requireProfile: true });
    const raw = await repository.load(me.clerkUserId);
    return authJson({ data: buildPathwayGraph(raw) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
