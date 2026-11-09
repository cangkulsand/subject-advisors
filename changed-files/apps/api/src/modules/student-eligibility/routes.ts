import { authorize } from '../../middleware/auth';
import type { AuthDependencies } from '../auth/contracts';
import { AuthError, authErrorResponse, authJson } from '../auth/errors';
import { buildStudentEligibility, type StudentEligibilityInput } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import type { ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';

export const STUDENT_ELIGIBILITY_PATH = '/api/student/eligible-offerings';
export interface OwnEligibilityEnvelope { studentId: number; sourceSnapshot: Record<string, unknown>; sourceRevision: string }
export interface StudentEligibilityReader {
  /** Must resolve only rows linked to clerkUserId and perform dependent reads in one consistent read-only database snapshot. */
  readOwnEligibility(clerkUserId: string): Promise<{ input: StudentEligibilityInput | null; emptyScope?: ForecastScope | null; centreBasis: string; scopeLabels?: { programmeName: string; learningCentreName: string; targetSemesterLabel: string }; internal?: OwnEligibilityEnvelope }>;
}
export interface StudentEligibilityDependencies { auth: AuthDependencies; reader: StudentEligibilityReader }

/** GET-only own-profile API. Query-string scope overrides are intentionally unsupported. */
export async function handleStudentEligibilityRequest(request: Request, deps: StudentEligibilityDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== STUDENT_ELIGIBILITY_PATH) return null;
  try {
    if (request.method !== 'GET') {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.' } }, 405);
      response.headers.set('Allow', 'GET'); return response;
    }
    if ([...url.searchParams.keys()].length) throw new AuthError(400, 'QUERY_NOT_ALLOWED', 'This endpoint does not accept scope overrides.');
    const me = await authorize(request, deps.auth, { roles: ['STUDENT'], requireProfile: true });
    const data = await deps.reader.readOwnEligibility(me.clerkUserId);
    return authJson({ data: { ...buildStudentEligibility(data.input, data.emptyScope ?? undefined), centreBasis: data.centreBasis, ...(data.scopeLabels ? { scopeLabels: data.scopeLabels } : {}) } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return authJson({ error: { code: 'ELIGIBILITY_UNAVAILABLE', message: 'Eligibility is temporarily unavailable. Please retry.' } }, 503);
  }
}
