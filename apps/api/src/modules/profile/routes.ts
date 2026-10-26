import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import type { ProfileRepository } from './contracts';
import type { RecordsRepository } from '../records/contracts';
import { recordInput } from '../records/validation';
import { P001Error, jsonBody, positiveId, profileInput, persistenceError } from './validation';
export interface P001Dependencies { auth: AuthDependencies; profiles: ProfileRepository; records: RecordsRepository }
export async function handleP001Request(request: Request, deps: P001Dependencies): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const profile = path === '/api/profile', options = path === '/api/profile/options';
  const records = path === '/api/academic-records', match = /^\/api\/academic-records\/([^/]+)$/.exec(path);
  if (!profile && !options && !records && !match) return null;
  try {
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: records || Boolean(match) });
    if (profile && request.method === 'GET') return authJson({ data: await deps.profiles.find(me.clerkUserId) });
    if (options && request.method === 'GET') return authJson({ data: await deps.profiles.options(me.clerkUserId) });
    if (profile && request.method === 'PUT') return authJson({ data: await deps.profiles.save(me.clerkUserId, profileInput(await jsonBody(request))) });
    if (records && request.method === 'GET') return authJson({ data: await deps.records.list(me.clerkUserId) });
    if ((records && request.method === 'POST') || (match && request.method === 'PUT')) {
      const id = match ? positiveId(/^\d+$/.test(match[1]!) ? Number(match[1]) : NaN, 'Record') : undefined;
      const input = recordInput(await jsonBody(request));
      return authJson({ data: await deps.records.save(me.clerkUserId, input, id) }, id === undefined ? 201 : 200);
    }
    return authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.' } }, 405);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    let safe: P001Error;
    try { persistenceError(error); } catch (mapped) { safe = mapped as P001Error; }
    return authJson({ error: { code: safe!.code, message: safe!.message } }, safe!.status);
  }
}
