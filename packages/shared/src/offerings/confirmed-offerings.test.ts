import { describe, expect, it } from 'vitest';
import { CONFIRMED_OFFERING_LABEL, CONFIRMED_OFFERING_NOTICE, nextSemesterAfter } from './confirmed-offerings';

describe('student wording', () => {
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
});
