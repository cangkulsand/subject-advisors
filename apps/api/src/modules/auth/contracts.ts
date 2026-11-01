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
}
/** P001 implements this using the verified user ID and a valid profile/curriculum. */
export interface ProfileReader {
  stateFor(clerkUserId: string): Promise<'COMPLETE' | 'SETUP_REQUIRED' | 'UNAVAILABLE'>;
}
export interface AuthDependencies {
  verify(request: Request): Promise<VerifiedIdentity>;
  access: AccessRepository;
  profiles?: ProfileReader;
}
