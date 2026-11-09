import type { Int32Id } from './contracts';
import { buildStudentContext, indexCurriculum } from './engine';
import { evaluateP002StudentSubject } from './p002-eligibility-policy';
import type { StudentEligibilityInput } from './student-eligibility';

export interface SemesterSelectionIssue { code: string; message: string; subjectId?: number }
export interface SemesterSelectionValidation {
  valid: boolean; totalSubjects: number; totalCredits: number;
  limits: { maxSubjects: number; maxCredits: number }; issues: SemesterSelectionIssue[];
}

/** Validates an immutable proposed selection against its confirmed offering and current academic evidence. */
export function validateSemesterSelection(input: StudentEligibilityInput, subjectIds: number[]): SemesterSelectionValidation {
  const issues: SemesterSelectionIssue[] = [];
  const confirmed = new Set(input.confirmedSubjects.filter((row) => row.status === 'CONFIRMED').map((row) => row.subjectId));
  const index = indexCurriculum(input.curriculum);
  const context = buildStudentContext(input.student, index, input.rejectedRows);
  const selected = new Set<Int32Id>();
  for (const id of subjectIds) {
    if (selected.has(id)) { issues.push({ code: 'DUPLICATE_SUBJECT', subjectId: id, message: 'A subject may only be selected once.' }); continue; }
    selected.add(id);
    const option = index.bySubjectId.get(id);
    if (!option) { issues.push({ code: 'UNKNOWN_SUBJECT', subjectId: id, message: 'Subject is not in the curriculum catalogue.' }); continue; }
    if (!confirmed.has(id)) { issues.push({ code: 'OUTSIDE_CONFIRMED_OFFERING', subjectId: id, message: 'Subject is not in the confirmed offering.' }); continue; }
  }
  const options = [...selected].map((id) => index.bySubjectId.get(id)).filter((option) => option !== undefined);
  const concurrent = new Set(selected);
  for (const option of options) {
    if (!confirmed.has(option.subjectId)) continue;
    const outcome = evaluateP002StudentSubject(context, option, index, input.target, concurrent);
    if (outcome.kind === 'PASSED') issues.push({ code: 'ALREADY_SATISFIED', subjectId: option.subjectId, message: 'Subject is already completed or exempted.' });
    else if (outcome.kind === 'NOT_OFFERED') issues.push({ code: 'SEMESTER_TYPE_NOT_ALLOWED', subjectId: option.subjectId, message: 'Subject is not permitted in this semester type.' });
    else if (outcome.kind === 'PREREQUISITE_NOT_MET') issues.push({ code: 'PREREQUISITE_NOT_MET', subjectId: option.subjectId, message: 'A mandatory prerequisite has not been passed.' });
    else if (outcome.kind === 'UNCERTAIN') issues.push({ code: outcome.reasons.includes('COREQUISITE_EVIDENCE_MISSING') ? 'MISSING_COREQUISITE' : 'ELIGIBILITY_UNCERTAIN', subjectId: option.subjectId, message: 'Eligibility cannot be verified from the available academic evidence.' });
    if (option.creditHours === 2 && input.target.semesterType === 'NORMAL') {
      const hasExplicitNormalRule = input.curriculum.subjectSemesterRules.some((rule) => rule.curriculumSubjectId === option.curriculumSubjectId && rule.semesterType === 'NORMAL');
      if (!hasExplicitNormalRule) issues.push({ code: 'TWO_CREDIT_NORMAL_NOT_CONFIGURED', subjectId: option.subjectId, message: 'Two-credit subjects require an explicit Normal-semester rule.' });
    }
  }
  const totalCredits = options.reduce((total, option) => total + option.creditHours, 0);
  if (selected.size > input.target.maxSubjects) issues.push({ code: 'MAX_SUBJECTS_EXCEEDED', message: `Selection exceeds the configured maximum of ${input.target.maxSubjects} subjects.` });
  if (totalCredits > input.target.maxCredits) issues.push({ code: 'MAX_CREDITS_EXCEEDED', message: `Selection exceeds the configured maximum of ${input.target.maxCredits} credits.` });
  return { valid: issues.length === 0, totalSubjects: subjectIds.length, totalCredits, limits: { maxSubjects: input.target.maxSubjects, maxCredits: input.target.maxCredits }, issues };
}
