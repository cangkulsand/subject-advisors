import { AuthError } from '../auth/errors';
import type { OfferingContext, OfferingRequirementType, OfferingSemester, OfferingSubject, OfferingWindow, WithdrawnOffering } from '../../../../../packages/shared/src/offerings/offerings';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import { selectionPhase } from '../../../../../packages/shared/src/forecasting/selection-window';
import type { OfferingSql } from './repository';
import type { StudentOfferingContext } from './contracts';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';
import { readCurriculumPrerequisiteDetails, summarizeCurriculumPrerequisiteDetails } from '../../../../../packages/shared/src/curriculum-reference';

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

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const iso = text(value);
  if (Number.isNaN(Date.parse(iso))) throw new Error('Invalid configured selection date');
  return iso;
}
function limit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('Invalid configured semester pick limit');
  return parsed;
}

/**
 * Read-only consumer of the agreed FOUNDATION/P001 tables; creates no profile or reference data.
 * S2-P004-022: the target is always the semester after the admin current semester (the profile's
 * current_semester_id is not read), and only coordinator-approved subjects are listed.
 */
export function createOfferingContextReader(query: OfferingSql['query'], now: () => Date = () => new Date()) {
  return async (clerkUserId: string, options: { includePrerequisites?: boolean } = {}): Promise<StudentOfferingContext | null> => {
    const profiles = await query(`
      SELECT p.student_id, p.curriculum_id, p.learning_centre_id, c.programme_id, c.curriculum_version, c.total_credit_required, g.programme_name, lc.centre_name
      FROM student_profile p
      JOIN curriculum c ON c.curriculum_id = p.curriculum_id
      JOIN programme g ON g.programme_id = c.programme_id
      LEFT JOIN learning_centre lc ON lc.learning_centre_id = p.learning_centre_id
      WHERE p.clerk_user_id = $1`, [clerkUserId]);
    const profile = profiles[0];
    if (!profile) return null;
    if (profiles.length !== 1) throw new Error('Ambiguous student offering context');
    const studentId = offeringId(profile.student_id);
    const curriculumId = offeringId(profile.curriculum_id);
    const programmeId = offeringId(profile.programme_id);
    const learningCentreId = profile.learning_centre_id === null || profile.learning_centre_id === undefined ? null : offeringId(profile.learning_centre_id);
    const learningCentreName = typeof profile.centre_name === 'string' && profile.centre_name.trim() ? profile.centre_name : null;
    // Semesters first: the target decides which approved subjects and withdrawals are read.
    const semesterRows = await query(`SELECT semester_id, academic_year, semester_no, is_current, max_subjects, max_credits,
        to_char(selection_opens_at AT TIME ZONE 'UTC', ${ISO}) AS selection_opens_at,
        to_char(selection_closes_at AT TIME ZONE 'UTC', ${ISO}) AS selection_closes_at
      FROM academic_semester ORDER BY academic_year, semester_no`, []);
    const semesters: OfferingSemester[] = semesterRows.map(row => {
      if (row.semester_no !== 1 && row.semester_no !== 2 && row.semester_no !== 3) throw new Error('Invalid configured semester number');
      return { semesterId: offeringId(row.semester_id), academicYear: text(row.academic_year), semesterNo: row.semester_no };
    });
    const adminCurrent = semesterRows.find(row => row.is_current === true);
    const target = adminCurrent ? nextSemesterAfter(offeringId(adminCurrent.semester_id), semesters) : null;
    const targetRow = target ? semesterRows.find(row => offeringId(row.semester_id) === target.semesterId) : undefined;
    const selectionOpensAt = targetRow ? optionalIso(targetRow.selection_opens_at) : null;
    const selectionClosesAt = targetRow ? optionalIso(targetRow.selection_closes_at) : null;
    let status: OfferingWindow['status'];
    if (!target) status = 'NO_NEXT_SEMESTER';
    else if (learningCentreId === null) status = 'NO_LEARNING_CENTRE';
    else {
      const phase = selectionPhase({ selectionOpensAt, selectionClosesAt }, now());
      status = phase === 'OPEN' ? 'OPEN' : phase === 'CLOSED' ? 'CLOSED' : selectionOpensAt === null ? 'NOT_SCHEDULED' : 'NOT_OPEN';
    }
    const window: OfferingWindow = { status, targetSemesterId: target?.semesterId ?? null, selectionOpensAt, selectionClosesAt, learningCentreName };
    const showSubjects = target !== null && (status === 'OPEN' || status === 'CLOSED');
    const [subjectRows, approvedRows, withdrawnRows] = await Promise.all([
      // The whole curriculum is read so prerequisites can be resolved to names even when the
      // required subject is not offered; only approved subjects are listed (filtered below).
      showSubjects ? query(`SELECT cs.curriculum_subject_id, cs.subject_id, cs.subject_category, cs.is_compulsory,
          s.subject_code, COALESCE(to_jsonb(cs)->>'display_name',s.subject_name) AS subject_name, s.credit_hours,
          to_jsonb(cs)->'prerequisite_details' AS prerequisite_details
        FROM curriculum_subject cs JOIN subject s ON s.subject_id = cs.subject_id
        WHERE cs.curriculum_id = $1 ORDER BY s.subject_code`, [curriculumId]) : Promise.resolve([]),
      target && showSubjects ? query(`SELECT d.subject_id FROM offering_decision d
        WHERE d.status = 'APPROVED' AND d.programme_id = $1 AND d.learning_centre_id = $2 AND d.semester_id = $3`,
      [programmeId, learningCentreId, target.semesterId]) : Promise.resolve([]),
      target ? query(`SELECT DISTINCT ON (w.subject_id) w.subject_id, s.subject_code, s.subject_name,
          to_char(w.withdrawn_at AT TIME ZONE 'UTC', ${ISO}) AS withdrawn_at, w.withdrawal_id
        FROM offering_pick_withdrawal w JOIN subject s ON s.subject_id = w.subject_id
        WHERE w.student_id = $1 AND w.semester_id = $2
          AND NOT EXISTS (SELECT 1 FROM offering_decision d WHERE d.subject_id = w.subject_id AND d.status = 'APPROVED'
            AND d.programme_id = $3 AND d.learning_centre_id = $4 AND d.semester_id = $2)
        ORDER BY w.subject_id, w.withdrawn_at DESC, w.withdrawal_id DESC`, [studentId, target.semesterId, programmeId, learningCentreId]) : Promise.resolve([]),
    ]);
    const approvedSubjectIds = new Set(approvedRows.map(row => offeringId(row.subject_id)));
    const withdrawnSubjects: WithdrawnOffering[] = withdrawnRows.map(row => ({
      subjectId: offeringId(row.subject_id), code: text(row.subject_code), name: text(row.subject_name), withdrawnAt: text(optionalIso(row.withdrawn_at)),
    })).sort((a, b) => b.withdrawnAt.localeCompare(a.withdrawnAt));
    const limits = targetRow ? { maxSubjects: limit(targetRow.max_subjects), maxCredits: limit(targetRow.max_credits) } : undefined;
    const rawDetailsById = new Map<string, unknown>();
    let subjects: OfferingContext['subjects'] = subjectRows.map(row => {
      const creditHours = typeof row.credit_hours === 'number' ? row.credit_hours :
        typeof row.credit_hours === 'string' && row.credit_hours.trim() ? Number(row.credit_hours) : NaN;
      if (!Number.isFinite(creditHours) || creditHours < 0) throw new Error('Invalid configured subject credits');
      const subjectCategory = row.subject_category;
      const isCompulsory = row.is_compulsory;
      if (subjectCategory !== undefined && subjectCategory !== null && typeof subjectCategory !== 'string') throw new Error('Invalid configured subject category');
      if (isCompulsory !== undefined && isCompulsory !== null && isCompulsory !== 0 && isCompulsory !== 1) throw new Error('Invalid configured compulsory flag');
      const curriculumSubjectId = offeringId(row.curriculum_subject_id);
      if (row.prerequisite_details !== undefined && row.prerequisite_details !== null) rawDetailsById.set(curriculumSubjectId, row.prerequisite_details);
      return {
        curriculumSubjectId,
        subjectId: offeringId(row.subject_id),
        code: text(row.subject_code), name: text(row.subject_name), creditHours,
        subjectCategory: subjectCategory as string | null | undefined,
        ...(isCompulsory === 0 || isCompulsory === 1 ? { isCompulsory } : {}),
      };
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
        const codes = new Set(subjects.map(subject => subject.code));
        if (codes.size !== subjects.length) throw new Error('Duplicate subject codes make prerequisite details ambiguous');
        const newDetails = new Map<string, ReturnType<typeof readCurriculumPrerequisiteDetails>>();
        for (const subject of subjects) {
          const raw = rawDetailsById.get(subject.curriculumSubjectId);
          newDetails.set(subject.curriculumSubjectId, raw === undefined || raw === null ? null : readCurriculumPrerequisiteDetails(raw, codes, subject.code));
        }
        subjects = subjects.map(subject => {
          const details = newDetails.get(subject.curriculumSubjectId);
          if (rawDetailsById.has(subject.curriculumSubjectId) && !details) throw new Error('Invalid configured prerequisite details');
          return {
            ...subject,
            prerequisites: { status: 'available', items: bySource.get(subject.curriculumSubjectId) ?? [],
              ...(details ? { details: summarizeCurriculumPrerequisiteDetails(details) } : {}) },
          };
        });
      } catch (error) {
        if (error instanceof AuthError && (error.status === 401 || error.status === 403)) throw error;
        // Optional catalogue metadata must never make a valid core context unavailable.
        subjects = subjects.map(subject => ({ ...subject, prerequisites: unavailable }));
      }
    }
    const prerequisiteCatalogue = subjects.map(({ prerequisites: _prerequisites, ...subject }) => { void _prerequisites; return subject; });
    subjects = subjects.filter(subject => subject.subjectId !== undefined && approvedSubjectIds.has(subject.subjectId));
    // Reject a concurrent curriculum or learning centre change instead of returning a stale mixed context.
    const current = await query('SELECT curriculum_id, learning_centre_id FROM student_profile WHERE student_id = $1 AND clerk_user_id = $2', [studentId, clerkUserId]);
    if (!current[0] || offeringId(current[0].curriculum_id) !== curriculumId) throw new AuthError(409, 'CURRICULUM_CHANGED', 'Your academic profile changed. Reload offerings.');
    const currentCentre = current[0].learning_centre_id === null || current[0].learning_centre_id === undefined ? null : offeringId(current[0].learning_centre_id);
    if (currentCentre !== learningCentreId) throw new AuthError(409, 'PROFILE_CHANGED', 'Your learning centre changed. Reload offerings.');
    return {
      studentId,
      curriculum: {
        curriculumId, name: text(profile.curriculum_version), programmeName: text(profile.programme_name),
        totalCreditRequired: requiredCredits(profile.total_credit_required),
      },
      ...(target ? { currentSemesterId: target.semesterId } : {}), subjects, semesters,
      window, ...(limits ? { limits } : {}), ...(prerequisiteCatalogue.length ? { prerequisiteCatalogue } : {}), withdrawnSubjects, programmeId, learningCentreId,
    };
  };
}
