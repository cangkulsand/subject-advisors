import type { OfferingSemester, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';

export function normalizeOfferingCategory(category: string | null | undefined): string {
  return category?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') ?? '';
}

export function isElectiveUmumU1OrU2(category: string | null | undefined): boolean {
  const normalized = normalizeOfferingCategory(category);
  return normalized === 'ELECTIVE U1' || normalized === 'ELECTIVE U2' ||
    normalized === 'ELECTIVE UMUM U1' || normalized === 'ELECTIVE UMUM U2';
}

/** User-requested UC08 display policy only; it does not determine eligibility or saved IDs. */
export function matchesOfferingSemesterDisplay(subject: OfferingSubject, semesterNo: OfferingSemester['semesterNo']): boolean {
  if (semesterNo === 3) return subject.code.trim().toUpperCase() !== 'SECJ3032' &&
    (subject.creditHours === 2 || isElectiveUmumU1OrU2(subject.subjectCategory));
  return subject.code.trim().toUpperCase() === 'SECJ3032' ||
    !(subject.creditHours === 2 || isElectiveUmumU1OrU2(subject.subjectCategory));
}

export function offeringCategoryLabel(subject: OfferingSubject): string {
  return subject.subjectCategory?.trim() || 'Other / unknown';
}
