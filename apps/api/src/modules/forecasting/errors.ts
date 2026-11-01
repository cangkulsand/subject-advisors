export type ForecastingErrorCode =
  | 'INVALID_REQUEST' | 'IF_MATCH_REQUIRED' | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE'
  | 'SCOPE_NOT_ASSIGNED' | 'SCOPE_NOT_FOUND' | 'IMPORT_NOT_FOUND'
  | 'TARGET_SEMESTER_NOT_ALLOWED' | 'TARGET_SEMESTER_UNAVAILABLE'
  | 'IMPORT_STATE_CONFLICT' | 'IMPORT_NOT_SUBSET_ACCEPTABLE' | 'IMPORT_REVISION_MISMATCH' | 'IMPORT_CURRICULUM_MISMATCH' | 'IMPORT_CONFLICT'
  | 'SYSTEM_SNAPSHOT_EMPTY' | 'IMPORT_FAILED' | 'FORECASTING_UNAVAILABLE'
  | 'RUN_NOT_FOUND' | 'RUN_ALREADY_EXISTS' | 'RUN_REVISION_MISMATCH' | 'RUN_FINALIZED' | 'RUN_STATE_CONFLICT' | 'RUN_CONFLICT' | 'RUN_FAILED'
  | 'CATALOGUE_INVALID' | 'DECISION_INVALID' | 'DECISION_REASON_REQUIRED' | 'DECISION_DUPLICATE_SUBJECT' | 'DECISION_SUBJECT_NOT_FOUND' | 'DECISION_NO_SECTIONS'
  | 'SUBJECT_NOT_CONFIGURED' | 'ALLOCATION_INVALID' | 'ALLOCATION_TOTAL_MISMATCH' | 'ALLOCATION_EXCEEDS_CAPACITY' | 'ALLOCATION_JUSTIFICATION_REQUIRED' | 'REVIEWS_INCOMPLETE'
  | 'CONFIRMATION_NOT_FOUND' | 'CONFIRMATION_REVISION_MISMATCH' | 'CONFIRMATION_REASON_REQUIRED' | 'CONFIRMATION_RUN_MISMATCH' | 'CONFIRMATION_UNCHANGED'
  | 'CONFIRMATION_CONFLICT' | 'CONFIRMATION_FAILED'
  | 'RUN_NOT_FINALIZED' | 'RUN_SCOPE_MISMATCH' | 'SUBJECT_EXCLUDED' | 'SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE' | 'SUBJECT_NOT_IN_RUN' | 'OFFERING_NOT_CONFIRMED'
  | 'PICK_DEADLINE_INVALID' | 'PICK_DEADLINE_MISMATCH';

const catalogue: Record<ForecastingErrorCode, { status: number; message: string }> = {
  INVALID_REQUEST: { status: 400, message: 'The request is not valid.' },
  IF_MATCH_REQUIRED: { status: 400, message: 'Send the current revision in the If-Match header.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Upload multipart/form-data with a CSV file, or send text/csv.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The upload exceeds the 5 MiB limit.' },
  SCOPE_NOT_ASSIGNED: { status: 403, message: 'You are not assigned to this programme and learning centre.' },
  SCOPE_NOT_FOUND: { status: 404, message: 'The programme, learning centre or semester is not available.' },
  IMPORT_NOT_FOUND: { status: 404, message: 'The import was not found.' },
  TARGET_SEMESTER_NOT_ALLOWED: { status: 422, message: 'Imports can only target the semester after the current semester.' },
  TARGET_SEMESTER_UNAVAILABLE: { status: 409, message: 'No current or next semester is configured yet.' },
  IMPORT_STATE_CONFLICT: { status: 409, message: 'The import is no longer awaiting acceptance.' },
  IMPORT_NOT_SUBSET_ACCEPTABLE: { status: 409, message: 'This validation has no rejected rows to acknowledge, or no valid rows remain.' },
  IMPORT_REVISION_MISMATCH: { status: 412, message: 'The validation changed or does not match the revision you acknowledged. Review the report again.' },
  IMPORT_CURRICULUM_MISMATCH: { status: 422, message: 'A student curriculum is outside the selected programme.' },
  IMPORT_CONFLICT: { status: 409, message: 'The import conflicts with existing data. Reload and retry.' },
  SYSTEM_SNAPSHOT_EMPTY: { status: 422, message: 'No students in the system match this programme and learning centre, so there is nothing to snapshot. Upload a CSV instead.' },
  IMPORT_FAILED: { status: 500, message: 'The import could not be stored. Please retry.' },
  FORECASTING_UNAVAILABLE: { status: 503, message: 'Forecasting data is unavailable. Please retry.' },
  RUN_NOT_FOUND: { status: 404, message: 'The forecast was not found.' },
  RUN_ALREADY_EXISTS: { status: 409, message: 'A forecast already exists for this import snapshot. Reload to open it.' },
  RUN_REVISION_MISMATCH: { status: 412, message: 'The forecast changed since you loaded it. Reload and review the current state.' },
  RUN_FINALIZED: { status: 409, message: 'This forecast is finalized and read-only.' },
  RUN_STATE_CONFLICT: { status: 409, message: 'This step is not allowed in the forecast current state.' },
  RUN_CONFLICT: { status: 409, message: 'The forecast conflicts with existing data. Reload and retry.' },
  RUN_FAILED: { status: 500, message: 'The forecast could not be saved. Please retry.' },
  CATALOGUE_INVALID: { status: 422, message: 'The curriculum catalogue has invalid prerequisite details; the forecast cannot be generated until they are corrected.' },
  DECISION_INVALID: { status: 422, message: 'The decision is not valid.' },
  DECISION_REASON_REQUIRED: { status: 422, message: 'Every decision needs a reason of 1-500 characters.' },
  DECISION_DUPLICATE_SUBJECT: { status: 422, message: 'Each subject can appear only once per decision request.' },
  DECISION_SUBJECT_NOT_FOUND: { status: 422, message: 'A decision refers to a subject that is not in this forecast.' },
  DECISION_NO_SECTIONS: { status: 422, message: 'This subject has no proposed sections to review.' },
  SUBJECT_NOT_CONFIGURED: { status: 422, message: 'The allocation of an excluded or unconfigured subject cannot be replaced.' },
  ALLOCATION_INVALID: { status: 422, message: 'The replacement allocation is not valid.' },
  ALLOCATION_TOTAL_MISMATCH: { status: 422, message: 'The replacement sections must add up to the forecast demand for the subject.' },
  ALLOCATION_EXCEEDS_CAPACITY: { status: 422, message: 'A section is larger than the maximum allowed by its capacity rule.' },
  ALLOCATION_JUSTIFICATION_REQUIRED: { status: 422, message: 'A section above the normal maximum needs a justification.' },
  REVIEWS_INCOMPLETE: { status: 422, message: 'Every proposed section must be reviewed, approved or deferred before finalizing.' },
  CONFIRMATION_NOT_FOUND: { status: 404, message: 'No offerings have been confirmed for this programme, learning centre and semester yet.' },
  CONFIRMATION_REVISION_MISMATCH: { status: 412, message: 'The confirmation changed since you loaded it. Reload and review the current state.' },
  CONFIRMATION_REASON_REQUIRED: { status: 422, message: 'A reason of 1-500 characters is required and is recorded in the audit trail.' },
  CONFIRMATION_RUN_MISMATCH: { status: 422, message: 'Later confirmations use the forecast the confirmation is based on. Switch the forecast through the pick deadline change.' },
  CONFIRMATION_UNCHANGED: { status: 422, message: 'Nothing would change: the deadline and forecast are the same as the current ones.' },
  CONFIRMATION_CONFLICT: { status: 409, message: 'The confirmation conflicts with existing data. Reload and retry.' },
  CONFIRMATION_FAILED: { status: 500, message: 'The confirmation could not be saved. Please retry.' },
  RUN_NOT_FINALIZED: { status: 409, message: 'Offerings can only be confirmed from a FINALIZED forecast for the same programme, learning centre and semester.' },
  RUN_SCOPE_MISMATCH: { status: 422, message: 'The forecast belongs to a different programme, learning centre or semester.' },
  SUBJECT_EXCLUDED: { status: 422, message: 'Subjects excluded from the offering forecast cannot be confirmed.' },
  SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE: { status: 422, message: 'A subject that does not run in this semester type (Normal/Short offering rule) cannot be confirmed for the semester.' },
  SUBJECT_NOT_IN_RUN: { status: 422, message: 'A subject is not part of the forecast the confirmation is based on.' },
  OFFERING_NOT_CONFIRMED: { status: 422, message: 'Only currently confirmed subjects can be withdrawn.' },
  PICK_DEADLINE_INVALID: { status: 422, message: 'The pick deadline must be a future date and time.' },
  PICK_DEADLINE_MISMATCH: { status: 422, message: 'The deadline differs from the current one. Change the deadline through the pick deadline action.' },
};

/** Carries only a stable code, an HTTP status and a fixed safe message; never SQL text. Optional details hold safe ids only. */
export class ForecastingError extends Error {
  readonly status: number;
  constructor(readonly code: ForecastingErrorCode, readonly details?: Record<string, unknown>) {
    super(catalogue[code].message);
    this.name = 'ForecastingError';
    this.status = catalogue[code].status;
  }
}

function readError(error: unknown): { code: string; message: string } {
  const value = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  return { code: typeof value.code === 'string' ? value.code : '', message: typeof value.message === 'string' ? value.message : '' };
}

/** Guard tokens raised by the run repository (a failing cast on a locked row) to abort a transaction atomically. */
export const RUN_GUARD_REVISION = 'GUARD_REVISION_MISMATCH';
export const RUN_GUARD_EXISTS = 'GUARD_RUN_EXISTS';
export const CONFIRMATION_GUARD_REVISION = 'GUARD_CONFIRMATION_REVISION';

/** Converts a database/driver error into a safe ForecastingError. Unknown errors never leak their text. */
export function mapForecastingDatabaseError(error: unknown, context: 'import' | 'run' | 'confirmation' = 'import'): ForecastingError {
  if (error instanceof ForecastingError) return error;
  const { code, message } = readError(error);
  const lower = message.toLowerCase();
  if (context === 'confirmation') {
    if (code === '22P02' && message.includes(CONFIRMATION_GUARD_REVISION)) return new ForecastingError('CONFIRMATION_REVISION_MISMATCH');
    if (code === '23514') {
      if (lower.includes('excluded from offering confirmation')) return new ForecastingError('SUBJECT_EXCLUDED');
      if (lower.includes('not part of the source forecast run')) return new ForecastingError('SUBJECT_NOT_IN_RUN');
      if (lower.includes('requires a finalized forecast run') || lower.includes('source run is not finalized')) return new ForecastingError('RUN_NOT_FINALIZED');
      if (lower.includes('actor and reason') || lower.includes('actor or reason') || lower.includes('reason is limited')) return new ForecastingError('CONFIRMATION_REASON_REQUIRED');
      return new ForecastingError('CONFIRMATION_CONFLICT');
    }
    if (code === '23505') return new ForecastingError('CONFIRMATION_REVISION_MISMATCH');
    if (code === '23503') return new ForecastingError('SCOPE_NOT_FOUND');
    return new ForecastingError('CONFIRMATION_FAILED');
  }
  if (context === 'run') {
    if (code === '22P02' && message.includes(RUN_GUARD_REVISION)) return new ForecastingError('RUN_REVISION_MISMATCH');
    if (code === '22P02' && message.includes(RUN_GUARD_EXISTS)) return new ForecastingError('RUN_ALREADY_EXISTS');
    if (code === '23514') {
      if (lower.includes('read-only') || lower.includes('finalized forecast')) return new ForecastingError('RUN_FINALIZED');
      if (lower.includes('accepted import snapshot')) return new ForecastingError('IMPORT_NOT_FOUND');
      if (lower.includes('exceeds configured capacity')) return new ForecastingError('ALLOCATION_EXCEEDS_CAPACITY');
      if (lower.includes('requires justification')) return new ForecastingError('ALLOCATION_JUSTIFICATION_REQUIRED');
      if (lower.includes('cannot be finalized')) return new ForecastingError('RUN_STATE_CONFLICT');
      return new ForecastingError('RUN_CONFLICT');
    }
    if (code === '23505') return new ForecastingError('RUN_CONFLICT');
    if (code === '23503') return new ForecastingError('RUN_NOT_FOUND');
    return new ForecastingError('RUN_FAILED');
  }
  if (code === '23514') {
    if (lower.includes('outside the import programme')) return new ForecastingError('IMPORT_CURRICULUM_MISMATCH');
    if (lower.includes('immutable') || lower.includes('invalid import status transition')) return new ForecastingError('IMPORT_STATE_CONFLICT');
    return new ForecastingError('IMPORT_CONFLICT');
  }
  if (code === '23505') return new ForecastingError('IMPORT_CONFLICT');
  if (code === '23503') return new ForecastingError('SCOPE_NOT_FOUND');
  return new ForecastingError('IMPORT_FAILED');
}
