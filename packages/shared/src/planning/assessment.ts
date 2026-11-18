import type { GraduationPlan, PlanCompletion, PlanningInput, PlanningSubject } from './contracts';
import { normaliseRequirementType as normalise } from './engine';

export interface RequirementProgress {
  key: string;
  name: string;
  requiredSubjects: number | null;
  requiredCredits: number | null;
  recordedSubjects: number;
  recordedCredits: number | null;
  projectedSubjects: number;
  projectedCredits: number | null;
  remainingSubjects: number | null;
  remainingCredits: number | null;
  status: 'MET' | 'PROJECTED' | 'OUTSTANDING' | 'UNVERIFIED';
  completion: PlanCompletion | null;
}

export interface PlanAssessment {
  requirements: RequirementProgress[];
  complete: boolean;
  warnings: string[];
}

type Status = RequirementProgress['status'];

const label = (type: string) => type.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function plannedSubjects(plan: GraduationPlan, passed: Set<number>): Map<number, { index: number; creditHours: number }> {
  const placed = new Map<number, { index: number; creditHours: number }>();
  plan.semesters.forEach((semester, index) => semester.subjects.forEach(s => {
    if (s.failedAttempt || passed.has(s.curriculumSubjectId) || placed.has(s.curriculumSubjectId)) return;
    placed.set(s.curriculumSubjectId, { index, creditHours: s.creditHours });
  }));
  return placed;
}

function groupRow(key: string, name: string, members: PlanningSubject[], requiredSubjects: number | null, requiredCredits: number | null,
  input: PlanningInput, placed: Map<number, { index: number; creditHours: number }>, plan: GraduationPlan): RequirementProgress {
  const passed = new Set(input.passed);
  const recordedSubjects = members.filter(m => passed.has(m.curriculumSubjectId)).length;
  let recordedCredits: number | null = 0;
  for (const member of members) {
    if (!passed.has(member.curriculumSubjectId)) continue;
    const record = input.recorded?.[member.curriculumSubjectId];
    if (record === undefined) { recordedCredits = null; break; }
    recordedCredits += record.recognizedCredits;
  }
  const plannedMembers = members.filter(m => placed.has(m.curriculumSubjectId));
  const projectedSubjects = recordedSubjects + plannedMembers.length;
  const projectedCredits = recordedCredits === null ? null : recordedCredits + plannedMembers.reduce((n, m) => n + placed.get(m.curriculumSubjectId)!.creditHours, 0);
  const met = (requiredSubjects === null || recordedSubjects >= requiredSubjects)
    && (requiredCredits === null || (recordedCredits !== null && recordedCredits >= requiredCredits));
  const projected = (requiredSubjects === null || projectedSubjects >= requiredSubjects)
    && (requiredCredits === null || (projectedCredits !== null && projectedCredits >= requiredCredits));
  let status: Status;
  if (requiredSubjects === null && requiredCredits === null) status = 'UNVERIFIED';
  else if (met) status = 'MET';
  else if (projected) status = 'PROJECTED';
  else if (requiredSubjects !== null && projectedSubjects < requiredSubjects) status = 'OUTSTANDING';
  else if (requiredCredits !== null && recordedCredits === null) status = 'UNVERIFIED';
  else status = 'OUTSTANDING';
  let completion: PlanCompletion | null = null;
  if (status === 'PROJECTED') {
    let subjects = recordedSubjects, credits = recordedCredits ?? 0;
    const byIndex = new Map<number, PlanningSubject[]>();
    for (const member of plannedMembers) {
      const slot = placed.get(member.curriculumSubjectId)!;
      byIndex.set(slot.index, [...(byIndex.get(slot.index) ?? []), member]);
    }
    for (const semester of plan.semesters) {
      for (const member of byIndex.get(semester.index - 1) ?? []) { subjects++; credits += placed.get(member.curriculumSubjectId)!.creditHours; }
      if ((requiredSubjects === null || subjects >= requiredSubjects) && (requiredCredits === null || credits >= requiredCredits)) {
        completion = { academicYear: semester.academicYear, semesterNo: semester.semesterNo, index: semester.index, label: semester.label };
        break;
      }
    }
  }
  return {
    key, name, requiredSubjects, requiredCredits, recordedSubjects, recordedCredits, projectedSubjects, projectedCredits,
    remainingSubjects: requiredSubjects === null ? null : Math.max(0, requiredSubjects - projectedSubjects),
    remainingCredits: requiredCredits === null ? null : projectedCredits === null ? null : Math.max(0, requiredCredits - projectedCredits),
    status, completion,
  };
}

export function assessPlan(input: PlanningInput, plan: GraduationPlan): PlanAssessment {
  const warnings: string[] = [];
  const passed = new Set(input.passed);
  const placed = plannedSubjects(plan, passed);
  const requirements: RequirementProgress[] = [];
  const compulsory = input.subjects.filter(s => s.compulsory);
  const nominalPlanned = [...placed.values()].reduce((n, p) => n + p.creditHours, 0);
  const totalStatus: Status = input.totalCredits === null || input.totalCredits <= 0 ? 'UNVERIFIED'
    : input.earnedCredits >= input.totalCredits ? 'MET'
    : input.earnedCredits + nominalPlanned >= input.totalCredits ? 'PROJECTED' : 'OUTSTANDING';
  if (input.totalCredits === null || input.totalCredits <= 0) warnings.push('The total programme credit requirement is not configured, so credit completion cannot be confirmed.');
  if ([...passed].some(id => input.recorded?.[id] === undefined)) warnings.push('Recognized credit details are not available for some recorded subjects, so group credit figures cannot be confirmed.');
  const completionOf = (projectedTotal: number): PlanCompletion | null => {
    if (input.earnedCredits >= projectedTotal) return null;
    let credits = input.earnedCredits;
    const byIndex = new Map<number, number>();
    for (const slot of placed.values()) byIndex.set(slot.index, (byIndex.get(slot.index) ?? 0) + slot.creditHours);
    for (const semester of plan.semesters) {
      credits += byIndex.get(semester.index - 1) ?? 0;
      if (credits >= projectedTotal) return { academicYear: semester.academicYear, semesterNo: semester.semesterNo, index: semester.index, label: semester.label };
    }
    return null;
  };
  requirements.push({
    key: 'total', name: 'Total programme credits',
    requiredSubjects: null, requiredCredits: input.totalCredits !== null && input.totalCredits > 0 ? input.totalCredits : null,
    recordedSubjects: passed.size, recordedCredits: input.earnedCredits,
    projectedSubjects: passed.size + placed.size, projectedCredits: input.earnedCredits + nominalPlanned,
    remainingSubjects: null,
    remainingCredits: input.totalCredits !== null && input.totalCredits > 0 ? Math.max(0, input.totalCredits - input.earnedCredits - nominalPlanned) : null,
    status: totalStatus,
    completion: totalStatus === 'PROJECTED' ? completionOf(input.totalCredits!) : null,
  });
  requirements.push(groupRow('compulsory', 'Compulsory subjects', compulsory, compulsory.length, null, input, placed, plan));
  input.requirements.forEach((requirement, index) => {
    const type = normalise(requirement.requirementType);
    const members = input.subjects.filter(s => type === 'COMPULSORY' ? s.compulsory : normalise(s.category) === type);
    requirements.push(groupRow(`group-${index}-${type}`, `${label(requirement.requirementType)} requirement`, members, requirement.requiredSubjects, requirement.requiredCredits, input, placed, plan));
    if (members.length === 0 && (requirement.requiredSubjects !== null || requirement.requiredCredits !== null)) {
      warnings.push(`No ${label(requirement.requirementType)} subjects are mapped in the curriculum data, so that requirement cannot be verified.`);
    }
  });
  return { requirements, complete: plan.status !== 'INCOMPLETE' && requirements.every(r => r.status === 'MET' || r.status === 'PROJECTED'), warnings };
}
