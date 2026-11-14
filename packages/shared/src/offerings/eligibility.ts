import { formatCurriculumPrerequisiteExpression, type CurriculumPrerequisiteExpression } from '../curriculum-reference';
import type { OfferingAcademicRecord, OfferingSubject } from './offerings';

export type OfferingEligibilityStatus = 'ELIGIBLE' | 'CHECK' | 'NOT_ELIGIBLE';
export type OfferingEligibilityReasonKind =
  | 'MISSING_PREREQUISITE' | 'MISSING_COREQUISITE' | 'CREDITS' | 'CGPA' | 'TOPIC'
  | 'IMPORTED_RULE' | 'RECOMMENDED' | 'HISTORY_UNAVAILABLE' | 'PREREQUISITES_UNAVAILABLE';
export interface OfferingEligibilityReason { kind: OfferingEligibilityReasonKind; message: string; blocking: boolean }
export interface OfferingEligibility { curriculumSubjectId: string; status: OfferingEligibilityStatus; reasons: OfferingEligibilityReason[] }
export type EligibilityRecord = Pick<OfferingAcademicRecord, 'subjectId' | 'status' | 'recognizedCredits'>;
export type EligibilityHistory = { status: 'available'; records: EligibilityRecord[] } | { status: 'unavailable' };

export const OFFERING_ELIGIBILITY_LABELS: Record<OfferingEligibilityStatus, string> = {
  ELIGIBLE: 'Eligible',
  CHECK: 'Check with your coordinator',
  NOT_ELIGIBLE: 'Not eligible',
};

const CHECK_KINDS: ReadonlySet<OfferingEligibilityReasonKind> = new Set([
  'CGPA', 'TOPIC', 'IMPORTED_RULE', 'HISTORY_UNAVAILABLE', 'PREREQUISITES_UNAVAILABLE',
]);

const label = (subject: OfferingSubject | undefined, fallback: string) => (subject ? `${subject.code} ${subject.name}` : fallback);

export function evaluateOfferingEligibility(input: {
  subject: OfferingSubject;
  catalogue: readonly OfferingSubject[];
  history: EligibilityHistory;
  pickedCurriculumSubjectIds: readonly string[];
}): OfferingEligibility {
  const { subject, catalogue, history, pickedCurriculumSubjectIds } = input;
  const reasons: OfferingEligibilityReason[] = [];
  const finish = (): OfferingEligibility => {
    const status: OfferingEligibilityStatus = reasons.some(r => r.blocking)
      ? 'NOT_ELIGIBLE'
      : reasons.some(r => CHECK_KINDS.has(r.kind)) ? 'CHECK' : 'ELIGIBLE';
    return { curriculumSubjectId: subject.curriculumSubjectId, status, reasons };
  };

  const prerequisites = subject.prerequisites;
  if (!prerequisites) return finish();
  if (prerequisites.status === 'unavailable') {
    reasons.push({ kind: 'PREREQUISITES_UNAVAILABLE', blocking: false, message: 'Prerequisites for this subject could not be loaded; confirm with your coordinator.' });
    return finish();
  }

  const byId = new Map(catalogue.map(s => [s.curriculumSubjectId, s]));
  const byCode = new Map(catalogue.map(s => [s.code, s]));
  const details = prerequisites.details;
  const hard = prerequisites.items.filter(i => i.requirementType !== 'RECOMMENDED');
  const needsHistory = hard.length > 0 || !!details?.expression || !!details?.conditions.some(c => c.type === 'completedCredits');

  const pushCgpaTopic = () => {
    for (const c of details?.conditions ?? []) {
      if (c.type !== 'cgpa') continue;
      reasons.push({ kind: 'CGPA', blocking: false, message: `Needs CGPA of ${c.operator === '>' ? 'more than' : 'at least'} ${c.value}; confirm with your coordinator` });
    }
    if (details?.topicDependent) {
      reasons.push({ kind: 'TOPIC', blocking: false, message: 'Prerequisite depends on the chosen topic; confirm with your coordinator' });
    }
  };

  if (history.status === 'unavailable') {
    if (needsHistory) {
      reasons.push({ kind: 'HISTORY_UNAVAILABLE', blocking: false, message: 'Your academic records could not be loaded, so prerequisites were not checked.' });
    }
    pushCgpaTopic();
    return finish();
  }

  const passedRecords = history.records.filter(r => r.status === 'COMPLETED' || r.status === 'EXEMPTED');
  const passed = new Set(passedRecords.map(r => r.subjectId));
  const completedCredits = passedRecords.reduce((sum, r) => sum + r.recognizedCredits, 0);
  const isPassed = (s: OfferingSubject | undefined) => !!s?.subjectId && passed.has(s.subjectId);
  const picked = new Set(pickedCurriculumSubjectIds);

  for (const item of prerequisites.items) {
    const required = byId.get(item.requiredCurriculumSubjectId);
    const name = label(required, item.requiredCurriculumSubjectId);
    if (item.requirementType === 'MANDATORY' && !isPassed(required)) {
      reasons.push({ kind: 'MISSING_PREREQUISITE', blocking: true, message: `Needs ${name}` });
    } else if (item.requirementType === 'COREQUISITE' && !isPassed(required) && !picked.has(item.requiredCurriculumSubjectId)) {
      reasons.push({ kind: 'MISSING_COREQUISITE', blocking: true, message: `Take ${name} in the same semester or complete it first` });
    } else if (item.requirementType === 'RECOMMENDED' && !isPassed(required)) {
      reasons.push({ kind: 'RECOMMENDED', blocking: false, message: `Recommended first: ${name}` });
    }
  }

  for (const c of details?.conditions ?? []) {
    if (c.type !== 'completedCredits') continue;
    const ok = c.operator === '>' ? completedCredits > c.value : completedCredits >= c.value;
    if (!ok) {
      reasons.push({
        kind: 'CREDITS', blocking: true,
        message: `Needs ${c.operator === '>' ? 'more than' : 'at least'} ${c.value} completed credits (you have ${completedCredits})`,
      });
    }
  }
  pushCgpaTopic();

  const expression = details?.expression ?? null;
  if (expression) {
    const satisfied = (e: CurriculumPrerequisiteExpression): boolean =>
      e.operator === 'course' ? isPassed(byCode.get(e.code))
        : e.operator === 'allOf' ? e.operands.every(satisfied) : e.operands.some(satisfied);
    if (!satisfied(expression)) {
      reasons.push({ kind: 'IMPORTED_RULE', blocking: false, message: `Check with your coordinator: requires ${formatCurriculumPrerequisiteExpression(expression)}` });
    }
  }
  return finish();
}
