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
  it('preserves validated logical conditions and notes from optional curriculum details', () => {
    const [first, second] = demoContext.subjects;
    const detail = { expression: { operator: 'anyOf', operands: [
      { operator: 'course', code: 'FIX101' }, { operator: 'course', code: 'FIX102' },
    ] }, conditions: [], conditionNote: 'Either subject satisfies this requirement.' };
    const page = readPageData({ ...demoContext, subjects: [
      { ...first!, curriculumSubjectId: '501', subjectId: '701', code: 'FIX103', prerequisites: { status: 'available', items: [], details: detail } },
      { ...second!, curriculumSubjectId: '502', subjectId: '702', code: 'FIX101' },
      { ...second!, curriculumSubjectId: '503', subjectId: '703', code: 'FIX102' },
    ], selection: null });
    expect(page.subjects[0]?.prerequisites).toMatchObject({ status: 'available', details: { conditionNote: detail.conditionNote } });
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
  it('decodes the selection window, pick limits and withdrawal notes', () => {
    const page = readPageData({ ...demoContext, selection: null,
      window: { status: 'NOT_OPEN', targetSemesterId: '201', selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: null, learningCentreName: 'Kuala Lumpur' },
      limits: { maxSubjects: 6, maxCredits: 18 },
      withdrawnSubjects: [{ subjectId: '9', code: 'DEMO204', name: 'Human-computer interaction', withdrawnAt: '2026-11-09T10:00:00.000Z' }] });
    expect(page.window).toEqual({ status: 'NOT_OPEN', targetSemesterId: '201', selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: null, learningCentreName: 'Kuala Lumpur' });
    expect(page.limits).toEqual({ maxSubjects: 6, maxCredits: 18 });
    expect(page.withdrawnSubjects?.[0]?.code).toBe('DEMO204');
  });
  it.each([
    { window: { status: 'MAYBE', targetSemesterId: null, selectionOpensAt: null, selectionClosesAt: null, learningCentreName: null } },
    { window: { status: 'OPEN', targetSemesterId: null, selectionOpensAt: 'tomorrow', selectionClosesAt: null, learningCentreName: null } },
    { limits: { maxSubjects: -1, maxCredits: 18 } },
    { withdrawnSubjects: [{ subjectId: '9', code: 'A', name: 'A', withdrawnAt: 'x' }] },
    { withdrawnSubjects: 'none' },
  ])('rejects malformed window data %j', extra => {
    expect(() => readPageData({ ...demoContext, selection: null, ...extra })).toThrow('Invalid offerings response');
  });
  it('resolves prerequisites of offered subjects against the whole-curriculum catalogue', () => {
    const [first, second] = demoContext.subjects;
    const offered = { ...first!, curriculumSubjectId: '501', subjectId: '701', code: 'FIX101', prerequisites: { status: 'available', items: [{ requiredCurriculumSubjectId: '502', requirementType: 'MANDATORY' }] } };
    const hidden = { ...second!, curriculumSubjectId: '502', subjectId: '702', code: 'FIX102' };
    const page = readPageData({ ...demoContext, subjects: [offered], prerequisiteCatalogue: [{ ...offered, prerequisites: undefined }, hidden], selection: null });
    expect(page.subjects[0]?.prerequisites).toEqual({ status: 'available', items: [{ requiredCurriculumSubjectId: '502', requirementType: 'MANDATORY' }] });
    expect(page.prerequisiteCatalogue?.map(subject => subject.code)).toEqual(['FIX101', 'FIX102']);
    // Without the catalogue the same edge points outside the list and degrades to unavailable.
    expect(readPageData({ ...demoContext, subjects: [offered], selection: null }).subjects[0]?.prerequisites).toEqual({ status: 'unavailable' });
    expect(() => readPageData({ ...demoContext, subjects: [offered], prerequisiteCatalogue: [hidden], selection: null })).toThrow('Invalid offerings response');
  });
});
