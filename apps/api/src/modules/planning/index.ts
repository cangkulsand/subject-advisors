import { neonDatabase } from '../p001-sprint2/repository';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createPlanningRepository } from './repository';
import { handlePlanningRequest } from './routes';
export { handlePlanningRequest, PLANNING_INPUT_PATH } from './routes';
export { toPlanningInput, startSemester, type PlanningRepository, type PlanningRows } from './repository';

export function createPlanningHandler(env: AuthBindings, auth: AuthDependencies): (request: Request) => Promise<Response | null> {
  const repository = createPlanningRepository(neonDatabase(env.DATABASE_URL));
  return request => handlePlanningRequest(request, { auth, repository });
}
