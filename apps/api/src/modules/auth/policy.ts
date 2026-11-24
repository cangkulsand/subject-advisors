import type { AccessAssignment, AppRole, VerifiedIdentity } from './contracts';
import { AuthError } from './errors';
import { isSystemAdminEmailDomain } from '../../../../../packages/shared/src/admin/admin';
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

/** One email domain per role, no exceptions (S3-P004-033). Domain eligibility never creates a role membership. */
export function eligibleRoles(identity: VerifiedIdentity, assignment: AccessAssignment): AppRole[] {
  if (!identity.primaryEmail?.verified) {
    throw new AuthError(403, 'EMAIL_UNVERIFIED', 'Verify your primary email with Clerk before continuing.');
  }
  const student = /^[^@\s]+@graduate\.utm\.my$/i.test(identity.primaryEmail.address);
  const coordinator = /^[^@\s]+@utm\.my$/i.test(identity.primaryEmail.address);
  return assignment.roles.filter(role => role === 'SYSTEM_ADMIN' && isSystemAdminEmailDomain(identity.primaryEmail!.address) ||
    role === 'STUDENT' && student || role === 'COORDINATOR' && coordinator);
}

/**
 * Staff self sign-up (S3-P004-036): the one role a verified staff-domain email could be given, or null.
 * Never grants anything; first sign-in uses it only to say the account is waiting for an administrator.
 */
export function staffSignupRole(email: VerifiedIdentity['primaryEmail']): Exclude<AppRole, 'STUDENT'> | null {
  if (!email?.verified) return null;
  if (/^[^@\s]+@utm\.my$/i.test(email.address)) return 'COORDINATOR';
  return isSystemAdminEmailDomain(email.address) ? 'SYSTEM_ADMIN' : null;
}
