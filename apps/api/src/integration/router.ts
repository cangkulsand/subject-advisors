import { authorize, authJson, handleAuthRequest } from '../modules/auth';
import type { AuthDependencies } from '../modules/auth/contracts';
export type FeatureHandler = (request: Request) => Promise<Response | null>;
export interface IntegratedServices { auth: AuthDependencies; profile?: FeatureHandler; offerings?: FeatureHandler }
/** Owners retain validation/authorization inside their handlers. No business logic here. */
export async function dispatchIntegratedRequest(request: Request, services: IntegratedServices): Promise<Response> {
  const path = new URL(request.url).pathname;
  const auth = await handleAuthRequest(request, services.auth);
  if (auth) return auth;
  const profileRoute = path === '/api/profile' || path === '/api/profile/options' || path === '/api/academic-records' || /^\/api\/academic-records\/[^/]+$/.test(path);
  const offeringRoute = path === '/api/semester-offerings';
  const handler = profileRoute ? services.profile : offeringRoute ? services.offerings : undefined;
  if (profileRoute || offeringRoute) {
    if (handler) {
      const response = await handler(request);
      if (response) return response;
      return authJson({ error: { code: 'FEATURE_ROUTE_UNAVAILABLE', message: 'This academic service is temporarily unavailable.' } }, 503);
    }
    // Check real identity/role even when an owner's code has not been pasted in.
    await authorize(request, services.auth, { roles: ['STUDENT'] });
    return authJson({ error: { code: 'FEATURE_NOT_INSTALLED', message: 'This academic service is not available yet.' } }, 503);
  }
  return authJson({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
}
