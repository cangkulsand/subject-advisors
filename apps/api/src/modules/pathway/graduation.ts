import type { GraduationEligibility, GraduationRequirementStatus } from './contracts';
import type { RawPathwayData, RawSubjectRow } from './repository';

const SATISFIED = new Set(['COMPLETED', 'EXEMPTED']);

/**
 * Pure UC13 graduation-eligibility engine. Derives eligibility only from stored
 * records and configured curriculum requirements; it never fabricates outcomes.
 * Duplicate attempts for a subject are treated as unresolved and do not count.
 */
export function buildGraduationEligibility(raw: RawPathwayData): GraduationEligibility {
  const recordsBySubject = new Map<number, RawPathwayData['records']>();
  for (const record of raw.records) {
    const attempts = recordsBySubject.get(record.subjectId) ?? [];
    attempts.push(record);
    recordsBySubject.set(record.subjectId, attempts);
  }

  const satisfiedCredits = new Map<number, number>();
  for (const [subjectId, attempts] of recordsBySubject) {
    if (attempts.length !== 1) continue; // ambiguous duplicate -> unresolved
    const record = attempts[0]!;
    if (SATISFIED.has(record.status)) satisfiedCredits.set(subjectId, record.recognizedCredits);
  }

  const totalCreditsRecognized = [...satisfiedCredits.values()].reduce((sum, credits) => sum + credits, 0);

  const requirements: GraduationRequirementStatus[] = raw.requirements.map(requirement => {
    const matched = matchSubjects(requirement.requirementType, raw.subjects);
    const satisfiedSubjects = matched.filter(subject => satisfiedCredits.has(subject.subjectId));
    const satisfiedCreditsSum = satisfiedSubjects.reduce(
      (sum, subject) => sum + (satisfiedCredits.get(subject.subjectId) ?? 0), 0);
    const met = (requirement.requiredCredits === null || satisfiedCreditsSum >= requirement.requiredCredits) &&
      (requirement.requiredSubjects === null || satisfiedSubjects.length >= requirement.requiredSubjects);
    return {
      requirementType: requirement.requirementType,
      requiredCredits: requirement.requiredCredits,
      requiredSubjects: requirement.requiredSubjects,
      satisfiedCredits: satisfiedCreditsSum,
      satisfiedSubjects: satisfiedSubjects.length,
      met,
    };
  });

  const totalMet = totalCreditsRecognized >= raw.totalCreditRequired;
  const eligible = totalMet && requirements.every(requirement => requirement.met);

  const outstanding: string[] = [];
  if (!totalMet) outstanding.push(`Total credits: ${totalCreditsRecognized}/${raw.totalCreditRequired}`);
  for (const requirement of requirements) {
    if (requirement.met) continue;
    const parts: string[] = [];
    if (requirement.requiredCredits !== null) parts.push(`${requirement.satisfiedCredits}/${requirement.requiredCredits} credits`);
    if (requirement.requiredSubjects !== null) parts.push(`${requirement.satisfiedSubjects}/${requirement.requiredSubjects} subjects`);
    outstanding.push(`${requirement.requirementType}: ${parts.join(', ')}`);
  }

  return {
    eligible,
    totalCreditsRequired: raw.totalCreditRequired,
    totalCreditsRecognized,
    requirements,
    outstanding,
  };
}

/**
 * Maps a requirement type to the curriculum subjects it applies to. Total
 * credits are handled separately via curriculum.total_credit_required.
 */
function matchSubjects(requirementType: string, subjects: RawSubjectRow[]): RawSubjectRow[] {
  const type = requirementType.toUpperCase();
  if (type === 'COMPULSORY') return subjects.filter(subject => subject.isCompulsory === 1);
  if (type === 'ELECTIVE') return subjects.filter(subject => subject.isCompulsory === 0);
  return subjects.filter(subject => subject.subjectCategory?.toUpperCase() === type);
}
