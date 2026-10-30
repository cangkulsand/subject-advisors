import { neon } from '@neondatabase/serverless';

export type SqlQuery = (text: string, parameters: string[]) => Promise<unknown>;

export interface RawSubjectRow {
  curriculumSubjectId: number;
  isCompulsory: number;
  subjectCategory: string | null;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
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

export interface RawPathwayData {
  curriculumId: number;
  curriculumVersion: string;
  programmeName: string;
  subjects: RawSubjectRow[];
  prerequisites: RawPrerequisiteRow[];
  records: RawRecordRow[];
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

export function createPathwayRepository(query: SqlQuery): PathwayRepository {
  return {
    async load(clerkUserId) {
      const curriculumRows = rowsOf(await query(
        `SELECT sp.curriculum_id, c.curriculum_version, p.programme_name
         FROM student_profile sp
         JOIN curriculum c ON c.curriculum_id = sp.curriculum_id
         JOIN programme p ON p.programme_id = c.programme_id
         WHERE sp.clerk_user_id = $1`, [clerkUserId]));
      const curriculum = curriculumRows[0] as Record<string, unknown> | undefined;
      if (!curriculum || typeof curriculum.curriculum_id !== 'number') {
        throw new Error('Student curriculum unavailable');
      }
      const curriculumId = curriculum.curriculum_id;

      const [subjects, prerequisites, records] = await Promise.all([
        query(
          `SELECT cs.curriculum_subject_id, cs.is_compulsory, cs.subject_category,
                  s.subject_id, s.subject_code, s.subject_name, s.credit_hours
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
      ]);

      return {
        curriculumId,
        curriculumVersion: typeof curriculum.curriculum_version === 'string' ? curriculum.curriculum_version : '',
        programmeName: typeof curriculum.programme_name === 'string' ? curriculum.programme_name : '',
        subjects: rowsOf(subjects).map(subjectFrom),
        prerequisites: rowsOf(prerequisites).map(prerequisiteFrom),
        records: rowsOf(records).map(recordFrom),
      };
    },
  };
}

export function createNeonPathwayRepository(databaseUrl: string): PathwayRepository {
  if (!databaseUrl) throw new Error('Database configuration is missing');
  const sql = neon(databaseUrl);
  return createPathwayRepository((text, params) => sql.query(text, params));
}
