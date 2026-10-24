import type { AppRole, AuthDependencies, Me } from '../modules/auth/contracts';
import { AuthError } from '../modules/auth/errors';
import { requireActive, requireStudentEmail } from '../modules/auth/policy';
/** Call before every protected handler, including setup and privileged routes. */
export async function authorize(
  request: Request,
  deps: AuthDependencies,
  options: { roles?: readonly AppRole[]; requireProfile?: boolean; initialize?: boolean } = {},
): Promise<Me> {
  const identity = await deps.verify(request);
  let assignment = await deps.access.find(identity.clerkUserId);
  if (!assignment && options.initialize) {
    requireStudentEmail(identity);
    assignment = await deps.access.initializeStudent(identity.clerkUserId);
  }
  if (!assignment) {
    throw new AuthError(403, 'ACCESS_NOT_ASSIGNED', 'Complete student registration or request an approved staff assignment.');
  }
  if (assignment.clerkUserId !== identity.clerkUserId) {
    throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable.');
  }
  requireActive(assignment);
  if (assignment.appRole === 'STUDENT') requireStudentEmail(identity);
  if (options.roles && !options.roles.includes(assignment.appRole)) {
    throw new AuthError(403, 'ROLE_DENIED', 'Your account does not have access to this resource.');
  }
  const profileState = assignment.appRole === 'STUDENT'
    ? (deps.profiles ? await deps.profiles.stateFor(identity.clerkUserId) : 'UNAVAILABLE')
    : 'NOT_APPLICABLE';
  if (options.requireProfile && assignment.appRole === 'STUDENT' && profileState !== 'COMPLETE') {
    throw new AuthError(profileState === 'UNAVAILABLE' ? 503 : 403,
      profileState === 'UNAVAILABLE' ? 'PROFILE_UNAVAILABLE' : 'PROFILE_SETUP_REQUIRED',
      profileState === 'UNAVAILABLE' ? 'Profile integration is unavailable. Please retry later.' : 'Complete your academic profile first.');
  }
  return {
    ...assignment, profileState,
    landingPath: assignment.appRole === 'COORDINATOR' ? '/coordinator'
      : assignment.appRole === 'SYSTEM_ADMIN' ? '/admin'
      : profileState === 'COMPLETE' ? '/student' : '/student/setup',
  };
}
