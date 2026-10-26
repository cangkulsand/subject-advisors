import type { Profile, ProfileInput, ProfileRepository, Query } from './contracts';
import type { ProfileReader } from '../auth/contracts';
import { P001Error, persistenceError } from './validation';

const select = `SELECT p.student_id AS "studentId",p.student_name AS "studentName",p.matric_no AS "matricNo",
 p.curriculum_id AS "curriculumId",p.weekly_working_hours AS "weeklyWorkingHours",p.available_study_hours AS "availableStudyHours",
 p.created_at AS "createdAt",p.updated_at AS "updatedAt",c.curriculum_version AS "curriculumVersion",
 g.programme_code AS "programmeCode",g.programme_name AS "programmeName"
 FROM public.student_profile p JOIN public.curriculum c USING(curriculum_id) JOIN public.programme g USING(programme_id)`;
function mapped(row: Record<string, unknown>): Profile {
  const value = row as unknown as Profile;
  if (!Number.isInteger(value.studentId) || typeof value.studentName !== 'string' || !Number.isInteger(value.curriculumId)) throw new Error('Invalid profile result');
  return { ...value, createdAt: new Date(value.createdAt).toISOString(), updatedAt: new Date(value.updatedAt).toISOString() };
}
export function createProfileRepository(query: Query): ProfileRepository {
  const find = async (userId: string) => {
    const rows = await query(select + ' WHERE p.clerk_user_id=$1', [userId]);
    return rows[0] ? mapped(rows[0]) : null;
  };
  return {
    find,
    async save(userId: string, input: ProfileInput) {
      try {
        const rows = await query(`WITH saved AS (
          INSERT INTO public.student_profile(clerk_user_id,student_name,matric_no,curriculum_id,weekly_working_hours,available_study_hours)
          SELECT $1,$2,$3,c.curriculum_id,$5,$6 FROM public.curriculum c JOIN public.programme g USING(programme_id)
          WHERE c.curriculum_id=$4 AND coalesce(upper(c.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE'
          ON CONFLICT(clerk_user_id) DO UPDATE SET student_name=EXCLUDED.student_name,matric_no=EXCLUDED.matric_no,
            curriculum_id=EXCLUDED.curriculum_id,weekly_working_hours=EXCLUDED.weekly_working_hours,available_study_hours=EXCLUDED.available_study_hours
          RETURNING *
        ) SELECT p.student_id AS "studentId",p.student_name AS "studentName",p.matric_no AS "matricNo",
          p.curriculum_id AS "curriculumId",p.weekly_working_hours AS "weeklyWorkingHours",p.available_study_hours AS "availableStudyHours",
          p.created_at AS "createdAt",p.updated_at AS "updatedAt",c.curriculum_version AS "curriculumVersion",
          g.programme_code AS "programmeCode",g.programme_name AS "programmeName"
          FROM saved p JOIN public.curriculum c USING(curriculum_id) JOIN public.programme g USING(programme_id)`,
        [userId,input.studentName,input.matricNo,input.curriculumId,input.weeklyWorkingHours,input.availableStudyHours]);
        if (!rows[0]) throw new P001Error(400, 'INVALID_CURRICULUM', 'Select an available configured curriculum.');
        return mapped(rows[0]);
      } catch (error) { return persistenceError(error); }
    },
    async options(userId: string) {
      const [curricula, subjects, semesters] = await Promise.all([
        query(`SELECT c.curriculum_id AS "curriculumId",c.curriculum_version AS "curriculumVersion",g.programme_id AS "programmeId",
          g.programme_code AS "programmeCode",g.programme_name AS "programmeName" FROM public.curriculum c JOIN public.programme g USING(programme_id)
          WHERE coalesce(upper(c.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE' ORDER BY g.programme_code,c.curriculum_version`, []),
        query(`SELECT s.subject_id AS "subjectId",s.subject_code AS "subjectCode",s.subject_name AS "subjectName",s.credit_hours AS "creditHours"
          FROM public.student_profile p JOIN public.curriculum_subject cs USING(curriculum_id) JOIN public.subject s USING(subject_id)
          WHERE p.clerk_user_id=$1 ORDER BY s.subject_code`, [userId]),
        query(`SELECT semester_id AS "semesterId",academic_year AS "academicYear",semester_no AS "semesterNo"
          FROM public.academic_semester ORDER BY academic_year DESC,semester_no DESC`, []),
      ]);
      return { curricula, subjects, semesters } as unknown as Awaited<ReturnType<ProfileRepository['options']>>;
    },
  };
}
export function createProfileReader(repository: ProfileRepository): ProfileReader {
  return { async stateFor(userId) {
    try {
      const p = await repository.find(userId);
      return p && p.studentName.trim() && p.curriculumId > 0 &&
        Number.isInteger(p.weeklyWorkingHours) && p.weeklyWorkingHours! >= 0 &&
        Number.isInteger(p.availableStudyHours) && p.availableStudyHours! >= 0 ? 'COMPLETE' : 'SETUP_REQUIRED';
    } catch { return 'UNAVAILABLE'; }
  } };
}
