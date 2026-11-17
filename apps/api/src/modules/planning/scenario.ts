import { fromRows, type SavedScenario, type ScenarioRow } from '../../../../../packages/shared/src/planning/saved';
import type { Database } from '../p001-sprint2/repository';

/** The signed-in student's single saved what-if (S3-P004-010): `simulation_scenario` + `simulation_subject`. */
export interface ScenarioRepository {
  read(clerkUserId: string): Promise<SavedScenario | null>;
  replace(clerkUserId: string, rows: ScenarioRow[]): Promise<SavedScenario>;
  remove(clerkUserId: string): Promise<void>;
}

export const SCENARIO_NAME = 'My plan';
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
/** The student's scenario: the oldest one, should a second ever exist. */
const SCENARIO_ID = `(SELECT MIN(ss.scenario_id) FROM public.simulation_scenario ss
  JOIN public.student_profile sp ON sp.student_id = ss.student_id WHERE sp.clerk_user_id = $1)`;

export function createScenarioRepository(db: Database): ScenarioRepository {
  return {
    async read(clerkUserId) {
      const rows = await db.query(
        `SELECT ss.created_at AS scenario_created, sub.curriculum_subject_id, sub.change_type, sub.proposed_semester_id,
                sub.hypothetical_status, sub.created_at AS row_created
         FROM public.simulation_scenario ss
         LEFT JOIN public.simulation_subject sub ON sub.scenario_id = ss.scenario_id
         WHERE ss.scenario_id = ${SCENARIO_ID}
         ORDER BY sub.simulation_subject_id`, [clerkUserId]);
      if (!rows.length) return null;
      const items: ScenarioRow[] = rows.filter(r => r.curriculum_subject_id !== null && r.curriculum_subject_id !== undefined).map(r => ({
        curriculumSubjectId: Number(r.curriculum_subject_id), changeType: String(r.change_type) as ScenarioRow['changeType'],
        proposedSemesterId: r.proposed_semester_id === null || r.proposed_semester_id === undefined ? null : Number(r.proposed_semester_id),
        hypotheticalStatus: r.hypothetical_status === 'FAILED' || r.hypothetical_status === 'WITHDRAWN' ? r.hypothetical_status : null,
      }));
      const times = rows.map(r => iso(r.row_created ?? r.scenario_created)).sort();
      return { changes: fromRows(items), savedAt: times.at(-1)! };
    },
    async replace(clerkUserId, rows) {
      // One batch = one transaction. The profile lock serialises saves, so a student never gets a second scenario.
      const results = await db.transaction([
        { text: 'SELECT student_id FROM public.student_profile WHERE clerk_user_id = $1 FOR UPDATE', params: [clerkUserId] },
        { text: `INSERT INTO public.simulation_scenario (scenario_name, student_id)
                 SELECT $2, sp.student_id FROM public.student_profile sp WHERE sp.clerk_user_id = $1
                 AND NOT EXISTS (SELECT 1 FROM public.simulation_scenario ss WHERE ss.student_id = sp.student_id)`, params: [clerkUserId, SCENARIO_NAME] },
        { text: `DELETE FROM public.simulation_subject WHERE scenario_id = ${SCENARIO_ID}`, params: [clerkUserId] },
        { text: `INSERT INTO public.simulation_subject (scenario_id, curriculum_subject_id, change_type, proposed_semester_id, hypothetical_status)
                 SELECT ${SCENARIO_ID}, r."curriculumSubjectId", r."changeType", r."proposedSemesterId", r."hypotheticalStatus"
                 FROM jsonb_to_recordset($2::jsonb) AS r("curriculumSubjectId" integer, "changeType" varchar(20), "proposedSemesterId" integer,
                   "hypotheticalStatus" varchar(20), ord integer)
                 ORDER BY r.ord`, params: [clerkUserId, JSON.stringify(rows.map((row, ord) => ({ ...row, ord })))] },
        { text: 'SELECT now() AS saved_at', params: [] },
      ]);
      return { changes: fromRows(rows), savedAt: iso(results.at(-1)?.[0]?.saved_at) };
    },
    async remove(clerkUserId) {
      const scenarios = `(SELECT ss.scenario_id FROM public.simulation_scenario ss
        JOIN public.student_profile sp ON sp.student_id = ss.student_id WHERE sp.clerk_user_id = $1)`;
      await db.transaction([
        { text: `DELETE FROM public.simulation_subject WHERE scenario_id IN ${scenarios}`, params: [clerkUserId] },
        { text: `DELETE FROM public.simulation_scenario WHERE scenario_id IN ${scenarios}`, params: [clerkUserId] },
      ]);
    },
  };
}
