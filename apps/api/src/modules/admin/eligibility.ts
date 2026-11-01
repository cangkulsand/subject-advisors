import type { AdminRole } from '../../../../../packages/shared/src/admin/admin';
import { eligibleRoles } from '../auth/policy';
import type { VerifiedIdentity } from '../auth/contracts';

export interface EligibilityResult { eligible: boolean; ineligible: AdminRole[] }

/**
 * Can this primary email hold these roles? STUDENT and COORDINATOR reuse the runtime policy in
 * auth/policy.ts (no duplicated regexes). SYSTEM_ADMIN is additionally restricted to exact @utm.my
 * because admin user management requires it; the runtime policy itself does not domain-gate it.
 * The protected owner exception is never available through this helper.
 */
export function checkRoleEligibility(email: { address: string; verified: boolean } | null, roles: readonly AdminRole[]): EligibilityResult {
  if (!email?.verified || roles.length === 0) return { eligible: false, ineligible: [...roles] };
  const identity: VerifiedIdentity = { clerkUserId: 'eligibility-check', sessionId: 'eligibility-check', primaryEmail: email };
  const allowed = new Set(eligibleRoles(identity, { clerkUserId: identity.clerkUserId, appRole: 'STUDENT', accessStatus: 'ACTIVE', roles: [...roles] }));
  const staffDomain = checkStaffDomain(identity);
  const ineligible = roles.filter(role => !allowed.has(role) || role === 'SYSTEM_ADMIN' && !staffDomain);
  return { eligible: ineligible.length === 0, ineligible };
}

/** A verified @utm.my address is what policy.ts accepts for COORDINATOR; reuse it as the staff-domain probe. */
function checkStaffDomain(identity: VerifiedIdentity): boolean {
  return eligibleRoles(identity, { clerkUserId: identity.clerkUserId, appRole: 'COORDINATOR', accessStatus: 'ACTIVE', roles: ['COORDINATOR'] }).length === 1;
}
