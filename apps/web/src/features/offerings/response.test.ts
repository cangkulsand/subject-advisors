import { describe, expect, it } from 'vitest';
import { demoContext } from '../../../../../tools/offerings/demo/fixtures';
import { readPageData } from './response';

describe('UC08 offering response compatibility', () => {
  it('accepts older contexts without optional category or subject metadata as unknown', () => {
    const page = readPageData({ ...demoContext, selection: null });
    expect(page.subjects[0]).not.toHaveProperty('subjectId');
    expect(page.subjects[0]).not.toHaveProperty('subjectCategory');
  });
  it('preserves valid additive curriculum metadata', () => {
    const page = readPageData({
      ...demoContext,
      subjects: [{ ...demoContext.subjects[0], subjectId: '501', subjectCategory: 'Elective Umum U1', isCompulsory: 0 }],
      selection: null,
    });
    expect(page.subjects[0]).toMatchObject({ subjectId: '501', subjectCategory: 'Elective Umum U1', isCompulsory: 0 });
  });
  it('accepts legacy contexts without a configured total and reads valid totals', () => {
    expect(readPageData({ ...demoContext, selection: null }).curriculum).not.toHaveProperty('totalCreditRequired');
    expect(readPageData({ ...demoContext, curriculum: { ...demoContext.curriculum, totalCreditRequired: 131 }, selection: null }).curriculum.totalCreditRequired).toBe(131);
    expect(readPageData({ ...demoContext, curriculum: { ...demoContext.curriculum, totalCreditRequired: 0 }, selection: null }).curriculum.totalCreditRequired).toBe(0);
  });
  it.each([
    { subjectId: 'bad' }, { subjectCategory: 4 }, { isCompulsory: 2 },
  ])('rejects malformed optional field %j', extra => {
    expect(() => readPageData({ ...demoContext, subjects: [{ ...demoContext.subjects[0], ...extra }], selection: null }))
      .toThrow('Invalid offerings response');
  });
  it.each([1.5, -1, 2147483648, '131'])('rejects malformed configured credit requirement %j', totalCreditRequired => {
    expect(() => readPageData({ ...demoContext, curriculum: { ...demoContext.curriculum, totalCreditRequired }, selection: null }))
      .toThrow('Invalid offerings response');
  });
  it('rejects ambiguous duplicate known subjectId mappings', () => {
    expect(() => readPageData({ ...demoContext, subjects: [
      { ...demoContext.subjects[0], subjectId: '501' },
      { ...demoContext.subjects[1], subjectId: '501' },
    ], selection: null })).toThrow('Invalid offerings response');
  });
});
