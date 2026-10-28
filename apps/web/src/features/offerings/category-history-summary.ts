import type { OfferingAcademicHistory, OfferingSemester, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { normalizeOfferingCategory } from './display-filter';

export type OfferingCategoryGroup = 'CORE' | 'E1' | 'E2' | 'U1' | 'U2' | 'OTHER';
export interface OfferingCategoryProgress {
  group: Exclude<OfferingCategoryGroup, 'OTHER'>;
  label: string;
  subjectCount: number;
  recognizedCount: number | null;
  unresolvedCount: number;
}
export interface OfferingCategorySummary {
  groups: OfferingCategoryProgress[];
  historyAvailable: boolean;
  unclassifiedCount: number;
}

const categoryOrder: OfferingCategoryGroup[] = ['CORE', 'E1', 'E2', 'U1', 'U2', 'OTHER'];
const aliases: Record<string, Exclude<OfferingCategoryGroup, 'OTHER'>> = {
  CORE: 'CORE', 'PROGRAMME CORE': 'CORE', TERAS: 'CORE',
  E1: 'E1', 'ELECTIVE E1': 'E1',
  E2: 'E2', 'ELECTIVE E2': 'E2',
  U1: 'U1', 'ELECTIVE U1': 'U1', 'ELECTIVE UMUM U1': 'U1',
  U2: 'U2', 'ELECTIVE U2': 'U2', 'ELECTIVE UMUM U2': 'U2',
};

export function offeringCategoryGroup(subject: OfferingSubject): OfferingCategoryGroup {
  if (normalizeOfferingCategory(subject.subjectCategory) === 'INDUSTRIAL TRAINING' && subject.isCompulsory === 1) return 'CORE';
  return aliases[normalizeOfferingCategory(subject.subjectCategory)] ?? 'OTHER';
}

export function offeringCategoryPillLabel(subject: OfferingSubject): string {
  const group = offeringCategoryGroup(subject);
  if (group !== 'OTHER') return group === 'CORE' ? 'Core' : group;
  return subject.subjectCategory?.trim() || 'Other / unknown';
}

/** Stable copy sorted by explicit curriculum category metadata, then subject code. */
export function sortOfferingSubjectsByCategory(subjects: readonly OfferingSubject[]): OfferingSubject[] {
  return [...subjects].sort((left, right) => {
    const leftGroup = offeringCategoryGroup(left), rightGroup = offeringCategoryGroup(right);
    const categoryDifference = categoryOrder.indexOf(leftGroup) - categoryOrder.indexOf(rightGroup);
    const otherCategoryDifference = leftGroup === 'OTHER' && rightGroup === 'OTHER'
      ? (normalizeOfferingCategory(left.subjectCategory) || '\uffff').localeCompare(normalizeOfferingCategory(right.subjectCategory) || '\uffff', undefined, { numeric: true, sensitivity: 'base' })
      : 0;
    return categoryDifference || otherCategoryDifference || left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: 'base' }) ||
      left.curriculumSubjectId.localeCompare(right.curriculumSubjectId, undefined, { numeric: true });
  });
}

/**
 * Count only unambiguous, mapped COMPLETED/EXEMPTED subjects. The denominator is
 * the actual current-curriculum catalogue count for each category, not a degree
 * requirement. Unavailable history never becomes a zero count.
 */
export function summarizeOfferingCategories(
  subjects: readonly OfferingSubject[],
  history: OfferingAcademicHistory | undefined,
  semesterNo: OfferingSemester['semesterNo'],
): OfferingCategorySummary {
  const visibleGroups: Exclude<OfferingCategoryGroup, 'OTHER'>[] = semesterNo === 3 ? ['U1', 'U2'] : ['CORE', 'E1', 'E2'];
  const historyAvailable = history?.status === 'available';
  const subjectIdCounts = new Map<string, number>();
  for (const subject of subjects) if (subject.subjectId) subjectIdCounts.set(subject.subjectId, (subjectIdCounts.get(subject.subjectId) ?? 0) + 1);
  const historyBySubject = new Map<string, number>();
  if (historyAvailable) for (const record of history.records) historyBySubject.set(record.subjectId, (historyBySubject.get(record.subjectId) ?? 0) + 1);

  const groups = visibleGroups.flatMap(group => {
    const members = subjects.filter(subject => offeringCategoryGroup(subject) === group);
    if (!members.length) return [];
    let recognizedCount = 0;
    let unresolvedCount = 0;
    if (historyAvailable) for (const subject of members) {
      if (!subject.subjectId || subjectIdCounts.get(subject.subjectId) !== 1) { unresolvedCount++; continue; }
      const records = historyBySubject.get(subject.subjectId) ?? 0;
      if (records > 1) { unresolvedCount++; continue; }
      if (records === 1 && history.records.find(record => record.subjectId === subject.subjectId)?.status) {
        const status = history.records.find(record => record.subjectId === subject.subjectId)!.status;
        if (status === 'COMPLETED' || status === 'EXEMPTED') recognizedCount++;
      }
    }
    return [{
      group,
      label: group === 'CORE' ? 'Core' : group,
      subjectCount: members.length,
      recognizedCount: historyAvailable ? recognizedCount : null,
      unresolvedCount,
    }];
  });
  return { groups, historyAvailable, unclassifiedCount: subjects.filter(subject => offeringCategoryGroup(subject) === 'OTHER').length };
}
