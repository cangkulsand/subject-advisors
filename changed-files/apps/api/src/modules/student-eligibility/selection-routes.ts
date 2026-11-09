import { authorize } from '../../middleware/auth';
import type { AuthDependencies } from '../auth/contracts';
import { AuthError, authErrorResponse, authJson } from '../auth/errors';
import { buildStudentEligibility } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import { validateSemesterSelection } from '../../../../../packages/shared/src/forecasting/semester-selection';
import type { SaveSemesterSelection, SemesterSelectionPageData } from '../../../../../packages/shared/src/forecasting/semester-selection-contracts';
import { DEFAULT_STUDENT_CENTRE_ID } from '../forecasting/scope-provider';
import type { StudentEligibilityReader } from './routes';
import type { OwnSemesterPlan } from './selection-repository';

export const STUDENT_SEMESTER_SELECTION_PATH = '/api/student/semester-selection';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_SUBJECTS = 100;
const MAX_INT32 = 2_147_483_647;

export interface SemesterSelectionRepository {
  readOwnPlan(clerkUserId: string, semesterId: number): Promise<OwnSemesterPlan>;
  save(context: {
    clerkUserId: string; centreId: number; programmeId: number; sourceSnapshot: Record<string, unknown>; studentId: number;
    semesterId: number; confirmationId: number; sourceRevision: string; planRevision: number; subjectIds: number[];
  }): Promise<OwnSemesterPlan>;
}
export interface SemesterSelectionDependencies {
  auth: AuthDependencies;
  reader: StudentEligibilityReader;
  selections: SemesterSelectionRepository;
  now?: () => number;
}

function parseSaveBody(raw: string): SaveSemesterSelection {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new AuthError(400, 'INVALID_SELECTION_BODY', 'Provide a valid semester selection.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'INVALID_SELECTION_BODY', 'Provide a valid semester selection.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'planRevision,sourceRevision,subjectIds' || !Array.isArray(body.subjectIds) || body.subjectIds.length > MAX_SUBJECTS ||
      !body.subjectIds.every(id => Number.isSafeInteger(id) && Number(id) > 0 && Number(id) <= MAX_INT32) ||
      typeof body.sourceRevision !== 'string' || body.sourceRevision.length < 1 || body.sourceRevision.length > 80 ||
      !Number.isSafeInteger(body.planRevision) || Number(body.planRevision) < 0 || Number(body.planRevision) > MAX_INT32) {
    throw new AuthError(400, 'INVALID_SELECTION_BODY', 'Provide a valid semester selection.');
  }
  return { subjectIds: body.subjectIds as number[], sourceRevision: body.sourceRevision, planRevision: Number(body.planRevision) };
}

async function readBoundedBody(request: Request): Promise<string> {
  const stream = request.body;
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AuthError(413, 'SELECTION_BODY_TOO_LARGE', 'The semester selection is too large.');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return body + decoder.decode();
  } finally { reader.releaseLock(); }
}

function requireInternal(data: Awaited<ReturnType<StudentEligibilityReader['readOwnEligibility']>>) {
  if (!data.internal || !Number.isSafeInteger(data.internal.studentId) || typeof data.internal.sourceRevision !== 'string' ||
      !data.internal.sourceSnapshot || typeof data.internal.sourceSnapshot !== 'object') {
    throw new AuthError(503, 'SELECTION_UNAVAILABLE', 'Semester selection is temporarily unavailable. Please retry.');
  }
  return data.internal;
}

function planDto(plan: OwnSemesterPlan) {
  return { revision: plan.revision, subjectIds: plan.subjectIds, updatedAt: plan.updatedAt };
}

export async function handleSemesterSelectionRequest(request: Request, deps: SemesterSelectionDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== STUDENT_SEMESTER_SELECTION_PATH) return null;
  try {
    if (request.method !== 'GET' && request.method !== 'PUT') {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or PUT for this endpoint.' } }, 405);
      response.headers.set('Allow', 'GET, PUT'); return response;
    }
    if ([...url.searchParams.keys()].length) throw new AuthError(400, 'QUERY_NOT_ALLOWED', 'This endpoint does not accept scope overrides.');
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    let body: SaveSemesterSelection | null = null;
    if (request.method === 'PUT') {
      const declaredBytes = Number(request.headers.get('content-length') ?? 0);
      if (declaredBytes > MAX_BODY_BYTES) throw new AuthError(413, 'SELECTION_BODY_TOO_LARGE', 'The semester selection is too large.');
      const raw = await readBoundedBody(request);
      body = parseSaveBody(raw);
    }

    const data = await deps.reader.readOwnEligibility(me.clerkUserId);
    const internal = requireInternal(data);
    const semesterId = data.input?.scope.targetSemesterId ?? data.emptyScope?.targetSemesterId;
    if (!semesterId) throw new AuthError(503, 'SELECTION_UNAVAILABLE', 'Semester selection is temporarily unavailable. Please retry.');
    const plan = await deps.selections.readOwnPlan(me.clerkUserId, semesterId);
    const deadline = data.input?.pickDeadline ?? null;
    const editingOpen = deadline !== null && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > (deps.now?.() ?? Date.now());
    if (body) {
      if (!data.input) throw new AuthError(409, 'CONFIRMATION_UNAVAILABLE', 'A confirmed offering is required before saving a selection.');
      if (!editingOpen) throw new AuthError(409, 'PICK_DEADLINE_CLOSED', 'The selection deadline has passed.');
      if (body.sourceRevision !== internal.sourceRevision || body.planRevision !== plan.revision) throw new AuthError(409, 'SELECTION_STALE', 'The eligibility or saved selection changed. Reload before saving.');
      const validation = validateSemesterSelection(data.input, body.subjectIds);
      if (!validation.valid) return Response.json({ error: { code: 'SELECTION_INVALID', message: 'Review the selection issues before saving.', issues: validation.issues } },
        { status: 422, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
      const saved = await deps.selections.save({ clerkUserId: me.clerkUserId, centreId: DEFAULT_STUDENT_CENTRE_ID, programmeId: data.input.scope.programmeId,
        sourceSnapshot: internal.sourceSnapshot, studentId: internal.studentId, semesterId, confirmationId: data.input.confirmationId,
        sourceRevision: internal.sourceRevision, planRevision: plan.revision, subjectIds: body.subjectIds });
      const page: SemesterSelectionPageData = { eligibility: buildStudentEligibility(data.input, data.emptyScope ?? undefined), centreBasis: data.centreBasis,
        ...(data.scopeLabels ? { scopeLabels: data.scopeLabels } : {}), sourceRevision: internal.sourceRevision, deadline,
        editingOpen: deadline !== null && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > (deps.now?.() ?? Date.now()),
        plan: planDto(saved), validation: validateSemesterSelection(data.input, saved.subjectIds) };
      return authJson({ data: page });
    }
    const page: SemesterSelectionPageData = { eligibility: buildStudentEligibility(data.input, data.emptyScope ?? undefined), centreBasis: data.centreBasis,
      ...(data.scopeLabels ? { scopeLabels: data.scopeLabels } : {}), sourceRevision: internal.sourceRevision, deadline, editingOpen,
      plan: planDto(plan), validation: data.input ? validateSemesterSelection(data.input, plan.subjectIds) : null };
    return authJson({ data: page });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const dbError = error as { code?: unknown; constraint?: unknown; message?: unknown };
    const message = typeof dbError?.message === 'string' ? dbError.message : '';
    if (message.includes('P002_SELECTION_DEADLINE_CLOSED')) return authErrorResponse(new AuthError(409, 'PICK_DEADLINE_CLOSED', 'The selection deadline has passed.'));
    if (message.includes('P002_SELECTION_STALE') || dbError?.code === '40001' || dbError?.code === '40P01' ||
        (dbError?.code === '23505' && dbError.constraint === 'p002_semester_selection_pkey')) {
      return authErrorResponse(new AuthError(409, 'SELECTION_STALE', 'The eligibility or saved selection changed. Reload before saving.'));
    }
    return authErrorResponse(new AuthError(503, 'SELECTION_UNAVAILABLE', 'Semester selection is temporarily unavailable. Please retry.'));
  }
}
