import { describe, expect, it } from 'vitest';
import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { planDependencies } from './dependencies';

const subject = (id: number, code: string, extra = {}) => ({ curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: 3,
  category: 'Core', compulsory: true, semesterTypes: ['NORMAL' as const], prerequisites: [] as number[], ...extra });

const input = (extra: Partial<PlanningInput> = {}): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 12, earnedCredits: 3,
  curriculumId: 1,
  subjects: [subject(1, 'A'), subject(2, 'B', { prerequisites: [1], corequisites: [3] }), subject(3, 'C'), subject(4, 'D', { compulsory: false }), subject(5, 'E1', { compulsory: false, category: 'Elective E1' }), subject(6, 'E2', { compulsory: false, category: 'Elective E1' }), subject(7, 'E3', { compulsory: false, category: 'Elective E1' })],
  requirements: [{ requirementType: 'ELECTIVE_E1', requiredSubjects: 1, requiredCredits: null }],
  recorded: { 4: { status: 'EXEMPTED', recognizedCredits: 3 } },
  passed: [4], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [['2026/2027', 2], ['2026/2027', 3], ['2027/2028', 1], ['2027/2028', 2]].map(([y, n], i) =>
    ({ semesterId: 21 + i, academicYear: y as string, semesterNo: n as number, maxSubjects: 3, maxCredits: 10 })),
  approvedFirst: null,
  ...extra,
});

describe('planDependencies', () => {
  it('builds the pathway graph from the shown plan input: statuses, mandatory and co-requisite edges', () => {
    const i = input();
    const { graph } = planDependencies(i, planBaseline(i), null);
    expect(graph.curriculumId).toBe(1);
    const node = (id: string) => graph.nodes.find(n => n.id === id)!;
    expect(node('4').status).toBe('EXEMPTED');
    expect(node('4').recognizedCredits).toBe(3);
    expect(node('1').status).toBe('REMAINING');
    expect(node('1').subjectCode).toBe('A');
    const edge = (s: string, t: string, type: string) => graph.edges.some(e => e.source === s && e.target === t && e.requirementType === type);
    expect(edge('1', '2', 'MANDATORY')).toBe(true);
    expect(edge('3', '2', 'COREQUISITE')).toBe(true);
  });
  it('marks recorded-less passed subjects as unknown, not completed', () => {
    const i = input({ recorded: undefined });
    const { graph } = planDependencies(i, planBaseline(i), null);
    expect(graph.nodes.find(n => n.id === '4')!.status).toBe('UNKNOWN');
  });
  it('annotates each subject with its semester from the given plan only', () => {
    const i = input();
    const plan = planBaseline(i);
    const { annotations } = planDependencies(i, plan, null);
    const semesterOf = (id: number) => plan.semesters.find(s => s.subjects.some(x => x.curriculumSubjectId === id && !x.failedAttempt))?.label;
    expect(annotations['1']).toEqual({ semester: semesterOf(1), baselineSemester: undefined, changed: false });
    expect(annotations['4']!.semester).toBe('Already satisfied');
  });
  it('flags subjects whose semester differs in the comparison baseline', () => {
    const i = input();
    const baseline = planBaseline(i);
    const scenario = planScenario(i, [{ kind: 'PLACE', curriculumSubjectId: 3, semester: { academicYear: '2027/2028', semesterNo: 2 } }]);
    const { annotations } = planDependencies(i, scenario, baseline);
    expect(annotations['3']!.changed).toBe(true);
    expect(annotations['3']!.baselineSemester).not.toBe(annotations['3']!.semester);
    expect(annotations['1']!.changed).toBe(false);
  });
  it('labels unused electives, unplanned and replaced subjects from the supplied plans', () => {
    const i = input();
    const baseline = planBaseline(i);
    const notes = planDependencies(i, baseline, null).annotations;
    expect(notes['4']!.semester).toBe('Already satisfied');
    const picked = baseline.semesters.flatMap(s => s.subjects).find(s => [5, 6, 7].includes(s.curriculumSubjectId))!;
    const unused = [5, 6, 7].filter(id => id !== picked.curriculumSubjectId);
    for (const id of unused) expect(notes[String(id)]!.semester).toBe('Not selected in this plan');
    const heavy = input({ subjects: [...i.subjects, subject(8, 'HUGE', { creditHours: 11 })] });
    expect(planDependencies(heavy, planBaseline(heavy), null).annotations['8']!.semester).toBe('Cannot be scheduled');
    const replaced = planScenario(i, [{ kind: 'REPLACE', curriculumSubjectId: picked.curriculumSubjectId, replacementId: unused[0]! }]);
    const after = planDependencies(i, replaced, baseline).annotations;
    expect(after[String(picked.curriculumSubjectId)]!.semester).toBe('Not selected in this plan');
    expect(after[String(picked.curriculumSubjectId)]!.changed).toBe(true);
    expect(after[String(unused[0]!)]!.semester).not.toBe('Not selected in this plan');
    expect(after[String(unused[0]!)]!.changed).toBe(true);
  });
});
