import type { CurriculumPrerequisiteExpression } from '../../curriculum-reference';
import type { ForecastSubjectOption, Int32Id, UncertaintyReason } from '../contracts';
import { isNearGraduation } from './policy';
import type { DemandBreakdown, EngineCurriculum, EngineStudent, EngineTargetSemester } from './types';

export const SUPPORTED_COHORT_STATUSES = ['ACTIVE'] as const;
const PASSED = new Set(['COMPLETED', 'EXEMPTED']);

type Tri = { state: 'T' } | { state: 'F' } | { state: 'U'; reasons: UncertaintyReason[] };
const TRUE: Tri = { state: 'T' };
const FALSE: Tri = { state: 'F' };
const unknown = (...reasons: UncertaintyReason[]): Tri => ({ state: 'U', reasons });

function allOf(parts: Tri[]): Tri {
  if (parts.some((part) => part.state === 'F')) return FALSE;
  const reasons = parts.flatMap((part) => (part.state === 'U' ? part.reasons : []));
  return reasons.length > 0 || parts.some((part) => part.state === 'U') ? { state: 'U', reasons } : TRUE;
}
function anyOf(parts: Tri[]): Tri {
  if (parts.some((part) => part.state === 'T')) return TRUE;
  if (parts.some((part) => part.state === 'U')) return { state: 'U', reasons: parts.flatMap((part) => (part.state === 'U' ? part.reasons : [])) };
  return FALSE;
}

export interface CurriculumIndex {
  curriculum: EngineCurriculum;
  bySubjectId: Map<Int32Id, ForecastSubjectOption>;
  subjectIdByCurriculumSubjectId: Map<Int32Id, Int32Id>;
  subjectIdByCode: Map<string, Int32Id>;
  semesterTypes: Map<Int32Id, Set<string>>;
}
export function indexCurriculum(curriculum: EngineCurriculum): CurriculumIndex {
  const bySubjectId = new Map<Int32Id, ForecastSubjectOption>();
  const subjectIdByCurriculumSubjectId = new Map<Int32Id, Int32Id>();
  const subjectIdByCode = new Map<string, Int32Id>();
  for (const subject of curriculum.subjects) {
    bySubjectId.set(subject.subjectId, subject);
    subjectIdByCurriculumSubjectId.set(subject.curriculumSubjectId, subject.subjectId);
    subjectIdByCode.set(subject.subjectCode, subject.subjectId);
  }
  const semesterTypes = new Map<Int32Id, Set<string>>();
  for (const rule of curriculum.subjectSemesterRules) {
    const set = semesterTypes.get(rule.curriculumSubjectId) ?? new Set<string>();
    set.add(rule.semesterType);
    semesterTypes.set(rule.curriculumSubjectId, set);
  }
  return { curriculum, bySubjectId, subjectIdByCurriculumSubjectId, subjectIdByCode, semesterTypes };
}

interface SubjectHistory { passed: boolean; inProgress: boolean; attempts: number; recognizedCredits: number | null; hasCompleted: boolean }
export interface StudentContext {
  student: EngineStudent;
  history: Map<Int32Id, SubjectHistory>;
  /** Evidence is complete: COMPLETE history and no rejected rows. */
  reliable: boolean;
  baseReasons: UncertaintyReason[];
  earnedKnownCredits: number;
  earnedUnknownCount: number;
}

export function buildStudentContext(student: EngineStudent, index: CurriculumIndex, rejectedRows: number): StudentContext {
  const history = new Map<Int32Id, SubjectHistory>();
  for (const record of student.records) {
    const entry = history.get(record.subjectId) ?? { passed: false, inProgress: false, attempts: 0, recognizedCredits: null, hasCompleted: false };
    entry.attempts += 1;
    if (PASSED.has(record.status)) {
      entry.passed = true;
      if (record.status === 'COMPLETED') entry.hasCompleted = true;
      if (record.recognizedCredits !== null) entry.recognizedCredits = Math.max(entry.recognizedCredits ?? 0, record.recognizedCredits);
    }
    if (record.status === 'IN_PROGRESS') entry.inProgress = true;
    history.set(record.subjectId, entry);
  }
  const reasons: UncertaintyReason[] = [];
  if (!(SUPPORTED_COHORT_STATUSES as readonly string[]).includes(student.cohortStatus.trim().toUpperCase())) reasons.push('COHORT_STATUS_UNMAPPED');
  if (student.historyCompleteness === 'UNKNOWN') reasons.push('HISTORY_UNKNOWN');
  if (student.historyCompleteness === 'PARTIAL') reasons.push('HISTORY_PARTIAL');
  if (rejectedRows > 0) reasons.push('REJECTED_HISTORY_ROW');
  let known = 0;
  let unknownCount = 0;
  for (const [subjectId, entry] of [...history.entries()].sort((a, b) => a[0] - b[0])) {
    if (!entry.passed) continue;
    if (entry.recognizedCredits !== null) known += entry.recognizedCredits;
    else if (entry.hasCompleted && index.bySubjectId.has(subjectId)) known += (index.bySubjectId.get(subjectId) as ForecastSubjectOption).creditHours;
    else unknownCount += 1;
  }
  return {
    student, history, reliable: student.historyCompleteness === 'COMPLETE' && rejectedRows === 0,
    baseReasons: reasons, earnedKnownCredits: known, earnedUnknownCount: unknownCount,
  };
}

/** Remaining curriculum credits; null when the curriculum total or any passed credit value is unknown. */
export function remainingCredits(context: StudentContext, totalCreditsRequired: number | null): number | null {
  if (totalCreditsRequired === null || context.earnedUnknownCount > 0) return null;
  return totalCreditsRequired - context.earnedKnownCredits;
}

function subjectState(context: StudentContext, subjectId: Int32Id | undefined): Tri {
  if (subjectId === undefined) return unknown('PREREQUISITE_EVIDENCE_MISSING');
  const entry = context.history.get(subjectId);
  if (entry?.passed) return TRUE;
  if (entry?.inProgress) return unknown('PREREQUISITE_EVIDENCE_MISSING');
  return context.reliable ? FALSE : unknown('PREREQUISITE_EVIDENCE_MISSING');
}

function expressionState(expression: CurriculumPrerequisiteExpression, context: StudentContext, index: CurriculumIndex): Tri {
  if (expression.operator === 'course') return subjectState(context, index.subjectIdByCode.get(expression.code));
  const parts = expression.operands.map((operand) => expressionState(operand, context, index));
  return expression.operator === 'allOf' ? allOf(parts) : anyOf(parts);
}

function conditionState(condition: { type: 'completedCredits' | 'cgpa'; operator: '>' | '>='; value: number }, context: StudentContext): Tri {
  if (condition.type === 'cgpa') return unknown('CGPA_EVIDENCE_MISSING');
  const holds = (credits: number) => (condition.operator === '>' ? credits > condition.value : credits >= condition.value);
  if (holds(context.earnedKnownCredits)) return TRUE;
  return context.earnedUnknownCount > 0 || !context.reliable ? unknown('CREDIT_EVIDENCE_MISSING') : FALSE;
}

/** Mandatory prerequisites only; recommended prior knowledge is advisory and corequisites do not gate eligibility in v1. */
function prerequisiteState(option: ForecastSubjectOption, context: StudentContext, index: CurriculumIndex): Tri {
  const details = option.conditionalPrerequisites.status === 'AVAILABLE' ? option.conditionalPrerequisites.details : null;
  if (details && (details.expression || details.conditions.length > 0 || details.topicDependent)) {
    const parts: Tri[] = [];
    if (details.expression) parts.push(expressionState(details.expression, context, index));
    for (const condition of details.conditions) parts.push(conditionState(condition, context));
    if (details.topicDependent) parts.push(unknown('PREREQUISITE_EVIDENCE_MISSING'));
    return allOf(parts);
  }
  return allOf(option.prerequisiteLinks.filter((link) => link.requirementType === 'MANDATORY')
    .map((link) => subjectState(context, index.subjectIdByCurriculumSubjectId.get(link.requiredCurriculumSubjectId))));
}

export type StudentSubjectOutcome =
  | { kind: 'PASSED'; retakeResolved: boolean }
  | { kind: 'NOT_OFFERED' }
  | { kind: 'PREREQUISITE_NOT_MET' }
  | { kind: 'SUPPORTED' }
  | { kind: 'UNCERTAIN'; reasons: UncertaintyReason[] };

/** Classifies one student x curriculum subject. Unknown evidence is never read as zero or as verified. */
export function evaluateStudentSubject(
  context: StudentContext, option: ForecastSubjectOption, index: CurriculumIndex, target: EngineTargetSemester,
): StudentSubjectOutcome {
  const entry = context.history.get(option.subjectId);
  if (entry?.passed) return { kind: 'PASSED', retakeResolved: entry.attempts > 1 };
  const allowed = index.semesterTypes.get(option.curriculumSubjectId);
  if (allowed && !allowed.has(target.semesterType)) return { kind: 'NOT_OFFERED' };
  const prerequisites = prerequisiteState(option, context, index);
  if (prerequisites.state === 'F') return { kind: 'PREREQUISITE_NOT_MET' };
  const reasons = new Set<UncertaintyReason>(context.baseReasons);
  if (prerequisites.state === 'U') prerequisites.reasons.forEach((reason) => reasons.add(reason));
  if (entry?.inProgress) reasons.add('RETAKE_OUTCOME_UNRESOLVED');
  if (reasons.size > 0) return { kind: 'UNCERTAIN', reasons: [...reasons].sort() };
  return { kind: 'SUPPORTED' };
}

export interface SubjectAccumulator {
  breakdown: DemandBreakdown;
  reasonCounts: Map<UncertaintyReason, number>;
  nearGraduationCount: number;
}
export function newAccumulator(): SubjectAccumulator {
  return {
    breakdown: { inCurriculum: 0, alreadyPassed: 0, notOfferedInSemesterType: 0, prerequisiteNotMet: 0, supported: 0, uncertain: 0, retakeResolvedAsPassed: 0 },
    reasonCounts: new Map(), nearGraduationCount: 0,
  };
}

/** Adds one student's outcome for a subject to its accumulator. */
export function recordOutcome(
  accumulator: SubjectAccumulator, outcome: StudentSubjectOutcome, context: StudentContext, totalCreditsRequired: number | null, target: EngineTargetSemester,
): void {
  const b = accumulator.breakdown;
  b.inCurriculum += 1;
  switch (outcome.kind) {
    case 'PASSED': b.alreadyPassed += 1; if (outcome.retakeResolved) b.retakeResolvedAsPassed += 1; break;
    case 'NOT_OFFERED': b.notOfferedInSemesterType += 1; break;
    case 'PREREQUISITE_NOT_MET': b.prerequisiteNotMet += 1; break;
    case 'SUPPORTED':
      b.supported += 1;
      if (isNearGraduation(remainingCredits(context, totalCreditsRequired), target.maxCredits)) accumulator.nearGraduationCount += 1;
      break;
    case 'UNCERTAIN':
      b.uncertain += 1;
      for (const reason of outcome.reasons) accumulator.reasonCounts.set(reason, (accumulator.reasonCounts.get(reason) ?? 0) + 1);
      break;
  }
}
