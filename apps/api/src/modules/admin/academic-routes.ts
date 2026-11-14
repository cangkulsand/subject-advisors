import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import type { AdminValidation } from '../../../../../packages/shared/src/admin/admin';
import { authorize, AuthError, authErrorResponse, authJson } from '../auth';
import type { AcademicSetupDependencies, AssignmentFilters } from './academic-contracts';
import { AcademicSetupDomainError } from './academic-errors';

const PREFIX = '/api/admin/academic-setup';
const BODY_LIMIT = 16 * 1024;
function invalid(message: string): never { throw new AuthError(400, 'INVALID_REQUEST', message); }
function id(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw) || !C.isAcademicSetupId(Number(raw))) invalid('Invalid record ID.');
  return Number(raw);
}
function query(url: URL, allowed: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) invalid('Unsupported or duplicate query parameter.');
  }
}
function includeInactive(url: URL): boolean {
  query(url, ['includeInactive']);
  const value = url.searchParams.get('includeInactive');
  if (value !== null && value !== 'true' && value !== 'false') invalid('includeInactive must be true or false.');
  return value === 'true';
}
function filters(url: URL): AssignmentFilters {
  const keys = ['accountId', 'programmeId', 'learningCentreId'] as const;
  query(url, keys);
  const result: AssignmentFilters = {};
  for (const key of keys) { const value = url.searchParams.get(key); if (value !== null) result[key] = id(value); }
  return result;
}
async function readJson(request: Request): Promise<unknown> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw new AuthError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json.');
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > BODY_LIMIT) invalid('The request body is too large.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_LIMIT) invalid('The request body is too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return invalid('The request body is not valid JSON.'); }
}
async function input<T>(request: Request, url: URL, validate: (body: unknown) => AdminValidation<T>): Promise<T> {
  query(url, []);
  const result = validate(await readJson(request));
  if (!result.ok) invalid(result.error);
  return result.value;
}
/** SYSTEM_ADMIN management endpoints; consuming forecast adapters use the separate scope reader. */
export async function handleAcademicSetupRequest(request: Request, deps: AcademicSetupDependencies): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname;
  if (path !== PREFIX && !path.startsWith(PREFIX + '/')) return null;
  try {
    const actor = (await authorize(request, deps.auth, { roles: ['SYSTEM_ADMIN'] })).clerkUserId;
    const repo = deps.repository;
    const routes: Record<string, Record<string, () => Promise<unknown>>> = {
      '/learning-centres': {
        GET: () => repo.listLearningCentres(includeInactive(url)),
        POST: async () => repo.createLearningCentre(await input(request, url, C.validateCreateLearningCentreRequest), actor),
      },
      '/faculties': {
        GET: () => repo.listFaculties(includeInactive(url)),
        POST: async () => repo.createFaculty(await input(request, url, C.validateCreateFacultyRequest), actor),
      },
      '/departments': {
        GET: () => repo.listDepartments(includeInactive(url)),
        POST: async () => repo.createDepartment(await input(request, url, C.validateCreateDepartmentRequest), actor),
      },
      '/programmes': { GET: () => { query(url, []); return repo.listProgrammeFaculties(); } },
      '/semesters': {
        GET: () => { query(url, []); return repo.listAcademicSemesters(); },
        POST: async () => repo.createAcademicSemester(await input(request, url, C.validateCreateSemesterRequest), actor),
      },
      '/current-semester': {
        GET: () => { query(url, []); return repo.getCurrentAcademicSemester(); },
        PUT: async () => repo.setCurrentAcademicSemester(await input(request, url, C.validateSetCurrentSemesterRequest), actor),
      },
      '/coordinator-assignments': {
        GET: () => repo.listCoordinatorAssignments(filters(url)),
        POST: async () => repo.createCoordinatorAssignment(await input(request, url, C.validateCreateCoordinatorAssignmentRequest), actor),
      },
    };
    const suffix = path.slice(PREFIX.length);
    let route = Object.prototype.hasOwnProperty.call(routes, suffix) ? routes[suffix] : undefined;
    const match = /^\/(learning-centres|faculties|departments|semesters|programmes|coordinator-assignments)\/([^/]+)(\/department|\/end)?$/.exec(suffix);
    if (!route && match) {
      const rawId = match[2]!;
      if (match[1] === 'learning-centres' && !match[3]) route = { PATCH: async () => repo.updateLearningCentre(id(rawId), await input(request, url, C.validateUpdateLearningCentreRequest), actor) };
      if (match[1] === 'faculties' && !match[3]) route = { PATCH: async () => repo.updateFaculty(id(rawId), await input(request, url, C.validateUpdateFacultyRequest), actor) };
      if (match[1] === 'departments' && !match[3]) route = { PATCH: async () => repo.updateDepartment(id(rawId), await input(request, url, C.validateUpdateDepartmentRequest), actor) };
      if (match[1] === 'semesters' && !match[3]) route = { PATCH: async () => repo.updateAcademicSemester(id(rawId), await input(request, url, C.validateUpdateSemesterRequest), actor) };
      if (match[1] === 'programmes' && match[3] === '/department') route = { PATCH: async () => repo.setProgrammeDepartment(id(rawId), await input(request, url, C.validateSetProgrammeDepartmentRequest), actor) };
      if (match[1] === 'coordinator-assignments' && match[3] === '/end') route = { POST: async () => repo.endCoordinatorAssignment(id(rawId), await input(request, url, C.validateEndCoordinatorAssignmentRequest), actor) };
    }
    if (!route) throw new AcademicSetupDomainError('NOT_FOUND');
    const execute = Object.prototype.hasOwnProperty.call(route, request.method) ? route[request.method] : undefined;
    if (!execute) {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported for this resource.' } }, 405);
      response.headers.set('Allow', Object.keys(route).join(', '));
      return response;
    }
    const created = request.method === 'POST' && !suffix.endsWith('/end');
    return authJson({ data: await execute() }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const safe = error instanceof AcademicSetupDomainError ? error : new AcademicSetupDomainError('DEPENDENCY_UNAVAILABLE');
    return authJson({ error: { code: safe.code, message: safe.message } }, safe.status);
  }
}
