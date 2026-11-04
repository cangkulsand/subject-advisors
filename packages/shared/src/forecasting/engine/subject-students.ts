import type { Int32Id, UncertaintyReason } from '../contracts';
import { buildStudentContext, evaluateStudentSubject, indexCurriculum, newAccumulator, recordOutcome, remainingCredits, type CurriculumIndex } from './demand';
import { isNearGraduation } from './policy';
import type { DemandBreakdown, ForecastEngineInput, UncertaintyReasonCount } from './types';

export type SubjectStudentOutcomeKind = 'PASSED' | 'NOT_OFFERED' | 'PREREQUISITE_NOT_MET' | 'SUPPORTED' | 'UNCERTAIN';

/** One student of a curriculum that contains the subject, classified exactly as the engine classified them. */
export interface SubjectStudentOutcome {
  externalReference: string;
  studentName: string | null;
  outcome: SubjectStudentOutcomeKind;
  /** Sorted reason codes; empty unless UNCERTAIN. */
  uncertaintyReasons: UncertaintyReason[];
  /** True only for SUPPORTED students who count towards `nearGraduationCount`. */
  nearGraduation: boolean;
  /** Curriculum credits still to earn; null when the curriculum total or any passed credit value is unknown. */
  remainingCredits: number | null;
  /** PASSED only: the student has a pass plus another attempt (retake resolved as passed). */
  passedByRetake: boolean;
}
export interface SubjectStudentOutcomes {
  subjectId: Int32Id;
  /** Sorted by external reference. */
  students: SubjectStudentOutcome[];
  breakdown: DemandBreakdown;
  nearGraduationCount: number;
  uncertaintyReasonCounts: UncertaintyReasonCount[];
}

/**
 * Per-student view of one subject for read-only review. Uses the same context, evaluation and tally helpers as `runForecastEngine`
 * (same student order, same curriculum order), so its tallies equal the engine's `breakdown` and `nearGraduationCount` for the same input.
 */
export function subjectStudentOutcomes(input: ForecastEngineInput, subjectId: Int32Id): SubjectStudentOutcomes {
  const { target, snapshot } = input;
  const curricula = [...input.curricula].sort((a, b) => a.curriculumId - b.curriculumId);
  const indexes = new Map<Int32Id, CurriculumIndex>(curricula.map((curriculum) => [curriculum.curriculumId, indexCurriculum(curriculum)]));
  const students = [...snapshot.students].sort((a, b) => (a.externalReference < b.externalReference ? -1 : a.externalReference > b.externalReference ? 1 : 0));
  const accumulator = newAccumulator();
  const rows: SubjectStudentOutcome[] = [];
  for (const student of students) {
    const index = indexes.get(student.curriculumId);
    if (!index) continue;
    const options = index.curriculum.subjects.filter((option) => option.subjectId === subjectId);
    if (options.length === 0) continue;
    const context = buildStudentContext(student, index, snapshot.rejectedRowsByStudent[student.externalReference] ?? 0);
    const remaining = remainingCredits(context, index.curriculum.totalCreditsRequired);
    for (const option of options) {
      const outcome = evaluateStudentSubject(context, option, index, target);
      recordOutcome(accumulator, outcome, context, index.curriculum.totalCreditsRequired, target);
      rows.push({
        externalReference: student.externalReference, studentName: student.studentName, outcome: outcome.kind,
        uncertaintyReasons: outcome.kind === 'UNCERTAIN' ? [...outcome.reasons] : [],
        nearGraduation: outcome.kind === 'SUPPORTED' && isNearGraduation(remaining, target.maxCredits),
        remainingCredits: remaining, passedByRetake: outcome.kind === 'PASSED' && outcome.retakeResolved,
      });
    }
  }
  const uncertaintyReasonCounts = [...accumulator.reasonCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([reason, count]) => ({ reason, count }));
  return { subjectId, students: rows, breakdown: accumulator.breakdown, nearGraduationCount: accumulator.nearGraduationCount, uncertaintyReasonCounts };
}
