import { describe, expect, it } from 'vitest';
import { formatCurriculumPrerequisiteExpression, readCurriculumPrerequisiteDetails, hideCgpaRules } from './curriculum-reference';

const codes = new Set(['SECD2613', 'SECJ2203', 'SECR3104']);
const details = (expression: unknown) => ({ expression, fixedCourseEdgesShown: true, sourcePrerequisiteStatus: 'Yes',
  sourceCells: { E: 'E4' }, conditions: [], conditionNote: null });

describe('curriculum prerequisite reader', () => {
  it('bounds and formats nested AND/OR expressions', () => {
    const parsed = readCurriculumPrerequisiteDetails(details({ operator: 'allOf', operands: [
      { operator: 'course', code: 'SECR3104' }, { operator: 'anyOf', operands: [
        { operator: 'course', code: 'SECD2613' }, { operator: 'course', code: 'SECJ2203' },
      ] },
    ] }), codes, 'SECR3032');
    expect(formatCurriculumPrerequisiteExpression(parsed?.expression ?? null)).toBe('SECR3104 AND (SECD2613 OR SECJ2203)');
  });
  it.each([
    [{ operator: 'wat', operands: [] }],
    [{ operator: 'course', code: 'SECR3032' }],
    [{ operator: 'course', code: 'NOPE9999' }],
    [{ operator: 'allOf', operands: Array.from({ length: 17 }, () => ({ operator: 'course', code: 'SECR3104' })) }],
    [null],
  ])('rejects malformed, self, cross-catalogue and oversized details %#', expression => {
    expect(readCurriculumPrerequisiteDetails(details(expression), codes, 'SECR3032')).toBeNull();
  });
  it('preserves condition metadata without interpreting it as eligibility', () => {
    const value = { ...details(null), fixedCourseEdgesShown: false } as Record<string, unknown>;
    value.sourceCells = { K: 'K19' };
    value.conditions = [{ type: 'cgpa', operator: '>=', value: 2, sourceCell: 'K19' }];
    value.conditionNote = 'Also needs CGPA >= 2.';
    expect(readCurriculumPrerequisiteDetails(value, codes, 'SECR3032')).toMatchObject({ conditions: [{ type: 'cgpa', value: 2 }], conditionNote: 'Also needs CGPA >= 2.' });
  });
});

describe('hideCgpaRules', () => {
  const base = { expression: null, fixedCourseEdgesShown: false, sourcePrerequisiteStatus: 'Conditional', sourceCells: { K: 'K27' } };
  it('drops CGPA conditions and a note that mentions CGPA, keeping completed-credit conditions', () => {
    expect(hideCgpaRules({ ...base, conditions: [{ type: 'completedCredits', operator: '>', value: 92, sourceCell: 'K27' }, { type: 'cgpa', operator: '>=', value: 2, sourceCell: 'K27' }],
      conditionNote: 'Industrial training: more than 92 completed credits and CGPA at least 2.0.' }))
      .toMatchObject({ conditions: [{ type: 'completedCredits', value: 92 }], conditionNote: null });
  });
  it('leaves details without CGPA unchanged', () => {
    const details = { ...base, conditions: [{ type: 'completedCredits' as const, operator: '>' as const, value: 80, sourceCell: 'K27' }], conditionNote: 'Final year project.' };
    expect(hideCgpaRules(details)).toEqual(details);
  });
});
