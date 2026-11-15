import { neonDatabase } from '../p001-sprint2/repository';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createGraduationRepository } from './repository';
import { handleGraduationRequest } from './routes';
export { handleGraduationRequest } from './routes';
export { assessGraduation, nextConfirmations } from './assess';
export type { GraduationCheck, GraduationStatus, Confirmations, GraduationRepository } from './contracts';

export function createGraduationHandler(env: AuthBindings, auth: AuthDependencies): (request: Request) => Promise<Response | null> {
  const repository = createGraduationRepository(neonDatabase(env.DATABASE_URL));
  return request => handleGraduationRequest(request, { auth, repository });
}
