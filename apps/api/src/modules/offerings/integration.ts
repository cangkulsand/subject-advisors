import { neon } from '@neondatabase/serverless';
import { authErrorResponse, authJson, createAuthDependencies } from '../auth';
import type { AuthBindings, ProfileReader } from '../auth';
import type { OfferingDependencies } from './contracts';
import { createOfferingContextReader } from './context';
import { createNeonOfferingRepository } from './neon';
import { handleOfferingRequest } from './routes';

export interface OfferingServices {
  /** Required real P001 reader. Missing service denies access; never use demo setup state. */
  profiles: ProfileReader;
  /** An approved shared reader can override the narrow read-only SQL adapter. */
  contextFor?: OfferingDependencies['contextFor'];
}

/** Mount in the existing Worker; this factory does not scaffold a router or auth service. */
export function createOfferingHandler(env: AuthBindings, services: OfferingServices) {
  return async (request: Request): Promise<Response | null> => {
    if (new URL(request.url).pathname !== '/api/semester-offerings') return null;
    if (!services?.profiles) return authJson({ error: { code: 'PROFILE_UNAVAILABLE', message: 'Academic profile integration is unavailable. Please retry later.' } }, 503);
    try {
      const sql = neon(env.DATABASE_URL);
      return await handleOfferingRequest(request, {
        auth: createAuthDependencies(env, services.profiles),
        contextFor: services.contextFor ?? createOfferingContextReader(async (text, parameters) =>
          await sql.query(text, parameters) as Record<string, unknown>[]),
        repository: createNeonOfferingRepository(env.DATABASE_URL),
      });
    } catch (error) { return authErrorResponse(error); }
  };
}
