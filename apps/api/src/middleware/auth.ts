import type { AppRole, AuthDependencies, Me } from '../modules/auth/contracts';
import { AuthError } from '../modules/auth/errors';
import { eligibleRoles, requireActive, requireStudentEmail, staffSignupRole } from '../modules/auth/policy';
import { isReadMethod, parseViewAs, VIEW_AS_HEADER, type ViewAs } from '../modules/auth/view-as';
/** Call before every protected handler, including setup and privileged routes. */
export async function authorize(
  request: Request,
  deps: AuthDependencies,
  options: { roles?: readonly AppRole[]; requireProfile?: boolean; initialize?: boolean } = {},
): Promise<Me> {
  const identity = await deps.verify(request);
  const viewAs = parseViewAs(request.headers.get(VIEW_AS_HEADER));
  if (viewAs && options.initialize) throw new AuthError(403, 'VIEW_AS_READ_ONLY', 'Exit the view before setting up an account.');
  let assignment = await deps.access.find(identity.clerkUserId);
  if (!assignment && options.initialize) {
    // An administrator invitation for the verified email takes precedence; otherwise behaviour is unchanged.
    if (deps.invitations) assignment = await deps.invitations.redeem(identity);
    if (!assignment) {
      // Staff may sign up on their own; nothing is created until a System Administrator grants a role (S3-P004-036).
      if (staffSignupRole(identity.primaryEmail)) {
        throw new AuthError(403, 'ROLE_PENDING', 'Your account is waiting for a System Administrator to give it a role.');
      }
      requireStudentEmail(identity);
      assignment = await deps.access.initializeStudent(identity.clerkUserId);
    }
  }
  if (!assignment) {
    throw new AuthError(403, 'ACCESS_NOT_ASSIGNED', 'Complete student registration or request an approved staff assignment.');
  }
  if (assignment.clerkUserId !== identity.clerkUserId) {
    throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable.');
  }
  requireActive(assignment);
  if (!Array.isArray(assignment.roles) || !assignment.roles.length) {
    throw new AuthError(403, 'ACCESS_NOT_ASSIGNED', 'No application roles are assigned to this account.');
  }
  const availableRoles = eligibleRoles(identity, assignment);
  if (viewAs) return await viewAsMe(request, deps, options, { ...assignment, availableRoles }, viewAs);
  const matched = availableRoles.filter(role => !options.roles || options.roles.includes(role));
  if (!matched.length) {
    if (!options.roles || assignment.roles.some(role => options.roles!.includes(role))) {
      throw new AuthError(403, 'EMAIL_DOMAIN_DENIED', 'Your verified primary email is not eligible for this application role.');
    }
    throw new AuthError(403, 'ROLE_DENIED', 'Your account does not have access to this resource.');
  }
  const appRole = matched.includes(assignment.appRole) ? assignment.appRole : matched[0]!;
  const studentProfileState = availableRoles.includes('STUDENT')
    ? (deps.profiles ? await deps.profiles.stateFor(identity.clerkUserId) : 'UNAVAILABLE')
    : 'NOT_APPLICABLE';
  const profileState = appRole === 'STUDENT' ? studentProfileState : 'NOT_APPLICABLE';
  if (options.requireProfile && appRole === 'STUDENT' && profileState !== 'COMPLETE') {
    throw new AuthError(profileState === 'UNAVAILABLE' ? 503 : 403,
      profileState === 'UNAVAILABLE' ? 'PROFILE_UNAVAILABLE' : 'PROFILE_SETUP_REQUIRED',
      profileState === 'UNAVAILABLE' ? 'Profile integration is unavailable. Please retry later.' : 'Complete your academic profile first.');
  }
  return {
    ...assignment, appRole, availableRoles, studentProfileState, profileState,
    landingPath: appRole === 'COORDINATOR' ? '/coordinator'
      : appRole === 'SYSTEM_ADMIN' ? '/admin'
      : profileState === 'COMPLETE' ? '/student' : '/student/setup',
  };
}

/**
 * View as (S3-P004-033). Only an ACTIVE account whose verified email makes SYSTEM_ADMIN usable may send the context.
 * Coordinator: the admin's own identity, pinned to the chosen scope by the coordinator routes. Student: the chosen
 * student's identity, read-only. `roles` lists SYSTEM_ADMIN plus the viewed role so the web account shape stays valid.
 */
async function viewAsMe(request: Request, deps: AuthDependencies, options: { roles?: readonly AppRole[] },
  admin: { clerkUserId: string; accessStatus: Me['accessStatus']; availableRoles: AppRole[] }, viewAs: ViewAs): Promise<Me> {
  if (!admin.availableRoles.includes('SYSTEM_ADMIN')) throw new AuthError(403, 'VIEW_AS_DENIED', 'Only a System Administrator can view as another role.');
  if (options.roles && !options.roles.includes(viewAs.role)) throw new AuthError(403, 'ROLE_DENIED', 'Your account does not have access to this resource.');
  const log = { event: 'view_as', admin: admin.clerkUserId, ...viewAs, method: request.method, path: new URL(request.url).pathname };
  if (viewAs.role === 'COORDINATOR') {
    console.info(JSON.stringify(log));
    return { clerkUserId: admin.clerkUserId, appRole: 'COORDINATOR', accessStatus: 'ACTIVE', roles: ['SYSTEM_ADMIN', 'COORDINATOR'], availableRoles: ['SYSTEM_ADMIN', 'COORDINATOR'],
      studentProfileState: 'NOT_APPLICABLE', profileState: 'NOT_APPLICABLE', landingPath: '/coordinator', viewAs: { ...viewAs, adminClerkUserId: admin.clerkUserId } };
  }
  if (!isReadMethod(request.method)) throw new AuthError(403, 'VIEW_AS_READ_ONLY', 'Read only while viewing as a student.');
  const student = deps.access.studentClerkUserId ? await deps.access.studentClerkUserId(viewAs.studentId) : null;
  if (!student) throw new AuthError(404, 'VIEW_AS_STUDENT_NOT_FOUND', 'This student was not found.');
  const state = deps.profiles ? await deps.profiles.stateFor(student.clerkUserId) : 'UNAVAILABLE';
  if (state === 'UNAVAILABLE') throw new AuthError(503, 'PROFILE_UNAVAILABLE', 'Profile integration is unavailable. Please retry later.');
  if (state !== 'COMPLETE') throw new AuthError(403, 'VIEW_AS_PROFILE_INCOMPLETE', 'This student has not set up their profile yet.');
  console.info(JSON.stringify(log));
  return { clerkUserId: student.clerkUserId, appRole: 'STUDENT', accessStatus: 'ACTIVE', roles: ['SYSTEM_ADMIN', 'STUDENT'], availableRoles: ['SYSTEM_ADMIN', 'STUDENT'],
    studentProfileState: 'COMPLETE', profileState: 'COMPLETE', landingPath: '/student',
    viewAs: { ...viewAs, adminClerkUserId: admin.clerkUserId, studentName: student.studentName } };
}
