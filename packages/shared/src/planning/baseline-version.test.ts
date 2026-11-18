import { describe, expect, it } from 'vitest';
import { planningBaselineVersion } from './baseline-version';
import type { PlanningInput } from './contracts';

const subject = (id: number, code: string, extra = {}) => ({ curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: 3,
  category: 'Core', compulsory: true, semesterTypes: ['NORMAL' as const], prerequisites: [] as number[], ...extra });

const input = (): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 12, earnedCredits: 3,
  curriculumId: 1,
  subjects: [subject(2, 'B', { prerequisites: [1, 3], corequisites: [4] }), subject(1, 'A'), subject(3, 'C'), subject(4, 'D')],
  requirements: [{ requirementType: 'CORE', requiredSubjects: 2, requiredCredits: 6 }],
  recorded: { 4: { status: 'COMPLETED', recognizedCredits: 3 } },
  passed: [4], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [{ semesterId: 21, academicYear: '2026/2027', semesterNo: 2, maxSubjects: 3, maxCredits: 10 }],
  approvedFirst: [1, 3],
});

describe('planningBaselineVersion', () => {
  it('is a 64-char hex digest', async () => {
    expect(await planningBaselineVersion(input())).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is stable when subject, set, id and object-key order changes', async () => {
    const a = input();
    const b = input();
    b.subjects.find(s => s.curriculumSubjectId === 2)!.prerequisites = [3, 1];
    b.subjects = [...b.subjects].reverse();
    b.approvedFirst = [3, 1];
    const reordered = Object.fromEntries(Object.entries(b).reverse()) as unknown as PlanningInput;
    reordered.subjects = b.subjects.map(s => Object.fromEntries(Object.entries(s).reverse())) as PlanningInput['subjects'];
    reordered.limits = b.limits.map(l => Object.fromEntries(Object.entries(l).reverse())) as PlanningInput['limits'];
    expect(await planningBaselineVersion(reordered)).toBe(await planningBaselineVersion(a));
  });
  it('ignores the baselineVersion field itself', async () => {
    const a = input();
    const b: PlanningInput = { ...input(), baselineVersion: 'x'.repeat(64) };
    expect(await planningBaselineVersion(b)).toBe(await planningBaselineVersion(a));
  });
  it.each([
    ['a curriculum id', (i: PlanningInput) => { i.curriculumId = 2; }],
    ['a recorded credit', (i: PlanningInput) => { i.recorded = { 4: { status: 'COMPLETED', recognizedCredits: 2 } }; }],
    ['a record status', (i: PlanningInput) => { i.recorded = { 4: { status: 'EXEMPTED', recognizedCredits: 3 } }; }],
    ['a subject', (i: PlanningInput) => { i.subjects[0]!.creditHours = 4; }],
    ['a prerequisite link', (i: PlanningInput) => { i.subjects[0]!.prerequisites = [1]; }],
    ['a rule', (i: PlanningInput) => { i.requirements[0]!.requiredCredits = 9; }],
    ['an offering', (i: PlanningInput) => { i.approvedFirst = [1]; }],
    ['a semester limit', (i: PlanningInput) => { i.limits[0]!.maxSubjects = 2; }],
    ['the start semester', (i: PlanningInput) => { i.start = { academicYear: '2026/2027', semesterNo: 3 }; }],
    ['earned credits', (i: PlanningInput) => { i.earnedCredits = 6; }],
    ['passed set', (i: PlanningInput) => { i.passed = [3, 4]; }],
  ])('changes when %s changes', async (_name, mutate) => {
    const changed = input(); mutate(changed);
    expect(await planningBaselineVersion(changed)).not.toBe(await planningBaselineVersion(input()));
  });
  it('does not mutate the input', async () => {
    const a = input();
    const snapshot = JSON.stringify(a);
    await planningBaselineVersion(a);
    expect(JSON.stringify(a)).toBe(snapshot);
    expect(a.subjects[0]!.prerequisites).toEqual([1, 3]);
    expect(a.approvedFirst).toEqual([1, 3]);
  });
  it('is deterministic across calls', async () => {
    expect(await planningBaselineVersion(input())).toBe(await planningBaselineVersion(input()));
  });
});
