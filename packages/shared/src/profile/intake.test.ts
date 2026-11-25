import { describe, expect, it } from 'vitest';
import { curriculumForIntake, curriculumLabel, intakeYearRange } from './intake';

const v1 = { curriculumId: 3, curriculumVersion: 'V1', effectiveYear: 2022 };
const v2 = { curriculumId: 8, curriculumVersion: 'V2', effectiveYear: 2026 };
describe('curriculumForIntake (S3-P004-037)', () => {
  it('takes the latest curriculum effective on or before the intake year', () => {
    expect(curriculumForIntake([v1, v2], 2024)).toEqual({ curriculumId: 3 });
    expect(curriculumForIntake([v2, v1], 2026)).toEqual({ curriculumId: 8 });
    expect(curriculumForIntake([v1, v2], 2030)).toEqual({ curriculumId: 8 });
    expect(curriculumForIntake([v1, v2], 2022)).toEqual({ curriculumId: 3 });
  });
  it('lets the student choose between curricula sharing the winning year', () => {
    const tie = { curriculumId: 9, curriculumVersion: 'V1b', effectiveYear: 2022 };
    expect(curriculumForIntake([v1, tie, v2], 2024)).toEqual({ choose: [3, 9] });
  });
  it('lets the student choose among all curricula when none is effective by the intake year', () => {
    expect(curriculumForIntake([v1, v2], 2021)).toEqual({ choose: [3, 8] });
    const undated = { curriculumId: 5, curriculumVersion: 'X', effectiveYear: null };
    const undated2 = { curriculumId: 6, curriculumVersion: 'Y', effectiveYear: null };
    expect(curriculumForIntake([undated, undated2], 2024)).toEqual({ choose: [5, 6] });
  });
  it('ignores curricula without an effective year when another qualifies', () => {
    const undated = { curriculumId: 5, curriculumVersion: 'X', effectiveYear: null };
    expect(curriculumForIntake([undated, v1], 2024)).toEqual({ curriculumId: 3 });
  });
  it('returns the only curriculum offered whatever its year', () => {
    expect(curriculumForIntake([v2], 2020)).toEqual({ curriculumId: 8 });
    expect(curriculumForIntake([{ curriculumId: 5, curriculumVersion: 'X', effectiveYear: null }], 2024)).toEqual({ curriculumId: 5 });
  });
  it('offers nothing to choose from an empty list', () => {
    expect(curriculumForIntake([], 2024)).toEqual({ choose: [] });
  });
});
describe('curriculumLabel', () => {
  it('shows the effective year when known', () => {
    expect(curriculumLabel(v1)).toBe('V1 (from 2022)');
    expect(curriculumLabel({ curriculumVersion: 'V1', effectiveYear: null })).toBe('V1');
  });
});
describe('intakeYearRange', () => {
  it('spans the last twelve years up to the current UTC year', () => {
    expect(intakeYearRange(new Date('2026-11-25T00:00:00Z'))).toEqual({ min: 2014, max: 2026 });
    expect(intakeYearRange(new Date('2026-12-31T23:30:00Z'))).toEqual({ min: 2014, max: 2026 });
    expect(intakeYearRange(new Date('2027-01-01T00:00:00Z'))).toEqual({ min: 2015, max: 2027 });
  });
});
