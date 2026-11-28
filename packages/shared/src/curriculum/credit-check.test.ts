import { describe, expect, it } from 'vitest';
import { creditCheck } from './credit-check';

const s = (code: string, credits: number, category: string, compulsory = false) => ({ code, credits, category, compulsory });
const core = Array.from({ length: 3 }, (_, i) => s('CORE' + i, 3, 'Core', true));

describe('curriculum credit check (S3-P004-044)', () => {
  it('adds the cheapest optional subjects of each group to the compulsory credits', () => {
    const subjects = [...core, s('E1A', 4, 'Elective E1'), s('E1B', 2, 'Elective E1'), s('E1C', 3, 'Elective E1'), s('U1A', 2, 'Elective U1')];
    const check = creditCheck(subjects, [{ type: 'ELECTIVE_E1', credits: null, subjects: 2 }, { type: 'ELECTIVE_U1', credits: null, subjects: 1 }], 16);
    expect(check.compulsory).toBe(9);
    expect(check.groups).toEqual([
      { type: 'ELECTIVE_E1', label: 'Elective E1 (2 subjects)', extra: 5, unmet: null },
      { type: 'ELECTIVE_U1', label: 'Elective U1 (1 subject)', extra: 2, unmet: null },
    ]);
    expect(check).toMatchObject({ minimum: 16, status: 'MATCHES', difference: 0, summary: 'Matches' });
  });
  it('says short or over by how many credits', () => {
    expect(creditCheck(core, [], 10)).toMatchObject({ minimum: 9, status: 'SHORT', difference: 1, summary: 'Short by 1 credit' });
    expect(creditCheck(core, [], 5)).toMatchObject({ status: 'OVER', difference: 4, summary: 'Over by 4 credits' });
  });
  it('a group its compulsory subjects already meet adds nothing', () => {
    expect(creditCheck(core, [{ type: 'CORE', credits: 9, subjects: 3 }], 9).groups[0]).toMatchObject({ extra: 0, unmet: null });
  });
  it('a group with both a subject count and credits must meet both', () => {
    const subjects = [s('E3A', 2, 'Elective E3'), s('E3B', 2, 'Elective E3'), s('E3C', 6, 'Elective E3')];
    expect(creditCheck(subjects, [{ type: 'ELECTIVE_E3', credits: 8, subjects: 2 }], 8).groups[0]).toMatchObject({ extra: 8, unmet: null });
  });
  it('names a group that the mapped subjects cannot meet', () => {
    const subjects = [s('IT1', 8, 'Industrial Training', true), s('IT2', 4, 'Industrial Training', true)];
    expect(creditCheck(subjects, [{ type: 'INDUSTRIAL_TRAINING', credits: 92, subjects: null }], 12).groups[0]!.unmet).toBe('Industrial Training needs 92 credits; only 12 are available.');
    expect(creditCheck([s('E1A', 3, 'Elective E1')], [{ type: 'ELECTIVE_E1', credits: null, subjects: 4 }], 12).groups[0]!.unmet).toBe('Elective E1 needs 4 subjects; only 1 is available.');
    expect(creditCheck(core, [{ type: 'ELECTIVE_X', credits: null, subjects: 1 }], 9).groups[0]!.unmet).toBe('ELECTIVE_X needs 1 subject; only 0 are available.');
  });
  it('a missing total is reported as not set', () => {
    for (const total of [null, 0]) expect(creditCheck(core, [], total)).toMatchObject({ status: 'NOT_SET', summary: 'Total credit requirement is not set.' });
  });
});
