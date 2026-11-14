import type { AdminMutationErrorCode } from '../../../../../packages/shared/src/admin/admin';

/** MT1 shared codes plus codes that only the data-access layer can raise. */
export type AdminErrorCode = AdminMutationErrorCode | 'INVALID_REQUEST' | 'NOT_FOUND' | 'ROLE_NOT_ASSIGNED' |
  'INVITATION_NOT_PENDING' | 'INVITATION_EXPIRED' | 'CONFLICT' | 'MUTATION_FAILED' |
  'STUDENT_PROFILE_NOT_FOUND' | 'CURRICULUM_UNAVAILABLE' | 'PROGRAMME_UNCHANGED';

const catalogue: Record<AdminErrorCode, { status: number; message: string }> = {
  ROLE_ALREADY_ASSIGNED: { status: 409, message: 'The account already holds this role.' },
  LAST_ACTIVE_ADMIN: { status: 409, message: 'At least one active System Administrator must remain.' },
  PROTECTED_OWNER: { status: 409, message: 'The protected owner account cannot be changed this way.' },
  SELF_LOCKOUT: { status: 409, message: 'You cannot suspend yourself or remove your own System Administrator role.' },
  ROLE_NOT_ELIGIBLE: { status: 422, message: 'The verified email address is not eligible for the requested role.' },
  ACCOUNT_EXISTS: { status: 409, message: 'An application account already exists for this user.' },
  CLERK_USER_EXISTS: { status: 409, message: 'This person already has a sign-in account. Use Add account instead.' },
  CLERK_USER_NOT_FOUND: { status: 404, message: 'No matching sign-in account was found.' },
  INVITATION_EXISTS: { status: 409, message: 'A pending invitation already exists for this email address.' },
  LAST_ROLE: { status: 409, message: 'An account must keep at least one role. Suspend the account instead of removing its last role.' },
  INVITATION_DELIVERY_FAILED: { status: 503, message: 'The invitation email could not be sent. Please retry.' },
  INVALID_REQUEST: { status: 400, message: 'The request is not valid.' },
  NOT_FOUND: { status: 404, message: 'The requested account or invitation was not found.' },
  ROLE_NOT_ASSIGNED: { status: 404, message: 'The account does not hold this role.' },
  INVITATION_NOT_PENDING: { status: 409, message: 'The invitation is no longer pending.' },
  INVITATION_EXPIRED: { status: 409, message: 'The invitation has expired.' },
  CONFLICT: { status: 409, message: 'The change conflicts with the current state. Reload and retry.' },
  STUDENT_PROFILE_NOT_FOUND: { status: 404, message: 'This account has no student profile yet.' },
  CURRICULUM_UNAVAILABLE: { status: 409, message: 'The selected programme is not available. Choose an active programme.' },
  PROGRAMME_UNCHANGED: { status: 409, message: 'The student is already on this programme.' },
  MUTATION_FAILED: { status: 500, message: 'The change could not be completed. Please retry.' },
};

/** Carries only a stable code, an HTTP status and a fixed safe message; never SQL text. */
export class AdminMutationError extends Error {
  readonly status: number;
  constructor(readonly code: AdminErrorCode) {
    super(catalogue[code].message);
    this.name = 'AdminMutationError';
    this.status = catalogue[code].status;
  }
}

/** Marker raised by repository guard statements (see repository.ts `guard`). */
export const GUARD_MARKER = 'ADMIN_GUARD:';

function readError(error: unknown): { code: string; message: string } {
  const value = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  return { code: typeof value.code === 'string' ? value.code : '', message: typeof value.message === 'string' ? value.message : '' };
}

/** Converts a database/driver error into a safe AdminMutationError. Unknown errors never leak their text. */
export function mapAdminDatabaseError(error: unknown): AdminMutationError {
  if (error instanceof AdminMutationError) return error;
  const { code, message } = readError(error);
  const lower = message.toLowerCase();
  if (code === '22P02' && message.includes(GUARD_MARKER)) {
    const name = /ADMIN_GUARD:([A-Z_]+)/.exec(message)?.[1] as AdminErrorCode | undefined;
    return new AdminMutationError(name && name in catalogue ? name : 'MUTATION_FAILED');
  }
  if (code === '23505') {
    if (lower.includes('role already assigned')) return new AdminMutationError('ROLE_ALREADY_ASSIGNED');
    if (lower.includes('admin_user_invitation_one_pending_email')) return new AdminMutationError('INVITATION_EXISTS');
    if (lower.includes('user_access_assignment')) return new AdminMutationError('ACCOUNT_EXISTS');
    if (lower.includes('user_role_assignment_pkey')) return new AdminMutationError('ROLE_ALREADY_ASSIGNED');
    return new AdminMutationError('CONFLICT');
  }
  if (code === '23514') {
    const change = /programme_change:([a-z_]+)/.exec(lower)?.[1];
    if (change === 'student_not_found') return new AdminMutationError('STUDENT_PROFILE_NOT_FOUND');
    if (change === 'curriculum_unavailable') return new AdminMutationError('CURRICULUM_UNAVAILABLE');
    if (change === 'unchanged') return new AdminMutationError('PROGRAMME_UNCHANGED');
    if (lower.includes('last active system administrator')) return new AdminMutationError('LAST_ACTIVE_ADMIN');
    if (lower.includes('protected owner')) return new AdminMutationError('PROTECTED_OWNER');
    if (lower.includes('expired invitation cannot be accepted')) return new AdminMutationError('INVITATION_EXPIRED');
    if (lower.includes('terminal invitation')) return new AdminMutationError('INVITATION_NOT_PENDING');
  }
  return new AdminMutationError('MUTATION_FAILED');
}
