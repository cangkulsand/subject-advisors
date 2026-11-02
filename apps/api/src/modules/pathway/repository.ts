import { neon } from '@neondatabase/serverless';
import type { CurriculumPrerequisiteDetails } from '../../../../../packages/shared/src/curriculum-reference';

export type SqlQuery = (text: string, parameters: string[]) => Promise<unknown>;

export interface RawSubjectRow {
  curriculumSubjectId: number;
  isCompulsory: number;
  subjectCategory: string | null;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  prerequisiteDetails?: CurriculumPrerequisiteDetails | null;
}

export interface RawPrerequisiteRow {
  prerequisiteId: number;
  requirementType: string;
  curriculumSubjectId: number;
  requiredCurriculumSubjectId: number;
}

export interface RawRecordRow {
  subjectId: number;
  status: string;
  grade: string | null;
  recognizedCredits: number;
}

export interface RawRequirementRow {
  requirementId: number;
  requirementType: string;
  requiredCredits: number | null;
  requiredSubjects: number | null;
}

export interface RawSemesterRuleRow {
  ruleId: number;
  semesterType: string;
  curriculumSubjectId: number;
}

export interface RawSemesterRow {
  semesterId: number;
  academicYear: string;
  semesterNo: number;
  semesterType: string;
  maxSubjects: number;
  maxCredits: number;
}

export interface RawPathwayData {
  curriculumId: number;
  curriculumVersion: string;
  programmeName: string;
  totalCreditRequired: number;
  subjects: RawSubjectRow[];
  prerequisites: RawPrerequisiteRow[];
  records: RawRecordRow[];
  requirements: RawRequirementRow[];
  semesterRules: RawSemesterRuleRow[];
  semesters: RawSemesterRow[];
}

export interface PathwayRepository {
  load(clerkUserId: string): Promise<RawPathwayData>;
}

function rowsOf(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid pathway query result');
  return value;
}

function subjectFrom(row: unknown): RawSubjectRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway subject');
  const r = row as Record<string, unknown>;
  if (typeof r.curriculum_subject_id !== 'number' || typeof r.subject_id !== 'number' ||
    typeof r.subject_code !== 'string' || typeof r.subject_name !== 'string' ||
    typeof r.credit_hours !== 'number') throw new Error('Invalid pathway subject');
  return {
    curriculumSubjectId: r.curriculum_subject_id,
    isCompulsory: r.is_compulsory as number,
    subjectCategory: typeof r.subject_category === 'string' ? r.subject_category : null,
    subjectId: r.subject_id,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    creditHours: r.credit_hours,
    prerequisiteDetails: r.prerequisite_details === undefined || r.prerequisite_details === null ? null : r.prerequisite_details as CurriculumPrerequisiteDetails,
  };
}

function prerequisiteFrom(row: unknown): RawPrerequisiteRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway prerequisite');
  const r = row as Record<string, unknown>;
  if (typeof r.prerequisite_id !== 'number' || typeof r.curriculum_subject_id !== 'number' ||
    typeof r.required_curriculum_subject_id !== 'number' || typeof r.requirement_type !== 'string') {
    throw new Error('Invalid pathway prerequisite');
  }
  return {
    prerequisiteId: r.prerequisite_id,
    requirementType: r.requirement_type,
    curriculumSubjectId: r.curriculum_subject_id,
    requiredCurriculumSubjectId: r.required_curriculum_subject_id,
  };
}

function recordFrom(row: unknown): RawRecordRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway record');
  const r = row as Record<string, unknown>;
  if (typeof r.subject_id !== 'number' || typeof r.status !== 'string' ||
    typeof r.recognized_credits !== 'number') throw new Error('Invalid pathway record');
  return {
    subjectId: r.subject_id,
    status: r.status,
    grade: typeof r.grade === 'string' ? r.grade : null,
    recognizedCredits: r.recognized_credits,
  };
}

function requirementFrom(row: unknown): RawRequirementRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway requirement');
  const r = row as Record<string, unknown>;
  if (typeof r.requirement_id !== 'number' || typeof r.requirement_type !== 'string') {
    throw new Error('Invalid pathway requirement');
  }
  return {
    requirementId: r.requirement_id,
    requirementType: r.requirement_type,
    requiredCredits: typeof r.required_credits === 'number' ? r.required_credits : null,
    requiredSubjects: typeof r.required_subjects === 'number' ? r.required_subjects : null,
  };
}

function semesterRuleFrom(row: unknown): RawSemesterRuleRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway semester rule');
  const r = row as Record<string, unknown>;
  if (typeof r.rule_id !== 'number' || typeof r.semester_type !== 'string' ||
    typeof r.curriculum_subject_id !== 'number') throw new Error('Invalid pathway semester rule');
  return {
    ruleId: r.rule_id,
    semesterType: r.semester_type,
    curriculumSubjectId: r.curriculum_subject_id,
  };
}

function semesterFrom(row: unknown): RawSemesterRow {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid pathway semester');
  const r = row as Record<string, unknown>;
  if (typeof r.semester_id !== 'number' || typeof r.academic_year !== 'string' ||
    typeof r.semester_no !== 'number' || typeof r.semester_type !== 'string' ||
    typeof r.max_subjects !== 'number' || typeof r.max_credits !== 'number') {
    throw new Error('Invalid pathway semester');
  }
  return {
    semesterId: r.semester_id,
    academicYear: r.academic_year,
    semesterNo: r.semester_no,
    semesterType: r.semester_type,
    maxSubjects: r.max_subjects,
    maxCredits: r.max_credits,
  };
}

export function createPathwayRepository(query: SqlQuery): PathwayRepository {
  return {
    async load(clerkUserId) {
      const curriculumRows = rowsOf(await query(
        `SELECT sp.curriculum_id, c.curriculum_version, p.programme_name, c.total_credit_required
         FROM student_profile sp
         JOIN curriculum c ON c.curriculum_id = sp.curriculum_id
         JOIN programme p ON p.programme_id = c.programme_id
         WHERE sp.clerk_user_id = $1`, [clerkUserId]));
      const curriculum = curriculumRows[0] as Record<string, unknown> | undefined;
      if (!curriculum || typeof curriculum.curriculum_id !== 'number') {
        throw new Error('Student curriculum unavailable');
      }
      const curriculumId = curriculum.curriculum_id;

      const [subjects, prerequisites, records, requirements, semesterRules, semesters] = await Promise.all([
        query(
          `SELECT cs.curriculum_subject_id, cs.is_compulsory, cs.subject_category,
                  s.subject_id, s.subject_code, COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS subject_name, s.credit_hours,
                  to_jsonb(cs)->'prerequisite_details' AS prerequisite_details
           FROM curriculum_subject cs
           JOIN subject s ON s.subject_id = cs.subject_id
           WHERE cs.curriculum_id = $1
           ORDER BY s.subject_code`, [String(curriculumId)]),
        query(
          `SELECT sp.prerequisite_id, sp.requirement_type,
                  sp.curriculum_subject_id, sp.required_curriculum_subject_id
           FROM subject_prerequisite sp
           JOIN curriculum_subject cs ON cs.curriculum_subject_id = sp.curriculum_subject_id
           WHERE cs.curriculum_id = $1`, [String(curriculumId)]),
        query(
          `SELECT ar.subject_id, ar.status, ar.grade, ar.recognized_credits
           FROM academic_record ar
           JOIN student_profile sp ON sp.student_id = ar.student_id
           WHERE sp.clerk_user_id = $1`, [clerkUserId]),
        query(
          `SELECT cr.requirement_id, cr.requirement_type, cr.required_credits, cr.required_subjects
           FROM curriculum_requirement cr
           WHERE cr.curriculum_id = $1`, [String(curriculumId)]),
        query(
          `SELECT ssr.rule_id, ssr.semester_type, ssr.curriculum_subject_id
           FROM subject_semester_rule ssr
           JOIN curriculum_subject cs ON cs.curriculum_subject_id = ssr.curriculum_subject_id
           WHERE cs.curriculum_id = $1`, [String(curriculumId)]),
        query(
          `SELECT s.semester_id, s.academic_year, s.semester_no, s.semester_type, s.max_subjects, s.max_credits
           FROM academic_semester s
           ORDER BY s.academic_year, s.semester_no`, []),
      ]);

      return {
        curriculumId,
        curriculumVersion: typeof curriculum.curriculum_version === 'string' ? curriculum.curriculum_version : '',
        programmeName: typeof curriculum.programme_name === 'string' ? curriculum.programme_name : '',
        totalCreditRequired: typeof curriculum.total_credit_required === 'number' ? curriculum.total_credit_required : 0,
        subjects: rowsOf(subjects).map(subjectFrom),
        prerequisites: rowsOf(prerequisites).map(prerequisiteFrom),
        records: rowsOf(records).map(recordFrom),
        requirements: rowsOf(requirements).map(requirementFrom),
        semesterRules: rowsOf(semesterRules).map(semesterRuleFrom),
        semesters: rowsOf(semesters).map(semesterFrom),
      };
    },
  };
}

export function createNeonPathwayRepository(databaseUrl: string): PathwayRepository {
  if (!databaseUrl) throw new Error('Database configuration is missing');
  const sql = neon(databaseUrl);
  return createPathwayRepository((text, params) => sql.query(text, params));
}
