import { AuthError } from '../auth/errors';
import type { OfferingRepository, OfferingScope } from './contracts';
import type { OfferingSelection } from '../../../../../packages/shared/src/offerings/offerings';
import { parseSave } from './validation';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';

export interface OfferingSql {
  query(text: string, parameters: unknown[]): Promise<Record<string, unknown>[]>;
}
export interface OfferingDatabase extends OfferingSql {
  /** Runs callback on one connection with BEGIN/COMMIT/ROLLBACK. */
  transaction<T>(work: (connection: OfferingSql) => Promise<T>): Promise<T>;
}

async function read(db: OfferingSql, scope: OfferingScope, semesterId: string): Promise<OfferingSelection> {
  const rows = await db.query(`
    SELECT o.curriculum_subject_id
    FROM semester_offering o
    JOIN student_profile p ON p.student_id = o.student_id
    JOIN curriculum_subject cs ON cs.curriculum_subject_id = o.curriculum_subject_id
    WHERE o.student_id = $1 AND p.clerk_user_id = $2 AND o.semester_id = $3
      AND p.curriculum_id = $4 AND cs.curriculum_id = p.curriculum_id
    ORDER BY o.curriculum_subject_id`, [scope.studentId, scope.clerkUserId, semesterId, scope.curriculumId]);
  const ids = rows.map(row => offeringId(row.curriculum_subject_id));
  return { semesterId, curriculumSubjectIds: ids };
}

export function createOfferingRepository(db: OfferingDatabase): OfferingRepository {
  return {
    read: (scope, semesterId) => read(db, scope, semesterId),
    async replace(scope, value) {
      const input = parseSave(value);
      return db.transaction(async tx => {
        // Serialize replacements for this student, including empty lists. Recheck
        // profile ownership/curriculum inside the transaction to reject stale context.
        const profiles = await tx.query(`
          SELECT curriculum_id, current_semester_id FROM student_profile
          WHERE student_id = $1 AND clerk_user_id = $2 FOR UPDATE`, [scope.studentId, scope.clerkUserId]);
        if (!profiles[0] || offeringId(profiles[0].curriculum_id) !== scope.curriculumId) {
          throw new AuthError(409, 'CURRICULUM_CHANGED', 'Your academic profile changed. Reload offerings before saving.');
        }
        if (profiles[0].current_semester_id === null || offeringId(profiles[0].current_semester_id) !== input.semesterId) {
          throw new AuthError(409, 'PROFILE_SEMESTER_CHANGED', 'Your selected semester changed. Reload offerings before saving.');
        }
        const semesters = await tx.query('SELECT semester_id FROM academic_semester WHERE semester_id = $1 FOR SHARE', [input.semesterId]);
        if (!semesters.length) throw new AuthError(404, 'SEMESTER_NOT_FOUND', 'This semester is no longer available. Reload offerings.');
        const subjects = await tx.query(`
          SELECT curriculum_subject_id FROM curriculum_subject
          WHERE curriculum_id = $1 AND curriculum_subject_id = ANY($2::integer[]) FOR SHARE`,
        [scope.curriculumId, input.curriculumSubjectIds]);
        if (subjects.length !== input.curriculumSubjectIds.length) {
          throw new AuthError(400, 'SUBJECT_OUTSIDE_CURRICULUM', 'A selected subject is no longer in your curriculum. Reload offerings.');
        }
        // Reconcile rather than delete/recreate unchanged entries. All values are bound.
        await tx.query(`DELETE FROM semester_offering
          WHERE student_id = $1 AND semester_id = $2
            AND NOT (curriculum_subject_id = ANY($3::integer[]))`,
        [scope.studentId, input.semesterId, input.curriculumSubjectIds]);
        await tx.query(`INSERT INTO semester_offering (student_id, semester_id, curriculum_subject_id)
          SELECT $1::integer, $2::integer, id FROM unnest($3::integer[]) AS id
          ON CONFLICT (student_id, semester_id, curriculum_subject_id) DO NOTHING`,
        [scope.studentId, input.semesterId, input.curriculumSubjectIds]);
        return read(tx, scope, input.semesterId);
      });
    },
  };
}
