import { describe, expect, it } from 'vitest';
import { assessPlan } from './assessment';
import { planBaseline, planScenario } from './engine';
import type { PlanningInput } from './contracts';

const subject = (id: number, code: string, extra = {}) => ({ curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: 3,
  category: 'Core', compulsory: true, semesterTypes: ['NORMAL' as const], prerequisites: [] as number[], ...extra });

const input = (extra: Partial<PlanningInput> = {}): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 12, earnedCredits: 3,
  subjects: [subject(1, 'A'), subject(2, 'B', { prerequisites: [1] }), subject(3, 'C'), subject(4, 'D')],
  requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 4, requiredCredits: null }],
  recorded: { 4: { status: 'COMPLETED', recognizedCredits: 3 } },
  passed: [4], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [['2026/2027', 2], ['2026/2027', 3], ['2027/2028', 1], ['2027/2028', 2], ['2027/2028', 3], ['2028/2029', 1]].map(([y, n], i) =>
    ({ semesterId: 21 + i, academicYear: y as string, semesterNo: n as number, maxSubjects: 3, maxCredits: 10 })),
  approvedFirst: null,
  ...extra,
});

const byKey = (key: string) => (r: { key: string }) => r.key === key;

describe('assessPlan', () => {
  it('marks a scheduled plan as projected and counts recorded plus nominal credits', () => {
    const plan = planBaseline(input());
    const out = assessPlan(input(), plan);
    const total = out.requirements.find(byKey('total'))!;
    expect(total).toMatchObject({ requiredCredits: 12, recordedCredits: 3, projectedCredits: 12, remainingCredits: 0, status: 'PROJECTED' });
    expect(total.completion).not.toBeNull();
    const group = out.requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group).toMatchObject({ requiredSubjects: 4, recordedSubjects: 1, projectedSubjects: 4, status: 'PROJECTED' });
    expect(out.complete).toBe(true);
    expect(out.warnings).toEqual([]);
  });
  it('is MET when records alone satisfy the thresholds and has no projected completion', () => {
    const i = input({ totalCredits: 6, earnedCredits: 6, recorded: { 4: { status: 'COMPLETED', recognizedCredits: 3 }, 1: { status: 'EXEMPTED', recognizedCredits: 3 } },
      passed: [4, 1], requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 2, requiredCredits: null }] });
    const out = assessPlan(i, planBaseline(i));
    expect(out.requirements.find(byKey('group-0-COMPULSORY'))!.status).toBe('MET');
    expect(out.requirements.find(byKey('group-0-COMPULSORY'))!.completion).toBeNull();
    expect(out.complete).toBe(true);
  });
  it('counts a zero-credit exemption toward subject counts but not credits', () => {
    const i = input({ recorded: { 4: { status: 'EXEMPTED', recognizedCredits: 0 } }, earnedCredits: 0, totalCredits: 9,
      requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 4, requiredCredits: null }] });
    const group = assessPlan(i, planBaseline(i)).requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group.recordedSubjects).toBe(1);
    expect(group.recordedCredits).toBe(0);
  });
  it('stays outstanding when the scheduled credits still miss the total', () => {
    const i = input({ totalCredits: 60 });
    const out = assessPlan(i, planBaseline(i));
    expect(out.requirements.find(byKey('total'))!.status).toBe('OUTSTANDING');
    expect(out.complete).toBe(false);
  });
  it('is unverified when the total credits figure is missing', () => {
    const i = input({ totalCredits: null });
    const out = assessPlan(i, planBaseline(i));
    const total = out.requirements.find(byKey('total'))!;
    expect(total.status).toBe('UNVERIFIED');
    expect(total.requiredCredits).toBeNull();
    expect(out.complete).toBe(false);
    expect(out.warnings.join(' ')).toMatch(/total/i);
  });
  it('is unverified when a group has no thresholds', () => {
    const i = input({ requirements: [{ requirementType: 'ELECTIVE', requiredSubjects: null, requiredCredits: null }] });
    const out = assessPlan(i, planBaseline(i));
    expect(out.requirements.find(byKey('group-0-ELECTIVE'))!.status).toBe('UNVERIFIED');
  });
  it('never counts a failed attempt twice', () => {
    const i = input();
    const plan = planScenario(i, [{ kind: 'FAIL', curriculumSubjectId: 3 }]);
    const out = assessPlan(i, plan);
    const group = out.requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group.projectedSubjects).toBe(4);
    expect(group.projectedCredits).toBe(12);
  });
  it('does not double-count a subject placed twice', () => {
    const i = input();
    const plan = planScenario(i, [{ kind: 'PLACE', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 2 } }, { kind: 'PLACE', curriculumSubjectId: 1, semester: { academicYear: '2026/2027', semesterNo: 3 } }]);
    const out = assessPlan(i, plan);
    expect(out.requirements.find(byKey('group-0-COMPULSORY'))!.projectedSubjects).toBeLessThanOrEqual(4);
  });
  it('delays a projected requirement row when the scenario postpones a needed subject', () => {
    const i = input();
    const base = assessPlan(i, planBaseline(i));
    const later = planScenario(i, [{ kind: 'PLACE', curriculumSubjectId: 3, semester: { academicYear: '2028/2029', semesterNo: 1 } }]);
    const after = assessPlan(i, later);
    const before = base.requirements.find(byKey('group-0-COMPULSORY'))!.completion!;
    const shifted = after.requirements.find(byKey('group-0-COMPULSORY'))!.completion!;
    expect(shifted.index).toBeGreaterThan(before.index);
  });
  it('warns when legacy records exist without recognised credit detail', () => {
    const i = input({ recorded: undefined });
    const out = assessPlan(i, planBaseline(i));
    expect(out.warnings.join(' ')).toMatch(/recognised|recognized/i);
  });
  it('warns when a passed mapping is missing from a partial recorded map', () => {
    const i = input({ recorded: {} });
    expect(assessPlan(i, planBaseline(i)).warnings.join(' ')).toMatch(/recognized/i);
  });
  it('keeps an incomplete plan unconfirmed even when every row projects', () => {
    const i = input();
    const plan = { ...planBaseline(i), status: 'INCOMPLETE' as const };
    const out = assessPlan(i, plan);
    expect(out.requirements.every(r => r.status === 'MET' || r.status === 'PROJECTED')).toBe(true);
    expect(out.complete).toBe(false);
  });
  it('stays unconfirmed when all subjects passed but configured targets are unmet', () => {
    const i = input({ passed: [1, 2, 3, 4], earnedCredits: 12, totalCredits: 60,
      recorded: { 1: { status: 'COMPLETED', recognizedCredits: 3 }, 2: { status: 'COMPLETED', recognizedCredits: 3 }, 3: { status: 'COMPLETED', recognizedCredits: 3 }, 4: { status: 'COMPLETED', recognizedCredits: 3 } } });
    const plan = planBaseline(i);
    expect(plan.status).toBe('DONE');
    const out = assessPlan(i, plan);
    expect(out.requirements.find(byKey('total'))!.status).toBe('OUTSTANDING');
    expect(out.complete).toBe(false);
  });
  it('counts a partial exemption at its recognized credits, not the nominal value', () => {
    const i = input({ recorded: { 4: { status: 'EXEMPTED', recognizedCredits: 1 } }, earnedCredits: 1, totalCredits: 11,
      requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 4, requiredCredits: 11 }] });
    const group = assessPlan(i, planBaseline(i)).requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group.recordedSubjects).toBe(1);
    expect(group.recordedCredits).toBe(1);
    expect(group.projectedCredits).toBe(10);
    expect(group.remainingCredits).toBe(1);
    expect(group.status).toBe('OUTSTANDING');
  });
  it('keeps a known subject-count deficiency outstanding when credit figures are unknown', () => {
    const i = input({ recorded: {}, requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 5, requiredCredits: 20 }] });
    const group = assessPlan(i, planBaseline(i)).requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group.status).toBe('OUTSTANDING');
  });
  it('is unverified when only credit information is missing and counts could be met', () => {
    const i = input({ recorded: {}, requirements: [{ requirementType: 'COMPULSORY', requiredSubjects: 4, requiredCredits: 99 }] });
    const group = assessPlan(i, planBaseline(i)).requirements.find(byKey('group-0-COMPULSORY'))!;
    expect(group.projectedSubjects).toBe(4);
    expect(group.status).toBe('UNVERIFIED');
  });
  it('does not let a duplicated successful subject advance the total completion date', () => {
    const i = input({ totalCredits: 6, earnedCredits: 0 });
    const base = planBaseline(i);
    const first = base.semesters[0]!, third = base.semesters[2]!;
    const dup: typeof base = { ...base, semesters: [
      { ...first, subjects: first.subjects.filter(s => s.curriculumSubjectId === 1), credits: 3 },
      { ...third, index: 2, subjects: [{ ...first.subjects.find(s => s.curriculumSubjectId === 1)! }], credits: 3 },
      { ...third, index: 3, subjects: third.subjects.filter(s => s.curriculumSubjectId === 2), credits: 3 },
    ] };
    const out = assessPlan(i, dup);
    expect(out.requirements.find(byKey('total'))!.completion!.index).toBe(3);
  });
});
