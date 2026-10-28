import { describe, expect, it } from 'vitest';
import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { isElectiveUmumU1OrU2, matchesOfferingSemesterDisplay, offeringCategoryLabel } from './display-filter';

const subject = (code: string, creditHours: number, subjectCategory?: string | null): OfferingSubject => ({
  curriculumSubjectId: '1', code, name: 'Fictional subject', creditHours, subjectCategory,
});

describe('UC08 semester display policy', () => {
  it('includes only two-credit or configured Elective Umum U1/U2 subjects in Short, except SECJ3032', () => {
    expect(matchesOfferingSemesterDisplay(subject('FIX101', 2), 3)).toBe(true);
    expect(matchesOfferingSemesterDisplay(subject('FIX102', 3, 'elective_umum-u1'), 3)).toBe(true);
    expect(matchesOfferingSemesterDisplay(subject('FIX103', 3, 'Elective U2'), 3)).toBe(true);
    expect(matchesOfferingSemesterDisplay(subject('SECJ3032', 2), 3)).toBe(false);
    expect(matchesOfferingSemesterDisplay(subject('FIX104', 3, 'Unknown'), 3)).toBe(false);
  });
  it('shows the complement plus SECJ3032 for Normal semesters', () => {
    expect(matchesOfferingSemesterDisplay(subject('FIX101', 2), 1)).toBe(false);
    expect(matchesOfferingSemesterDisplay(subject('FIX102', 3, 'Elective U1'), 2)).toBe(false);
    expect(matchesOfferingSemesterDisplay(subject('FIX103', 3, 'Core'), 1)).toBe(true);
    expect(matchesOfferingSemesterDisplay(subject('SECJ3032', 2), 2)).toBe(true);
  });
  it('recognizes category metadata without guessing from course code', () => {
    expect(isElectiveUmumU1OrU2('Elective Umum U1')).toBe(true);
    expect(isElectiveUmumU1OrU2('Elective U3')).toBe(false);
    expect(offeringCategoryLabel(subject('U1001', 2))).toBe('Other / unknown');
  });
});
