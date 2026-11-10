export type ForecastingErrorCode =
  | 'INVALID_REQUEST' | 'IF_MATCH_REQUIRED' | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE'
  | 'SCOPE_NOT_ASSIGNED' | 'SCOPE_NOT_FOUND' | 'IMPORT_NOT_FOUND'
  | 'TARGET_SEMESTER_NOT_ALLOWED' | 'TARGET_SEMESTER_UNAVAILABLE'
  | 'IMPORT_STATE_CONFLICT' | 'IMPORT_NOT_SUBSET_ACCEPTABLE' | 'IMPORT_REVISION_MISMATCH' | 'IMPORT_CURRICULUM_MISMATCH' | 'IMPORT_CONFLICT'
  | 'SYSTEM_SNAPSHOT_EMPTY' | 'IMPORT_FAILED' | 'FORECASTING_UNAVAILABLE'
  | 'RUN_NOT_FOUND' | 'RUN_SUBJECT_NOT_FOUND' | 'RUN_ALREADY_EXISTS' | 'RUN_CONFLICT' | 'RUN_FAILED'
  | 'CATALOGUE_INVALID'
  | 'SUBJECT_EXCLUDED' | 'DECISION_SUBJECT_NOT_FOUND'
  | 'SEMESTER_READ_ONLY' | 'SELECTION_CLOSED' | 'DECISION_STALE' | 'OFFERING_DECISION_NOT_FOUND' | 'DECISION_CONFLICT' | 'DECISION_FAILED';

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
  RUN_SUBJECT_NOT_FOUND: { status: 404, message: 'The subject is not part of this forecast.' },
  RUN_ALREADY_EXISTS: { status: 409, message: 'A forecast already exists for this import snapshot. Reload to open it.' },
  RUN_CONFLICT: { status: 409, message: 'The forecast conflicts with existing data. Reload and retry.' },
  RUN_FAILED: { status: 500, message: 'The forecast could not be saved. Please retry.' },
  CATALOGUE_INVALID: { status: 422, message: 'The curriculum catalogue has invalid prerequisite details; the forecast cannot be generated until they are corrected.' },
  DECISION_SUBJECT_NOT_FOUND: { status: 422, message: 'The subject is not in the catalogue of this programme.' },
  SUBJECT_EXCLUDED: { status: 422, message: 'Subjects excluded from the offering forecast cannot be offered.' },
  SEMESTER_READ_ONLY: { status: 409, message: 'Only the next semester can be planned.' },
  SELECTION_CLOSED: { status: 409, message: 'Selection for this semester has closed; decisions are locked.' },
  DECISION_STALE: { status: 409, message: 'This subject was changed by someone else. Reload to see the current decision.' },
  OFFERING_DECISION_NOT_FOUND: { status: 404, message: 'This subject has no decision in this scope.' },
  DECISION_CONFLICT: { status: 409, message: 'The decision conflicts with existing data. Reload and retry.' },
  DECISION_FAILED: { status: 500, message: 'The decision could not be saved. Please retry.' },
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
export const RUN_GUARD_EXISTS = 'GUARD_RUN_EXISTS';
export const DECISION_GUARD_STALE = 'GUARD_DECISION_STALE';

/** Converts a database/driver error into a safe ForecastingError. Unknown errors never leak their text. */
export function mapForecastingDatabaseError(error: unknown, context: 'import' | 'run' | 'decision' = 'import'): ForecastingError {
  if (error instanceof ForecastingError) return error;
  const { code, message } = readError(error);
  const lower = message.toLowerCase();
  if (context === 'decision') {
    if (code === '22P02' && message.includes(DECISION_GUARD_STALE)) return new ForecastingError('DECISION_STALE');
    if (code === '23514' || code === '23505') return new ForecastingError('DECISION_CONFLICT');
    if (code === '23503') return new ForecastingError('SCOPE_NOT_FOUND');
    return new ForecastingError('DECISION_FAILED');
  }
  if (context === 'run') {
    if (code === '22P02' && message.includes(RUN_GUARD_EXISTS)) return new ForecastingError('RUN_ALREADY_EXISTS');
    if (code === '23514') {
      if (lower.includes('accepted import snapshot')) return new ForecastingError('IMPORT_NOT_FOUND');
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
