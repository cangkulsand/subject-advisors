import { AuthError } from '../auth/errors';
import type { OfferingRepository, OfferingScope } from './contracts';
import type { OfferingSelection, OfferingSemester } from '../../../../../packages/shared/src/offerings/offerings';
import { pickLimitMessage } from '../../../../../packages/shared/src/offerings/offerings';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import { selectionPhase } from '../../../../../packages/shared/src/forecasting/selection-window';
import { parseSave } from './validation';
import { OFFERING_NOT_APPROVED_MESSAGE, PICKS_CLOSED_MESSAGE, PICKS_NOT_OPEN_MESSAGE, SEMESTER_NOT_TARGET_MESSAGE } from './messages';
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

export function createOfferingRepository(db: OfferingDatabase, now: () => Date = () => new Date()): OfferingRepository {
  return {
    read: (scope, semesterId) => read(db, scope, semesterId),
    async replace(scope, value) {
      const input = parseSave(value);
      return db.transaction(async tx => {
        // Serialize replacements for this student, including empty lists. Recheck
        // profile ownership/curriculum inside the transaction to reject stale context.
        const profiles = await tx.query(`
          SELECT curriculum_id, learning_centre_id FROM student_profile
          WHERE student_id = $1 AND clerk_user_id = $2 FOR UPDATE`, [scope.studentId, scope.clerkUserId]);
        if (!profiles[0] || offeringId(profiles[0].curriculum_id) !== scope.curriculumId) {
          throw new AuthError(409, 'CURRICULUM_CHANGED', 'Your academic profile changed. Reload offerings before saving.');
        }
        if (profiles[0].learning_centre_id === null || profiles[0].learning_centre_id === undefined ||
            offeringId(profiles[0].learning_centre_id) !== scope.learningCentreId) {
          throw new AuthError(409, 'PROFILE_CHANGED', 'Your learning centre changed. Reload offerings before saving.');
        }
        // Share-lock every semester row so an admin cannot move the current semester or the
        // selection dates between this check and the write below.
        const semesterRows = await tx.query(`
          SELECT semester_id, academic_year, semester_no, is_current, max_subjects, max_credits,
            to_char(selection_opens_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS selection_opens_at,
            to_char(selection_closes_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS selection_closes_at
          FROM academic_semester ORDER BY academic_year, semester_no FOR SHARE`, []);
        const target = semesterRows.find(row => offeringId(row.semester_id) === input.semesterId);
        if (!target) throw new AuthError(404, 'SEMESTER_NOT_FOUND', 'This semester is no longer available. Reload offerings.');
        const semesters: OfferingSemester[] = semesterRows.map(row => ({
          semesterId: offeringId(row.semester_id), academicYear: String(row.academic_year), semesterNo: row.semester_no as 1 | 2 | 3,
        }));
        const adminCurrent = semesterRows.find(row => row.is_current === true);
        const next = adminCurrent ? nextSemesterAfter(offeringId(adminCurrent.semester_id), semesters) : null;
        if (!next || next.semesterId !== input.semesterId) throw new AuthError(409, 'SEMESTER_NOT_TARGET', SEMESTER_NOT_TARGET_MESSAGE);
        const phase = selectionPhase({
          selectionOpensAt: typeof target.selection_opens_at === 'string' ? target.selection_opens_at : null,
          selectionClosesAt: typeof target.selection_closes_at === 'string' ? target.selection_closes_at : null,
        }, now());
        if (phase === 'CLOSED') throw new AuthError(409, 'PICKS_CLOSED', PICKS_CLOSED_MESSAGE);
        if (phase === 'PLANNING') throw new AuthError(409, 'PICKS_NOT_OPEN', PICKS_NOT_OPEN_MESSAGE);
        const subjects = await tx.query(`
          SELECT curriculum_subject_id FROM curriculum_subject
          WHERE curriculum_id = $1 AND curriculum_subject_id = ANY($2::integer[]) FOR SHARE`,
        [scope.curriculumId, input.curriculumSubjectIds]);
        if (subjects.length !== input.curriculumSubjectIds.length) {
          throw new AuthError(400, 'SUBJECT_OUTSIDE_CURRICULUM', 'A selected subject is no longer in your curriculum. Reload offerings.');
        }
        // Approved set: the decision rows are share-locked, so a coordinator who removes a subject
        // waits for this transaction and then deletes the pick we are about to write.
        const approved = await tx.query(`
          SELECT cs.curriculum_subject_id, s.credit_hours
          FROM curriculum_subject cs
          JOIN subject s ON s.subject_id = cs.subject_id
          JOIN offering_decision d ON d.subject_id = cs.subject_id AND d.status = 'APPROVED'
            AND d.programme_id = $2 AND d.learning_centre_id = $3 AND d.semester_id = $4
          WHERE cs.curriculum_id = $1 AND cs.curriculum_subject_id = ANY($5::integer[]) FOR SHARE OF d`,
        [scope.curriculumId, scope.programmeId, scope.learningCentreId, input.semesterId, input.curriculumSubjectIds]);
        if (approved.length !== input.curriculumSubjectIds.length) {
          throw new AuthError(409, 'OFFERING_NOT_APPROVED', OFFERING_NOT_APPROVED_MESSAGE);
        }
        const maxSubjects = Number(target.max_subjects);
        const maxCredits = Number(target.max_credits);
        const credits = approved.reduce((total, row) => total + Number(row.credit_hours), 0);
        if (input.curriculumSubjectIds.length > maxSubjects || credits > maxCredits) {
          throw new AuthError(409, 'PICK_LIMIT_EXCEEDED', pickLimitMessage({ maxSubjects, maxCredits }));
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
