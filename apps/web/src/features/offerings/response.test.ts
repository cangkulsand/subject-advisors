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
  it('normalizes absent, null and unknown optional metadata to unavailable while preserving known-empty', () => {
    const catalogue = [{ ...demoContext.subjects[0], curriculumSubjectId: '501', subjectId: '701' }];
    for (const metadata of [undefined, null, { status: 'future' }, { status: 'available' }]) {
      const page = readPageData({ ...demoContext, subjects: [{ ...catalogue[0], prerequisites: metadata }], selection: null });
      expect(page.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
    }
    const empty = readPageData({ ...demoContext, subjects: [{ ...catalogue[0], prerequisites: { status: 'available', items: [] } }], selection: null });
    expect(empty.subjects[0]?.prerequisites).toEqual({ status: 'available', items: [] });
  });
  it('resolves optional relationships against the full catalogue and accepts all types to one target', () => {
    const [first, second] = demoContext.subjects;
    const catalogue = [
      { ...first!, curriculumSubjectId: '501', subjectId: '701', code: 'FIX101', prerequisites: { status: 'available', items: [
        { requiredCurriculumSubjectId: '502', requirementType: 'MANDATORY' },
        { requiredCurriculumSubjectId: '502', requirementType: 'RECOMMENDED' },
        { requiredCurriculumSubjectId: '502', requirementType: 'COREQUISITE' },
      ] } },
      { ...second!, curriculumSubjectId: '502', subjectId: '702', code: 'FIX102', prerequisites: { status: 'available', items: [] } },
    ];
    const page = readPageData({ ...demoContext, subjects: catalogue, selection: null });
    expect(page.subjects[0]?.prerequisites).toEqual(catalogue[0]?.prerequisites);
  });
  const invalidPrerequisiteCases: Array<{ items: unknown; reason: string }> = [
    { items: [{ requiredCurriculumSubjectId: '999', requirementType: 'MANDATORY' }], reason: 'missing target' },
    { items: [{ requiredCurriculumSubjectId: '0502', requirementType: 'MANDATORY' }], reason: 'noncanonical ID' },
    { items: [{ requiredCurriculumSubjectId: '502', requirementType: 'OTHER' }], reason: 'unknown type' },
    { items: [{ requiredCurriculumSubjectId: '501', requirementType: 'MANDATORY' }], reason: 'self edge' },
    { items: [
      { requiredCurriculumSubjectId: '502', requirementType: 'MANDATORY' },
      { requiredCurriculumSubjectId: '502', requirementType: 'MANDATORY' },
    ], reason: 'duplicate exact edge' },
  ];
  it.each(invalidPrerequisiteCases)('normalizes malformed optional edges to unavailable ($reason)', ({ items }) => {
    const [first, second] = demoContext.subjects;
    const page = readPageData({ ...demoContext, subjects: [
      { ...first!, curriculumSubjectId: '501', subjectId: '701', prerequisites: { status: 'available', items } },
      { ...second!, curriculumSubjectId: '502', subjectId: '702' },
    ], selection: null });
    expect(page.subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
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
