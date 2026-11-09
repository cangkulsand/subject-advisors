import type { ForecastScope, Int32Id, UncertaintyReason } from './contracts';
import { buildStudentContext, indexCurriculum, type EngineCurriculum, type EngineStudent, type EngineTargetSemester } from './engine';
import { evaluateP002StudentSubject, prerequisitePolicyExplanation } from './p002-eligibility-policy';

export interface ConfirmedSubject { subjectId: Int32Id; status: 'CONFIRMED' | 'WITHDRAWN'; confirmedOfferingId: Int32Id }
export interface StudentEligibilityInput {
  scope: ForecastScope; confirmationId: Int32Id; confirmationRevision: number; confirmedAt: string;
  student: EngineStudent; curriculum: EngineCurriculum; target: EngineTargetSemester;
  confirmedSubjects: ConfirmedSubject[]; rejectedRows: number; pickDeadline?: string;
}
export type EligibilityResult =
  | { subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; status: 'ELIGIBLE'; explanation: string }
  | { subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; status: 'CONDITIONAL'; requiredConcurrentSubjectIds: Int32Id[]; explanation: string }
  | { subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; status: 'INELIGIBLE'; reason: 'PASSED' | 'PREREQUISITE_NOT_MET' | 'NOT_OFFERED'; explanation: string }
  | { subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; status: 'UNCERTAIN'; reasons: UncertaintyReason[]; explanation: string };
export interface StudentEligibilityProjection {
  state: 'AVAILABLE' | 'NO_ACTIVE_CONFIRMATION'; scope: ForecastScope | null; confirmationId: Int32Id | null; confirmationRevision: number | null;
  confirmedAt: string | null; results: EligibilityResult[];
}

/** Student-specific projection; callers must bind the input student and scope to the freshly authenticated profile. */
export function buildStudentEligibility(input: StudentEligibilityInput | null, emptyScope?: ForecastScope): StudentEligibilityProjection {
  if (!input) return { state: 'NO_ACTIVE_CONFIRMATION', scope: emptyScope ?? null, confirmationId: null, confirmationRevision: null, confirmedAt: null, results: [] };
  const index = indexCurriculum(input.curriculum);
  const context = buildStudentContext(input.student, index, input.rejectedRows);
  const confirmedIds = new Set(input.confirmedSubjects.filter((subject) => subject.status === 'CONFIRMED').map((subject) => subject.subjectId));
  const results: EligibilityResult[] = [];
  for (const option of index.curriculum.subjects) {
    if (!confirmedIds.has(option.subjectId)) continue;
    const base = { subjectId: option.subjectId, subjectCode: option.subjectCode, subjectName: option.subjectName, creditHours: option.creditHours };
    const outcome = evaluateP002StudentSubject(context, option, index, input.target);
    const policyDetails = prerequisitePolicyExplanation(option, index);
    const policySuffix = policyDetails ? ` ${policyDetails}` : '';
    if (outcome.kind === 'SUPPORTED') {
      results.push({ ...base, status: 'ELIGIBLE', explanation: `Confirmed offering; recorded prerequisites and available evidence are satisfied.${policySuffix}` });
    } else if (outcome.kind === 'UNCERTAIN' && outcome.reasons.length === 1 && outcome.reasons[0] === 'COREQUISITE_EVIDENCE_MISSING') {
      const requiredConcurrentSubjectIds = option.prerequisiteLinks.filter((link) => link.requirementType === 'COREQUISITE')
        .map((link) => index.subjectIdByCurriculumSubjectId.get(link.requiredCurriculumSubjectId))
        .filter((id): id is Int32Id => id !== undefined && !context.history.get(id)?.passed).sort((a, b) => a - b);
      const confirmedOutcome = evaluateP002StudentSubject(context, option, index, input.target, confirmedIds);
      if (requiredConcurrentSubjectIds.length > 0 && requiredConcurrentSubjectIds.every((id) => confirmedIds.has(id)) && confirmedOutcome.kind === 'SUPPORTED') {
        const codes = requiredConcurrentSubjectIds.map((id) => index.bySubjectId.get(id)?.subjectCode).filter((code): code is string => code !== undefined);
        results.push({ ...base, status: 'CONDITIONAL', requiredConcurrentSubjectIds, explanation: `Eligible only when selected with ${codes.join(', ')}.` });
      } else results.push({ ...base, status: 'UNCERTAIN', reasons: outcome.reasons, explanation: `A required co-requisite is not confirmed in the current offering.${policySuffix}` });
    } else if (outcome.kind === 'UNCERTAIN') results.push({ ...base, status: 'UNCERTAIN', reasons: outcome.reasons, explanation: outcome.reasons.includes('CGPA_EVIDENCE_MISSING') ? `A required CGPA threshold cannot be verified from the available student record.${policySuffix}` : `Prerequisite evidence is incomplete or unavailable.${policySuffix}` });
    else results.push({ ...base, status: 'INELIGIBLE', reason: outcome.kind, explanation: outcome.kind === 'PASSED' ? 'Already recorded as completed or exempted.' : outcome.kind === 'PREREQUISITE_NOT_MET' ? `A required prerequisite is not recorded as completed.${policySuffix}` : 'This subject is not offered in the target semester type.' });
  }
  return { state: 'AVAILABLE', scope: input.scope, confirmationId: input.confirmationId, confirmationRevision: input.confirmationRevision, confirmedAt: input.confirmedAt, results };
}
