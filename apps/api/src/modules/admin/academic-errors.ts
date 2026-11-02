import { ACADEMIC_SETUP_ERROR_CODES, type AcademicSetupErrorCode } from '../../../../../packages/shared/src/admin/academic-setup';
const catalogue: Record<AcademicSetupErrorCode, { status: number; message: string }> = {
  INVALID_REQUEST: { status: 400, message: 'The request is not valid.' },
  NOT_FOUND: { status: 404, message: 'The requested academic setup record was not found.' },
  CONFLICT: { status: 409, message: 'The change conflicts with the current state. Reload and retry.' },
  DEPENDENCY_UNAVAILABLE: { status: 503, message: 'Academic setup is temporarily unavailable. Please retry.' },
  COORDINATOR_ROLE_REQUIRED: { status: 409, message: 'The account must hold an active Coordinator role.' },
  ACCOUNT_INACTIVE: { status: 409, message: 'The account must be active.' },
  REFERENCE_INACTIVE: { status: 409, message: 'The selected reference must be active.' },
  PROGRAMME_FACULTY_MISMATCH: { status: 409, message: 'The programme must belong to the selected faculty.' },
  ASSIGNMENT_ACTIVE: { status: 409, message: 'An active assignment already exists.' },
  ASSIGNMENT_ENDED: { status: 409, message: 'The assignment has already ended.' },
};
/** Repository domain boundary: fixed messages only, never driver messages or SQL. */
export class AcademicSetupDomainError extends Error {
  readonly status: number;
  constructor(readonly code: AcademicSetupErrorCode) {
    super(catalogue[code].message);
    this.name = 'AcademicSetupDomainError';
    this.status = catalogue[code].status;
  }
}

/** Only recognized SQLSTATE/constraint markers cross the repository boundary. */
export function mapAcademicDatabaseError(error: unknown): AcademicSetupDomainError {
  if (error instanceof AcademicSetupDomainError) return error;
  const value = error !== null && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof value.code === 'string' ? value.code : '';
  const message = typeof value.message === 'string' ? value.message : '';
  if (code === '23514') {
    const marker = /^ACADEMIC_SETUP:([A-Z_]+)$/.exec(message)?.[1];
    if (marker && ACADEMIC_SETUP_ERROR_CODES.includes(marker as AcademicSetupErrorCode)) return new AcademicSetupDomainError(marker as AcademicSetupErrorCode);
    return new AcademicSetupDomainError('INVALID_REQUEST');
  }
  if (code === '23505') return new AcademicSetupDomainError(
    value.constraint === 'coordinator_assignment_one_live_scope_idx' ? 'ASSIGNMENT_ACTIVE' : 'CONFLICT');
  if (code === '23503') return new AcademicSetupDomainError('NOT_FOUND');
  if (['23502', '22001', '22003', '22007', '22008', '22P02'].includes(code)) return new AcademicSetupDomainError('INVALID_REQUEST');
  if (['40001', '40P01'].includes(code)) return new AcademicSetupDomainError('CONFLICT');
  return new AcademicSetupDomainError('DEPENDENCY_UNAVAILABLE');
}
