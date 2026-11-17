import { describe, expect, it } from 'vitest';
import type { GraduationPlan, PlanningInput, PlanningSubject, ScenarioChange, SemesterLimit } from './contracts';
import { planBaseline } from './engine';
import { checkChange, checkPlacement, cleanChanges, placementTargets, validateChanges, withChange } from './placement';

const subject = (id: number, code: string, credits: number, extra: Partial<PlanningSubject> = {}): PlanningSubject => ({
  curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: credits, category: 'Core',
  compulsory: true, semesterTypes: ['NORMAL'], prerequisites: [], ...extra,
});
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
// Configured 2026/2027 S2 (id 21) to 2028/2029 S3 (id 28).
const limits: SemesterLimit[] = [
  ['2026/2027', 2], ['2026/2027', 3], ['2027/2028', 1], ['2027/2028', 2], ['2027/2028', 3], ['2028/2029', 1], ['2028/2029', 2], ['2028/2029', 3],
].map(([academicYear, semesterNo], i) => ({ semesterId: 21 + i, academicYear: academicYear as string, semesterNo: semesterNo as number,
  maxSubjects: 3, maxCredits: semesterNo === 3 ? 6 : 10 }));
const input = (extra: Partial<PlanningInput> = {}): PlanningInput => ({
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 27, earnedCredits: 0, subjects,
  requirements: [
    { requirementType: 'CORE', requiredSubjects: 4, requiredCredits: 12 },
    { requirementType: 'ELECTIVE_E1', requiredSubjects: 1, requiredCredits: null },
    { requirementType: 'UNIVERSITY_COMPULSORY', requiredSubjects: 3, requiredCredits: 6 },
  ],
  passed: [], start: { academicYear: '2026/2027', semesterNo: 2 }, limits, approvedFirst: null, ...extra,
});
const sem = (academicYear: string, semesterNo: number) => ({ academicYear, semesterNo });
const place = (id: number, academicYear: string, semesterNo: number): ScenarioChange => ({ kind: 'PLACE', curriculumSubjectId: id, semester: sem(academicYear, semesterNo) });
const indexOf = (plan: GraduationPlan, code: string) => plan.semesters.findIndex(s => s.subjects.some(x => x.subjectCode === code && !x.failedAttempt));
const refused = (check: ReturnType<typeof checkPlacement>) => check.ok ? 'accepted' : check.reason;

describe('checkPlacement refusals', () => {
  it('refuses a semester before the first planned one', () => {
    expect(refused(checkPlacement(input(), [], 4, sem('2026/2027', 1)))).toBe('You can only plan from 2026/2027 – Semester 2 onwards.');
  });
  it('refuses a semester the admin has not set up', () => {
    expect(refused(checkPlacement(input(), [], 4, sem('2029/2030', 1)))).toBe('This semester is not set up yet.');
  });
  it('refuses the wrong semester type', () => {
    expect(refused(checkPlacement(input(), [], 4, sem('2026/2027', 3)))).toBe('Runs only in Normal semesters.');
    expect(refused(checkPlacement(input(), [], 8, sem('2027/2028', 1)))).toBe('Runs only in Short semesters.');
  });
  it('refuses a first-semester subject the coordinator did not approve', () => {
    const changes = [place(4, '2027/2028', 1)];
    expect(refused(checkPlacement(input({ approvedFirst: [1] }), changes, 4, sem('2026/2027', 2)))).toBe('Not approved by your coordinator for 2026/2027 – Semester 2.');
  });
  it('refuses a semester already full with placed subjects', () => {
    const changes = [place(1, '2026/2027', 2), place(4, '2026/2027', 2), place(5, '2026/2027', 2)];
    expect(validateChanges(input(), changes).ok).toBe(true);
    expect(refused(checkPlacement(input(), changes, 2, sem('2026/2027', 2)))).toBe('2026/2027 – Semester 2 is already full with subjects you placed there.');
  });
  it('refuses moving a subject to or after a placed subject that needs it', () => {
    const changes = [place(2, '2027/2028', 1)];
    expect(refused(checkPlacement(input(), changes, 1, sem('2027/2028', 2)))).toBe('SECA2013 is placed in 2027/2028 – Semester 1 and needs this subject first.');
  });
  it('refuses when a prerequisite cannot fit before the target', () => {
    expect(refused(checkPlacement(input(), [], 3, sem('2026/2027', 2)))).toBe('Needs SECA2013 first, and there is no room to fit it in an earlier semester.');
  });
});

describe('checkPlacement accepted', () => {
  it('pins the subject and returns the new plan', () => {
    const check = checkPlacement(input(), [], 4, sem('2027/2028', 2));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.changes).toEqual([place(4, '2027/2028', 2)]);
    expect(indexOf(check.plan, 'SECB1013')).toBe(3);
  });
  it('moving back to the semester the plan would choose removes the pin', () => {
    const check = checkPlacement(input(), [place(4, '2027/2028', 2)], 4, sem('2026/2027', 2));
    expect(check.ok && check.changes).toEqual([]);
  });
});

describe('withChange', () => {
  it('a move after a fail keeps the fail and pins the retake', () => {
    expect(withChange([{ kind: 'FAIL', curriculumSubjectId: 4 }], place(4, '2027/2028', 2))).toEqual([{ kind: 'FAIL', curriculumSubjectId: 4, semester: sem('2027/2028', 2) }]);
  });
  it('a move replaces a postpone or an earlier move', () => {
    expect(withChange([{ kind: 'POSTPONE', curriculumSubjectId: 4 }], place(4, '2027/2028', 2))).toEqual([place(4, '2027/2028', 2)]);
    expect(withChange([place(4, '2027/2028', 1), { kind: 'POSTPONE', curriculumSubjectId: 1 }], place(4, '2027/2028', 2)))
      .toEqual([{ kind: 'POSTPONE', curriculumSubjectId: 1 }, place(4, '2027/2028', 2)]);
  });
  it('a form change replaces a move', () => {
    expect(withChange([place(4, '2027/2028', 2)], { kind: 'POSTPONE', curriculumSubjectId: 4 })).toEqual([{ kind: 'POSTPONE', curriculumSubjectId: 4 }]);
  });
});

describe('checkChange', () => {
  it('refuses a form change that breaks a placed subject', () => {
    const check = checkChange(input(), [place(2, '2027/2028', 1)], { kind: 'POSTPONE', curriculumSubjectId: 1 });
    expect(check.ok ? 'accepted' : check.reason).toBe('SECA2013 is placed in 2027/2028 – Semester 1 and needs this subject first. Remove that move first.');
  });
  it('accepts a form change that keeps every placement', () => {
    expect(checkChange(input(), [place(4, '2027/2028', 2)], { kind: 'POSTPONE', curriculumSubjectId: 5 }).ok).toBe(true);
  });
});

describe('cleanChanges', () => {
  it('drops a placement now before the first planned semester', () => {
    const later = input({ start: sem('2027/2028', 2) });
    expect(cleanChanges(later, [place(2, '2027/2028', 1)])).toEqual({ changes: [], dropped: 1 });
  });
  it('drops changes to unknown or passed subjects', () => {
    expect(cleanChanges(input(), [{ kind: 'POSTPONE', curriculumSubjectId: 999 }]).dropped).toBe(1);
    expect(cleanChanges(input({ passed: [4] }), [place(4, '2027/2028', 2)]).dropped).toBe(1);
  });
  it('drops a placement in a semester that is no longer set up', () => {
    expect(cleanChanges(input({ limits: limits.slice(0, 3) }), [place(4, '2027/2028', 2)]).dropped).toBe(1);
  });
  it('keeps a valid list', () => {
    const changes = [place(4, '2027/2028', 2), { kind: 'POSTPONE', curriculumSubjectId: 5 } as ScenarioChange];
    expect(cleanChanges(input(), changes)).toEqual({ changes, dropped: 0 });
  });
});

describe('placementTargets', () => {
  it('lists the semesters with why a subject cannot go there', () => {
    const targets = placementTargets(input(), planBaseline(input()), [], 4);
    expect(targets[0]).toMatchObject({ label: '2026/2027 – Semester 2', ok: true, reason: null });
    expect(targets[1]).toMatchObject({ label: '2026/2027 – Semester 3 (Short Semester)', ok: false, reason: 'Runs only in Normal semesters.' });
    expect(targets.length).toBe(planBaseline(input()).semesters.length + 1);
  });
});
