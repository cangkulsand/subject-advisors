import { createP001Dependencies } from '../profile';
import type { AuthBindings } from '../auth';
import { createSprint2Repository,neonDatabase } from './repository';
export { handleSprint2Request } from './routes';
export function createSprint2Dependencies(env: AuthBindings) {
  const p001=createP001Dependencies(env);
  return { ...p001,repository:createSprint2Repository(neonDatabase(env.DATABASE_URL)) };
}
