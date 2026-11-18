import type { PlanningInput } from './contracts';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function sortDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep((value as Record<string, Json>)[key]!)]));
  }
  return value;
}

function canonical(input: Omit<PlanningInput, 'baselineVersion'>): Json {
  return sortDeep({
    programmeName: input.programmeName,
    curriculumVersion: input.curriculumVersion,
    totalCredits: input.totalCredits,
    earnedCredits: input.earnedCredits,
    subjects: [...input.subjects]
      .map(s => ({
        ...s,
        prerequisites: [...s.prerequisites].sort((a, b) => a - b),
        corequisites: [...(s.corequisites ?? [])].sort((a, b) => a - b),
        semesterTypes: [...s.semesterTypes].sort(),
      }))
      .sort((a, b) => a.curriculumSubjectId - b.curriculumSubjectId) as unknown as Json,
    requirements: [...input.requirements]
      .sort((a, b) => a.requirementType.localeCompare(b.requirementType)
        || (a.requiredSubjects ?? -1) - (b.requiredSubjects ?? -1)
        || (a.requiredCredits ?? -1) - (b.requiredCredits ?? -1)) as unknown as Json,
    passed: [...input.passed].sort((a, b) => a - b),
    start: input.start === null ? null : { academicYear: input.start.academicYear, semesterNo: input.start.semesterNo },
    limits: [...input.limits]
      .sort((a, b) => a.academicYear.localeCompare(b.academicYear) || a.semesterNo - b.semesterNo || a.semesterId - b.semesterId) as unknown as Json,
    approvedFirst: input.approvedFirst === null ? null : [...input.approvedFirst].sort((a, b) => a - b),
    curriculumId: input.curriculumId ?? null,
    recorded: input.recorded ?? null,
  });
}

export async function planningBaselineVersion(input: PlanningInput): Promise<string> {
  const { baselineVersion: _drop, ...rest } = input;
  void _drop;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(rest))));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
