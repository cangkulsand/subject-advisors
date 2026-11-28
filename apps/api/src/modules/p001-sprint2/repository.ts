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
  async function mutate(id: number, revision: string, operations: Command[], actor: string, reason: string): Promise<CurriculumSnapshot> {
    return (await run(id, revision, operations, actor, reason)).snapshot;
  }
  async function run(id: number, revision: string, operations: Command[], actor: string, reason: string): Promise<{ snapshot: CurriculumSnapshot; results: Record<string, unknown>[][] }> {
    const commands: Command[] = [
      // The 0018 audit triggers record every change under this actor and reason (S3-P004-041).
      { text: "SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", params: [actor, reason] },
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
      return { snapshot: await withShared({ revision: String(last.revision), data: last.data as CurriculumSnapshot['data'] }), results };
    } catch (error) { return databaseError(error); }
  }
  /** Adds, per subject, the other programmes whose curricula use the same shared subject. Kept out of the revision. */
  async function withShared(snapshot: CurriculumSnapshot): Promise<CurriculumSnapshot> {
    const rows = await db.query(`SELECT mine.curriculum_subject_id AS "mappingId", g.programme_id AS "programmeId", g.programme_code AS "programmeCode"
      FROM public.curriculum_subject mine JOIN public.curriculum_subject other ON other.subject_id=mine.subject_id AND other.curriculum_id<>mine.curriculum_id
      JOIN public.curriculum c ON c.curriculum_id=other.curriculum_id JOIN public.programme g ON g.programme_id=c.programme_id
      JOIN public.curriculum me ON me.curriculum_id=mine.curriculum_id
      WHERE mine.curriculum_id=$1 AND g.programme_id<>me.programme_id
      GROUP BY 1,2,3 ORDER BY 1,3`, [snapshot.data.curriculumId]);
    const shared = new Map<number, { programmeId: number; programmeCode: string }[]>();
    for (const row of rows) { const key = Number(row.mappingId); shared.set(key, [...(shared.get(key) ?? []), { programmeId: Number(row.programmeId), programmeCode: String(row.programmeCode) }]); }
    const requirements = (await db.query(`SELECT requirement_type AS type, required_credits AS credits, required_subjects AS subjects
      FROM public.curriculum_requirement WHERE curriculum_id=$1 ORDER BY requirement_id`, [snapshot.data.curriculumId]))
      .map(row => ({ type: String(row.type), credits: row.credits == null ? null : Number(row.credits), subjects: row.subjects == null ? null : Number(row.subjects) }));
    return { ...snapshot, data: { ...snapshot.data, requirements, subjects: snapshot.data.subjects.map(s => ({ ...s, sharedWith: shared.get(s.mappingId) ?? [] })) } };
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
    async catalogue(programmeIds) {
      const [curricula, subjects] = await Promise.all([
        db.query(`SELECT c.curriculum_id AS "curriculumId",g.programme_code || ' — ' || g.programme_name AS programme,c.curriculum_version AS version
          FROM public.curriculum c JOIN public.programme g USING(programme_id) WHERE $1::integer[] IS NULL OR g.programme_id=ANY($1::integer[]) ORDER BY g.programme_code,c.curriculum_version`,[programmeIds ?? null]),
        db.query(`SELECT subject_id AS "subjectId",subject_code AS code,subject_name AS name,credit_hours AS credits FROM public.subject ORDER BY subject_code`,[]),
      ]);
      return { curricula,subjects } as unknown as Catalogue;
    },
    async curriculum(id) { const rows = await db.query(snapshotSql,[id]); const snapshot = rows[0] as unknown as CurriculumSnapshot | undefined; return snapshot ? withShared(snapshot) : null; },
    async curriculumProgrammeId(id) { const rows = await db.query('SELECT programme_id AS "programmeId" FROM public.curriculum WHERE curriculum_id=$1',[id]); return rows[0] ? Number(rows[0].programmeId) : null; },
    async subjectUse(mappingId) {
      // Saved picks (any semester) and graduation plans keep the mapping (ON DELETE RESTRICT), so they block a removal.
      const rows = await db.query(`SELECT (SELECT count(DISTINCT o.student_id) FROM public.semester_offering o WHERE o.curriculum_subject_id=$1)::integer AS picks,
          (SELECT count(DISTINCT p.plan_id) FROM public.plan_subject p WHERE p.curriculum_subject_id=$1)::integer AS plans,
          coalesce((SELECT array_agg(DISTINCT s.academic_year||' S'||s.semester_no) FROM public.semester_offering o JOIN public.academic_semester s USING(semester_id) WHERE o.curriculum_subject_id=$1),'{}') AS semesters`,[mappingId]);
      const row = rows[0] ?? {};
      return { picks: Number(row.picks ?? 0), plans: Number(row.plans ?? 0), semesters: [...((row.semesters as string[] | undefined) ?? [])].sort() };
    },
    async removeSubject(id, mappingId, rev, reason, actor) {
      // Takes the subject out of this curriculum only: scenario rows, links on either side, semester rules, then the mapping.
      // The shared subject row, academic records and offering decisions are kept. Each delete is audited (0018).
      const owned = `curriculum_subject_id=$1 AND curriculum_subject_id IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$2)`;
      const commands: Command[] = [
        { text: `WITH gone AS (DELETE FROM public.simulation_subject WHERE ${owned} AND ${permitted} RETURNING 1) SELECT count(*)::integer AS n FROM gone`, params: [mappingId,id] },
        { text: `WITH gone AS (DELETE FROM public.subject_prerequisite WHERE (curriculum_subject_id=$1 OR required_curriculum_subject_id=$1)
            AND $1 IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$2) AND ${permitted} RETURNING 1) SELECT count(*)::integer AS n FROM gone`, params: [mappingId,id] },
        { text: `DELETE FROM public.subject_semester_rule WHERE ${owned} AND ${permitted}`, params: [mappingId,id] },
        { text: `DELETE FROM public.curriculum_subject WHERE curriculum_subject_id=$1 AND curriculum_id=$2 AND ${permitted}`, params: [mappingId,id] },
      ];
      const { snapshot, results } = await run(id, rev, commands, actor, reason);
      // results: [context, lock, lock, guard, scenarios, links, rules, mapping, final]
      const scenarioRows = Number(results[4]?.[0]?.n ?? 0), prerequisiteLinks = Number(results[5]?.[0]?.n ?? 0);
      return { ...snapshot, removed: { scenarioRows, prerequisiteLinks } };
    },
    async subject(id, mappingId, input, actor) {
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
      const result = await mutate(id,input.revision,[...operations,...semesterCommands(input)],actor,input.reason);
      if (mappingId !== null && !result.data.subjects.some(s => s.mappingId === mappingId)) throw new P001Error(404,'SUBJECT_NOT_FOUND','The mapped subject is unavailable.');
      if (mappingId === null && input.existingSubjectId !== null && !result.data.subjects.some(s => s.subjectId === input.existingSubjectId)) throw new P001Error(400,'SUBJECT_NOT_FOUND','Select an existing catalogue subject.');
      return result;
    },
    async dependency(id, linkId, input, actor) {
      return mutate(id,input.revision,[linkId === null ?
        { text: `INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type)
          SELECT $1,$2,$3 WHERE ${permitted}`,params:[input.from,input.required,input.kind] } :
        { text: `UPDATE public.subject_prerequisite SET curriculum_subject_id=$1,required_curriculum_subject_id=$2,requirement_type=$3
          WHERE prerequisite_id=$4 AND curriculum_subject_id IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$5) AND ${permitted}`,params:[input.from,input.required,input.kind,linkId,id] }],actor,input.reason);
    },
    async removeDependency(id, linkId, rev, reason, actor) {
      return mutate(id,rev,[{ text: `DELETE FROM public.subject_prerequisite WHERE prerequisite_id=$1
        AND curriculum_subject_id IN (SELECT curriculum_subject_id FROM public.curriculum_subject WHERE curriculum_id=$2) AND ${permitted}`,params:[linkId,id] }],actor,reason);
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
