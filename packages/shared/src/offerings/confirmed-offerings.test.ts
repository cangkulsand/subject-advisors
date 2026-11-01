import { describe, expect, it } from 'vitest';
import { CONFIRMED_OFFERING_LABEL, CONFIRMED_OFFERING_NOTICE, NOT_YET_CONFIRMED_MESSAGE, PICKS_CLOSED_MESSAGE, PICK_ERROR_CODES, hideAlreadyPassed, nextSemesterAfter, pickAllowance, validateOfferingPicks } from './confirmed-offerings';

const confirmed = [{ curriculumSubjectId: '101' }, { curriculumSubjectId: '102' }];
describe('student picks from confirmed offerings', () => {
  it('accepts confirmed subjects and an empty clear', () => {
    expect(validateOfferingPicks(['101', '102'], confirmed)).toEqual({ ok: true });
    expect(validateOfferingPicks([], confirmed)).toEqual({ ok: true });
  });
  it('rejects subjects that are not confirmed', () => {
    expect(validateOfferingPicks(['101', '999'], confirmed)).toEqual({ ok: false, issues: [{ code: 'OFFERING_NOT_CONFIRMED', curriculumSubjectId: '999' }] });
  });
  it('rejects duplicates', () => {
    expect(validateOfferingPicks(['101', '101'], confirmed)).toEqual({ ok: false, issues: [{ code: 'PICK_DUPLICATE', curriculumSubjectId: '101' }] });
  });
  it('uses wording that does not claim official registration or a guaranteed timetable', () => {
    expect(CONFIRMED_OFFERING_LABEL).toBe('Confirmed by coordinator');
    expect(CONFIRMED_OFFERING_NOTICE).toMatch(/not an official registration/);
    expect(CONFIRMED_OFFERING_NOTICE).toMatch(/not a guaranteed timetable/);
  });
});

describe('next semester targeting', () => {
  const sems = [
    { semesterId: '3', academicYear: '2026/2027', semesterNo: 3 as const },
    { semesterId: '1', academicYear: '2026/2027', semesterNo: 1 as const },
    { semesterId: '2', academicYear: '2026/2027', semesterNo: 2 as const },
    { semesterId: '4', academicYear: '2027/2028', semesterNo: 1 as const },
  ];
  it('targets the semester after the profile current semester', () => {
    expect(nextSemesterAfter('1', sems)?.semesterId).toBe('2');
    expect(nextSemesterAfter('3', sems)?.semesterId).toBe('4');
  });
  it('returns null when no later semester or unknown current semester', () => {
    expect(nextSemesterAfter('4', sems)).toBeNull();
    expect(nextSemesterAfter('999', sems)).toBeNull();
  });
  it('has a not-yet-confirmed message for the empty state', () => {
    expect(NOT_YET_CONFIRMED_MESSAGE).toBe('Offerings not yet confirmed by the coordinator');
  });
});

describe('limits, passed subjects and pick allowance', () => {
  const items = [
    { curriculumSubjectId: '1', subjectId: 's1', creditHours: 3 },
    { curriculumSubjectId: '2', subjectId: 's2', creditHours: 3 },
    { curriculumSubjectId: '3', subjectId: 's3', creditHours: 4 },
  ];
  it('enforces subject and credit limits on save', () => {
    const result = validateOfferingPicks(['1', '2', '3'], items, { limits: { maxSubjects: 2, maxCredits: 8 } });
    expect(result).toEqual({ ok: false, issues: [
      { code: 'PICK_LIMIT_SUBJECTS', curriculumSubjectId: null },
      { code: 'PICK_LIMIT_CREDITS', curriculumSubjectId: null },
    ] });
    expect(validateOfferingPicks(['1', '2'], items, { limits: { maxSubjects: 3, maxCredits: 6 } })).toEqual({ ok: true });
  });
  it('rejects already passed subjects and hides them from the list', () => {
    expect(validateOfferingPicks(['1'], items, { passedCurriculumSubjectIds: new Set(['1']) }))
      .toEqual({ ok: false, issues: [{ code: 'ALREADY_PASSED', curriculumSubjectId: '1' }] });
    expect(hideAlreadyPassed(items, new Set(['s2'])).map((i) => i.curriculumSubjectId)).toEqual(['1', '3']);
  });
  it('computes the remaining allowance', () => {
    expect(pickAllowance({ maxSubjects: 3, maxCredits: 10 }, [{ creditHours: 3 }, { creditHours: 4 }]))
      .toEqual({ maxSubjects: 3, maxCredits: 10, pickedSubjects: 2, pickedCredits: 7, remainingSubjects: 1, remainingCredits: 3 });
    expect(pickAllowance({ maxSubjects: 1, maxCredits: 3 }, [{ creditHours: 3 }, { creditHours: 4 }]).remainingCredits).toBe(0);
  });
  it('exposes stable error codes and the closed message', () => {
    expect(PICK_ERROR_CODES.closed).toBe('PICKS_CLOSED');
    expect(PICK_ERROR_CODES.limitExceeded).toBe('PICK_LIMIT_EXCEEDED');
    expect(PICKS_CLOSED_MESSAGE).toMatch(/closed/);
  });
});
