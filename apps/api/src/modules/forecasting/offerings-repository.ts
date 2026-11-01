import type { ClassType, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ConfirmedOfferingAction, ConfirmedOfferingAuditEntry, ConfirmedOfferingStatus } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import { CONFIRMATION_GUARD_REVISION, mapForecastingDatabaseError } from './errors';
import type { ConfirmationHeader, ConfirmationRows, OfferingRow, OfferingsRepository } from './offerings-contracts';
import type { ForecastingQuery, ForecastingStatement, ForecastingTransaction } from './repository';

const integer = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unexpected numeric database value');
  return number;
};
const text = (value: unknown): string => String(value ?? '');
const nullableText = (value: unknown): string | null => (value == null ? null : String(value));
const nullableInteger = (value: unknown): number | null => (value == null ? null : integer(value));
const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;
const isoSql = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
/** jsonb timestamps come back with the session offset; always hand out UTC ISO text. */
const isoOf = (value: unknown): string | null => {
  if (value == null) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const HEADER_COLUMNS = `c.confirmation_id, c.programme_id, c.learning_centre_id, c.semester_id, c.forecast_run_id, ${isoSql('c.pick_deadline')} AS pick_deadline,
  c.revision, c.created_by, ${isoSql('c.created_at')} AS created_at, c.updated_by, ${isoSql('c.updated_at')} AS updated_at`;

function headerFrom(row: Record<string, unknown>): ConfirmationHeader {
  return {
    confirmationId: integer(row.confirmation_id), programmeId: integer(row.programme_id), learningCentreId: integer(row.learning_centre_id),
    targetSemesterId: integer(row.semester_id), forecastRunId: integer(row.forecast_run_id), pickDeadline: text(row.pick_deadline), revision: integer(row.revision),
    createdBy: text(row.created_by), createdAt: text(row.created_at), updatedBy: text(row.updated_by), updatedAt: text(row.updated_at),
  };
}

/** Trusted audit context: the triggers of migration 0007 read these transaction-local settings and refuse any change without them. */
const context = (actor: string, reason: string): ForecastingStatement => ({
  text: "SELECT set_config('app.offering_actor', $1::text, true) AS actor, set_config('app.offering_reason', $2::text, true) AS reason",
  values: [actor, reason],
});
/**
 * Serialises concurrent writers of one confirmation and aborts the whole transaction when the revision moved. The check is its
 * own statement so it runs on a fresh snapshot after the row lock was granted; the failing cast is evaluated only on mismatch.
 */
function guardRevision(confirmationId: number, expected: number): ForecastingStatement[] {
  return [
    { text: 'SELECT 1 AS locked FROM public.offering_confirmation c WHERE c.confirmation_id = $1::integer FOR UPDATE OF c', values: [confirmationId] },
    {
      text: `SELECT CASE WHEN c.revision = $2::integer THEN 0 ELSE ('${CONFIRMATION_GUARD_REVISION}' || c.revision)::integer END AS ok
        FROM public.offering_confirmation c WHERE c.confirmation_id = $1::integer`,
      values: [confirmationId, expected],
    },
  ];
}
const selectHeader = (confirmationId: number): ForecastingStatement => ({
  text: `SELECT ${HEADER_COLUMNS} FROM public.offering_confirmation c WHERE c.confirmation_id = $1::integer`, values: [confirmationId],
});

/** Run in force when an audit entry was written: the latest SET_DEADLINE entry at or before it (the header insert writes the first). */
const RUN_AT_AUDIT = `(SELECT (d.after_state->>'forecastRunId')::integer FROM public.confirmed_offering_audit d
  WHERE d.confirmation_id = a.confirmation_id AND d.action = 'SET_DEADLINE' AND d.audit_id <= a.audit_id ORDER BY d.audit_id DESC LIMIT 1)`;

export function createOfferingsRepository(query: ForecastingQuery, transaction: ForecastingTransaction): OfferingsRepository {
  const guarded = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { throw mapForecastingDatabaseError(error, 'confirmation'); }
  };
  const mutate = (statements: ForecastingStatement[]): Promise<ConfirmationHeader> => guarded(async () => {
    const results = await transaction(statements);
    const row = results[results.length - 1]?.[0];
    if (!row) throw new Error('Confirmation was not returned');
    return headerFrom(row);
  });

  return {
    get: (scope: ForecastScope) => guarded(async (): Promise<ConfirmationRows | null> => {
      const headers = await query(`SELECT ${HEADER_COLUMNS} FROM public.offering_confirmation c
        WHERE c.programme_id = $1::integer AND c.learning_centre_id = $2::integer AND c.semester_id = $3::integer`, [scope.programmeId, scope.learningCentreId, scope.targetSemesterId]);
      const first = headers[0];
      if (!first) return null;
      const header = headerFrom(first);
      const rows = await query(`SELECT o.confirmed_offering_id, o.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, o.status,
          o.confirmed_by, ${isoSql('o.confirmed_at')} AS confirmed_at, o.withdrawn_by, ${isoSql('o.withdrawn_at')} AS withdrawn_at,
          la.reason, la.run_id
        FROM public.confirmed_offering o JOIN public.subject s ON s.subject_id = o.subject_id
        LEFT JOIN LATERAL (SELECT a.reason, ${RUN_AT_AUDIT} AS run_id FROM public.confirmed_offering_audit a
          WHERE a.confirmation_id = o.confirmation_id AND a.subject_id = o.subject_id ORDER BY a.audit_id DESC LIMIT 1) la ON true
        WHERE o.confirmation_id = $1::integer ORDER BY s.subject_code, o.confirmed_offering_id`, [header.confirmationId]);
      const offerings = rows.map((row): OfferingRow => ({
        confirmedOfferingId: integer(row.confirmed_offering_id), subjectId: integer(row.subject_id), subjectCode: text(row.subject_code), subjectName: text(row.subject_name),
        creditHours: Number(row.credit_hours), classType: (row.class_type == null ? null : text(row.class_type)) as ClassType, status: text(row.status) as ConfirmedOfferingStatus,
        confirmedBy: text(row.confirmed_by), confirmedAt: text(row.confirmed_at), withdrawnBy: nullableText(row.withdrawn_by), withdrawnAt: nullableText(row.withdrawn_at),
        reason: text(row.reason), forecastRunId: nullableInteger(row.run_id),
      }));
      return { header, offerings };
    }),

    confirm: (input) => {
      const statements: ForecastingStatement[] = [context(input.actor, input.reason)];
      const { scope } = input;
      const confirmationOfScope = `(SELECT c.confirmation_id FROM public.offering_confirmation c
        WHERE c.programme_id = $1::integer AND c.learning_centre_id = $2::integer AND c.semester_id = $3::integer)`;
      if (input.expectedRevision === null || input.confirmationId === null) {
        statements.push({
          text: `INSERT INTO public.offering_confirmation(programme_id, learning_centre_id, semester_id, forecast_run_id, pick_deadline, created_by, updated_by)
            VALUES ($1::integer, $2::integer, $3::integer, $4::integer, $5::timestamptz, $6::text, $6::text)`,
          values: [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, input.forecastRunId, input.pickDeadline, input.actor],
        });
      } else {
        statements.push(...guardRevision(input.confirmationId, input.expectedRevision));
      }
      if (input.insertSubjectIds.length) {
        statements.push({
          text: `INSERT INTO public.confirmed_offering(confirmation_id, subject_id, status, confirmed_by)
            SELECT ${confirmationOfScope}, s.subject_id, 'CONFIRMED', $5::text FROM unnest($4::integer[]) AS s(subject_id) ORDER BY s.subject_id`,
          values: [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, input.insertSubjectIds, input.actor],
        });
      }
      if (input.reconfirmSubjectIds.length) {
        statements.push({
          text: `UPDATE public.confirmed_offering o SET status = 'CONFIRMED' WHERE o.confirmation_id = ${confirmationOfScope} AND o.subject_id = ANY($4::integer[]) AND o.status = 'WITHDRAWN'`,
          values: [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, input.reconfirmSubjectIds],
        });
      }
      statements.push({
        text: `SELECT ${HEADER_COLUMNS} FROM public.offering_confirmation c WHERE c.programme_id = $1::integer AND c.learning_centre_id = $2::integer AND c.semester_id = $3::integer`,
        values: [scope.programmeId, scope.learningCentreId, scope.targetSemesterId],
      });
      return mutate(statements);
    },

    withdraw: (input) => mutate([
      context(input.actor, input.reason),
      ...guardRevision(input.confirmationId, input.expectedRevision),
      { text: "UPDATE public.confirmed_offering o SET status = 'WITHDRAWN' WHERE o.confirmation_id = $1::integer AND o.subject_id = ANY($2::integer[]) AND o.status = 'CONFIRMED'", values: [input.confirmationId, input.subjectIds] },
      selectHeader(input.confirmationId),
    ]),

    setDeadline: (input) => mutate([
      context(input.actor, input.reason),
      ...guardRevision(input.confirmationId, input.expectedRevision),
      { text: 'UPDATE public.offering_confirmation SET pick_deadline = $2::timestamptz, forecast_run_id = $3::integer WHERE confirmation_id = $1::integer', values: [input.confirmationId, input.pickDeadline, input.forecastRunId] },
      selectHeader(input.confirmationId),
    ]),

    listAudit: (header, limit, beforeAuditId) => guarded(async () => {
      const scope: ForecastScope = { programmeId: header.programmeId, learningCentreId: header.learningCentreId, targetSemesterId: header.targetSemesterId };
      const rows = await query(`SELECT a.audit_id, a.subject_id, a.action, a.before_state, a.after_state, a.reason, a.recorded_by, ${isoSql('a.recorded_at')} AS recorded_at,
          ${RUN_AT_AUDIT} AS run_id
        FROM public.confirmed_offering_audit a WHERE a.confirmation_id = $1::integer AND ($3::bigint IS NULL OR a.audit_id < $3::bigint)
        ORDER BY a.audit_id DESC LIMIT $2::integer`, [header.confirmationId, limit, beforeAuditId]);
      return rows.map((row): ConfirmedOfferingAuditEntry => {
        const before = row.before_state == null ? null : json<Record<string, unknown>>(row.before_state);
        const after = json<Record<string, unknown>>(row.after_state);
        const action = text(row.action) as ConfirmedOfferingAction;
        const deadline = action === 'SET_DEADLINE';
        return {
          auditId: integer(row.audit_id), scope, subjectId: nullableInteger(row.subject_id), action,
          beforeStatus: deadline ? null : (before?.status as ConfirmedOfferingStatus | undefined) ?? null,
          afterStatus: deadline ? null : (after.status as ConfirmedOfferingStatus | undefined) ?? null,
          beforeDeadline: deadline ? isoOf(before?.pickDeadline) : null, afterDeadline: deadline ? isoOf(after.pickDeadline) : null,
          recordedBy: text(row.recorded_by), recordedAt: text(row.recorded_at), reason: text(row.reason), forecastRunId: nullableInteger(row.run_id),
        };
      });
    }),
  };
}
