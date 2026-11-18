import type { GraduationPlan, PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import type { PathwayGraph, PathwayNodeStatus, PathwayPrerequisiteEdge, PathwaySubjectNode } from '../pathway/contracts';

export interface DependencyAnnotation { semester: string; baselineSemester?: string; changed: boolean }

const PLACED = (plan: GraduationPlan) => {
  const at = new Map<number, string>();
  for (const semester of plan.semesters) for (const s of semester.subjects) {
    if (!s.failedAttempt && !at.has(s.curriculumSubjectId)) at.set(s.curriculumSubjectId, semester.label);
  }
  return at;
};

export function planDependencies(input: PlanningInput, plan: GraduationPlan, baseline: GraduationPlan | null): {
  graph: PathwayGraph;
  annotations: Record<string, DependencyAnnotation>;
} {
  const passed = new Set(input.passed);
  const unplanned = new Set(plan.unplanned.map(u => u.curriculumSubjectId));
  const at = PLACED(plan);
  const atBaseline = baseline ? PLACED(baseline) : null;
  const nodes: PathwaySubjectNode[] = input.subjects.map(s => {
    const record = input.recorded?.[s.curriculumSubjectId];
    const status: PathwayNodeStatus = record ? record.status : passed.has(s.curriculumSubjectId) ? 'UNKNOWN' : 'REMAINING';
    return {
      id: String(s.curriculumSubjectId), subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours,
      isCompulsory: s.compulsory, subjectCategory: s.category || null, status, grade: null,
      recognizedCredits: record?.recognizedCredits ?? null,
    };
  });
  const edges: PathwayPrerequisiteEdge[] = input.subjects.flatMap(s => [
    ...s.prerequisites.map(required => ({ id: `m-${required}-${s.curriculumSubjectId}`, source: String(required), target: String(s.curriculumSubjectId), requirementType: 'MANDATORY' as const })),
    ...(s.corequisites ?? []).map(partner => ({ id: `c-${partner}-${s.curriculumSubjectId}`, source: String(partner), target: String(s.curriculumSubjectId), requirementType: 'COREQUISITE' as const })),
  ]);
  const annotations: Record<string, DependencyAnnotation> = {};
  for (const s of input.subjects) {
    const id = String(s.curriculumSubjectId);
    const semester = passed.has(s.curriculumSubjectId) ? 'Already satisfied'
      : unplanned.has(s.curriculumSubjectId) ? 'Cannot be scheduled'
      : at.get(s.curriculumSubjectId) ?? 'Not selected in this plan';
    const baselineSemester = atBaseline === null ? undefined
      : passed.has(s.curriculumSubjectId) ? 'Already satisfied'
      : new Set(baseline!.unplanned.map(u => u.curriculumSubjectId)).has(s.curriculumSubjectId) ? 'Cannot be scheduled'
      : atBaseline.get(s.curriculumSubjectId) ?? 'Not selected in this plan';
    annotations[id] = { semester, ...(baselineSemester !== undefined ? { baselineSemester } : {}), changed: baselineSemester !== undefined && baselineSemester !== semester };
  }
  return {
    graph: {
      curriculumId: input.curriculumId ?? 0, curriculumVersion: input.curriculumVersion,
      programmeName: input.programmeName, nodes, edges, demo: false,
    },
    annotations,
  };
}
