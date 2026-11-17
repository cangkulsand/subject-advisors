import { neonDatabase } from '../p001-sprint2/repository';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createPlanningRepository } from './repository';
import { handlePlanningRequest } from './routes';
import { createScenarioRepository } from './scenario';
export { handlePlanningRequest, PLANNING_INPUT_PATH, PLANNING_SCENARIO_PATH } from './routes';
export { createScenarioRepository, type ScenarioRepository } from './scenario';
export { toPlanningInput, startSemester, type PlanningRepository, type PlanningRows } from './repository';

export function createPlanningHandler(env: AuthBindings, auth: AuthDependencies): (request: Request) => Promise<Response | null> {
  const db = neonDatabase(env.DATABASE_URL);
  const repository = createPlanningRepository(db);
  const scenarios = createScenarioRepository(db);
  return request => handlePlanningRequest(request, { auth, repository, scenarios });
}
