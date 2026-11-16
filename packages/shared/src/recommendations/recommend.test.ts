import { describe, expect, it } from 'vitest';
import type { PlanningInput, PlanningSubject } from '../planning/contracts';
import { recommend } from './recommend';

const subject = (id: number, code: string, credits: number, extra: Partial<PlanningSubject> = {}): PlanningSubject => ({
  curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: credits, category: 'Core',
  compulsory: true, semesterTypes: ['NORMAL'], prerequisites: [], ...extra,
});
const subjects: PlanningSubject[] = [
  subject(1, 'SECA1013', 3), subject(2, 'SECA2013', 3, { prerequisites: [1] }), subject(3, 'SECA3013', 3, { prerequisites: [2] }),
  subject(4, 'SECB1013', 3),
  subject(5, 'SECE1013', 3, { category: 'Elective E1', compulsory: false }),
  subject(6, 'SECE2013', 3, { category: 'Elective E1', compulsory: false }),
  subject(8, 'UHLB1112', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'] }),
  subject(9, 'UHLB2122', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'], prerequisites: [8] }),
  subject(10, 'UHLB3132', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'], prerequisites: [9] }),
];
const input = (extra: Partial<PlanningInput> = {}): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 27, earnedCredits: 0, subjects,
  requirements: [
    { requirementType: 'CORE', requiredSubjects: 4, requiredCredits: null },
    { requirementType: 'ELECTIVE_E1', requiredSubjects: 1, requiredCredits: null },
    { requirementType: 'UNIVERSITY_COMPULSORY', requiredSubjects: 3, requiredCredits: null },
  ],
  passed: [], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [{ academicYear: '2026/2027', semesterNo: 2, maxSubjects: 3, maxCredits: 10 }, { academicYear: '2026/2027', semesterNo: 3, maxSubjects: 3, maxCredits: 6 }],
  approvedFirst: null, ...extra,
});
const codes = (option: { subjects: { subjectCode: string }[] } | null) => option?.subjects.map(s => s.subjectCode);

describe('recommend', () => {
  it('ranks full loads that start the longest chain first, with reasons', () => {
    const result = recommend(input());
    expect(result.status).toBe('READY');
    expect(result.semester).toEqual({ label: 'AY 2026/2027 – Semester 2', semesterType: 'NORMAL', maxSubjects: 3, maxCredits: 10 });
    expect(codes(result.best)).toEqual(['SECA1013', 'SECB1013', 'SECE1013']);
    expect(result.best!.differenceFromBest).toBe(0);
    expect(result.best!.subjects[0]!.reasons).toEqual(['Unlocks 2 later subjects', 'Compulsory']);
    expect(result.best!.subjects[2]!.reasons).toEqual(['Counts toward Elective E1']);
    expect(result.alternatives.map(codes)).toEqual([['SECA1013', 'SECB1013'], ['SECA1013', 'SECE1013'], ['SECA1013']]);
    expect(result.warnings).toEqual([]); // the English chain decides completion, so leaving SECA1013 out costs nothing
  });
  it('warns about a Short-only chain head and names the next Short semester', () => {
    const result = recommend(input({ start: { academicYear: '2026/2027', semesterNo: 3 } }));
    expect(codes(result.best)).toEqual(['UHLB1112']);
    expect(result.best!.subjects[0]!.reasons).toContain('Short semester only: the next chance is AY 2027/2028 – Semester 3 (Short Semester)');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toBe('If you do not take UHLB1112 in AY 2026/2027 – Semester 3 (Short Semester), your earliest completion moves from AY 2028/2029 – Semester 3 (Short Semester) to AY 2029/2030 – Semester 3 (Short Semester). This assumes later semesters offer every subject.');
  });
  it('recommends only coordinator-approved subjects when the semester is decided', () => {
    const result = recommend(input({ approvedFirst: [4, 5] }));
    expect(codes(result.best)).toEqual(['SECB1013', 'SECE1013']);
    expect(result.assumptions[0]).toBe('Only subjects your coordinator approved for AY 2026/2027 – Semester 2 are recommended.');
  });
  it('says when nothing can be recommended and when nothing is left', () => {
    expect(recommend(input({ approvedFirst: [] }))).toMatchObject({ status: 'NO_CANDIDATES', best: null, alternatives: [] });
    expect(recommend(input({ passed: [1, 2, 3, 4, 5, 8, 9, 10] }))).toMatchObject({ status: 'DONE', best: null });
  });
  it('keeps every option within the subject and credit limits', () => {
    const result = recommend(input({ limits: [{ academicYear: '2026/2027', semesterNo: 2, maxSubjects: 2, maxCredits: 6 }] }));
    for (const option of [result.best!, ...result.alternatives]) {
      expect(option.subjects.length).toBeLessThanOrEqual(2);
      expect(option.credits).toBeLessThanOrEqual(6);
    }
  });
});
