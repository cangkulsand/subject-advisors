import { describe, expect, it } from 'vitest';
import { semesterLabel, semesterType } from './offerings';

describe('semester presentation', () => {
  it.each([[1, 'Normal'], [2, 'Normal'], [3, 'Short']] as const)('Semester %i is %s', (number, label) => {
    expect(semesterType(number)).toBe(label);
  });
  it('identifies year, number and short semester explicitly', () => {
    expect(semesterLabel({ semesterId: 'fixture', academicYear: '2026/2027', semesterNo: 3 }))
      .toBe('Academic Year 2026/2027 — Semester 3 (Short Semester)');
  });
});
