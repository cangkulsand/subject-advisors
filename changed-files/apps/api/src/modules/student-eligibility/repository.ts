import type { StudentEligibilityReader } from './routes';
import type { StudentEligibilityInput } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import type { ForecastSubjectOption } from '../../../../../packages/shared/src/forecasting/contracts';
import type { EngineCurriculum, EngineRecord } from '../../../../../packages/shared/src/forecasting/engine/types';
import { fingerprint } from '../../../../../packages/shared/src/forecasting/engine/hash';
import { P002_ELIGIBILITY_POLICY_VERSION } from '../../../../../packages/shared/src/forecasting/p002-eligibility-policy';
import { readCurriculumPrerequisiteDetails, summarizeCurriculumPrerequisiteDetails } from '../../../../../packages/shared/src/curriculum-reference';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import { DEFAULT_STUDENT_CENTRE_ID } from '../forecasting/scope-provider';
import { AuthError } from '../auth/errors';

type Row = Record<string, unknown>;
export type EligibilityQuery = (text: string, values: unknown[]) => Promise<Row[]>;
export const CENTRE_BASIS = 'Your campus is currently mapped to Kuala Lumpur. Please ask your coordinator to review this if you study at a different centre.';
const integer = (value: unknown): number => {
  const parsed = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(parsed)) throw new Error('Invalid eligibility database number');
  return parsed;
};
const nullableInteger = (value: unknown) => value == null ? null : integer(value);
const text = (value: unknown) => String(value ?? '');
function rows(value: unknown): Row[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid eligibility database rows');
  return parsed as Row[];
}

/** A single SELECT gives every dependent read the same PostgreSQL statement snapshot.
 * No other student's records, manual selections or forecast lifecycle status are read.
 * Centre is the existing main-project mapping, not a cross-centre fallback.
 */
export const OWN_ELIGIBILITY_SQL = `WITH owner AS (
  SELECT p.student_id, p.curriculum_id, c.programme_id, c.curriculum_version, c.total_credit_required, g.programme_name
  FROM public.student_profile p JOIN public.curriculum c USING (curriculum_id) JOIN public.programme g USING (programme_id)
  WHERE p.clerk_user_id = $1
), subjects AS (
  SELECT cs.curriculum_subject_id, cs.curriculum_id, s.subject_id, s.subject_code,
    COALESCE(to_jsonb(cs)->>'display_name', s.subject_name) AS subject_name,
    s.credit_hours, s.class_type, s.include_in_offering_forecast,
    to_jsonb(cs)->'prerequisite_details' AS prerequisite_details
  FROM owner o JOIN public.curriculum_subject cs USING (curriculum_id) JOIN public.subject s USING (subject_id)
)
SELECT o.*,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.academic_year,a.semester_no), '[]'::jsonb)
    FROM public.academic_semester a) AS semesters,
  (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.subject_code), '[]'::jsonb) FROM subjects s) AS subjects,
  (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.prerequisite_id), '[]'::jsonb)
    FROM public.subject_prerequisite p JOIN subjects s USING (curriculum_subject_id)) AS links,
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rule_id), '[]'::jsonb)
    FROM public.subject_semester_rule r JOIN subjects s USING (curriculum_subject_id)) AS rules,
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.requirement_id), '[]'::jsonb)
    FROM public.curriculum_requirement r WHERE r.curriculum_id=o.curriculum_id) AS requirements,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('subject_id',r.subject_id,'status',r.status,
      'semester_id',r.semester_id,'recognized_credits',r.recognized_credits) ORDER BY r.record_id), '[]'::jsonb)
    FROM public.academic_record r JOIN subjects s USING (subject_id) WHERE r.student_id=o.student_id) AS records,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('confirmation_id',c.confirmation_id,'semester_id',c.semester_id,
      'revision',c.revision,'updated_at',c.updated_at,'pick_deadline',c.pick_deadline,'offerings',
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('confirmed_offering_id',f.confirmed_offering_id,
        'subject_id',f.subject_id,'status',f.status) ORDER BY f.confirmed_offering_id), '[]'::jsonb)
       FROM public.confirmed_offering f WHERE f.confirmation_id=c.confirmation_id)) ORDER BY c.confirmation_id), '[]'::jsonb)
    FROM public.offering_confirmation c JOIN public.learning_centre lc ON lc.learning_centre_id=c.learning_centre_id AND lc.is_active
    WHERE c.programme_id=o.programme_id AND c.learning_centre_id=$2::integer) AS confirmations
FROM owner o`;

function curriculumFrom(head: Row): EngineCurriculum {
  const curriculumId = integer(head.curriculum_id), subjectRows = rows(head.subjects), linkRows = rows(head.links);
  const codes = new Set(subjectRows.map(row => text(row.subject_code)));
  const subjects = subjectRows.map((row): ForecastSubjectOption => {
    const curriculumSubjectId = integer(row.curriculum_subject_id);
    let conditionalPrerequisites: ForecastSubjectOption['conditionalPrerequisites'] = { status: 'UNAVAILABLE', reason: 'No conditional prerequisite details are configured.' };
    if (row.prerequisite_details != null) {
      const raw: unknown = typeof row.prerequisite_details === 'string' ? JSON.parse(row.prerequisite_details) : row.prerequisite_details;
      const details = readCurriculumPrerequisiteDetails(raw, codes, text(row.subject_code));
      if (!details) throw new AuthError(503, 'CATALOGUE_INVALID', 'Prerequisite configuration needs review by the coordinator.');
      conditionalPrerequisites = { status: 'AVAILABLE', details: summarizeCurriculumPrerequisiteDetails(details) };
    }
    return { curriculumSubjectId, curriculumId, subjectId: integer(row.subject_id), subjectCode: text(row.subject_code), subjectName: text(row.subject_name),
      creditHours: integer(row.credit_hours), classType: row.class_type as ForecastSubjectOption['classType'],
      includeInOfferingForecast: row.include_in_offering_forecast === true, exclusionReason: row.include_in_offering_forecast === true ? null : 'Excluded from initial offering demand.',
      conditionalPrerequisites, prerequisiteLinks: linkRows.filter(link => integer(link.curriculum_subject_id) === curriculumSubjectId).map(link => ({
        prerequisiteId: integer(link.prerequisite_id), curriculumSubjectId, requiredCurriculumSubjectId: integer(link.required_curriculum_subject_id),
        requirementType: link.requirement_type as 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE',
      })) };
  });
  const subjectSemesterRules = rows(head.rules).map(row => ({ ruleId: integer(row.rule_id), curriculumSubjectId: integer(row.curriculum_subject_id), semesterType: row.semester_type as 'NORMAL' | 'SHORT' }));
  const requirements = rows(head.requirements).map(row => ({ requirementId: integer(row.requirement_id), curriculumId, requirementType: text(row.requirement_type), requiredCredits: nullableInteger(row.required_credits), requiredSubjects: nullableInteger(row.required_subjects) }));
  return { curriculumId, curriculumVersion: text(head.curriculum_version), totalCreditsRequired: nullableInteger(head.total_credit_required), subjects, subjectSemesterRules, requirements,
    catalogueFingerprint: fingerprint({ subjects, subjectSemesterRules, requirements }) };
}

export function createStudentEligibilityReader(query: EligibilityQuery): StudentEligibilityReader {
  return { async readOwnEligibility(clerkUserId) {
    const result = await query(OWN_ELIGIBILITY_SQL, [clerkUserId, DEFAULT_STUDENT_CENTRE_ID]);
    if (result.length > 1) throw new Error('Duplicate eligibility owner rows');
    const head = result[0];
    if (!head) throw new AuthError(409, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile before checking eligible subjects.');
    const internal = { studentId: integer(head.student_id), sourceSnapshot: JSON.parse(JSON.stringify(head)) as Record<string, unknown>,
      sourceRevision: fingerprint({ policyVersion: P002_ELIGIBILITY_POLICY_VERSION, snapshot: head }) };
    const semesterRows = rows(head.semesters), current = semesterRows.filter(row => row.is_current === true);
    if (current.length !== 1) throw new AuthError(409, 'CURRENT_SEMESTER_UNAVAILABLE', 'The system administrator must set the current academic semester.');
    const semesters = semesterRows.map(row => ({ semesterId: String(integer(row.semester_id)), academicYear: text(row.academic_year), semesterNo: integer(row.semester_no) as 1 | 2 | 3 }));
    const next = nextSemesterAfter(String(integer(current[0]!.semester_id)), semesters);
    if (!next) throw new AuthError(409, 'NO_NEXT_SEMESTER', 'The next academic semester has not been configured yet.');
    const targetRow = semesterRows.find(row => String(row.semester_id) === next.semesterId)!;
    const scope = { programmeId: integer(head.programme_id), learningCentreId: DEFAULT_STUDENT_CENTRE_ID, targetSemesterId: Number(next.semesterId) };
    const confirmation = rows(head.confirmations).find(row => integer(row.semester_id) === scope.targetSemesterId);
    const semesterTypeLabel = text(targetRow.semester_type) === 'SHORT' ? 'Short semester' : 'Normal semester';
    const scopeLabels = { programmeName: text(head.programme_name), learningCentreName: 'Kuala Lumpur', targetSemesterLabel: `${next.academicYear} · Semester ${next.semesterNo} (${semesterTypeLabel})` };
    if (!confirmation) return { input: null, emptyScope: scope, centreBasis: CENTRE_BASIS, scopeLabels, internal };
    const curriculum = curriculumFrom(head);
    const creditBySubject = new Map(curriculum.subjects.map(subject => [subject.subjectId, subject.creditHours]));
    const records: EngineRecord[] = rows(head.records).map(row => {
      if (!['COMPLETED', 'EXEMPTED', 'FAILED', 'WITHDRAWN', 'IN_PROGRESS'].includes(text(row.status))) throw new Error('Invalid academic record status');
      const subjectId = integer(row.subject_id), rawCredits = nullableInteger(row.recognized_credits);
      const maximum = creditBySubject.get(subjectId);
      const recognizedCredits = rawCredits !== null && maximum !== undefined && rawCredits >= 0 && rawCredits <= maximum ? rawCredits : null;
      return { subjectId, status: row.status === 'WITHDRAWN' ? 'FAILED' : row.status as EngineRecord['status'], semesterId: nullableInteger(row.semester_id), recognizedCredits: row.status === 'WITHDRAWN' ? 0 : recognizedCredits };
    });
    const confirmedAt = new Date(text(confirmation.updated_at)).toISOString();
    const input: StudentEligibilityInput = { scope, confirmationId: integer(confirmation.confirmation_id), confirmationRevision: integer(confirmation.revision), confirmedAt, pickDeadline: new Date(text(confirmation.pick_deadline)).toISOString(),
      curriculum, student: { externalReference: 'own-profile', studentName: null, curriculumId: integer(head.curriculum_id), cohortStatus: 'ACTIVE', historyCompleteness: records.length ? 'COMPLETE' : 'UNKNOWN', records },
      target: { semesterId: scope.targetSemesterId, semesterType: targetRow.semester_type as 'NORMAL' | 'SHORT', maxSubjects: integer(targetRow.max_subjects), maxCredits: integer(targetRow.max_credits) },
      rejectedRows: 0, confirmedSubjects: rows(confirmation.offerings).map(row => {
        if (!['CONFIRMED', 'WITHDRAWN'].includes(text(row.status))) throw new Error('Invalid confirmation status');
        return { subjectId: integer(row.subject_id), confirmedOfferingId: integer(row.confirmed_offering_id), status: row.status as 'CONFIRMED' | 'WITHDRAWN' };
      }) };
    return { input, centreBasis: CENTRE_BASIS, scopeLabels, internal };
  } };
}
