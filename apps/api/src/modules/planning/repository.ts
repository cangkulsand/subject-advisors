import type { PlanningInput, PlanningSubject, SemesterRef, SemesterType } from '../../../../../packages/shared/src/planning/contracts';
import { semesterAt } from '../../../../../packages/shared/src/planning/semesters';
import type { Database } from '../p001-sprint2/repository';

/** Raw rows the planning input is built from (one student). Exported for tests. */
export interface PlanningRows {
  profile: { curriculumId: number; programmeId: number; learningCentreId: number; programmeName: string; curriculumVersion: string; totalCredits: number | null };
  subjects: { curriculumSubjectId: number; subjectId: number; subjectCode: string; subjectName: string; creditHours: number; category: string; compulsory: boolean;
    /** `subject.include_in_offering_forecast`: false for subjects a coordinator never decides on (projects, industrial training). */
    inOfferingForecast: boolean }[];
  rules: { curriculumSubjectId: number; semesterType: string }[];
  prerequisites: { curriculumSubjectId: number; requiredCurriculumSubjectId: number; requirementType?: string }[];
  records: { subjectId: number; status: string; recognizedCredits: number; remarks: string | null }[];
  requirements: { requirementType: string; requiredSubjects: number | null; requiredCredits: number | null }[];
  semesters: { semesterId: number; academicYear: string; semesterNo: number; maxSubjects: number; maxCredits: number; isCurrent: boolean }[];
  /** Coordinator decisions for the student's programme and centre in the first planned semester. */
  decisions: { subjectId: number; status: string }[];
}

export interface PlanningRepository { load(clerkUserId: string): Promise<PlanningInput | null> }

/**
 * The semester after the system current one (1 -> 2 -> 3 -> next year's 1), with its configured row ID when the admin
 * has created it (needed for coordinator decisions). Null only when no current semester is set.
 */
export function startSemester(semesters: PlanningRows['semesters']): (SemesterRef & { semesterId: number | null }) | null {
  const current = semesters.find(s => s.isCurrent);
  if (!current) return null;
  const next = semesterAt(current, 1);
  const row = semesters.find(s => s.academicYear === next.academicYear && s.semesterNo === next.semesterNo);
  return { ...next, semesterId: row?.semesterId ?? null };
}

/**
 * A record counts as passed when it is COMPLETED with the subject's full credits, or EXEMPTED with credits between 0
 * and the subject's credits. Remarks are not required: the Subject records page saves "Exempted" immediately and lets
 * the student add remarks later (S3-P004-007). FAILED / WITHDRAWN never count.
 */
function countsAsPassed(record: PlanningRows['records'][number], creditHours: number): boolean {
  if (!Number.isInteger(record.recognizedCredits) || record.recognizedCredits < 0 || record.recognizedCredits > creditHours) return false;
  if (record.status === 'COMPLETED') return record.recognizedCredits === creditHours;
  return record.status === 'EXEMPTED';
}

/** Pure: raw rows -> engine input. */
export function toPlanningInput(rows: PlanningRows): PlanningInput {
  const bySubjectId = new Map(rows.subjects.map(s => [s.subjectId, s]));
  const passed = new Set<number>();
  const earned = new Map<number, number>();
  for (const record of rows.records) {
    const subject = bySubjectId.get(record.subjectId);
    if (!subject || !countsAsPassed(record, subject.creditHours)) continue;
    passed.add(subject.curriculumSubjectId);
    const credits = record.status === 'COMPLETED' ? subject.creditHours : record.recognizedCredits;
    earned.set(subject.curriculumSubjectId, Math.max(earned.get(subject.curriculumSubjectId) ?? 0, credits));
  }
  const recorded: NonNullable<PlanningInput['recorded']> = {};
  for (const record of rows.records) {
    const subject = bySubjectId.get(record.subjectId);
    if (!subject || !countsAsPassed(record, subject.creditHours)) continue;
    const status = record.status === 'COMPLETED' ? 'COMPLETED' : 'EXEMPTED';
    const existing = recorded[subject.curriculumSubjectId];
    if (!existing || record.recognizedCredits > existing.recognizedCredits || (record.recognizedCredits === existing.recognizedCredits && status === 'COMPLETED')) {
      recorded[subject.curriculumSubjectId] = { status, recognizedCredits: record.recognizedCredits };
    }
  }
  const subjects: PlanningSubject[] = rows.subjects.map(s => {
    const corequisites = rows.prerequisites
      .filter(p => p.curriculumSubjectId === s.curriculumSubjectId && p.requirementType === 'COREQUISITE')
      .map(p => p.requiredCurriculumSubjectId);
    return {
      curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours,
      category: s.category, compulsory: s.compulsory,
      semesterTypes: [...new Set(rows.rules.filter(r => r.curriculumSubjectId === s.curriculumSubjectId).map(r => r.semesterType))]
        .filter((t): t is SemesterType => t === 'NORMAL' || t === 'SHORT').sort(),
      prerequisites: rows.prerequisites
        .filter(p => p.curriculumSubjectId === s.curriculumSubjectId && (p.requirementType ?? 'MANDATORY') === 'MANDATORY')
        .map(p => p.requiredCurriculumSubjectId),
      ...(corequisites.length > 0 ? { corequisites } : {}),
    };
  });
  const start = startSemester(rows.semesters);
  const curriculumBySubject = new Map(rows.subjects.map(s => [s.subjectId, s.curriculumSubjectId]));
  // Subjects outside the offering forecast (projects, industrial training) cannot be approved by a coordinator and need
  // no approval, so they are always allowed in the first semester.
  const approvedFirst = start?.semesterId != null && rows.decisions.length
    ? [...rows.decisions.filter(d => d.status === 'APPROVED').map(d => curriculumBySubject.get(d.subjectId)).filter((id): id is number => id !== undefined),
      ...rows.subjects.filter(s => !s.inOfferingForecast).map(s => s.curriculumSubjectId)]
    : null;
  return {
    programmeName: rows.profile.programmeName,
    curriculumVersion: rows.profile.curriculumVersion,
    curriculumId: rows.profile.curriculumId,
    recorded,
    totalCredits: rows.profile.totalCredits,
    earnedCredits: [...earned.values()].reduce((n, c) => n + c, 0),
    subjects,
    requirements: rows.requirements,
    passed: [...passed].sort((a, b) => a - b),
    start: start ? { academicYear: start.academicYear, semesterNo: start.semesterNo } : null,
    limits: rows.semesters.map(s => ({ semesterId: s.semesterId, academicYear: s.academicYear, semesterNo: s.semesterNo, maxSubjects: s.maxSubjects, maxCredits: s.maxCredits })),
    approvedFirst,
  };
}

const num = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

export function createPlanningRepository(db: Database): PlanningRepository {
  return {
    async load(clerkUserId) {
      const [profileRow] = await db.query(
        `SELECT sp.curriculum_id, sp.learning_centre_id, c.programme_id, c.curriculum_version, c.total_credit_required, p.programme_name
         FROM public.student_profile sp
         JOIN public.curriculum c ON c.curriculum_id = sp.curriculum_id
         JOIN public.programme p ON p.programme_id = c.programme_id
         WHERE sp.clerk_user_id = $1`, [clerkUserId]);
      if (!profileRow || profileRow.curriculum_id === null || profileRow.learning_centre_id === null) return null;
      const curriculumId = Number(profileRow.curriculum_id);
      const [subjects, rules, prerequisites, records, requirements, semesters] = await Promise.all([
        db.query(
          `SELECT cs.curriculum_subject_id, s.subject_id, s.subject_code,
                  COALESCE(to_jsonb(cs)->>'display_name', s.subject_name) AS subject_name, s.credit_hours,
                  cs.subject_category, cs.is_compulsory, s.include_in_offering_forecast
           FROM public.curriculum_subject cs JOIN public.subject s ON s.subject_id = cs.subject_id
           WHERE cs.curriculum_id = $1 ORDER BY s.subject_code`, [curriculumId]),
        db.query(
          `SELECT r.curriculum_subject_id, r.semester_type FROM public.subject_semester_rule r
           JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = r.curriculum_subject_id WHERE cs.curriculum_id = $1`, [curriculumId]),
        db.query(
          `SELECT p.curriculum_subject_id, p.required_curriculum_subject_id, p.requirement_type FROM public.subject_prerequisite p
           JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = p.curriculum_subject_id
           WHERE cs.curriculum_id = $1 AND p.requirement_type IN ('MANDATORY', 'COREQUISITE')`, [curriculumId]),
        db.query(
          `SELECT ar.subject_id, ar.status, ar.recognized_credits, ar.remarks FROM public.academic_record ar
           JOIN public.student_profile sp ON sp.student_id = ar.student_id WHERE sp.clerk_user_id = $1`, [clerkUserId]),
        db.query(
          `SELECT requirement_type, required_subjects, required_credits FROM public.curriculum_requirement
           WHERE curriculum_id = $1 ORDER BY requirement_id`, [curriculumId]),
        db.query(
          `SELECT semester_id, academic_year, semester_no, max_subjects, max_credits, is_current FROM public.academic_semester
           ORDER BY academic_year, semester_no`, []),
      ]);
      const semesterRows: PlanningRows['semesters'] = semesters.map(r => ({
        semesterId: Number(r.semester_id), academicYear: String(r.academic_year), semesterNo: Number(r.semester_no),
        maxSubjects: Number(r.max_subjects), maxCredits: Number(r.max_credits), isCurrent: r.is_current === true,
      }));
      // Hotfix 2026-11-28 (owner): for now the plan does not depend on the coordinator's offering decisions, so students may plan
      // any subject in their next semester. With no decisions approvedFirst is null; the planner's approval support stays for later.
      const decisions: Record<string, unknown>[] = [];
      return toPlanningInput({
        profile: {
          curriculumId, programmeId: Number(profileRow.programme_id), learningCentreId: Number(profileRow.learning_centre_id),
          programmeName: String(profileRow.programme_name ?? ''), curriculumVersion: String(profileRow.curriculum_version ?? ''),
          totalCredits: num(profileRow.total_credit_required),
        },
        subjects: subjects.map(r => ({
          curriculumSubjectId: Number(r.curriculum_subject_id), subjectId: Number(r.subject_id), subjectCode: String(r.subject_code),
          subjectName: String(r.subject_name), creditHours: Number(r.credit_hours), category: String(r.subject_category ?? ''), compulsory: Number(r.is_compulsory) === 1,
          inOfferingForecast: r.include_in_offering_forecast !== false,
        })),
        rules: rules.map(r => ({ curriculumSubjectId: Number(r.curriculum_subject_id), semesterType: String(r.semester_type) })),
        prerequisites: prerequisites.map(r => ({ curriculumSubjectId: Number(r.curriculum_subject_id), requiredCurriculumSubjectId: Number(r.required_curriculum_subject_id), requirementType: String(r.requirement_type) })),
        records: records.map(r => ({ subjectId: Number(r.subject_id), status: String(r.status), recognizedCredits: Number(r.recognized_credits ?? 0), remarks: typeof r.remarks === 'string' ? r.remarks : null })),
        requirements: requirements.map(r => ({ requirementType: String(r.requirement_type), requiredSubjects: num(r.required_subjects), requiredCredits: num(r.required_credits) })),
        semesters: semesterRows,
        decisions: decisions.map(r => ({ subjectId: Number(r.subject_id), status: String(r.status) })),
      });
    },
  };
}
