import { OWN_ELIGIBILITY_SQL } from './repository';

export interface SelectionCommand { text: string; params: unknown[] }
export interface OwnSemesterPlan { revision: number; subjectIds: number[]; updatedAt: string | null }
export interface SelectionDatabase {
  query(text: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  transaction(commands: SelectionCommand[]): Promise<Record<string, unknown>[][]>;
}
export interface SelectionSaveContext {
  clerkUserId: string;
  centreId: number;
  programmeId: number;
  sourceSnapshot: Record<string, unknown>;
  studentId: number;
  semesterId: number;
  confirmationId: number;
  sourceRevision: string;
  planRevision: number;
  subjectIds: number[];
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid selection database number');
  return parsed;
};

/** Builds the complete atomic mutation in order for review and isolated database tests. */
export function buildSelectionSaveStatements(context: SelectionSaveContext): SelectionCommand[] {
  const { clerkUserId, centreId, programmeId, sourceSnapshot, studentId, semesterId, confirmationId, sourceRevision, planRevision, subjectIds } = context;
  return [
    { text: `SELECT student_id FROM public.student_profile WHERE clerk_user_id=$1 AND student_id=$2 FOR UPDATE`, params: [clerkUserId, studentId] },
    { text: `SELECT confirmation_id FROM public.offering_confirmation WHERE confirmation_id=$1 AND semester_id=$2 AND programme_id=$3 AND learning_centre_id=$4 FOR SHARE`, params: [confirmationId, semesterId, programmeId, centreId] },
    { text: `SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.offering_confirmation WHERE confirmation_id=$7 AND semester_id=$5 AND pick_deadline > now())
          THEN ('P002_SELECTION_DEADLINE_CLOSED' || coalesce(guard_owner.student_id::text,'missing'))::integer
        WHEN (SELECT to_jsonb(s) FROM (${OWN_ELIGIBILITY_SQL}) s) IS DISTINCT FROM $3::jsonb
          OR coalesce((SELECT revision FROM public.p002_semester_selection WHERE student_id=$4 AND semester_id=$5),0) <> $6
          OR EXISTS (SELECT 1 FROM public.p002_semester_selection m LEFT JOIN public.academic_plan ap ON ap.plan_id=m.plan_id
            WHERE m.student_id=$4 AND m.semester_id=$5 AND (ap.plan_id IS NULL OR ap.student_id<>$4 OR ap.plan_type<>'P002_SEMESTER_SELECTION' OR ap.status<>'PROPOSED'))
          THEN ('P002_SELECTION_STALE' || coalesce(guard_owner.student_id::text,'missing'))::integer
        ELSE 1 END AS guard
      FROM (SELECT 1) AS singleton LEFT JOIN public.student_profile guard_owner ON guard_owner.student_id=$4::integer`, params: [clerkUserId, centreId, JSON.stringify(sourceSnapshot), studentId, semesterId, planRevision, confirmationId] },
    { text: `WITH updated AS (
        UPDATE public.p002_semester_selection
        SET revision=revision+1, confirmation_id=$3, source_revision=$4
        WHERE student_id=$1 AND semester_id=$2
        RETURNING plan_id
      ), new_plan AS (
        INSERT INTO public.academic_plan(plan_name,plan_type,status,student_id)
        SELECT 'Proposed semester selection','P002_SEMESTER_SELECTION','PROPOSED',$1
        WHERE NOT EXISTS (SELECT 1 FROM public.p002_semester_selection WHERE student_id=$1 AND semester_id=$2)
        RETURNING plan_id
      ), new_selection AS (
        INSERT INTO public.p002_semester_selection(student_id,semester_id,plan_id,revision,confirmation_id,source_revision)
        SELECT $1,$2,plan_id,1,$3,$4 FROM new_plan
        RETURNING plan_id
      ) SELECT plan_id FROM updated UNION ALL SELECT plan_id FROM new_selection`, params: [studentId, semesterId, confirmationId, sourceRevision] },
    { text: `DELETE FROM public.plan_subject ps USING public.p002_semester_selection m
      WHERE m.student_id=$1 AND m.semester_id=$2 AND ps.plan_id=m.plan_id`, params: [studentId, semesterId] },
    { text: `INSERT INTO public.plan_subject(plan_id,curriculum_subject_id,semester_id)
      SELECT m.plan_id,cs.curriculum_subject_id,$2
      FROM public.p002_semester_selection m
      JOIN public.curriculum_subject cs ON cs.curriculum_id=(SELECT curriculum_id FROM public.student_profile WHERE student_id=$3)
      JOIN jsonb_array_elements_text($1::jsonb) picked(subject_id) ON cs.subject_id=picked.subject_id::integer
      WHERE m.student_id=$3 AND m.semester_id=$2`, params: [JSON.stringify(subjectIds), semesterId, studentId] },
    { text: `UPDATE public.academic_plan ap SET updated_at=now()
      FROM public.p002_semester_selection m WHERE m.student_id=$1 AND m.semester_id=$2 AND ap.plan_id=m.plan_id`, params: [studentId, semesterId] },
    { text: `SELECT m.revision,ap.updated_at,
        coalesce((SELECT jsonb_agg(cs.subject_id ORDER BY cs.subject_id) FROM public.plan_subject ps
          JOIN public.curriculum_subject cs USING (curriculum_subject_id) WHERE ps.plan_id=m.plan_id AND ps.semester_id=m.semester_id),'[]'::jsonb) AS subject_ids
      FROM public.p002_semester_selection m JOIN public.academic_plan ap USING (plan_id)
      WHERE m.student_id=$1 AND m.semester_id=$2 AND ap.student_id=$1 AND ap.plan_type='P002_SEMESTER_SELECTION'`, params: [studentId, semesterId] },
  ];
}

export function createSemesterSelectionRepository(db: SelectionDatabase) {
  return {
    async readOwnPlan(clerkUserId: string, semesterId: number): Promise<OwnSemesterPlan> {
      const rows = await db.query(`SELECT p.student_id,coalesce(m.revision,0) AS revision,ap.updated_at,
          coalesce((SELECT jsonb_agg(cs.subject_id ORDER BY cs.subject_id) FROM public.plan_subject ps
            JOIN public.curriculum_subject cs USING (curriculum_subject_id)
            WHERE ps.plan_id=m.plan_id AND ps.semester_id=$2),'[]'::jsonb) AS subject_ids
        FROM public.student_profile p
        LEFT JOIN public.p002_semester_selection m ON m.student_id=p.student_id AND m.semester_id=$2
        LEFT JOIN public.academic_plan ap ON ap.plan_id=m.plan_id AND ap.student_id=p.student_id AND ap.plan_type='P002_SEMESTER_SELECTION' AND ap.status='PROPOSED'
        WHERE p.clerk_user_id=$1 AND (m.plan_id IS NULL OR ap.plan_id IS NOT NULL)`, [clerkUserId, semesterId]);
      const row = rows[0];
      if (!row) throw new Error('Selection owner profile unavailable');
      const subjectIdsRaw: unknown = typeof row.subject_ids === 'string' ? JSON.parse(row.subject_ids) : row.subject_ids;
      if (!Array.isArray(subjectIdsRaw)) throw new Error('Invalid stored selection subjects');
      return { revision: integer(row.revision), subjectIds: subjectIdsRaw.map(integer), updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString() };
    },
    async save(context: SelectionSaveContext): Promise<OwnSemesterPlan> {
      const results = await db.transaction(buildSelectionSaveStatements(context));
      const row = results.at(-1)?.[0];
      if (!row) throw new Error('Saved selection row unavailable');
      const subjectIdsRaw: unknown = typeof row.subject_ids === 'string' ? JSON.parse(row.subject_ids) : row.subject_ids;
      if (!Array.isArray(subjectIdsRaw)) throw new Error('Invalid saved selection subjects');
      return { revision: integer(row.revision), subjectIds: subjectIdsRaw.map(integer), updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString() };
    },
  };
}
