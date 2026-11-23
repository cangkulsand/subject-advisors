import type { ViewAsContext } from './view-as';
export type AppRole = 'STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN';
export type AccessStatus = 'ACTIVE' | 'SUSPENDED';
export type ProfileState = 'COMPLETE' | 'SETUP_REQUIRED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
export interface AccessAssignment {
  clerkUserId: string;
  appRole: AppRole;
  accessStatus: AccessStatus;
  /** Authoritative explicit grants; appRole is only the legacy/default view. */
  roles: AppRole[];
  coordinatorStudentException?: boolean;
  protectedOwner?: boolean;
}
export interface Me extends AccessAssignment {
  availableRoles: AppRole[];
  studentProfileState: ProfileState;
  profileState: ProfileState;
  landingPath: '/student/setup' | '/student' | '/coordinator' | '/admin';
  /** Present only while a System Admin views as a coordinator or student (S3-P004-033). */
  viewAs?: ViewAsContext;
}
export type ApiResult<T> = { data: T } | { error: { code: string; message: string } };
/** Constructed only from Clerk's verified session and current Backend API user. */
export interface VerifiedIdentity {
  clerkUserId: string;
  sessionId: string;
  primaryEmail: { address: string; verified: boolean } | null;
}
export interface AccessRepository {
  find(clerkUserId: string): Promise<AccessAssignment | null>;
  /** Insert STUDENT/ACTIVE if absent; never modify an existing assignment. */
  initializeStudent(clerkUserId: string): Promise<AccessAssignment>;
  /** View as Student (S3-P004-033): the Clerk user and name behind a student profile; null when there is none. */
  studentClerkUserId?(studentId: number): Promise<{ clerkUserId: string; studentName: string } | null>;
}
/** P001 implements this using the verified user ID and a valid profile/curriculum. */
export interface ProfileReader {
  stateFor(clerkUserId: string): Promise<'COMPLETE' | 'SETUP_REQUIRED' | 'UNAVAILABLE'>;
}
/**
 * Optional first-sign-in hook: turns a matching pending administrator invitation into an application account.
 * Returns the new assignment, or null when nothing was redeemed (no invitation, ineligible, expired, account exists).
 * Infrastructure failures throw so a transient fault never silently falls back to student self-registration.
 */
export interface InvitationRedeemer {
  redeem(identity: VerifiedIdentity): Promise<AccessAssignment | null>;
}
export interface AuthDependencies {
  verify(request: Request): Promise<VerifiedIdentity>;
  access: AccessRepository;
  profiles?: ProfileReader;
  invitations?: InvitationRedeemer;
}
