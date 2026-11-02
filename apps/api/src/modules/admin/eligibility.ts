import type { AdminRole } from '../../../../../packages/shared/src/admin/admin';
import { eligibleRoles } from '../auth/policy';
import type { VerifiedIdentity } from '../auth/contracts';

export interface EligibilityResult { eligible: boolean; ineligible: AdminRole[] }

/**
 * Can this primary email hold these roles? Reuses the runtime policy in auth/policy.ts, which owns every domain
 * rule (STUDENT @graduate.utm.my, COORDINATOR @utm.my, SYSTEM_ADMIN SYSTEM_ADMIN_EMAIL_DOMAINS), so the admin
 * surface and runtime access cannot drift. The protected owner exception is never available through this helper.
 */
export function checkRoleEligibility(email: { address: string; verified: boolean } | null, roles: readonly AdminRole[]): EligibilityResult {
  if (!email?.verified || roles.length === 0) return { eligible: false, ineligible: [...roles] };
  const identity: VerifiedIdentity = { clerkUserId: 'eligibility-check', sessionId: 'eligibility-check', primaryEmail: email };
  const allowed = new Set(eligibleRoles(identity, { clerkUserId: identity.clerkUserId, appRole: 'STUDENT', accessStatus: 'ACTIVE', roles: [...roles] }));
  const ineligible = roles.filter(role => !allowed.has(role));
  return { eligible: ineligible.length === 0, ineligible };
}
