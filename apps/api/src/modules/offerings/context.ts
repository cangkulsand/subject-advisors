import { AuthError } from '../auth/errors';
import type { OfferingContext, OfferingRequirementType, OfferingSemester, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import type { OfferingSql } from './repository';
import type { StudentOfferingContext } from './contracts';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid configured offering context');
  return value;
}
function requiredCredits(value: unknown): number {
  const credits = typeof value === 'number' ? value :
    typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(credits) || credits < 0 || credits > 2147483647) throw new Error('Invalid configured curriculum credit requirement');
  return credits;
}

/** Read-only consumer of the agreed FOUNDATION/P001 tables; creates no profile or reference data. */
export function createOfferingContextReader(query: OfferingSql['query']) {
  return async (clerkUserId: string, options: { includePrerequisites?: boolean } = {}): Promise<StudentOfferingContext | null> => {
    const profiles = await query(`
      SELECT p.student_id, p.curriculum_id, p.current_semester_id, c.curriculum_version, c.total_credit_required, g.programme_name
      FROM student_profile p
      JOIN curriculum c ON c.curriculum_id = p.curriculum_id
      JOIN programme g ON g.programme_id = c.programme_id
      WHERE p.clerk_user_id = $1`, [clerkUserId]);
    const profile = profiles[0];
    if (!profile) return null;
    if (profiles.length !== 1) throw new Error('Ambiguous student offering context');
    const studentId = offeringId(profile.student_id);
    const curriculumId = offeringId(profile.curriculum_id);
    if (profile.current_semester_id === null || profile.current_semester_id === undefined) {
      throw new AuthError(403, 'PROFILE_SETUP_REQUIRED', 'Choose a current academic year and semester in your academic profile before entering offerings.');
    }
    const currentSemesterId = offeringId(profile.current_semester_id);
    const [subjectRows, semesterRows] = await Promise.all([
      query(`SELECT cs.curriculum_subject_id, cs.subject_id, cs.subject_category, cs.is_compulsory,
          s.subject_code, s.subject_name, s.credit_hours
        FROM curriculum_subject cs JOIN subject s ON s.subject_id = cs.subject_id
        WHERE cs.curriculum_id = $1 ORDER BY s.subject_code`, [curriculumId]),
      query('SELECT semester_id, academic_year, semester_no FROM academic_semester ORDER BY academic_year, semester_no', []),
    ]);
    let subjects: OfferingContext['subjects'] = subjectRows.map(row => {
      const creditHours = typeof row.credit_hours === 'number' ? row.credit_hours :
        typeof row.credit_hours === 'string' && row.credit_hours.trim() ? Number(row.credit_hours) : NaN;
      if (!Number.isFinite(creditHours) || creditHours < 0) throw new Error('Invalid configured subject credits');
      const subjectCategory = row.subject_category;
      const isCompulsory = row.is_compulsory;
      if (subjectCategory !== undefined && subjectCategory !== null && typeof subjectCategory !== 'string') throw new Error('Invalid configured subject category');
      if (isCompulsory !== undefined && isCompulsory !== null && isCompulsory !== 0 && isCompulsory !== 1) throw new Error('Invalid configured compulsory flag');
      return {
        curriculumSubjectId: offeringId(row.curriculum_subject_id),
        subjectId: offeringId(row.subject_id),
        code: text(row.subject_code), name: text(row.subject_name), creditHours,
        subjectCategory: subjectCategory as string | null | undefined,
        ...(isCompulsory === 0 || isCompulsory === 1 ? { isCompulsory } : {}),
      };
    });
    const semesters: OfferingSemester[] = semesterRows.map(row => {
      if (row.semester_no !== 1 && row.semester_no !== 2 && row.semester_no !== 3) throw new Error('Invalid configured semester number');
      return { semesterId: offeringId(row.semester_id), academicYear: text(row.academic_year), semesterNo: row.semester_no };
    });
    if (options.includePrerequisites) {
      const unavailable: OfferingSubject['prerequisites'] = { status: 'unavailable' };
      try {
        const rows = await query(`SELECT sp.curriculum_subject_id, sp.required_curriculum_subject_id,
            sp.requirement_type, src.curriculum_id AS source_curriculum_id,
            required.curriculum_id AS required_curriculum_id
          FROM subject_prerequisite sp
          JOIN curriculum_subject src ON src.curriculum_subject_id = sp.curriculum_subject_id
          LEFT JOIN curriculum_subject required ON required.curriculum_subject_id = sp.required_curriculum_subject_id
          WHERE src.curriculum_id = $1`, [curriculumId]);
        const subjectsById = new Map(subjects.map(subject => [subject.curriculumSubjectId, subject]));
        const allowedTypes = new Set<OfferingRequirementType>(['MANDATORY', 'RECOMMENDED', 'COREQUISITE']);
        const seen = new Set<string>();
        const bySource = new Map<string, Array<{ requiredCurriculumSubjectId: string; requirementType: OfferingRequirementType }>>();
        for (const row of rows) {
          const sourceId = offeringId(row.curriculum_subject_id);
          const requiredId = offeringId(row.required_curriculum_subject_id);
          if (row.source_curriculum_id === null || offeringId(row.source_curriculum_id) !== curriculumId ||
              row.required_curriculum_id === null || offeringId(row.required_curriculum_id) !== curriculumId ||
              !subjectsById.has(sourceId) || !subjectsById.has(requiredId) || sourceId === requiredId ||
              typeof row.requirement_type !== 'string' || !allowedTypes.has(row.requirement_type as OfferingRequirementType)) {
            throw new Error('Invalid configured prerequisite metadata');
          }
          const requirementType = row.requirement_type as OfferingRequirementType;
          const key = `${sourceId}:${requiredId}:${requirementType}`;
          if (seen.has(key)) throw new Error('Duplicate configured prerequisite metadata');
          seen.add(key);
          const items = bySource.get(sourceId) ?? [];
          items.push({ requiredCurriculumSubjectId: requiredId, requirementType });
          bySource.set(sourceId, items);
        }
        subjects = subjects.map(subject => ({
          ...subject,
          prerequisites: { status: 'available', items: bySource.get(subject.curriculumSubjectId) ?? [] },
        }));
      } catch (error) {
        if (error instanceof AuthError && (error.status === 401 || error.status === 403)) throw error;
        // Optional catalogue metadata must never make a valid core context unavailable.
        subjects = subjects.map(subject => ({ ...subject, prerequisites: unavailable }));
      }
    }
    // Reject a concurrent curriculum change instead of returning a stale mixed context.
    if (!semesters.some(semester => semester.semesterId === currentSemesterId)) throw new AuthError(409, 'PROFILE_SEMESTER_UNAVAILABLE', 'Your selected semester is no longer configured. Update your academic profile.');
    const current = await query('SELECT curriculum_id, current_semester_id FROM student_profile WHERE student_id = $1 AND clerk_user_id = $2', [studentId, clerkUserId]);
    if (!current[0] || offeringId(current[0].curriculum_id) !== curriculumId) throw new AuthError(409, 'CURRICULUM_CHANGED', 'Your academic profile changed. Reload offerings.');
    if (current[0].current_semester_id === null || offeringId(current[0].current_semester_id) !== currentSemesterId) throw new AuthError(409, 'PROFILE_SEMESTER_CHANGED', 'Your selected semester changed. Reload offerings.');
    return {
      studentId,
      curriculum: {
        curriculumId, name: text(profile.curriculum_version), programmeName: text(profile.programme_name),
        totalCreditRequired: requiredCredits(profile.total_credit_required),
      },
      currentSemesterId, subjects, semesters,
    };
  };
}
