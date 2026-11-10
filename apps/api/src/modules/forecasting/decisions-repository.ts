import type { ClassType, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { OfferingDecisionAuditEntry, OfferingDecisionStatus } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { DECISION_GUARD_STALE, mapForecastingDatabaseError } from './errors';
import type { DecisionRow, OfferingDecisionsRepository, PickerRow } from './decisions-contracts';
import type { ForecastingQuery, ForecastingStatement, ForecastingTransaction } from './repository';

const integer = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unexpected numeric database value');
  return number;
};
const text = (value: unknown): string => String(value ?? '');
const isoSql = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Student picks of one scope: the semester's picks of students at the centre whose curriculum belongs to the programme ($1 programme, $2 centre, $3 semester).
const PICKS_FROM = `FROM public.semester_offering o
  JOIN public.student_profile p ON p.student_id = o.student_id
  JOIN public.curriculum c ON c.curriculum_id = p.curriculum_id
  JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = o.curriculum_subject_id
  WHERE o.semester_id = $3::integer AND c.programme_id = $1::integer AND p.learning_centre_id = $2::integer`;

const SCOPED = 'programme_id = $1::integer AND learning_centre_id = $2::integer AND semester_id = $3::integer';

export function createOfferingDecisionsRepository(query: ForecastingQuery, transaction: ForecastingTransaction): OfferingDecisionsRepository {
  const guarded = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { throw mapForecastingDatabaseError(error, 'decision'); }
  };

  return {
    get: (scope: ForecastScope) => guarded(async () => {
      const rows = await query(`SELECT d.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, d.status, d.decided_by, ${isoSql('d.decided_at')} AS decided_at
        FROM public.offering_decision d JOIN public.subject s ON s.subject_id = d.subject_id
        WHERE d.programme_id = $1::integer AND d.learning_centre_id = $2::integer AND d.semester_id = $3::integer ORDER BY s.subject_code`,
      [scope.programmeId, scope.learningCentreId, scope.targetSemesterId]);
      return rows.map((row): DecisionRow => ({
        subjectId: integer(row.subject_id), subjectCode: text(row.subject_code), subjectName: text(row.subject_name), creditHours: Number(row.credit_hours),
        classType: (row.class_type == null ? null : text(row.class_type)) as ClassType, status: text(row.status) as 'APPROVED' | 'REMOVED',
        decidedBy: text(row.decided_by), decidedAt: text(row.decided_at),
      }));
    }),

    decide: (input) => guarded(async () => {
      const { scope } = input;
      const key = [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, input.subjectId];
      const where = `${SCOPED} AND subject_id = $4::integer`;
      const statements: ForecastingStatement[] = [
        // There is no row to lock while a subject is Pending, so concurrent writers of one subject are serialised by an advisory lock.
        { text: 'SELECT pg_advisory_xact_lock(hashtext($1::text)) AS locked', values: [key.join(':')] },
        // Its own statement, so it runs on a fresh snapshot after the lock was granted; the failing cast is evaluated only on mismatch.
        // The cast input must include the row value: a constant-only cast is folded (and fails) at plan time, before CASE is evaluated.
        {
          text: `SELECT CASE WHEN cur.status = $5::text THEN 0 ELSE ('${DECISION_GUARD_STALE}:' || cur.status)::integer END AS ok
            FROM (SELECT coalesce((SELECT status FROM public.offering_decision WHERE ${where}), 'PENDING') AS status) cur`,
          values: [...key, input.expectedStatus],
        },
        input.status === 'PENDING'
          ? { text: `DELETE FROM public.offering_decision WHERE ${where}`, values: key }
          : {
            text: `INSERT INTO public.offering_decision(programme_id, learning_centre_id, semester_id, subject_id, status, decided_by)
              VALUES ($1::integer, $2::integer, $3::integer, $4::integer, $5::text, $6::text)
              ON CONFLICT (programme_id, learning_centre_id, semester_id, subject_id)
              DO UPDATE SET status = EXCLUDED.status, decided_by = EXCLUDED.decided_by, decided_at = now()`,
            values: [...key, input.status, input.actor],
          },
        // One statement, so the pick count, the deletion and the withdrawal records share a snapshot and agree.
        // Picks exist only for approved subjects; leaving APPROVED (to REMOVED or back to PENDING) withdraws them.
        input.expectedStatus === 'APPROVED'
          ? {
            text: `WITH scoped AS (SELECT o.offering_id, o.student_id ${PICKS_FROM} AND cs.subject_id = $4::integer),
              a AS (INSERT INTO public.offering_decision_audit(programme_id, learning_centre_id, semester_id, subject_id, before_status, after_status, import_batch_id, affected_picks, recorded_by)
                VALUES ($1::integer, $2::integer, $3::integer, $4::integer, $5::text, $6::text, $7::integer, (SELECT count(*) FROM scoped), $8::text) RETURNING audit_id),
              gone AS (DELETE FROM public.semester_offering o USING scoped WHERE o.offering_id = scoped.offering_id RETURNING o.student_id),
              w AS (INSERT INTO public.offering_pick_withdrawal(audit_id, student_id, semester_id, subject_id)
                SELECT a.audit_id, gone.student_id, $3::integer, $4::integer FROM a, gone RETURNING withdrawal_id)
              SELECT (SELECT audit_id FROM a) AS audit_id, (SELECT count(*) FROM w)::int AS affected_picks`,
            values: [...key, input.expectedStatus, input.status, input.importBatchId, input.actor],
          }
          : {
            text: `INSERT INTO public.offering_decision_audit(programme_id, learning_centre_id, semester_id, subject_id, before_status, after_status, import_batch_id, affected_picks, recorded_by)
              VALUES ($1::integer, $2::integer, $3::integer, $4::integer, $5::text, $6::text, $7::integer, 0, $8::text) RETURNING audit_id, 0 AS affected_picks`,
            values: [...key, input.expectedStatus, input.status, input.importBatchId, input.actor],
          },
      ];
      const results = await transaction(statements);
      const last = results[results.length - 1]?.[0];
      if (!last || last.audit_id == null) throw new Error('Decision audit was not returned');
      return { beforeStatus: input.expectedStatus, afterStatus: input.status, affectedPicks: integer(last.affected_picks) };
    }),

    listAudit: (scope, limit, beforeAuditId) => guarded(async () => {
      const rows = await query(`SELECT a.audit_id, a.subject_id, s.subject_code, s.subject_name, a.before_status, a.after_status, a.import_batch_id, a.affected_picks,
          a.recorded_by, ${isoSql('a.recorded_at')} AS recorded_at
        FROM public.offering_decision_audit a JOIN public.subject s ON s.subject_id = a.subject_id
        WHERE a.programme_id = $1::integer AND a.learning_centre_id = $2::integer AND a.semester_id = $3::integer AND ($4::bigint IS NULL OR a.audit_id < $4::bigint)
        ORDER BY a.audit_id DESC LIMIT $5::integer`, [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, beforeAuditId, limit]);
      return rows.map((row): OfferingDecisionAuditEntry => ({
        auditId: integer(row.audit_id), scope: { ...scope }, subjectId: integer(row.subject_id), subjectCode: text(row.subject_code), subjectName: text(row.subject_name),
        beforeStatus: text(row.before_status) as OfferingDecisionStatus, afterStatus: text(row.after_status) as OfferingDecisionStatus,
        importBatchId: row.import_batch_id == null ? null : integer(row.import_batch_id), affectedPicks: integer(row.affected_picks),
        recordedBy: text(row.recorded_by), recordedAt: text(row.recorded_at),
      }));
    }),

    pickCounts: (scope) => guarded(async () => {
      const rows = await query(`SELECT cs.subject_id, count(*)::int AS pick_count ${PICKS_FROM} GROUP BY cs.subject_id ORDER BY cs.subject_id`,
        [scope.programmeId, scope.learningCentreId, scope.targetSemesterId]);
      return rows.map((row) => ({ subjectId: integer(row.subject_id), pickCount: integer(row.pick_count) }));
    }),

    pickers: (scope, subjectId) => guarded(async () => {
      const rows = await query(`SELECT p.student_id, p.student_name, p.matric_no ${PICKS_FROM} AND cs.subject_id = $4::integer ORDER BY p.student_name, p.student_id`,
        [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, subjectId]);
      return rows.map((row): PickerRow => ({
        studentId: integer(row.student_id), studentName: text(row.student_name),
        matricNo: typeof row.matric_no === 'string' && row.matric_no.trim() ? row.matric_no.trim() : null,
      }));
    }),
  };
}
