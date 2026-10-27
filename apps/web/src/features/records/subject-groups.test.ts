import { describe, expect, it } from 'vitest';
import { groupElectiveSubjects, groupSubjectsByCategory, subjectGroupForCategory } from './subject-groups';

describe('subject category grouping', () => {
  it.each([
    ['CORE', 'CORE'], [' core ', 'CORE'], ['Programme   Core', 'CORE'], ['TERAS', 'CORE'],
    ['ELECTIVE', 'ELECTIVE'], [' programme elective ', 'ELECTIVE'], ['ELEKTIF', 'ELECTIVE'],
    ['Elective E1', 'ELECTIVE'], [' ELECTIVE   e2 ', 'ELECTIVE'], ['Elective U1', 'ELECTIVE'], ['Elective U2', 'ELECTIVE'],
    ['Alt Elective', 'ELECTIVE'], ['Generic Elective', 'ELECTIVE'],
    ['', 'OTHER'], [null, 'OTHER'], [undefined, 'OTHER'], ['Major', 'OTHER'], ['COMPULSORY', 'OTHER'],
  ] as const)('maps %s to %s without category inference', (category, group) => expect(subjectGroupForCategory(category)).toBe(group));

  it('preserves every subject exactly once across groups and keeps unknown categories in Other', () => {
    const subjects = [
      { subjectId: 1, subjectCategory: 'core' },
      { subjectId: 2, subjectCategory: 'Programme Elective' },
      { subjectId: 3, subjectCategory: null },
      { subjectId: 4, subjectCategory: 'SPECIAL' },
      { subjectId: 5 },
    ];
    const groups = groupSubjectsByCategory(subjects);
    expect(groups).toEqual({
      core: [subjects[0]], elective: [subjects[1]], other: [subjects[2], subjects[3], subjects[4]],
    });
    expect([...groups.core, ...groups.elective, ...groups.other]).toHaveLength(subjects.length);
    expect(new Set([...groups.core, ...groups.elective, ...groups.other].map(({ subjectId }) => subjectId)).size).toBe(subjects.length);
  });

  it('classifies Industrial Training as Core only when its configured compulsory flag is set', () => {
    expect(subjectGroupForCategory('Industrial Training')).toBe('OTHER');
    expect(subjectGroupForCategory('Industrial Training', 0)).toBe('OTHER');
    expect(subjectGroupForCategory(' industrial   training ', 1)).toBe('CORE');
    const groups = groupSubjectsByCategory([
      { subjectId: 11, subjectCategory: 'Industrial Training', isCompulsory: 1 as const },
      { subjectId: 12, subjectCategory: 'Industrial Training', isCompulsory: 0 as const },
    ]);
    expect(groups.core.map(({ subjectId }) => subjectId)).toEqual([11]);
    expect(groups.other.map(({ subjectId }) => subjectId)).toEqual([12]);
  });

  it('groups explicit elective subcategories with configured pick rules and preserves rows', () => {
    const subjects = [
      { subjectId: 1, subjectCategory: 'Elective E1' },
      { subjectId: 2, subjectCategory: 'elective e1' },
      { subjectId: 3, subjectCategory: 'Elective U1' },
      { subjectId: 4, subjectCategory: 'Alt Elective' },
      { subjectId: 5, subjectCategory: 'Unknown Elective' },
    ];
    const groups = groupElectiveSubjects(subjects, [
      { category: 'Elective E1', requiredSubjects: 4, availableSubjects: 5 },
      { category: 'Elective U1', requiredSubjects: 1, availableSubjects: 24 },
    ]);
    expect(groups).toEqual([
      { category: 'Elective E1', requiredSubjects: 4, availableSubjects: 5, subjects: [subjects[0], subjects[1]] },
      { category: 'Elective U1', requiredSubjects: 1, availableSubjects: 24, subjects: [subjects[2]] },
      { category: 'Alt Elective', requiredSubjects: null, availableSubjects: 1, subjects: [subjects[3]] },
    ]);
    expect(groups.flatMap(({ subjects: members }) => members).map(({ subjectId }) => subjectId)).toEqual([1, 2, 3, 4]);
  });

  it('does not choose between conflicting duplicate group metadata', () => {
    const groups = groupElectiveSubjects([{ subjectId: 1, subjectCategory: 'Elective E1' }], [
      { category: 'Elective E1', requiredSubjects: 4, availableSubjects: 5 },
      { category: 'elective e1', requiredSubjects: 3, availableSubjects: 5 },
      { category: 'Elective E2', requiredSubjects: null, availableSubjects: 9 },
    ]);
    expect(groups).toEqual([
      { category: 'Elective E1', requiredSubjects: null, availableSubjects: 10, subjects: [{ subjectId: 1, subjectCategory: 'Elective E1' }] },
      { category: 'Elective E2', requiredSubjects: null, availableSubjects: 9, subjects: [] },
    ]);
  });
});
