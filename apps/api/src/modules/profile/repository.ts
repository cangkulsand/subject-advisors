import type { Profile, ProfileInput, ProfileRepository, Query } from './contracts';
import type { ProfileReader } from '../auth/contracts';
import type { ReferenceCache } from '../../cache/redis';
import { P001Error, persistenceError } from './validation';
import { selectionPhase } from '../../../../../packages/shared/src/forecasting/selection-window';

const curriculumOptionKeys = ['curriculumId', 'curriculumVersion', 'programmeId', 'programmeCode', 'programmeName'];
const semesterOptionKeys = ['semesterId', 'academicYear', 'semesterNo', 'semesterType'];
const subjectOptionKeys = ['subjectId', 'subjectCode', 'subjectName', 'creditHours', 'subjectCategory', 'isCompulsory'];
const subjectGroupOptionKeys = ['category', 'requiredSubjects', 'availableSubjects'];
const curriculumBundleKeys = ['curriculumId', 'subjects', 'subjectGroups'];
const isDatabaseId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
const isNonNegativeDatabaseInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647;
function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function isCurriculumOptionRows(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(row => hasExactKeys(row, curriculumOptionKeys) &&
    isDatabaseId(row.curriculumId) && typeof row.curriculumVersion === 'string' && isDatabaseId(row.programmeId) &&
    typeof row.programmeCode === 'string' && typeof row.programmeName === 'string');
}
function isSemesterOptionRows(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(row => hasExactKeys(row, semesterOptionKeys) &&
    isDatabaseId(row.semesterId) && typeof row.academicYear === 'string' &&
    typeof row.semesterNo === 'number' && Number.isInteger(row.semesterNo) && [1, 2, 3].includes(row.semesterNo) &&
    (row.semesterType === 'NORMAL' && row.semesterNo !== 3 || row.semesterType === 'SHORT' && row.semesterNo === 3));
}
function isSubjectOptionRows(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(row => hasExactKeys(row, subjectOptionKeys) &&
    isDatabaseId(row.subjectId) && typeof row.subjectCode === 'string' && typeof row.subjectName === 'string' &&
    isNonNegativeDatabaseInteger(row.creditHours) && typeof row.subjectCategory === 'string' &&
    (row.isCompulsory === 0 || row.isCompulsory === 1));
}
function isSubjectGroupRows(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(row => hasExactKeys(row, subjectGroupOptionKeys) &&
    typeof row.category === 'string' && (row.requiredSubjects === null || isNonNegativeDatabaseInteger(row.requiredSubjects)) &&
    isNonNegativeDatabaseInteger(row.availableSubjects));
}
function isCurriculumOptionsBundle(value: unknown): value is {
  curriculumId: number; subjects: Record<string, unknown>[]; subjectGroups: Record<string, unknown>[];
} {
  return hasExactKeys(value, curriculumBundleKeys) && isDatabaseId(value.curriculumId) &&
    isSubjectOptionRows(value.subjects) && isSubjectGroupRows(value.subjectGroups);
}

export interface ProfileRepositoryOptions {
  /** Selects the optional curriculum-scoped path after full flag/config validation by composition. */
  curriculumCacheEnabled?: boolean;
  /** Server clock for the learning centre lock; tests inject a fixed time. */
  now?: () => Date;
}

const select = `SELECT p.student_id AS "studentId",p.student_name AS "studentName",p.matric_no AS "matricNo",p.learning_centre_id AS "learningCentreId",
 p.curriculum_id AS "curriculumId",p.current_semester_id AS "currentSemesterId",p.weekly_working_hours AS "weeklyWorkingHours",p.available_study_hours AS "availableStudyHours",
 p.created_at AS "createdAt",p.updated_at AS "updatedAt",c.curriculum_version AS "curriculumVersion",
 g.programme_code AS "programmeCode",g.programme_name AS "programmeName",c.total_credit_required AS "totalCreditRequired"
 FROM public.student_profile p JOIN public.curriculum c USING(curriculum_id) JOIN public.programme g USING(programme_id)`;
function mapped(row: Record<string, unknown>): Profile {
  const value = row as unknown as Profile;
  if (!Number.isInteger(value.studentId) || typeof value.studentName !== 'string' || !Number.isInteger(value.curriculumId)) throw new Error('Invalid profile result');
  if (value.totalCreditRequired !== undefined && value.totalCreditRequired !== null &&
      (!Number.isInteger(value.totalCreditRequired) || value.totalCreditRequired < 0 || value.totalCreditRequired > 2147483647)) throw new Error('Invalid profile curriculum total');
  return { ...value, learningCentreId: value.learningCentreId ?? null, learningCentreLocked: false,
    createdAt: new Date(value.createdAt).toISOString(), updatedAt: new Date(value.updatedAt).toISOString() };
}
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const CENTRE_LOCKED_MESSAGE = 'Your learning centre is locked while subject selection for the next semester is open. It unlocks when the next semester starts.';
export function createProfileRepository(query: Query, referenceCache?: ReferenceCache, options: ProfileRepositoryOptions = {}): ProfileRepository {
  const now = options.now ?? (() => new Date());
  /** True once the next semester's selection has opened (OPEN or CLOSED) and the admin has not yet moved the current semester forward. */
  const selectionStarted = async () => {
    const rows = await query(`SELECT to_char(s.selection_opens_at AT TIME ZONE 'UTC', ${ISO}) AS "selectionOpensAt",
        to_char(s.selection_closes_at AT TIME ZONE 'UTC', ${ISO}) AS "selectionClosesAt"
      FROM public.academic_semester s, public.academic_semester c
      WHERE c.is_current AND (s.academic_year, s.semester_no) > (c.academic_year, c.semester_no)
      ORDER BY s.academic_year, s.semester_no LIMIT 1`, []);
    const row = rows[0];
    if (!row) return false;
    const selectionOpensAt = typeof row.selectionOpensAt === 'string' ? row.selectionOpensAt : null;
    const selectionClosesAt = typeof row.selectionClosesAt === 'string' ? row.selectionClosesAt : null;
    return selectionPhase({ selectionOpensAt, selectionClosesAt }, now()) !== 'PLANNING';
  };
  const find = async (userId: string) => {
    const rows = await query(select + ' WHERE p.clerk_user_id=$1', [userId]);
    if (!rows[0]) return null;
    const profile = mapped(rows[0]);
    // A student without a centre can always set one, so only a saved centre can be locked.
    return profile.learningCentreId === null ? profile : { ...profile, learningCentreLocked: await selectionStarted() };
  };
  return {
    find,
    async save(userId: string, input: ProfileInput) {
      try {
        const existing = (await query('SELECT learning_centre_id AS "learningCentreId" FROM public.student_profile WHERE clerk_user_id=$1', [userId]))[0]?.learningCentreId;
        const savedCentre = typeof existing === 'number' ? existing : null;
        // Changing a saved centre is blocked while selection is open; a student without one may set it at any time.
        const locked = savedCentre !== null && await selectionStarted();
        if (locked && savedCentre !== input.learningCentreId)
          throw new P001Error(409, 'PROFILE_CENTRE_LOCKED', CENTRE_LOCKED_MESSAGE);
        const rows = await query(`WITH saved AS (
          INSERT INTO public.student_profile(clerk_user_id,student_name,matric_no,learning_centre_id,curriculum_id,current_semester_id,weekly_working_hours,available_study_hours)
          SELECT $1,$2,$3,lc.learning_centre_id,c.curriculum_id,s.semester_id,$6,$7 FROM public.curriculum c JOIN public.programme g USING(programme_id)
          JOIN public.academic_semester s ON s.semester_id=$5
          JOIN public.learning_centre lc ON lc.learning_centre_id=$8 AND (lc.is_active OR lc.learning_centre_id=$9)
          WHERE c.curriculum_id=$4 AND coalesce(upper(c.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE'
          ON CONFLICT(clerk_user_id) DO UPDATE SET student_name=EXCLUDED.student_name,matric_no=EXCLUDED.matric_no,
            learning_centre_id=EXCLUDED.learning_centre_id,curriculum_id=EXCLUDED.curriculum_id,current_semester_id=EXCLUDED.current_semester_id,
            weekly_working_hours=EXCLUDED.weekly_working_hours,available_study_hours=EXCLUDED.available_study_hours
          RETURNING *
        ) SELECT p.student_id AS "studentId",p.student_name AS "studentName",p.matric_no AS "matricNo",p.learning_centre_id AS "learningCentreId",
          p.curriculum_id AS "curriculumId",p.current_semester_id AS "currentSemesterId",p.weekly_working_hours AS "weeklyWorkingHours",p.available_study_hours AS "availableStudyHours",
          p.created_at AS "createdAt",p.updated_at AS "updatedAt",c.curriculum_version AS "curriculumVersion",
          g.programme_code AS "programmeCode",g.programme_name AS "programmeName",c.total_credit_required AS "totalCreditRequired"
          FROM saved p JOIN public.curriculum c USING(curriculum_id) JOIN public.programme g USING(programme_id)`,
        [userId,input.studentName,input.matricNo,input.curriculumId,input.currentSemesterId,input.weeklyWorkingHours,input.availableStudyHours,input.learningCentreId,savedCentre]);
        if (!rows[0]) {
          const centres = await query('SELECT learning_centre_id FROM public.learning_centre WHERE learning_centre_id=$1 AND (is_active OR learning_centre_id=$2)', [input.learningCentreId, savedCentre]);
          if (!centres[0]) throw new P001Error(400, 'INVALID_LEARNING_CENTRE', 'Select an available learning centre.');
          const semesters = await query('SELECT semester_id FROM public.academic_semester WHERE semester_id=$1', [input.currentSemesterId]);
          if (!semesters[0]) throw new P001Error(400, 'INVALID_SEMESTER', 'Select a configured academic year and semester.');
          throw new P001Error(400, 'INVALID_CURRICULUM', 'Select an available configured curriculum.');
        }
        return { ...mapped(rows[0]), learningCentreLocked: locked };
      } catch (error) { return persistenceError(error); }
    },
    async options(userId: string) {
      const loadCurricula = () => query(`SELECT c.curriculum_id AS "curriculumId",c.curriculum_version AS "curriculumVersion",g.programme_id AS "programmeId",
          g.programme_code AS "programmeCode",g.programme_name AS "programmeName" FROM public.curriculum c JOIN public.programme g USING(programme_id)
          WHERE coalesce(upper(c.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE' ORDER BY g.programme_code,c.curriculum_version`, []);
      const loadSemesters = () => query(`SELECT semester_id AS "semesterId",academic_year AS "academicYear",semester_no AS "semesterNo",semester_type AS "semesterType"
          FROM public.academic_semester ORDER BY academic_year DESC,semester_no DESC`, []);
      // Active centres, plus the student's saved centre even if it was deactivated so the select can still show it. Not cached: it is tiny and follows admin edits at once.
      const loadCentres = () => query(`SELECT learning_centre_id AS "learningCentreId",centre_code AS "centreCode",centre_name AS "centreName"
          FROM public.learning_centre WHERE is_active OR learning_centre_id=(SELECT learning_centre_id FROM public.student_profile WHERE clerk_user_id=$1)
          ORDER BY centre_code`, [userId]);
      if (options.curriculumCacheEnabled && referenceCache) {
        const association = await query('SELECT curriculum_id AS "curriculumId" FROM public.student_profile WHERE clerk_user_id=$1', [userId]);
        const curriculumId = association[0]?.curriculumId;
        if (curriculumId === undefined || curriculumId === null) {
          const [curricula, semesters, learningCentres] = await Promise.all([
            referenceCache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load: loadCurricula, validate: isCurriculumOptionRows }),
            referenceCache.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadSemesters, validate: isSemesterOptionRows }),
            loadCentres(),
          ]);
          return { curricula, subjects: [], semesters, subjectGroups: [], learningCentres } as unknown as Awaited<ReturnType<ProfileRepository['options']>>;
        }
        if (!isDatabaseId(curriculumId)) throw new Error('Invalid curriculum association result');
        const loadSubjects = () => query(`SELECT s.subject_id AS "subjectId",s.subject_code AS "subjectCode",COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS "subjectName",s.credit_hours AS "creditHours",
            cs.subject_category AS "subjectCategory",cs.is_compulsory AS "isCompulsory"
          FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id)
          WHERE cs.curriculum_id=$1 ORDER BY s.subject_code`, [curriculumId]);
        const loadSubjectGroups = () => query(`WITH category_counts AS (
            SELECT cs.curriculum_id,cs.subject_category AS category,count(*)::integer AS "availableSubjects"
            FROM public.curriculum_subject cs WHERE cs.curriculum_id=$1
            GROUP BY cs.curriculum_id,cs.subject_category
          ), requirement_counts AS (
            SELECT cr.curriculum_id,cr.requirement_type,
              CASE WHEN count(*)=count(cr.required_subjects) AND count(DISTINCT cr.required_subjects)=1
                THEN min(cr.required_subjects)::integer ELSE NULL END AS "requiredSubjects"
            FROM public.curriculum_requirement cr WHERE cr.curriculum_id=$1
            GROUP BY cr.curriculum_id,cr.requirement_type
          )
          SELECT cc.category,rc."requiredSubjects",cc."availableSubjects"
          FROM category_counts cc LEFT JOIN requirement_counts rc ON rc.curriculum_id=cc.curriculum_id
            AND rc.requirement_type=btrim(regexp_replace(upper(cc.category),'[^A-Z0-9]+','_','g'),'_')
          ORDER BY cc.category`, [curriculumId]);
        const loadBundle = async () => {
          const [subjects, subjectGroups] = await Promise.all([loadSubjects(), loadSubjectGroups()]);
          return { curriculumId, subjects, subjectGroups };
        };
        const [curricula, semesters, bundle, learningCentres] = await Promise.all([
          referenceCache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load: loadCurricula, validate: isCurriculumOptionRows }),
          referenceCache.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadSemesters, validate: isSemesterOptionRows }),
          referenceCache.getOrLoad({ kind: 'curriculum-options', curriculumId, ttlSeconds: 300, load: loadBundle, validate: isCurriculumOptionsBundle }),
          loadCentres(),
        ]);
        return { curricula, subjects: bundle.subjects, semesters, subjectGroups: bundle.subjectGroups, learningCentres } as unknown as Awaited<ReturnType<ProfileRepository['options']>>;
      }
      const [curricula, subjects, semesters, subjectGroups, learningCentres] = await Promise.all([
        referenceCache
          ? referenceCache.getOrLoad({ kind: 'curricula', ttlSeconds: 300, load: loadCurricula, validate: isCurriculumOptionRows })
          : loadCurricula(),
        query(`SELECT s.subject_id AS "subjectId",s.subject_code AS "subjectCode",COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS "subjectName",s.credit_hours AS "creditHours",
            cs.subject_category AS "subjectCategory",cs.is_compulsory AS "isCompulsory"
          FROM public.student_profile p JOIN public.curriculum_subject cs USING(curriculum_id) JOIN public.subject s USING(subject_id)
          WHERE p.clerk_user_id=$1 ORDER BY s.subject_code`, [userId]),
        referenceCache
          ? referenceCache.getOrLoad({ kind: 'semesters', ttlSeconds: 60, load: loadSemesters, validate: isSemesterOptionRows })
          : loadSemesters(),
        query(`WITH owner_curriculum AS (
            SELECT curriculum_id FROM public.student_profile WHERE clerk_user_id=$1
          ), category_counts AS (
            SELECT cs.curriculum_id,cs.subject_category AS category,count(*)::integer AS "availableSubjects"
            FROM owner_curriculum oc JOIN public.curriculum_subject cs USING(curriculum_id)
            GROUP BY cs.curriculum_id,cs.subject_category
          ), requirement_counts AS (
            SELECT cr.curriculum_id,cr.requirement_type,
              CASE WHEN count(*)=count(cr.required_subjects) AND count(DISTINCT cr.required_subjects)=1
                THEN min(cr.required_subjects)::integer ELSE NULL END AS "requiredSubjects"
            FROM owner_curriculum oc JOIN public.curriculum_requirement cr USING(curriculum_id)
            GROUP BY cr.curriculum_id,cr.requirement_type
          )
          SELECT cc.category,rc."requiredSubjects",cc."availableSubjects"
          FROM category_counts cc LEFT JOIN requirement_counts rc ON rc.curriculum_id=cc.curriculum_id
            AND rc.requirement_type=btrim(regexp_replace(upper(cc.category),'[^A-Z0-9]+','_','g'),'_')
          ORDER BY cc.category`, [userId]),
        loadCentres(),
      ]);
      return { curricula, subjects, semesters, subjectGroups, learningCentres } as unknown as Awaited<ReturnType<ProfileRepository['options']>>;
    },
  };
}
export function createProfileReader(repository: ProfileRepository): ProfileReader {
  return { async stateFor(userId) {
    try {
      const p = await repository.find(userId);
      // A matric number is required (S2-P004-016): coordinators identify portal students by it in the forecast student list.
      // A learning centre is required too (S2-P004-023): it decides which approved offerings the student sees.
      return p && p.studentName.trim() && p.matricNo?.trim() && Number.isInteger(p.learningCentreId) && p.learningCentreId! > 0 && p.curriculumId > 0 &&
        Number.isInteger(p.currentSemesterId) && p.currentSemesterId! > 0 &&
        Number.isInteger(p.weeklyWorkingHours) && p.weeklyWorkingHours! >= 0 &&
        Number.isInteger(p.availableStudyHours) && p.availableStudyHours! >= 0 ? 'COMPLETE' : 'SETUP_REQUIRED';
    } catch { return 'UNAVAILABLE'; }
  } };
}
