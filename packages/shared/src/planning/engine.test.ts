import { describe, expect, it } from 'vitest';
import type { PlanningInput, PlanningSubject } from './contracts';
import { comparePlans, planBaseline, planScenario } from './engine';
import { limitsFor, nextAcademicYear, semesterAt, semesterLabel } from './semesters';

const subject = (id: number, code: string, credits: number, extra: Partial<PlanningSubject> = {}): PlanningSubject => ({
  curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: credits, category: 'Core',
  compulsory: true, semesterTypes: ['NORMAL'], prerequisites: [], ...extra,
});

// Core chain A1 -> A2 -> A3, a standalone core B1, an elective group needing 1 of E1/E2/E3, and the
// English chain EN1 -> EN2 -> EN3 (2 credits, Short only).
const subjects: PlanningSubject[] = [
  subject(1, 'SECA1013', 3), subject(2, 'SECA2013', 3, { prerequisites: [1] }), subject(3, 'SECA3013', 3, { prerequisites: [2] }),
  subject(4, 'SECB1013', 3),
  subject(5, 'SECE1013', 3, { category: 'Elective E1', compulsory: false }),
  subject(6, 'SECE2013', 3, { category: 'Elective E1', compulsory: false }),
  subject(7, 'SECE3013', 3, { category: 'Elective E1', compulsory: false, prerequisites: [5] }),
  subject(8, 'UHLB1112', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'] }),
  subject(9, 'UHLB2122', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'], prerequisites: [8] }),
  subject(10, 'UHLB3132', 2, { category: 'University Compulsory', semesterTypes: ['SHORT'], prerequisites: [9] }),
];
const input = (extra: Partial<PlanningInput> = {}): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 27, earnedCredits: 0, subjects,
  requirements: [
    { requirementType: 'CORE', requiredSubjects: 4, requiredCredits: 12 },
    { requirementType: 'ELECTIVE_E1', requiredSubjects: 1, requiredCredits: null },
    { requirementType: 'UNIVERSITY_COMPULSORY', requiredSubjects: 3, requiredCredits: 6 },
  ],
  passed: [], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [{ academicYear: '2026/2027', semesterNo: 2, maxSubjects: 3, maxCredits: 10 }, { academicYear: '2026/2027', semesterNo: 3, maxSubjects: 3, maxCredits: 6 }],
  approvedFirst: null, ...extra,
});
const codesBySemester = (plan: ReturnType<typeof planBaseline>) => plan.semesters.map(s => s.subjects.map(x => x.subjectCode + (x.failedAttempt ? '*' : '')));

describe('semester helpers', () => {
  it('steps 1, 2, 3 then rolls the academic year', () => {
    expect(semesterAt({ academicYear: '2026/2027', semesterNo: 2 }, 2)).toEqual({ academicYear: '2027/2028', semesterNo: 1 });
    expect(nextAcademicYear('2026/2027')).toBe('2027/2028');
    expect(semesterAt(null, 4)).toEqual({ academicYear: '', semesterNo: 2 });
  });
  it('labels calendar and numbered semesters', () => {
    expect(semesterLabel({ academicYear: '2026/2027', semesterNo: 3 }, 2, true)).toBe('AY 2026/2027 – Semester 3 (Short Semester)');
    expect(semesterLabel({ academicYear: '', semesterNo: 1 }, 4, false)).toBe('Plan semester 4');
  });
  it('uses exact, then latest same-type, then default limits', () => {
    const limits = [{ academicYear: '2026/2027', semesterNo: 1, maxSubjects: 4, maxCredits: 12 }, { academicYear: '2025/2026', semesterNo: 2, maxSubjects: 2, maxCredits: 8 }];
    expect(limitsFor({ academicYear: '2026/2027', semesterNo: 1 }, limits)).toMatchObject({ maxSubjects: 4, maxCredits: 12 });
    expect(limitsFor({ academicYear: '2030/2031', semesterNo: 2 }, limits)).toMatchObject({ maxSubjects: 4, maxCredits: 12 });
    expect(limitsFor({ academicYear: '2030/2031', semesterNo: 3 }, limits)).toEqual({ maxSubjects: 3, maxCredits: 6, configured: false });
  });
});

describe('planBaseline', () => {
  it('places chains in separate semesters, Short-only subjects in Short semesters, and only the needed electives', () => {
    const plan = planBaseline(input());
    expect(plan.status).toBe('PLANNED');
    // The Short-only English chain needs three Short semesters, so two Normal semesters stay empty before English 3.
    expect(codesBySemester(plan)).toEqual([
      ['SECA1013', 'SECB1013', 'SECE1013'],
      ['UHLB1112'],
      ['SECA2013'],
      ['SECA3013'],
      ['UHLB2122'],
      [],
      [],
      ['UHLB3132'],
    ]);
    expect(plan.semesters[1]!.label).toBe('AY 2026/2027 – Semester 3 (Short Semester)');
    expect(plan.completion).toMatchObject({ index: 8, academicYear: '2028/2029', semesterNo: 3, label: 'AY 2028/2029 – Semester 3 (Short Semester)' });
    const elective = plan.semesters[0]!.subjects.find(s => s.subjectCode === 'SECE1013')!;
    expect(elective.electiveChoice).toEqual({ requirementType: 'ELECTIVE_E1', needed: 1, options: 3 });
    expect(plan.remainingSubjects).toBe(8);
    expect(plan.remainingCredits).toBe(21);
  });
  it('reports the earliest possible completion as a lower bound and the bottlenecks', () => {
    const plan = planBaseline(input());
    expect(plan.earliest!.index).toBeLessThanOrEqual(plan.completion!.index);
    expect(plan.earliest!.index).toBe(3);
    expect(plan.bottlenecks.map(b => b.subjectCode)).toEqual(['SECA1013', 'UHLB1112', 'SECA2013', 'UHLB2122']);
    expect(plan.bottlenecks[0]!.explanation).toBe('Delaying SECA1013 delays 2 later subjects (SECA1013 → SECA2013 → SECA3013).');
  });
  it('treats any COMPLETED or EXEMPTED attempt as passed and counts passed electives toward the group', () => {
    const plan = planBaseline(input({ passed: [1, 6, 8] }));
    const codes = codesBySemester(plan).flat();
    expect(codes).not.toContain('SECA1013');
    expect(codes.filter(code => code.startsWith('SECE'))).toEqual([]);
    expect(codes[0]).toBe('SECA2013');
  });
  it('limits the first semester to coordinator-approved subjects', () => {
    const plan = planBaseline(input({ approvedFirst: [4] }));
    expect(codesBySemester(plan)[0]).toEqual(['SECB1013']);
    expect(plan.assumptions.join(' ')).toContain('approved');
  });
  it('respects subject and credit limits', () => {
    const plan = planBaseline(input({ limits: [{ academicYear: '2026/2027', semesterNo: 2, maxSubjects: 1, maxCredits: 10 }] }));
    expect(plan.semesters[0]!.subjects).toHaveLength(1);
    expect(plan.semesters[0]!.maxSubjects).toBe(1);
  });
  it('is DONE when nothing is left', () => {
    const plan = planBaseline(input({ passed: [1, 2, 3, 4, 5, 8, 9, 10] }));
    expect(plan).toMatchObject({ status: 'DONE', semesters: [], completion: null, remainingSubjects: 0 });
  });
  it('lists subjects that can never fit as unplanned', () => {
    const big = [...subjects, subject(11, 'SECX4118', 12)];
    const plan = planBaseline(input({ subjects: big, requirements: [] }));
    expect(plan.status).toBe('INCOMPLETE');
    expect(plan.unplanned).toEqual([{ curriculumSubjectId: 11, subjectCode: 'SECX4118', subjectName: 'Name SECX4118', reason: 'Worth 12 credits, more than any semester allows.' }]);
    expect(plan.assumptions.join(' ')).toContain('No requirement groups');
  });
  it('numbers semesters when there is no current semester', () => {
    const plan = planBaseline(input({ start: null, limits: [] }));
    expect(plan.semesters[0]!.label).toBe('Plan semester 1');
    expect(plan.semesters[2]!.semesterType).toBe('SHORT');
  });
});

describe('planScenario and comparePlans', () => {
  it('postpones a subject past its baseline semester; completion holds when another chain decides it', () => {
    const baseline = planBaseline(input());
    const scenario = planScenario(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 1 }]);
    const a1 = scenario.semesters.findIndex(s => s.subjects.some(x => x.subjectCode === 'SECA1013'));
    expect(a1).toBe(2); // the next semester is Short, which SECA1013 cannot use
    expect(scenario.semesters[a1]!.subjects.find(x => x.subjectCode === 'SECA1013')!.change).toBe('POSTPONE');
    const comparison = comparePlans(baseline, scenario);
    expect(comparison.semesterDifference).toBe(0);
    expect(comparison.moved.find(m => m.subjectCode === 'SECA1013')).toMatchObject({ from: 'AY 2026/2027 – Semester 2', to: 'AY 2027/2028 – Semester 1' });
  });
  it('postponing a bottleneck delays completion', () => {
    const comparison = comparePlans(planBaseline(input()), planScenario(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 8 }]));
    expect(comparison.semesterDifference).toBe(3);
    expect(comparison.scenario!.label).toBe('AY 2029/2030 – Semester 3 (Short Semester)');
  });
  it('keeps a failed attempt in its semester, using the slot, and retakes it later', () => {
    const scenario = planScenario(input(), [{ kind: 'FAIL', curriculumSubjectId: 4 }]);
    expect(codesBySemester(scenario)[0]).toContain('SECB1013*');
    expect(codesBySemester(scenario).slice(1).flat()).toContain('SECB1013');
  });
  it('replaces an elective choice with another option from the same group', () => {
    const scenario = planScenario(input(), [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }]);
    const codes = codesBySemester(scenario).flat();
    expect(codes).toContain('SECE2013');
    expect(codes).not.toContain('SECE1013');
    expect(scenario.semesters.flatMap(s => s.subjects).find(x => x.subjectCode === 'SECE2013')!.change).toBe('REPLACE');
  });
  it('ignores a replacement from another group and changes to subjects not in the plan', () => {
    const baseline = planBaseline(input());
    expect(codesBySemester(planScenario(input(), [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 4 }, { kind: 'POSTPONE', curriculumSubjectId: 99 }]))).toEqual(codesBySemester(baseline));
  });
  it('an empty scenario equals the baseline', () => {
    const comparison = comparePlans(planBaseline(input()), planScenario(input(), []));
    expect(comparison).toMatchObject({ semesterDifference: 0, moved: [] });
  });
});

describe('review fixes (S3-P004-004 round 2)', () => {
  it('keeps every compulsory subject even when a group threshold is already met or not set', () => {
    const plan = planBaseline(input({ requirements: [{ requirementType: 'CORE', requiredSubjects: 1, requiredCredits: null }, { requirementType: 'COMPULSORY', requiredSubjects: null, requiredCredits: null }] }));
    const codes = codesBySemester(plan).flat();
    for (const code of ['SECA1013', 'SECA2013', 'SECA3013', 'SECB1013', 'UHLB1112', 'UHLB2122', 'UHLB3132']) expect(codes).toContain(code);
    expect(codes.filter(code => code.startsWith('SECE'))).toEqual([]);
  });
  it('counts compulsory members toward a group before choosing optional ones', () => {
    const mixed = subjects.map(s => s.subjectCode === 'SECE2013' ? { ...s, compulsory: true } : s);
    const plan = planBaseline(input({ subjects: mixed }));
    const codes = codesBySemester(plan).flat();
    expect(codes).toContain('SECE2013');
    expect(codes.filter(code => code.startsWith('SECE'))).toEqual(['SECE2013']);
  });
  it('applies changes in order: a second postpone moves the subject again, from where it is now', () => {
    const once = planScenario(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 8 }]);
    const twice = planScenario(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 8 }, { kind: 'POSTPONE', curriculumSubjectId: 8 }]);
    const where = (p: typeof once) => p.semesters.findIndex(s => s.subjects.some(x => x.subjectCode === 'UHLB1112' && !x.failedAttempt));
    expect(where(once)).toBe(4);
    expect(where(twice)).toBe(7);
  });
  it('records each failed attempt where it happened and puts a later fail after a postponed prerequisite', () => {
    const twice = planScenario(input(), [{ kind: 'FAIL', curriculumSubjectId: 4 }, { kind: 'FAIL', curriculumSubjectId: 4 }]);
    expect(codesBySemester(twice)[0]).toContain('SECB1013*');
    expect(codesBySemester(twice)[2]).toContain('SECB1013*');
    const chained = planScenario(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 1 }, { kind: 'FAIL', curriculumSubjectId: 2 }]);
    const a1 = chained.semesters.findIndex(s => s.subjects.some(x => x.subjectCode === 'SECA1013'));
    const failed = chained.semesters.findIndex(s => s.subjects.some(x => x.subjectCode === 'SECA2013' && x.failedAttempt));
    expect(failed).toBeGreaterThan(a1);
  });
});
