import { describe, expect, it } from 'vitest';
import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { changeableSubjects, describeChange, differenceText, replacementOptions, restoreChanges, subjectNote } from './plan-view';

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

describe('saved what-if (S3-P004-010)', () => {
  const calendar: PlanningInput = { ...input, limits: [{ semesterId: 7, academicYear: '2026/2027', semesterNo: 2, maxSubjects: 3, maxCredits: 10 }] };
  it('describes a move and a moved retake', () => {
    expect(describeChange({ kind: 'PLACE', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 2 } }, calendar)).toBe('Move SECJ1013 to 2026/2027 – Semester 2');
    expect(describeChange({ kind: 'FAIL', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 2 } }, calendar)).toBe('Fail SECJ1013, retaken in 2026/2027 – Semester 2');
  });
  it('notes a subject the student placed', () => {
    const plan = planScenario(calendar, [{ kind: 'PLACE', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 2 } }]);
    const placed = plan.semesters.flatMap(s => s.subjects).find(s => s.subjectCode === 'SECJ1013')!;
    expect(subjectNote(placed)).toBe('Placed here by you');
  });
  it('restores saved changes and drops the ones that no longer apply', () => {
    expect(restoreChanges(calendar, null)).toEqual({ changes: [], dropped: 0 });
    expect(restoreChanges(calendar, { savedAt: 'x', changes: [{ kind: 'POSTPONE', curriculumSubjectId: 999 }, { kind: 'PLACE', curriculumSubjectId: 1, semesterId: 7 }] }))
      .toEqual({ changes: [{ kind: 'PLACE', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 2 } }], dropped: 1 });
  });
});
