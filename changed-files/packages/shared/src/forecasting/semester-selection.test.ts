import { describe, expect, it } from 'vitest';
import type { ForecastSubjectOption } from './contracts';
import type { EngineCurriculum, EngineStudent } from './engine/types';
import { validateSemesterSelection } from './semester-selection';
import type { StudentEligibilityInput } from './student-eligibility';

const option = (id: number, code: string, credits = 3, links: ForecastSubjectOption['prerequisiteLinks'] = []): ForecastSubjectOption => ({
  curriculumSubjectId: id + 10, curriculumId: 1, subjectId: id, subjectCode: code, subjectName: code, creditHours: credits,
  classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: links,
  conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'No structured condition.' },
});
const baseStudent = (records: EngineStudent['records'] = [], historyCompleteness: EngineStudent['historyCompleteness'] = 'COMPLETE'): EngineStudent => ({
  externalReference: 'DEMO', studentName: null, curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness, records,
});
function input(subjects: ForecastSubjectOption[], overrides: Partial<StudentEligibilityInput> = {}): StudentEligibilityInput {
  const curriculum: EngineCurriculum = { curriculumId: 1, curriculumVersion: 'v', catalogueFingerprint: 'f', requirements: [], subjectSemesterRules: [], subjects, totalCreditsRequired: 120 };
  return { scope: { programmeId: 1, learningCentreId: 1, targetSemesterId: 4 }, confirmationId: 1, confirmationRevision: 1,
    confirmedAt: '2026-11-09T00:00:00Z', student: baseStudent(), curriculum, target: { semesterId: 4, semesterType: 'NORMAL', maxSubjects: 3, maxCredits: 10 },
    confirmedSubjects: subjects.map((row) => ({ subjectId: row.subjectId, status: 'CONFIRMED', confirmedOfferingId: row.subjectId + 20 })), rejectedRows: 0, ...overrides };
}
const link = (required: number, requirementType: 'COREQUISITE' | 'MANDATORY' = 'COREQUISITE') => ({ prerequisiteId: required, curriculumSubjectId: 11, requiredCurriculumSubjectId: required + 10, requirementType });

describe('P002 semester selection', () => {
  it('accepts a mutual corequisite pair only when selected together', () => {
    const a = option(1, 'PAIR1000', 3, [link(2)]);
    const b = option(2, 'PAIR2000', 3, [link(1)]);
    const data = input([a, b]);
    expect(validateSemesterSelection(data, [1]).issues).toContainEqual(expect.objectContaining({ code: 'MISSING_COREQUISITE', subjectId: 1 }));
    expect(validateSemesterSelection(data, [1, 2])).toMatchObject({ valid: true, totalSubjects: 2, totalCredits: 6 });
  });
  it('does not satisfy a mandatory prerequisite by co-selection', () => {
    const a = option(1, 'MAND1000', 3, [link(2, 'MANDATORY')]);
    const b = option(2, 'MAND2000');
    expect(validateSemesterSelection(input([a, b]), [1, 2]).issues).toContainEqual(expect.objectContaining({ code: 'PREREQUISITE_NOT_MET', subjectId: 1 }));
  });
  it('does not conditionally allow co-requisites without a confirmed concurrent option', () => {
    const a = option(1, 'COREQ1000', 3, [link(2)]);
    const b = option(2, 'COREQ2000');
    const data = input([a, b], { confirmedSubjects: [{ subjectId: 1, status: 'CONFIRMED', confirmedOfferingId: 21 }] });
    expect(validateSemesterSelection(data, [1]).issues).toContainEqual(expect.objectContaining({ code: 'MISSING_COREQUISITE', subjectId: 1 }));
  });
  it('does not let excluding a confirmed FYP-like subject block another valid subject', () => {
    const a = option(1, 'OTHER1000');
    const b = option(2, 'PROJECT1000', 2);
    expect(validateSemesterSelection(input([a, b]), [1])).toMatchObject({ valid: true, totalCredits: 3 });
  });
  it('allows a two-credit Normal subject only with an explicit maintained Normal rule', () => {
    const project = option(1, 'PROJECT1000', 2);
    const ordinary = option(2, 'OTHER2000');
    const data = input([project, ordinary]);
    expect(validateSemesterSelection(data, [1]).issues).toContainEqual(expect.objectContaining({ code: 'TWO_CREDIT_NORMAL_NOT_CONFIGURED' }));
    const allowed = { ...data, curriculum: { ...data.curriculum, subjectSemesterRules: [{ ruleId: 7, curriculumSubjectId: project.curriculumSubjectId, semesterType: 'NORMAL' as const }] } };
    expect(validateSemesterSelection(allowed, [1]).valid).toBe(true);
  });
  it('allows a confirmed two-credit project subject in Normal only when the curriculum explicitly permits it', () => {
    const project = option(1, 'PROJECT1', 2);
    const data = input([project], { curriculum: { ...input([project]).curriculum, subjectSemesterRules: [{ ruleId: 7, curriculumSubjectId: project.curriculumSubjectId, semesterType: 'NORMAL' }] } });
    expect(validateSemesterSelection(data, [1])).toMatchObject({ valid: true, totalSubjects: 1, totalCredits: 2 });
  });
  it('rejects duplicates, unknowns, unconfirmed rows, satisfied subjects, uncertain history and configured-cap overflow', () => {
    const a = option(1, 'SUBJ1000', 4);
    const b = option(2, 'SUBJ2000', 4);
    const c = option(3, 'SUBJ3000', 4);
    const data = input([a, b, c], { target: { semesterId: 4, semesterType: 'NORMAL', maxSubjects: 2, maxCredits: 8 }, confirmedSubjects: [1, 2].map((subjectId) => ({ subjectId, status: 'CONFIRMED' as const, confirmedOfferingId: subjectId + 20 })) });
    expect(validateSemesterSelection(data, [1, 1, 99, 3, 2]).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['DUPLICATE_SUBJECT', 'UNKNOWN_SUBJECT', 'OUTSIDE_CONFIRMED_OFFERING', 'MAX_SUBJECTS_EXCEEDED', 'MAX_CREDITS_EXCEEDED']));
    expect(validateSemesterSelection(input([a], { student: baseStudent([{ subjectId: 1, status: 'EXEMPTED', semesterId: 1, recognizedCredits: 4 }]) }), [1]).issues[0]?.code).toBe('ALREADY_SATISFIED');
    expect(validateSemesterSelection(input([a], { student: baseStudent([], 'UNKNOWN') }), [1]).issues[0]?.code).toBe('ELIGIBILITY_UNCERTAIN');
    const failed = baseStudent([{ subjectId: 9, status: 'FAILED', semesterId: 1, recognizedCredits: 0 }]);
    expect(validateSemesterSelection(input([a], { student: failed }), [1]).valid).toBe(true);
    const cgpaOption = { ...a, conditionalPrerequisites: { status: 'AVAILABLE' as const, details: { expression: null, conditions: [{ type: 'cgpa' as const, operator: '>=' as const, value: 2 }], topicDependent: false, conditionNote: null } } };
    expect(validateSemesterSelection(input([cgpaOption]), [1]).issues[0]?.code).toBe('ELIGIBILITY_UNCERTAIN');
  });
  it('accepts exact configured caps and empty clear selections', () => {
    const a = option(1, 'CAP1000', 4); const b = option(2, 'CAP2000', 4);
    const data = input([a, b], { target: { semesterId: 4, semesterType: 'NORMAL', maxSubjects: 2, maxCredits: 8 } });
    expect(validateSemesterSelection(data, [1, 2]).valid).toBe(true);
    expect(validateSemesterSelection(data, [])).toMatchObject({ valid: true, totalSubjects: 0, totalCredits: 0 });
  });
});
