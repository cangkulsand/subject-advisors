import { authorize } from '../../middleware/auth';
import { AuthError, authErrorResponse, authJson } from '../auth/errors';
import type { OfferingDependencies, OfferingScope } from './contracts';
import { readSave, requireId } from './validation';
import { pickLimitMessage } from '../../../../../packages/shared/src/offerings/offerings';
import { evaluateOfferingEligibility } from '../../../../../packages/shared/src/offerings/eligibility';
import { OFFERING_NOT_APPROVED_MESSAGE, PICKS_CLOSED_MESSAGE, PICKS_NOT_OPEN_MESSAGE, SEMESTER_NOT_TARGET_MESSAGE } from './messages';

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
    const context = await deps.contextFor(account.clerkUserId, { includePrerequisites: true });
    if (!context) throw new AuthError(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile before entering offerings.');
    const { window } = context;
    const target = window.targetSemesterId;
    const publicContext = {
      curriculum: context.curriculum, ...(context.currentSemesterId ? { currentSemesterId: context.currentSemesterId } : {}),
      subjects: context.subjects, semesters: context.semesters, window,
      ...(context.limits ? { limits: context.limits } : {}),
      ...(context.prerequisiteCatalogue ? { prerequisiteCatalogue: context.prerequisiteCatalogue } : {}),
      withdrawnSubjects: context.withdrawnSubjects,
    };
    const scope: OfferingScope | null = context.learningCentreId === null ? null : {
      clerkUserId: account.clerkUserId, studentId: context.studentId, curriculumId: context.curriculum.curriculumId,
      programmeId: context.programmeId, learningCentreId: context.learningCentreId,
    };
    if ([...url.searchParams.keys()].some(key => key !== 'semesterId') || url.searchParams.getAll('semesterId').length > 1 ||
        (request.method === 'PUT' && url.search)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Use only one semesterId query parameter for GET; PUT uses a JSON body.');
    }
    const input = request.method === 'PUT' ? await readSave(request) : null;
    const requested = input?.semesterId ?? (url.searchParams.has('semesterId') ? requireId(url.searchParams.get('semesterId')) : target);
    if (requested !== null && !context.semesters.some(semester => semester.semesterId === requested)) {
      throw new AuthError(404, 'SEMESTER_NOT_FOUND', 'This semester is not configured. Choose another semester.');
    }
    if (requested !== null && requested !== target) throw new AuthError(409, 'SEMESTER_NOT_TARGET', SEMESTER_NOT_TARGET_MESSAGE);
    if (input) {
      // The repository repeats the window, approved-set and limit checks inside its transaction.
      if (window.status === 'CLOSED') throw new AuthError(409, 'PICKS_CLOSED', PICKS_CLOSED_MESSAGE);
      if (window.status !== 'OPEN' || !scope) throw new AuthError(409, 'PICKS_NOT_OPEN', PICKS_NOT_OPEN_MESSAGE);
      const offered = new Map(context.subjects.map(subject => [subject.curriculumSubjectId, subject]));
      if (input.curriculumSubjectIds.some(id => !offered.has(id))) throw new AuthError(409, 'OFFERING_NOT_APPROVED', OFFERING_NOT_APPROVED_MESSAGE);
      const credits = input.curriculumSubjectIds.reduce((total, id) => total + (offered.get(id)?.creditHours ?? 0), 0);
      if (context.limits && (input.curriculumSubjectIds.length > context.limits.maxSubjects || credits > context.limits.maxCredits)) {
        throw new AuthError(409, 'PICK_LIMIT_EXCEEDED', pickLimitMessage(context.limits));
      }
      const catalogue = context.prerequisiteCatalogue ?? context.subjects;
      const history = context.history ?? { status: 'unavailable' as const };
      for (const id of input.curriculumSubjectIds) {
        const subject = offered.get(id)!;
        const blocking = evaluateOfferingEligibility({ subject, catalogue, history, pickedCurriculumSubjectIds: input.curriculumSubjectIds })
          .reasons.find(reason => reason.blocking);
        if (blocking) throw new AuthError(409, 'OFFERING_NOT_ELIGIBLE', `${subject.code} cannot be picked: ${blocking.message}.`);
      }
      return authJson({ data: await deps.repository.replace(scope, input) });
    }
    let selection = null;
    if (scope && target) {
      const read = await deps.repository.read(scope, target);
      // Picks that are no longer offered are not listed; the page only decodes picks it can show.
      selection = { ...read, curriculumSubjectIds: read.curriculumSubjectIds.filter(id => context.subjects.some(subject => subject.curriculumSubjectId === id)) };
    }
    return authJson({ data: { ...publicContext, selection } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    // Do not serialize database, provider or context-reader errors.
    return authJson({ error: { code: 'OFFERINGS_UNAVAILABLE', message: 'Offerings could not be loaded or saved. Please retry; no success has been confirmed.' } }, 503);
  }
}
