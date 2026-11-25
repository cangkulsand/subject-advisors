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
  DEPARTMENT_HAS_PROGRAMMES: { status: 409, message: 'A department with programmes cannot move to another faculty. Reassign its programmes first.' },
  FACULTY_CODE_TAKEN: { status: 409, message: 'Another faculty already uses this code. Choose a different code.' },
  DEPARTMENT_CODE_TAKEN: { status: 409, message: 'Another department already uses this code. Choose a different code.' },
  PROGRAMME_CODE_TAKEN: { status: 409, message: 'Another programme already uses this code. Choose a different code.' },
  CENTRE_CODE_TAKEN: { status: 409, message: 'Another learning centre already uses this code. Choose a different code.' },
  CURRICULUM_VERSION_TAKEN: { status: 409, message: 'This programme already has a curriculum with this version. Choose a different version.' },
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

/** Unique constraints whose violation means a reused code (S3-P004-038); any other 23505 stays CONFLICT. */
const uniqueConstraintCodes: Partial<Record<string, AcademicSetupErrorCode>> = {
  coordinator_assignment_one_live_scope_idx: 'ASSIGNMENT_ACTIVE',
  faculty_faculty_code_key: 'FACULTY_CODE_TAKEN',
  department_department_code_key: 'DEPARTMENT_CODE_TAKEN',
  programme_programme_code_key: 'PROGRAMME_CODE_TAKEN',
  learning_centre_centre_code_key: 'CENTRE_CODE_TAKEN',
  curriculum_rule_1: 'CURRICULUM_VERSION_TAKEN',
};
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
    (typeof value.constraint === 'string' ? uniqueConstraintCodes[value.constraint] : undefined) ?? 'CONFLICT');
  if (code === '23503') return new AcademicSetupDomainError('NOT_FOUND');
  if (['23502', '22001', '22003', '22007', '22008', '22P02'].includes(code)) return new AcademicSetupDomainError('INVALID_REQUEST');
  if (['40001', '40P01'].includes(code)) return new AcademicSetupDomainError('CONFLICT');
  return new AcademicSetupDomainError('DEPENDENCY_UNAVAILABLE');
}
