import { describe, expect, it } from 'vitest';
import {
  CONFIRMED_OFFERING_LABEL, SENIORITY_POLICY_VERSION, CLASS_SIZE_MAXIMUM, compareBySeniority, sortPickers, type OfferingPicker, OPTIMAL_CLASS_SIZE, impliedClasses, isPickWindowOpen, isScopeAssigned,
  validateConfirmOfferingsRequest, validateSetPickDeadlineRequest, validateWithdrawOfferingsRequest,
  type ConfirmOfferingsRequest, type OfferingPickCountSummary,
} from './confirmed-offerings';

const scope = { programmeId: 1, learningCentreId: 2, targetSemesterId: 3 };
const confirm: ConfirmOfferingsRequest = { scope, forecastRunId: 7, subjectIds: [11, 12], reason: 'Approved after review', pickDeadline: '2026-12-01T00:00:00Z', baseRevision: null };

describe('confirmed offering requests', () => {
  it('accepts a well-formed confirmation', () => {
    expect(validateConfirmOfferingsRequest(confirm)).toEqual({ ok: true });
  });
  it('requires a reason, a run and unique positive subject IDs', () => {
    const result = validateConfirmOfferingsRequest({ ...confirm, reason: '  ', forecastRunId: 0, subjectIds: [1, 1] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code).sort()).toEqual(['REASON_REQUIRED', 'RUN_REQUIRED', 'SUBJECTS_DUPLICATE']);
  });
  it('rejects an empty subject list and an invalid scope', () => {
    const result = validateConfirmOfferingsRequest({ ...confirm, subjectIds: [], scope: { ...scope, learningCentreId: -1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code).sort()).toEqual(['SCOPE_INVALID', 'SUBJECTS_INVALID']);
  });
  it('validates withdrawal with a revision and reason', () => {
    expect(validateWithdrawOfferingsRequest({ scope, subjectIds: [11], reason: 'Lecturer unavailable', baseRevision: 'r1' })).toEqual({ ok: true });
    expect(validateWithdrawOfferingsRequest({ scope, subjectIds: [11], reason: '', baseRevision: 'r1' }).ok).toBe(false);
  });
  it('pick count entries carry the count, class aids and the picker list', () => {
    const summary: OfferingPickCountSummary = { scope, asOf: '2026-11-01T00:00:00Z', pickDeadline: null, counts: [{ subjectId: 11, subjectCode: 'FIC-001', subjectName: 'Fictional subject', pickCount: 4, classType: 'LECTURE', implied: impliedClasses(4, 'LECTURE'), pickers: [] }] };
    expect(Object.keys(summary.counts[0] ?? {}).sort()).toEqual(['classType', 'implied', 'pickCount', 'pickers', 'subjectCode', 'subjectId', 'subjectName']);
    expect(CONFIRMED_OFFERING_LABEL).toBe('Confirmed by coordinator');
  });
});

describe('pick deadline, assignments and implied classes', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  it('requires a parseable deadline on confirmation', () => {
    const result = validateConfirmOfferingsRequest({ ...confirm, pickDeadline: 'not-a-date' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.code)).toEqual(['DEADLINE_INVALID']);
  });
  it('requires a future deadline and a reason to change it', () => {
    expect(validateSetPickDeadlineRequest({ scope, pickDeadline: '2026-12-01T00:00:00Z', reason: 'Extended', baseRevision: 'r1' }, now)).toEqual({ ok: true });
    expect(validateSetPickDeadlineRequest({ scope, pickDeadline: '2026-10-01T00:00:00Z', reason: '', baseRevision: 'r1' }, now).ok).toBe(false);
  });
  it('closes picks at the deadline', () => {
    expect(isPickWindowOpen('2026-11-02T00:00:00Z', now)).toBe(true);
    expect(isPickWindowOpen('2026-11-01T00:00:00Z', now)).toBe(false);
  });
  it('limits scope to assigned programme and centre', () => {
    const assignments = [{ facultyId: 1, programmeId: 1, learningCentreId: 2 }];
    expect(isScopeAssigned(assignments, scope)).toBe(true);
    expect(isScopeAssigned(assignments, { ...scope, learningCentreId: 9 })).toBe(false);
    expect(isScopeAssigned([], scope)).toBe(false);
  });
  it('derives implied classes from the decided class sizes (LAB 35, LECTURE 45, optimal 25)', () => {
    expect(CLASS_SIZE_MAXIMUM).toEqual({ LAB: 35, LECTURE: 45 });
    expect(OPTIMAL_CLASS_SIZE).toBe(25);
    expect(impliedClasses(46, 'LECTURE')).toEqual({ maxPerClass: 45, classesAtMaximum: 2, classesAtOptimal: 2, averageSizeAtMaximum: 23 });
    expect(impliedClasses(71, 'LAB')).toMatchObject({ maxPerClass: 35, classesAtMaximum: 3, classesAtOptimal: 3 });
    expect(impliedClasses(10, null)).toMatchObject({ maxPerClass: 45, classesAtMaximum: 1 });
    expect(impliedClasses(0, 'LAB')).toEqual({ maxPerClass: 35, classesAtMaximum: 0, classesAtOptimal: 0, averageSizeAtMaximum: 0 });
  });
});

describe('picker seniority ordering (display aid, OP16 decided)', () => {
  const sem = (academicYear: string, semesterNumber: 1 | 2 | 3, semesterId: number) => ({ semesterId, academicYear, semesterNumber });
  const mk = (studentId: number, studentName: string, creditsCompleted: number | null, intake: ReturnType<typeof sem> | null, current: ReturnType<typeof sem> | null = null): OfferingPicker =>
    ({ studentId, studentName, matricNo: null, currentSemester: current, intakeSemester: intake, creditsCompleted });
  it('orders by credits completed, most first', () => {
    const list = [mk(1, 'A', 30, null), mk(2, 'B', 90, null), mk(3, 'C', 60, null)];
    expect(sortPickers(list).map((p) => p.studentId)).toEqual([2, 3, 1]);
  });
  it('breaks ties by earliest intake, known before unknown', () => {
    const list = [
      mk(1, 'A', 60, sem('2025/2026', 1, 5)),
      mk(2, 'B', 60, sem('2024/2025', 2, 4)),
      mk(3, 'C', 60, null),
    ];
    expect(sortPickers(list).map((p) => p.studentId)).toEqual([2, 1, 3]);
  });
  it('falls back to the later current semester, then name', () => {
    const list = [
      mk(1, 'Zed', 60, null, sem('2026/2027', 1, 7)),
      mk(2, 'Amy', 60, null, sem('2026/2027', 2, 8)),
      mk(3, 'Bob', 60, null, sem('2026/2027', 2, 8)),
    ];
    expect(sortPickers(list).map((p) => p.studentId)).toEqual([2, 3, 1]);
  });
  it('labels the ordering as display-aid policy version 1', () => {
    expect(SENIORITY_POLICY_VERSION).toBe(1);
  });
  it('puts unknown credits last, can sort by name and does not mutate input', () => {
    const list = [mk(1, 'B', null, null), mk(2, 'A', 10, null)];
    expect(sortPickers(list).map((p) => p.studentId)).toEqual([2, 1]);
    expect(sortPickers(list, 'name').map((p) => p.studentName)).toEqual(['A', 'B']);
    expect(list.map((p) => p.studentId)).toEqual([1, 2]);
    expect(compareBySeniority(list[1]!, list[1]!)).toBe(0);
  });
});
