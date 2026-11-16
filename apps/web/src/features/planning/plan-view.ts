import type { GraduationPlan, PlannedSubject, PlanningInput, ScenarioChange, ScenarioChangeKind } from '../../../../../packages/shared/src/planning/contracts';
import { normaliseRequirementType as normalise } from '../../../../../packages/shared/src/planning/engine';

export const CHANGE_LABEL: Record<ScenarioChangeKind, string> = {
  POSTPONE: 'Postpone one semester', FAIL: 'Fail it', WITHDRAW: 'Withdraw', REPLACE: 'Replace with another elective',
};

/** The note shown next to a subject in the plan. */
export function subjectNote(subject: PlannedSubject): string | null {
  if (subject.failedAttempt) return 'Failed in this what-if: retaken later';
  if (subject.change === 'FAIL') return 'Retake';
  if (subject.change === 'POSTPONE') return 'Postponed';
  if (subject.change === 'WITHDRAW') return 'Taken again after withdrawing';
  if (subject.change === 'REPLACE') return 'Replacement elective';
  if (subject.electiveChoice) return `Elective choice: any ${subject.electiveChoice.needed} of ${subject.electiveChoice.options} options`;
  return null;
}

/** "2 semesters later", "1 semester earlier", "Same as your plan". */
export function differenceText(difference: number | null): string {
  if (difference === null) return 'Cannot compare: one of the plans cannot be completed';
  if (difference === 0) return 'Same as your plan';
  const n = Math.abs(difference);
  return `${n} semester${n === 1 ? '' : 's'} ${difference > 0 ? 'later' : 'earlier'}`;
}

/** Subjects the student can apply a change to: those the baseline plans (not failed attempts), by code. */
export function changeableSubjects(plan: GraduationPlan): PlannedSubject[] {
  const seen = new Map<number, PlannedSubject>();
  for (const semester of plan.semesters) for (const s of semester.subjects) if (!s.failedAttempt) seen.set(s.curriculumSubjectId, s);
  return [...seen.values()].sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));
}

/** Other options of the same elective group that are not passed and not already in the plan. */
export function replacementOptions(input: PlanningInput, plan: GraduationPlan, subject: PlannedSubject) {
  if (!subject.electiveChoice) return [];
  const planned = new Set(changeableSubjects(plan).map(s => s.curriculumSubjectId));
  const passed = new Set(input.passed);
  return input.subjects
    .filter(s => !s.compulsory && normalise(s.category) === subject.electiveChoice!.requirementType && !passed.has(s.curriculumSubjectId) && !planned.has(s.curriculumSubjectId))
    .sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));
}

/** Plain description of one change, for the list of changes. */
export function describeChange(change: ScenarioChange, input: PlanningInput): string {
  const code = (id: number | undefined) => input.subjects.find(s => s.curriculumSubjectId === id)?.subjectCode ?? 'subject';
  if (change.kind === 'REPLACE') return `Replace ${code(change.curriculumSubjectId)} with ${code(change.replacementId)}`;
  if (change.kind === 'POSTPONE') return `Postpone ${code(change.curriculumSubjectId)} one semester`;
  if (change.kind === 'FAIL') return `Fail ${code(change.curriculumSubjectId)}`;
  return `Withdraw from ${code(change.curriculumSubjectId)}`;
}
