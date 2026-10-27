export type SubjectGroup = 'CORE' | 'ELECTIVE' | 'OTHER';

export interface CategorizedSubject {
  subjectCategory?: string | null;
  isCompulsory?: 0 | 1;
}

export interface SubjectGroups<T> {
  core: T[];
  elective: T[];
  other: T[];
}

const coreLabels = new Set(['CORE', 'PROGRAMME CORE', 'TERAS']);
const electiveLabels = new Set([
  'ELECTIVE', 'PROGRAMME ELECTIVE', 'ELEKTIF',
  'ELECTIVE E1', 'ELECTIVE E2', 'ELECTIVE U1', 'ELECTIVE U2',
  'ALT ELECTIVE', 'GENERIC ELECTIVE',
]);

export function normalizeSubjectCategory(category: string | null | undefined): string {
  return category?.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en') ?? '';
}

export function subjectGroupForCategory(category: string | null | undefined, isCompulsory?: 0 | 1): SubjectGroup {
  const normalized = normalizeSubjectCategory(category);
  if (normalized && coreLabels.has(normalized)) return 'CORE';
  if (normalized && electiveLabels.has(normalized)) return 'ELECTIVE';
  if (normalized === 'INDUSTRIAL TRAINING' && isCompulsory === 1) return 'CORE';
  return 'OTHER';
}

export function groupSubjectsByCategory<T extends CategorizedSubject>(subjects: readonly T[]): SubjectGroups<T> {
  const groups: SubjectGroups<T> = { core: [], elective: [], other: [] };
  for (const subject of subjects) {
    switch (subjectGroupForCategory(subject.subjectCategory, subject.isCompulsory)) {
      case 'CORE': groups.core.push(subject); break;
      case 'ELECTIVE': groups.elective.push(subject); break;
      case 'OTHER': groups.other.push(subject); break;
    }
  }
  return groups;
}

export interface SubjectGroupMetadata {
  category: string;
  requiredSubjects: number | null;
  availableSubjects: number;
}

export interface ElectiveSubgroup<T> extends SubjectGroupMetadata {
  subjects: T[];
}

export function groupElectiveSubjects<T extends CategorizedSubject>(
  subjects: readonly T[], metadata: readonly SubjectGroupMetadata[] = [],
): ElectiveSubgroup<T>[] {
  const groups = new Map<string, ElectiveSubgroup<T>>();
  const configuredKeys = new Set<string>();
  for (const configured of metadata) {
    if (subjectGroupForCategory(configured.category) !== 'ELECTIVE') continue;
    const key = normalizeSubjectCategory(configured.category);
    configuredKeys.add(key);
    const existing = groups.get(key);
    if (existing) {
      existing.availableSubjects += configured.availableSubjects;
      if (existing.requiredSubjects !== configured.requiredSubjects) existing.requiredSubjects = null;
    } else {
      groups.set(key, { ...configured, subjects: [] });
    }
  }
  for (const subject of subjects) {
    const category = subject.subjectCategory;
    if (!category || subjectGroupForCategory(category, subject.isCompulsory) !== 'ELECTIVE') continue;
    const key = normalizeSubjectCategory(category);
    let group = groups.get(key);
    if (!group) {
      group = { category, requiredSubjects: null, availableSubjects: 0, subjects: [] };
      groups.set(key, group);
    }
    group.subjects.push(subject);
    if (!configuredKeys.has(key)) group.availableSubjects += 1;
  }
  return [...groups.values()];
}
