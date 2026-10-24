import { createClerkVerifier } from './clerk';
import { createNeonAccessRepository } from './repository';
import type { AuthDependencies, ProfileReader } from './contracts';
export { handleAuthRequest } from './routes';
export { authorize } from '../../middleware/auth';
export { authErrorResponse, authJson, AuthError } from './errors';
export type { AuthDependencies, Me, AppRole, ProfileReader, ApiResult } from './contracts';

/** A subset consumed from FOUNDATION's generated Worker bindings. */
export interface AuthBindings {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  DATABASE_URL: string;
}
/** Construct per request; no global user state or cross-request auth cache. */
export function createAuthDependencies(env: AuthBindings, profiles?: ProfileReader): AuthDependencies {
  return {
    verify: createClerkVerifier({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      authorizedParties: (env.CLERK_AUTHORIZED_PARTIES ?? '').split(',').map(s => s.trim()).filter(Boolean),
    }),
    access: createNeonAccessRepository(env.DATABASE_URL),
    profiles,
  };
}
