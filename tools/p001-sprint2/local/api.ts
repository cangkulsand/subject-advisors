import { authErrorResponse,type AuthBindings } from '../../../apps/api/src/modules/auth';
import { dispatchIntegratedRequest } from '../../../apps/api/src/integration/router';
import { createIntegratedServices } from '../../../.generated-integration/api';
import { createSprint2Dependencies,handleSprint2Request } from '../../../apps/api/src/modules/p001-sprint2';
export default { async fetch(request:Request,env:AuthBindings):Promise<Response> {
  try {
    const deps=createSprint2Dependencies(env);
    return await handleSprint2Request(request,deps) ?? await dispatchIntegratedRequest(request,{...createIntegratedServices(env),auth:deps.auth});
  } catch(error) { return authErrorResponse(error); }
} };
