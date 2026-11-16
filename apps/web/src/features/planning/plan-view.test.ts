import { describe, expect, it } from 'vitest';
import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { changeableSubjects, describeChange, differenceText, replacementOptions, subjectNote } from './plan-view';

const input: PlanningInput = {
  programmeName: 'SE', curriculumVersion: '2024', totalCredits: 9, earnedCredits: 0, passed: [], approvedFirst: null,
  start: { academicYear: '2026/2027', semesterNo: 1 }, limits: [],
  subjects: [
    { curriculumSubjectId: 1, subjectCode: 'SECJ1013', subjectName: 'PT1', creditHours: 3, category: 'Core', compulsory: true, semesterTypes: ['NORMAL'], prerequisites: [] },
    { curriculumSubjectId: 2, subjectCode: 'SECE1013', subjectName: 'E1', creditHours: 3, category: 'Elective E1', compulsory: false, semesterTypes: ['NORMAL'], prerequisites: [] },
    { curriculumSubjectId: 3, subjectCode: 'SECE2013', subjectName: 'E2', creditHours: 3, category: 'Elective E1', compulsory: false, semesterTypes: ['NORMAL'], prerequisites: [] },
  ],
  requirements: [{ requirementType: 'Core', requiredSubjects: 1, requiredCredits: null }, { requirementType: 'Elective E1', requiredSubjects: 1, requiredCredits: null }],
};

describe('plan view helpers', () => {
  const plan = planBaseline(input);
  it('lists changeable subjects and replacement options from the same group', () => {
    expect(changeableSubjects(plan).map(s => s.subjectCode)).toEqual(['SECE1013', 'SECJ1013']);
    const elective = changeableSubjects(plan)[0]!;
    expect(replacementOptions(input, plan, elective).map(s => s.subjectCode)).toEqual(['SECE2013']);
    expect(replacementOptions(input, plan, changeableSubjects(plan)[1]!)).toEqual([]);
  });
  it('words notes, differences and changes', () => {
    expect(subjectNote(changeableSubjects(plan)[0]!)).toBe('Elective choice: any 1 of 2 options');
    expect(subjectNote(changeableSubjects(plan)[1]!)).toBeNull();
    const failed = planScenario(input, [{ kind: 'FAIL', curriculumSubjectId: 1 }]).semesters[0]!.subjects.find(s => s.failedAttempt)!;
    expect(subjectNote(failed)).toBe('Failed in this what-if: retaken later');
    expect([differenceText(0), differenceText(2), differenceText(-1), differenceText(null)]).toEqual(['Same as your plan', '2 semesters later', '1 semester earlier', 'Cannot compare: one of the plans cannot be completed']);
    expect(describeChange({ kind: 'REPLACE', curriculumSubjectId: 2, replacementId: 3 }, input)).toBe('Replace SECE1013 with SECE2013');
    expect(describeChange({ kind: 'WITHDRAW', curriculumSubjectId: 1 }, input)).toBe('Withdraw from SECJ1013');
  });
});
