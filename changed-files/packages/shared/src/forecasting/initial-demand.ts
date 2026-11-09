import type { ForecastScope, ForecastSubjectOption, Int32Id, UncertaintyReason } from './contracts';
import { buildStudentContext, fingerprint, indexCurriculum, type EngineCurriculum, type EngineSnapshot, type EngineStudent, type EngineTargetSemester } from './engine';
import { evaluateP002StudentSubject, P002_ELIGIBILITY_POLICY_VERSION } from './p002-eligibility-policy';
export const INITIAL_DEMAND_THRESHOLD = 30;
export interface InitialDemandSubject {
  subjectId: Int32Id; subjectCode: string; subjectName: string; creditHours: number; outcome: 'QUALIFIED' | 'BELOW_THRESHOLD' | 'UNCERTAIN';
  eligibleDistinctCount: number; uncertainDistinctCount: number; passedCount: number; prerequisiteNotMetCount: number; notOfferedCount: number;
  excluded: boolean; exclusionReason: string | null; uncertaintyReasonCounts: Partial<Record<UncertaintyReason, number>>;
}
export interface InitialDemandProjection {
  scope: ForecastScope; importBatchId: Int32Id; sourceFingerprint: string; catalogueFingerprint: string; revision: string;
  qualifiedSubjectIds: Int32Id[]; threshold: number; studentsInCohort: number; ambiguousDuplicateReferences: number; unresolvedCurriculumStudents: number; subjects: InitialDemandSubject[];
}
export interface InitialDemandInput {
  scope: ForecastScope; importBatchId: Int32Id; sourceFingerprint: string;
  snapshot: EngineSnapshot; curricula: EngineCurriculum[]; target: EngineTargetSemester;
}
type Aggregate = { option: ForecastSubjectOption; eligible: Set<string>; uncertain: Map<string, Set<UncertaintyReason>>; passed: Set<string>; unmet: Set<string>; notOffered: Set<string> };

/** Derive S1 demand from an accepted import. No capacity rules, allocations, or student roster are returned. */
export function buildInitialDemand(input: InitialDemandInput): InitialDemandProjection {
  const seen = new Map<string, EngineStudent>(); const ambiguous = new Set<string>();
  for (const student of input.snapshot.students) {
    const prior = seen.get(student.externalReference);
    if (!prior) seen.set(student.externalReference, student);
    else if (JSON.stringify(prior) !== JSON.stringify(student)) ambiguous.add(student.externalReference);
  }
  const students = [...seen.values()].sort((a, b) => a.externalReference.localeCompare(b.externalReference));
  const curricula = new Map(input.curricula.map((c) => [c.curriculumId, indexCurriculum(c)]));
  const unresolvedCurriculumStudents = students.filter((student) => !curricula.has(student.curriculumId)).length;
  const aggregate = new Map<Int32Id, Aggregate>();
  const get = (option: ForecastSubjectOption): Aggregate => {
    let value = aggregate.get(option.subjectId);
    if (!value) { value = { option, eligible: new Set(), uncertain: new Map(), passed: new Set(), unmet: new Set(), notOffered: new Set() }; aggregate.set(option.subjectId, value); }
    return value;
  };
  for (const student of students) {
    const index = curricula.get(student.curriculumId); if (!index) continue;
    if (ambiguous.has(student.externalReference)) {
      for (const option of index.curriculum.subjects) if (option.includeInOfferingForecast) get(option).uncertain.set(student.externalReference, new Set(['PREREQUISITE_EVIDENCE_MISSING']));
      continue;
    }
    const context = buildStudentContext(student, index, input.snapshot.rejectedRowsByStudent[student.externalReference] ?? 0);
    for (const option of index.curriculum.subjects) {
      const entry = get(option); const result = evaluateP002StudentSubject(context, option, index, input.target);
      if (!option.includeInOfferingForecast) continue;
      if (result.kind === 'SUPPORTED') {
        entry.eligible.add(student.externalReference);
      } else if (result.kind === 'UNCERTAIN') entry.uncertain.set(student.externalReference, new Set(result.reasons));
      else if (result.kind === 'PASSED') entry.passed.add(student.externalReference);
      else if (result.kind === 'PREREQUISITE_NOT_MET') entry.unmet.add(student.externalReference);
      else if (result.kind === 'NOT_OFFERED') entry.notOffered.add(student.externalReference);
    }
  }
  const subjects = [...aggregate.values()].map(({ option, eligible, uncertain, passed, unmet, notOffered }) => {
    const reasonCounts: Partial<Record<UncertaintyReason, number>> = {};
    for (const reasons of uncertain.values()) for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    const excluded = !option.includeInOfferingForecast; const count = eligible.size;
    return { subjectId: option.subjectId, subjectCode: option.subjectCode, subjectName: option.subjectName, creditHours: option.creditHours,
      outcome: excluded ? 'BELOW_THRESHOLD' as const : count >= INITIAL_DEMAND_THRESHOLD ? 'QUALIFIED' as const : uncertain.size ? 'UNCERTAIN' as const : 'BELOW_THRESHOLD' as const,
      eligibleDistinctCount: count, uncertainDistinctCount: uncertain.size, passedCount: passed.size, prerequisiteNotMetCount: unmet.size, notOfferedCount: notOffered.size,
      excluded, exclusionReason: option.exclusionReason, uncertaintyReasonCounts: reasonCounts };
  }).sort((a, b) => a.subjectId - b.subjectId);
  const catalogueFingerprint = fingerprint(input.curricula.map((c) => ({ curriculumId: c.curriculumId, curriculumVersion: c.curriculumVersion, catalogueFingerprint: c.catalogueFingerprint })));
  const qualifiedSubjectIds = subjects.filter((s) => s.outcome === 'QUALIFIED').map((s) => s.subjectId);
  const revision = fingerprint({ scope: input.scope, importBatchId: input.importBatchId, sourceFingerprint: input.sourceFingerprint, catalogueFingerprint, target: input.target,
    threshold: INITIAL_DEMAND_THRESHOLD, policyVersion: P002_ELIGIBILITY_POLICY_VERSION, qualifiedSubjectIds,
    unresolvedCurriculumStudents, subjects: subjects.map(({ subjectId, outcome, eligibleDistinctCount, uncertainDistinctCount, passedCount, prerequisiteNotMetCount, notOfferedCount, excluded, uncertaintyReasonCounts }) =>
      ({ subjectId, outcome, eligibleDistinctCount, uncertainDistinctCount, passedCount, prerequisiteNotMetCount, notOfferedCount, excluded, uncertaintyReasonCounts })) });
  return { scope: input.scope, importBatchId: input.importBatchId, sourceFingerprint: input.sourceFingerprint, catalogueFingerprint, revision, qualifiedSubjectIds,
    threshold: INITIAL_DEMAND_THRESHOLD, studentsInCohort: students.length, ambiguousDuplicateReferences: ambiguous.size, unresolvedCurriculumStudents, subjects };
}
