import { formatCurriculumPrerequisiteExpression } from '../curriculum-reference';
import type { CurriculumPrerequisiteExpression, ForecastSubjectOption, UncertaintyReason } from './contracts';
import { evaluateStudentSubject, type EngineTargetSemester } from './engine';
import type { CurriculumIndex, StudentContext, StudentSubjectOutcome } from './engine/demand';

export const P002_ELIGIBILITY_POLICY_VERSION = 3;

function containsAlternative(expression: CurriculumPrerequisiteExpression, left: string, right: string): boolean {
  if (expression.operator === 'anyOf' && expression.operands.length === 2 && expression.operands.every((item) => item.operator === 'course')) {
    const codes = expression.operands.filter((item) => item.operator === 'course').map((item) => item.code);
    if (codes.length === 2 && codes.includes(left) && codes.includes(right)) return true;
  }
  return expression.operator !== 'course' && expression.operands.some((item) => containsAlternative(item, left, right));
}

/** Only accepts a descriptive note when its complete meaning is already encoded in structured data. */
function noteIsRepresented(option: ForecastSubjectOption): boolean {
  const details = option.conditionalPrerequisites.status === 'AVAILABLE' ? option.conditionalPrerequisites.details : null;
  const note = details?.conditionNote;
  if (!note) return true;
  const alternative = /^Prerequisites \d+ and \d+ are alternatives: ([A-Z0-9]{4,12}) OR ([A-Z0-9]{4,12})\.$/.exec(note);
  if (alternative) return Boolean(details?.expression && alternative[1] && alternative[2] && containsAlternative(details.expression, alternative[1], alternative[2]));
  const credits = /^Also requires more than ([0-9]+) completed credits\.$/.exec(note);
  if (credits) return details?.conditions.some((condition) => condition.type === 'completedCredits' && condition.operator === '>' && condition.value === Number(credits[1])) ?? false;
  if (note === 'Industrial training: more than 92 completed credits and CGPA at least 2.0.') {
    return details?.conditions.some((condition) => condition.type === 'completedCredits' && condition.operator === '>' && condition.value === 92) === true &&
      details.conditions.some((condition) => condition.type === 'cgpa' && condition.operator === '>=' && condition.value === 2) === true;
  }
  return false;
}

const uncertain = (...reasons: UncertaintyReason[]): StudentSubjectOutcome => ({ kind: 'UNCERTAIN', reasons: [...new Set(reasons)].sort() });

/** P002-only guard layered over the shared engine; intentionally does not alter P004 engine semantics. */
export function evaluateP002StudentSubject(context: StudentContext, option: ForecastSubjectOption, index: CurriculumIndex, target: EngineTargetSemester, concurrentSubjectIds: ReadonlySet<number> = new Set()): StudentSubjectOutcome {
  const passed = context.history.get(option.subjectId)?.passed === true;
  if (!passed && option.creditHours === 2 && target.semesterType === 'NORMAL' &&
      !index.curriculum.subjectSemesterRules.some((rule) => rule.curriculumSubjectId === option.curriculumSubjectId && rule.semesterType === 'NORMAL')) {
    return { kind: 'NOT_OFFERED' };
  }
  const outcome = evaluateStudentSubject(context, option, index, target);
  if (outcome.kind !== 'SUPPORTED') return outcome;

  const details = option.conditionalPrerequisites.status === 'AVAILABLE' ? option.conditionalPrerequisites.details : null;
  if (details?.topicDependent || !noteIsRepresented(option)) return uncertain('PREREQUISITE_EVIDENCE_MISSING');

  const missingCorequisite = option.prerequisiteLinks.some((link) => {
    if (link.requirementType !== 'COREQUISITE') return false;
    const id = index.subjectIdByCurriculumSubjectId.get(link.requiredCurriculumSubjectId);
    return id === undefined || (!context.history.get(id)?.passed && !concurrentSubjectIds.has(id));
  });
  if (missingCorequisite) return uncertain('COREQUISITE_EVIDENCE_MISSING');

  // Legacy industrial-training course codes have no structured catalogue metadata, so remain conservative.
  if ((option.subjectCode === 'SECJ4114' || option.subjectCode === 'SECJ4118') && option.conditionalPrerequisites.status !== 'AVAILABLE') {
    return uncertain('PREREQUISITE_EVIDENCE_MISSING');
  }
  return outcome;
}

export function prerequisitePolicyExplanation(option: ForecastSubjectOption, index?: CurriculumIndex): string {
  const details = option.conditionalPrerequisites.status === 'AVAILABLE' ? option.conditionalPrerequisites.details : null;
  const expression = details ? formatCurriculumPrerequisiteExpression(details.expression) : null;
  const linkedMandatoryCodes = expression ? [] : (index ? option.prerequisiteLinks.filter((link) => link.requirementType === 'MANDATORY')
    .map((link) => index.bySubjectId.get(index.subjectIdByCurriculumSubjectId.get(link.requiredCurriculumSubjectId) ?? -1)?.subjectCode)
    .filter((code): code is string => code !== undefined).sort() : []);
  const requiredCourses = expression ?? (linkedMandatoryCodes.length > 0 ? linkedMandatoryCodes.join(' AND ') : null);
  const codes = requiredCourses ? ` Required courses: ${requiredCourses}.` : '';
  const conditions = details?.conditions.map((condition) => condition.type === 'cgpa'
    ? `CGPA ${condition.operator} ${condition.value.toFixed(1)}`
    : `completed credits ${condition.operator} ${condition.value}`).join(' and ');
  return `${codes}${conditions ? ` Required conditions: ${conditions}.` : ''}`.trim();
}
