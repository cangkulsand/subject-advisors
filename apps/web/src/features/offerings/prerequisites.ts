import type { OfferingRequirementType, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';

export interface OfferingPrerequisiteGroup {
  type: OfferingRequirementType;
  label: string;
  subjects: OfferingSubject[];
}

const groupDefinitions: Array<{ type: OfferingRequirementType; label: string }> = [
  { type: 'MANDATORY', label: 'Prerequisites' },
  { type: 'COREQUISITE', label: 'Corequisites' },
  { type: 'RECOMMENDED', label: 'Recommended preparation' },
];

/** Resolve relationship IDs only against the complete current curriculum catalogue. */
export function offeringPrerequisiteDisplay(subject: OfferingSubject, catalogue: readonly OfferingSubject[]) {
  const prerequisites = subject.prerequisites;
  if (prerequisites?.status !== 'available') return { status: 'unavailable' as const, groups: [] };
  const byId = new Map(catalogue.map(item => [item.curriculumSubjectId, item]));
  if (prerequisites.items.some(item => !byId.has(item.requiredCurriculumSubjectId))) return { status: 'unavailable' as const, groups: [] };
  const groups = groupDefinitions.map(definition => ({
    ...definition,
    subjects: prerequisites.items
      .filter(item => item.requirementType === definition.type)
      .map(item => byId.get(item.requiredCurriculumSubjectId))
      .filter((item): item is OfferingSubject => item !== undefined)
      .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: 'base' }) ||
        left.curriculumSubjectId.localeCompare(right.curriculumSubjectId, undefined, { numeric: true })),
  })).filter(group => group.subjects.length > 0);
  return { status: 'available' as const, groups };
}
