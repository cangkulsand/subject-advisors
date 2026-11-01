import type { AccessRepository, InvitationRedeemer } from '../auth/contracts';
import type { AdminRepository } from './contracts';
import { AdminMutationError } from './errors';
import { checkRoleEligibility } from './eligibility';

/** Only the repository operations redemption needs; keeps the auth hook decoupled from the admin surface. */
export type RedemptionRepository = Pick<AdminRepository, 'findPendingInvitationByEmail' | 'createAccount'>;

/**
 * Redeems a PENDING invitation at first sign-in. Roles come from the invitation row but are re-checked against
 * the VERIFIED primary email of the signed-in user (never trusted from the invitation alone). The user is their own
 * actor because they are the one accepting. Any failure that means "not redeemable" returns null so the caller
 * falls back to the existing student self-registration; infrastructure errors propagate.
 */
export function createInvitationRedeemerFor(repository: RedemptionRepository, access: Pick<AccessRepository, 'find'>): InvitationRedeemer {
  return {
    async redeem(identity) {
      const email = identity.primaryEmail;
      if (!email?.verified) return null;
      const invitation = await repository.findPendingInvitationByEmail(email.address.trim().toLowerCase());
      if (!invitation || invitation.email !== email.address.trim().toLowerCase()) return null;
      if (!checkRoleEligibility(email, invitation.roles).eligible) return null;
      try {
        await repository.createAccount(identity.clerkUserId, invitation.roles, identity.clerkUserId, `Invitation ${invitation.id} accepted`, { invitationId: invitation.id });
      } catch (error) {
        // Account already exists, invitation just lapsed/was revoked, or roles no longer fit: not redeemable.
        if (error instanceof AdminMutationError && error.status < 500) return null;
        throw error;
      }
      return await access.find(identity.clerkUserId);
    },
  };
}
