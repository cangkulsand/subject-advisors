import type { AuthDependencies } from '../auth/contracts';
import { createNeonPathwayRepository } from './repository';
import { handlePathwayRequest } from './routes';

export { handlePathwayRequest } from './routes';
export { buildPathwayGraph } from './adapter';
export type { PathwayGraph, PathwaySubjectNode, PathwayPrerequisiteEdge, PathwayNodeStatus, PrerequisiteType } from './contracts';

/** A subset consumed from FOUNDATION's generated Worker bindings. */
export interface PathwayBindings {
  DATABASE_URL: string;
}

/**
 * Construct a read-only feature handler for the shared dispatcher. The handler
 * owns its authorization and persistence boundary; no business logic lives in
 * the shared router.
 */
export function createPathwayHandler(env: PathwayBindings, auth: AuthDependencies) {
  const repository = createNeonPathwayRepository(env.DATABASE_URL);
  return (request: Request) => handlePathwayRequest(request, auth, repository);
}
