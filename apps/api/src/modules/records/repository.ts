import type { Query } from '../profile/contracts';
import { P001Error, persistenceError } from '../profile/validation';
import type { AcademicRecord, RecordInput, RecordsRepository } from './contracts';
const columns = `r.record_id AS "recordId",r.subject_id AS "subjectId",r.semester_id AS "semesterId",r.status,
 r.grade,r.recognized_credits AS "recognizedCredits",r.remarks,r.created_at AS "createdAt",
 s.subject_code AS "subjectCode",s.subject_name AS "subjectName",s.credit_hours AS "creditHours",a.academic_year AS "academicYear",a.semester_no AS "semesterNo"`;
function mapped(row: Record<string, unknown>): AcademicRecord {
  const value = row as unknown as AcademicRecord;
  if (!Number.isInteger(value.recordId) || !Number.isInteger(value.recognizedCredits)) throw new Error('Invalid academic record result');
  return { ...value, createdAt: new Date(value.createdAt).toISOString() };
}
export function createRecordsRepository(query: Query): RecordsRepository {
  return {
    async list(userId) {
      const rows = await query(`SELECT ${columns} FROM public.academic_record r JOIN public.student_profile p USING(student_id)
        JOIN public.subject s USING(subject_id) LEFT JOIN public.academic_semester a USING(semester_id)
        WHERE p.clerk_user_id=$1 ORDER BY s.subject_code,a.academic_year DESC NULLS LAST,a.semester_no DESC NULLS LAST,r.record_id`, [userId]);
      return rows.map(mapped);
    },
    async save(userId: string, input: RecordInput, recordId?: number) {
      const parameters = [userId,input.subjectId,input.semesterId,input.status,input.grade,input.recognizedCredits,input.remarks];
      const eligible = `SELECT p.student_id,s.subject_id,CASE WHEN $4::text='COMPLETED' THEN s.credit_hours ELSE $6::integer END AS credits
        FROM public.student_profile p JOIN public.curriculum_subject cs USING(curriculum_id) JOIN public.subject s USING(subject_id)
        WHERE p.clerk_user_id=$1 AND s.subject_id=$2
        AND ($6::integer IS NULL OR ($4::text='COMPLETED' AND $6::integer=s.credit_hours) OR ($4::text<>'COMPLETED' AND $6::integer<=s.credit_hours))`;
      const write = recordId === undefined ? `INSERT INTO public.academic_record(student_id,subject_id,semester_id,status,grade,recognized_credits,remarks)
          SELECT e.student_id,e.subject_id,$3::integer,$4,$5,e.credits,$7 FROM eligible e RETURNING *`
        : `UPDATE public.academic_record r SET subject_id=e.subject_id,semester_id=$3::integer,status=$4,grade=$5,recognized_credits=e.credits,remarks=$7
          FROM eligible e WHERE r.record_id=$8 AND r.student_id=e.student_id RETURNING r.*`;
      try {
        const rows = await query(`WITH eligible AS (${eligible}),saved AS (${write}) SELECT ${columns}
          FROM saved r JOIN public.subject s USING(subject_id) LEFT JOIN public.academic_semester a USING(semester_id)`,
        recordId === undefined ? parameters : [...parameters,recordId]);
        if (!rows[0]) throw new P001Error(recordId === undefined ? 400 : 404,
          recordId === undefined ? 'INVALID_SUBJECT_OR_CREDITS' : 'RECORD_NOT_FOUND',
          recordId === undefined ? 'Select a subject in your curriculum and valid recognized credits.' : 'The record is unavailable or the change is invalid.');
        return mapped(rows[0]);
      } catch (error) { return persistenceError(error); }
    },
  };
}
