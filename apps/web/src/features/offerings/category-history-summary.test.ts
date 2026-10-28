import { describe, expect, it } from 'vitest';
import type { OfferingAcademicHistory, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringCategoryGroup, offeringCategoryPillLabel, sortOfferingSubjectsByCategory, summarizeOfferingCategories } from './category-history-summary';

const subject = (id: string, category: string | null | undefined, code = `FIX${id}`, subjectId = id): OfferingSubject => ({
  curriculumSubjectId: id, subjectId, code, name: 'Fictional subject', creditHours: 3, subjectCategory: category,
});
const history: OfferingAcademicHistory = { status: 'available', records: [
  { subjectId: '1', code: 'FIX1', name: 'Fictional subject', status: 'COMPLETED', recognizedCredits: 3, creditHours: 3 },
  { subjectId: '2', code: 'FIX2', name: 'Fictional subject', status: 'EXEMPTED', recognizedCredits: 0, creditHours: 3 },
  { subjectId: '3', code: 'FIX3', name: 'Fictional subject', status: 'FAILED', recognizedCredits: 0, creditHours: 3 },
  { subjectId: '4', code: 'FIX4', name: 'Fictional subject', status: 'COMPLETED', recognizedCredits: 3, creditHours: 3 },
  { subjectId: '4', code: 'FIX4', name: 'Fictional subject', status: 'FAILED', recognizedCredits: 0, creditHours: 3 },
] };

describe('Offerings category history summary', () => {
  it('counts only unique completed or exempted mapped subjects against actual category catalogue counts', () => {
    const subjects = [subject('1', 'Core'), subject('2', 'Programme Core'), subject('3', 'Core'), subject('4', 'Core'), subject('5', 'Core')];
    expect(summarizeOfferingCategories(subjects, history, 1)).toEqual({
      groups: [{ group: 'CORE', label: 'Core', subjectCount: 5, recognizedCount: 2, unresolvedCount: 1 }],
      historyAvailable: true, unclassifiedCount: 0,
    });
  });

  it('uses metadata categories for Normal and Short labels without counting other semester groups', () => {
    const subjects = [subject('1', 'Core'), subject('2', 'Elective E1'), subject('3', 'Elective E2'), subject('4', 'Elective Umum U1'), subject('5', 'Elective U2')];
    expect(summarizeOfferingCategories(subjects, history, 1).groups.map(group => group.label)).toEqual(['Core', 'E1', 'E2']);
    expect(summarizeOfferingCategories(subjects, history, 3).groups.map(group => group.label)).toEqual(['U1', 'U2']);
    expect(offeringCategoryGroup(subject('5', 'Elective U2'))).toBe('U2');
    expect(offeringCategoryPillLabel(subject('2', 'Elective E1'))).toBe('E1');
  });

  it('matches Records metadata handling for compulsory Industrial Training only', () => {
    expect(offeringCategoryGroup({ ...subject('1', 'Industrial Training'), isCompulsory: 1 })).toBe('CORE');
    expect(offeringCategoryGroup({ ...subject('2', 'Industrial Training'), isCompulsory: 0 })).toBe('OTHER');
  });

  it('reports unavailable history as unavailable rather than zero and flags unknown categories separately', () => {
    const subjects = [subject('1', 'Core'), subject('2', null), subject('3', 'Elective')];
    expect(summarizeOfferingCategories(subjects, { status: 'unavailable' }, 1)).toMatchObject({
      groups: [{ label: 'Core', subjectCount: 1, recognizedCount: null }], historyAvailable: false, unclassifiedCount: 2,
    });
    expect(offeringCategoryPillLabel(subject('2', null))).toBe('Other / unknown');
  });

  it('sorts a copy by canonical category then code without relying on subject code prefixes', () => {
    const input = [subject('1', 'Elective Umum U2', 'AAA'), subject('2', null, 'AAA'), subject('3', 'Elective E1', 'ZZZ'), subject('4', 'Core', 'FIX10'), subject('5', 'Core', 'FIX2'), subject('6', 'Other B', 'BBB'), subject('7', 'Other A', 'ZZZ')];
    const sorted = sortOfferingSubjectsByCategory(input);
    expect(input.map(item => item.curriculumSubjectId)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(sorted.map(item => item.curriculumSubjectId)).toEqual(['5', '4', '3', '1', '7', '6', '2']);
  });
});
