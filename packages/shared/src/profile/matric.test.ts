import { describe, expect, it } from 'vitest';
import { MATRIC_BATCH_MAX, normaliseMatric, readMatric, splitMatricList } from './matric';

describe('matric numbers (S3-P004-039)', () => {
  it('normalises spaces and case', () => {
    expect(normaliseMatric(' sx23 2315ecjhf04 ')).toBe('SX232315ECJHF04');
  });
  it('reads the intake year and programme code from the UTM form', () => {
    expect(readMatric('SX232315ECJHF04')).toEqual({ intakeYear: 2023, programmeCode: 'ECJH' });
    expect(readMatric('SX2302ECRHF04')).toEqual({ intakeYear: 2023, programmeCode: 'ECRH' });
    expect(readMatric('sx220312ecrhs04')).toEqual({ intakeYear: 2022, programmeCode: 'ECRH' });
    expect(readMatric('SX23')).toEqual({ intakeYear: 2023, programmeCode: null });
  });
  it('returns null for numbers without a readable year', () => {
    for (const bad of ['DUMMY-20261101-01', 'A22EC0001', 'SXAB1234', '']) expect(readMatric(bad)).toBeNull();
  });
  it('splits a pasted list, dropping blanks and repeats', () => {
    expect(splitMatricList('SX1\r\n\tSX2, sx1;\n\nSX3 ')).toEqual({ matricNos: ['SX1', 'SX2', 'SX3'], repeated: 1 });
    expect(splitMatricList('  \n ')).toEqual({ matricNos: [], repeated: 0 });
    expect(MATRIC_BATCH_MAX).toBe(500);
  });
});
