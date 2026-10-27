import { authorize } from '../../middleware/auth';
import { AuthError, authErrorResponse, authJson } from '../auth/errors';
import type { OfferingDependencies, OfferingScope } from './contracts';
import { readSave, requireId } from './validation';

/** FOUNDATION registers this handler; unmatched routes return null. */
export async function handleOfferingRequest(request: Request, deps: OfferingDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/semester-offerings') return null;
  try {
    if (request.method !== 'GET' && request.method !== 'PUT') {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or PUT for semester offerings.' } }, 405);
      response.headers.set('Allow', 'GET, PUT');
      return response;
    }
    const account = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    const context = await deps.contextFor(account.clerkUserId);
    if (!context) throw new AuthError(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile before entering offerings.');
    const publicContext = { curriculum: context.curriculum, subjects: context.subjects, semesters: context.semesters };
    const scope: OfferingScope = { clerkUserId: account.clerkUserId, studentId: context.studentId, curriculumId: context.curriculum.curriculumId };
    if ([...url.searchParams.keys()].some(key => key !== 'semesterId') || url.searchParams.getAll('semesterId').length > 1 ||
        (request.method === 'PUT' && url.search)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Use only one semesterId query parameter for GET; PUT uses a JSON body.');
    }
    if (request.method === 'GET' && !url.searchParams.has('semesterId')) {
      return authJson({ data: { ...publicContext, selection: null } });
    }
    const input = request.method === 'PUT' ? await readSave(request) : null;
    const semesterId = input?.semesterId ?? requireId(url.searchParams.get('semesterId'));
    if (!context.semesters.some(semester => semester.semesterId === semesterId)) {
      throw new AuthError(404, 'SEMESTER_NOT_FOUND', 'This semester is not configured. Choose another semester.');
    }
    if (input) {
      const allowed = new Set(context.subjects.map(subject => subject.curriculumSubjectId));
      if (input.curriculumSubjectIds.some(id => !allowed.has(id))) {
        throw new AuthError(400, 'SUBJECT_OUTSIDE_CURRICULUM', 'Select subjects from your saved curriculum only.');
      }
      return authJson({ data: await deps.repository.replace(scope, input) });
    }
    return authJson({ data: { ...publicContext, selection: await deps.repository.read(scope, semesterId) } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    // Do not serialize database, provider or context-reader errors.
    return authJson({ error: { code: 'OFFERINGS_UNAVAILABLE', message: 'Offerings could not be loaded or saved. Please retry; no success has been confirmed.' } }, 503);
  }
}
