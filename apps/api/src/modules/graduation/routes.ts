import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { fields, jsonBody, P001Error } from '../profile/validation';
import { calculateProgress } from '../p001-sprint2/progress';
import { databaseError } from '../p001-sprint2/repository';
import { assessGraduation, nextConfirmations } from './assess';
import type { GraduationRepository } from './contracts';

export interface GraduationDependencies { auth: AuthDependencies; repository: GraduationRepository; now?: () => Date }
const path = '/api/graduation-check', confirmationsPath = path + '/confirmations';

export async function handleGraduationRequest(request: Request, deps: GraduationDependencies): Promise<Response | null> {
  const url = new URL(request.url).pathname;
  if (url !== path && url !== confirmationsPath) return null;
  try {
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    const method = request.method;
    if (url === path && method === 'GET') {
      const source = await load(deps, me.clerkUserId);
      return authJson({ data: assessGraduation(calculateProgress(source.progress), source.confirmations) });
    }
    if (url === confirmationsPath && method === 'PUT') {
      const body = fields(await jsonBody(request), ['feesCleared', 'muet']);
      if (typeof body.feesCleared !== 'boolean' || typeof body.muet !== 'boolean') throw new P001Error(400, 'VALIDATION_ERROR', 'feesCleared and muet must both be true or false.');
      const source = await load(deps, me.clerkUserId);
      const next = nextConfirmations(source.confirmations, { feesCleared: body.feesCleared, muet: body.muet }, (deps.now ?? (() => new Date()))());
      if (!await deps.repository.save(me.clerkUserId, next)) throw new P001Error(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
      return authJson({ data: assessGraduation(calculateProgress(source.progress), next) });
    }
    return authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.' } }, 405);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    try { databaseError(error); } catch (safe) {
      const e = safe as P001Error; return authJson({ error: { code: e.code, message: e.message } }, e.status);
    }
  }
}

async function load(deps: GraduationDependencies, clerkUserId: string) {
  const source = await deps.repository.source(clerkUserId);
  if (!source) throw new P001Error(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
  return source;
}
