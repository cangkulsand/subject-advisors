import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { P001Error } from '../profile/validation';
import { databaseError } from '../p001-sprint2/repository';
import { planningBaselineVersion } from '../../../../../packages/shared/src/planning/baseline-version';
import { validateChanges } from '../../../../../packages/shared/src/planning/placement';
import { fromSaved, toRows, validateSavedBody } from '../../../../../packages/shared/src/planning/saved';
import type { PlanningRepository } from './repository';
import type { ScenarioRepository } from './scenario';

export interface PlanningDependencies { auth: AuthDependencies; repository: PlanningRepository; scenarios: ScenarioRepository }
export const PLANNING_INPUT_PATH = '/api/planning/input';
export const PLANNING_SCENARIO_PATH = '/api/planning/scenario';

const notAllowed = (allow: string) => {
  const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${allow} for this endpoint.` } }, 405);
  response.headers.set('Allow', allow);
  return response;
};
const invalid = (message: string) => authJson({ error: { code: 'SCENARIO_INVALID', message } }, 422);

/**
 * UC14–UC16: `GET /api/planning/input` (the planning input; the browser runs the shared engine) and
 * `GET/PUT/DELETE /api/planning/scenario` (the student's one saved what-if, S3-P004-010). Students only, own data only.
 */
export async function handlePlanningRequest(request: Request, deps: PlanningDependencies): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== PLANNING_INPUT_PATH && path !== PLANNING_SCENARIO_PATH) return null;
  try {
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    if (path === PLANNING_INPUT_PATH) {
      if (request.method !== 'GET') return notAllowed('GET');
      const input = await deps.repository.load(me.clerkUserId);
      if (!input) throw new P001Error(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
      return authJson({ data: { ...input, baselineVersion: await planningBaselineVersion(input) } });
    }
    if (request.method === 'GET') return authJson({ data: await deps.scenarios.read(me.clerkUserId) });
    // 200 with { data: null } rather than 204: the shared browser client reads a JSON body on every response.
    if (request.method === 'DELETE') { await deps.scenarios.remove(me.clerkUserId); return authJson({ data: null }); }
    if (request.method !== 'PUT') return notAllowed('GET, PUT, DELETE');
    let body: unknown;
    try { body = await request.json(); } catch { return invalid('The request is not valid JSON.'); }
    const shape = validateSavedBody(body);
    if (!shape.ok) return invalid(shape.error);
    const input = await deps.repository.load(me.clerkUserId);
    if (!input) throw new P001Error(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
    if (shape.baselineVersion !== undefined && shape.baselineVersion !== await planningBaselineVersion(input)) {
      return authJson({ error: { code: 'PLANNING_BASELINE_CHANGED', message: 'Your programme, records or semester setup changed since this plan was loaded. Refresh the plan and try again.' } }, 409);
    }
    const known = new Set(input.subjects.map(s => s.curriculumSubjectId));
    const passed = new Set(input.passed);
    const configured = new Set(input.limits.map(l => l.semesterId));
    for (const change of shape.value) {
      for (const id of [change.curriculumSubjectId, change.replacementId]) {
        if (id === undefined) continue;
        if (!known.has(id)) return invalid('A subject is not in your programme.');
        if (passed.has(id)) return invalid('A subject is already passed.');
      }
      if (change.semesterId !== undefined && !configured.has(change.semesterId)) return invalid('This semester is not set up yet.');
    }
    const check = validateChanges(input, fromSaved(input, shape.value));
    if (!check.ok) return invalid(check.reason);
    return authJson({ data: await deps.scenarios.replace(me.clerkUserId, toRows(shape.value)) });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23514') return invalid('A change does not match your programme. Reload the page.');
    try { databaseError(error); } catch (safe) {
      const e = safe as P001Error; return authJson({ error: { code: e.code, message: e.message } }, e.status);
    }
  }
}
