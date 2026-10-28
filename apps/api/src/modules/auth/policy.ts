import type { AccessAssignment, AppRole, VerifiedIdentity } from './contracts';
import { AuthError } from './errors';
export function requireStudentEmail(identity: VerifiedIdentity): void {
  const email = identity.primaryEmail;
  if (!email?.verified) {
    throw new AuthError(403, 'EMAIL_UNVERIFIED', 'Verify your primary institutional email with Clerk before continuing.');
  }
  if (!/^[^@\s]+@graduate\.utm\.my$/i.test(email.address)) {
    throw new AuthError(403, 'EMAIL_DOMAIN_DENIED', 'Student access requires a verified @graduate.utm.my primary email.');
  }
}
export function requireActive(assignment: AccessAssignment): void {
  if (assignment.accessStatus !== 'ACTIVE') {
    throw new AuthError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Contact the application administrator.');
  }
}

/** Domain eligibility never creates a role membership. */
export function eligibleRoles(identity: VerifiedIdentity, assignment: AccessAssignment): AppRole[] {
  if (!identity.primaryEmail?.verified) {
    throw new AuthError(403, 'EMAIL_UNVERIFIED', 'Verify your primary email with Clerk before continuing.');
  }
  const student = /^[^@\s]+@graduate\.utm\.my$/i.test(identity.primaryEmail.address);
  const coordinator = /^[^@\s]+@utm\.my$/i.test(identity.primaryEmail.address);
  return assignment.roles.filter(role => role === 'SYSTEM_ADMIN' ||
    role === 'STUDENT' && student || role === 'COORDINATOR' &&
    (coordinator || student && assignment.coordinatorStudentException === true && assignment.protectedOwner === true));
}
