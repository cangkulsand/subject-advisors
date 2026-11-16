import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { P001Error } from '../profile/validation';
import { databaseError } from '../p001-sprint2/repository';
import type { PlanningRepository } from './repository';

export interface PlanningDependencies { auth: AuthDependencies; repository: PlanningRepository }
export const PLANNING_INPUT_PATH = '/api/planning/input';

/** UC14–UC16 read-only endpoint: the planning input for the signed-in student. The browser runs the shared engine. */
export async function handlePlanningRequest(request: Request, deps: PlanningDependencies): Promise<Response | null> {
  if (new URL(request.url).pathname !== PLANNING_INPUT_PATH) return null;
  try {
    if (request.method !== 'GET') {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.' } }, 405);
      response.headers.set('Allow', 'GET');
      return response;
    }
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    const input = await deps.repository.load(me.clerkUserId);
    if (!input) throw new P001Error(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
    return authJson({ data: input });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    try { databaseError(error); } catch (safe) {
      const e = safe as P001Error; return authJson({ error: { code: e.code, message: e.message } }, e.status);
    }
  }
}
