import type { AccessAssignment, VerifiedIdentity } from './contracts';
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
