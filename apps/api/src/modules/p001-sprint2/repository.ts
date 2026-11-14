import { neon } from '@neondatabase/serverless';
import { P001Error } from '../profile/validation';
import type { Catalogue, CurriculumSnapshot, ProgressSource, Sprint2Repository, SubjectInput } from './contracts';
export interface Command { text: string; params: unknown[] }
export interface Database { query(text: string, params: unknown[]): Promise<Record<string, unknown>[]>; transaction(commands: Command[]): Promise<Record<string, unknown>[][]> }

// Ordered aggregates make the revision stable and include shared subject metadata.
export const curriculumJson = `jsonb_build_object(
 'curriculumId',c.curriculum_id,'programme',g.programme_code || ' — ' || g.programme_name,
 'version',c.curriculum_version,'totalCredits',c.total_credit_required,
 'subjects',coalesce((SELECT jsonb_agg(jsonb_build_object('mappingId',cs.curriculum_subject_id,'subjectId',s.subject_id,
   'code',s.subject_code,'name',s.subject_name,'credits',s.credit_hours,'category',cs.subject_category,'compulsory',cs.is_compulsory=1,
   'semesterTypes',coalesce((SELECT jsonb_agg(sr.semester_type ORDER BY sr.semester_type) FROM public.subject_semester_rule sr
     WHERE sr.curriculum_subject_id=cs.curriculum_subject_id),'[]'::jsonb)) ORDER BY cs.curriculum_subject_id)
   FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id) WHERE cs.curriculum_id=c.curriculum_id),'[]'::jsonb),
 'links',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.prerequisite_id,'from',p.curriculum_subject_id,
   'required',p.required_curriculum_subject_id,'kind',p.requirement_type) ORDER BY p.prerequisite_id)
   FROM public.subject_prerequisite p JOIN public.curriculum_subject cs ON cs.curriculum_subject_id=p.curriculum_subject_id
   WHERE cs.curriculum_id=c.curriculum_id),'[]'::jsonb))`;
export const snapshotSql = `SELECT md5(data::text) AS revision,data FROM (SELECT ${curriculumJson} AS data
 FROM public.curriculum c JOIN public.programme g USING(programme_id) WHERE c.curriculum_id=$1) snapshot`;
export const progressSql = `SELECT jsonb_build_object('curriculum',${curriculumJson},
 'attempts',coalesce((SELECT jsonb_agg(jsonb_build_object('subjectId',r.subject_id,'status',r.status,
   'recognizedCredits',r.recognized_credits,'remarks',r.remarks)) FROM public.academic_record r WHERE r.student_id=p.student_id),'[]'::jsonb),
 'requirements',coalesce((SELECT jsonb_agg(jsonb_build_object('type',q.requirement_type,'credits',q.required_credits,
   'subjects',q.required_subjects) ORDER BY q.requirement_id) FROM public.curriculum_requirement q
   WHERE q.curriculum_id=c.curriculum_id),'[]'::jsonb)) AS source
 FROM public.student_profile p JOIN public.curriculum c USING(curriculum_id) JOIN public.programme g USING(programme_id)
 WHERE p.clerk_user_id=$1`;
const permitted = `current_setting('p001s2.allowed',true)='true'`;
const mapping = `nullif(current_setting('p001s2.mapping_id',true),'')::integer`;
const subject = `nullif(current_setting('p001s2.subject_id',true),'')::integer`;
export function databaseError(error: unknown): never {
  if (error instanceof P001Error) throw error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code === '23505') throw new P001Error(409,'DUPLICATE_CURRICULUM_DATA','This subject code, mapping or relationship already exists.');
  if (code === '23503') throw new P001Error(409,'REFERENCE_CONFLICT','A selected subject is unavailable or still referenced. Reload the curriculum.');
  if (code === '23502') throw new P001Error(400,'INVALID_PREREQUISITE','A selected prerequisite no longer matches a subject in this curriculum. Reload and select it again.');
  if (code === '23514') throw new P001Error(409,'CURRICULUM_CONFLICT','This change violates curriculum rules or would alter recorded credit history. Review prerequisites and existing records.');
  if (code === '40001' || code === '40P01') throw new P001Error(409,'CONCURRENT_EDIT','Another change is being saved. Reload and retry.');
  throw new P001Error(503,'SPRINT2_UNAVAILABLE','Academic information is temporarily unavailable. Please retry.');
}
export function createSprint2Repository(db: Database): Sprint2Repository {
  async function mutate(id: number, revision: string, operations: Command[]): Promise<CurriculumSnapshot> {
    const commands: Command[] = [
      // Match the foundation prerequisite trigger's lock namespace. Shared subject
      // row locks also serialize metadata edits across curriculum versions.
      { text: 'SELECT pg_advisory_xact_lock(260001,$1)', params: [id] },
      { text: `SELECT s.subject_id FROM public.subject s JOIN public.curriculum_subject cs USING(subject_id)
          WHERE cs.curriculum_id=$1 ORDER BY s.subject_id FOR UPDATE OF s`, params: [id] },
      { text: `SELECT set_config('p001s2.allowed',coalesce((SELECT (revision=$2)::text FROM (${snapshotSql}) current_snapshot),'false'),true),
          set_config('p001s2.mapping_id','',true),set_config('p001s2.subject_id','',true)`, params: [id,revision] },
      ...operations,
      { text: `SELECT ${permitted} AS allowed,revision,data FROM (${snapshotSql}) saved`, params: [id] },
    ];
    try {
      const results = await db.transaction(commands), last = results.at(-1)?.[0];
      if (!last) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      if (last.allowed !== true) throw new P001Error(409,'STALE_CURRICULUM','The curriculum changed since you opened it. Reload before saving.');
      return { revision: String(last.revision), data: last.data as CurriculumSnapshot['data'] };
    } catch (error) { return databaseError(error); }
  }
  function semesterCommands(input: SubjectInput): Command[] {
    return [
      { text: `DELETE FROM public.subject_semester_rule WHERE curriculum_subject_id=${mapping} AND ${permitted}`, params: [] },
      { text: `INSERT INTO public.subject_semester_rule(curriculum_subject_id,semester_type)
          SELECT ${mapping},value FROM jsonb_array_elements_text($1::jsonb) WHERE ${mapping} IS NOT NULL AND ${permitted}`, params: [JSON.stringify(input.semesterTypes)] },
    ];
  }
  return {
    async progress(userId) { const rows = await db.query(progressSql,[userId]); return rows[0]?.source as ProgressSource ?? null; },
    async catalogue() {
      const [curricula, subjects] = await Promise.all([
        db.query(`SELECT c.curriculum_id AS "curriculumId",g.programme_code || ' — ' || g.programme_name AS programme,c.curriculum_version AS version
          FROM public.curriculum c JOIN public.programme g USING(programme_id) ORDER BY g.programme_code,c.curriculum_version`,[]),
        db.query(`SELECT subject_id AS "subjectId",subject_code AS code,subject_name AS name,credit_hours AS credits FROM public.subject ORDER BY subject_code`,[]),
      ]);
      return { curricula,subjects } as unknown as Catalogue;
    },
    async curriculum(id) { const rows = await db.query(snapshotSql,[id]); return rows[0] as unknown as CurriculumSnapshot ?? null; },
    async subject(id, mappingId, input) {
      const operations: Command[] = [];
      if (mappingId !== null) {
        operations.push({ text: `SELECT set_config('p001s2.mapping_id',cs.curriculum_subject_id::text,true),set_config('p001s2.subject_id',cs.subject_id::text,true)
          FROM public.curriculum_subject cs WHERE cs.curriculum_id=$1 AND cs.curriculum_subject_id=$2 AND ${permitted}`,params:[id,mappingId] });
        operations.push({ text: `UPDATE public.subject SET subject_code=$1,subject_name=$2,credit_hours=$3 WHERE subject_id=${subject} AND ${permitted}`,params:[input.code,input.name,input.credits] });
        operations.push({ text: `UPDATE public.curriculum_subject SET subject_category=$1,is_compulsory=$2 WHERE curriculum_subject_id=${mapping} AND ${permitted}`,params:[input.category,input.compulsory?1:0] });
      } else {
        operations.push(input.existingSubjectId === null ?
          { text: `WITH inserted AS (INSERT INTO public.subject(subject_code,subject_name,credit_hours,subject_category)
              SELECT $1,$2,$3,$4 WHERE ${permitted} RETURNING subject_id)
            SELECT set_config('p001s2.subject_id',subject_id::text,true) FROM inserted`,params:[input.code,input.name,input.credits,input.category] } :
          { text: `SELECT set_config('p001s2.subject_id',subject_id::text,true) FROM public.subject WHERE subject_id=$1 AND ${permitted}`,params:[input.existingSubjectId] });
        operations.push({ text: `WITH inserted AS (INSERT INTO public.curriculum_subject(curriculum_id,subject_id,subject_category,is_compulsory)
          SELECT $1,${subject},$2,$3 WHERE ${subject} IS NOT NULL AND ${permitted} RETURNING curriculum_subject_id)
          SELECT set_config('p001s2.mapping_id',curriculum_subject_id::text,true) FROM inserted`,params:[id,input.category,input.compulsory?1:0] });
        // Initial mandatory prerequisites (UC24). Identity and canonical code are rechecked
        // against live rows here; an unresolvable selection violates NOT NULL and rolls back.
        operations.push({ text: `INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type)
          SELECT ${mapping},CASE WHEN cs.curriculum_id=$2 AND s.subject_code=selection.code THEN cs.curriculum_subject_id ELSE NULL END,'MANDATORY'
          FROM jsonb_to_recordset($1::jsonb) AS selection("mappingId" integer,code text)
          LEFT JOIN public.curriculum_subject cs ON cs.curriculum_subject_id=selection."mappingId"
          LEFT JOIN public.subject s ON s.subject_id=cs.subject_id
          WHERE ${mapping} IS NOT NULL AND ${permitted}`,params:[JSON.stringify(input.prerequisites??[]),id] });
      }
      const result = await mutate(id,input.revision,[...operations,...semesterCommands(input)]);
      if (mappingId !== null && !result.data.subjects.some(s => s.mappingId === mappingId)) throw new P001Error(404,'SUBJECT_NOT_FOUND','The mapped subject is unavailable.');
      if (mappingId === null && input.existingSubjectId !== null && !result.data.subjects.some(s => s.subjectId === input.existingSubjectId)) throw new P001Error(400,'SUBJECT_NOT_FOUND','Select an existing catalogue subject.');
      return result;
    },
    async dependency(id, linkId, input) {
      return mutate(id,input.revision,[linkId === null ?
        { text: `INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type)
          SELECT $1,$2,$3 WHERE ${permitted}`,params:[input.from,input.required,input.kind] } :
        { text: `UPDATE public.subject_prerequisite SET curriculum_subject_id=$1,required_curriculum_subject_id=$2,requirement_type=$3
          WHERE prerequisite_id=$4 AND curriculum_subject_id IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$5) AND ${permitted}`,params:[input.from,input.required,input.kind,linkId,id] }]);
    },
    async removeDependency(id, linkId, rev) {
      return mutate(id,rev,[{ text: `DELETE FROM public.subject_prerequisite WHERE prerequisite_id=$1
        AND curriculum_subject_id IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$2) AND ${permitted}`,params:[linkId,id] }]);
    },
  };
}
export function neonDatabase(url: string): Database {
  const sql = neon(url);
  return {
    query: async (text,params) => await sql.query(text,params) as Record<string,unknown>[],
    transaction: async commands => await sql.transaction(commands.map(c => sql.query(c.text,c.params))) as Record<string,unknown>[][],
  };
}
