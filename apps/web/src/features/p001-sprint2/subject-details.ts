import type { LinkKind, Progress, ProgressSubject, SemesterType } from '../../../../api/src/modules/p001-sprint2/contracts';

export const OUTCOME_LABEL: Record<ProgressSubject['outcome'], string> = { COMPLETED: 'Completed', EXEMPTED: 'Exempted', REMAINING: 'Remaining' };
export const KIND_LABEL: Record<LinkKind, string> = { MANDATORY: 'Mandatory prerequisite', COREQUISITE: 'Co-requisite', RECOMMENDED: 'Recommended' };
export const NO_MANDATORY_TEXT = 'No mandatory prerequisite is configured';
export const APPROVED_TEXT = 'Approved for next semester';
export const NOT_CONFIRMED_TEXT = 'Availability not confirmed';

export interface PrerequisiteView { mappingId: number; code: string; name: string; kind: LinkKind; kindLabel: string; outcomeLabel: string; met: boolean; adviceOnly: boolean }
export interface UnlockView { mappingId: number; code: string; name: string; kindLabel: string }
export interface SubjectDetails {
  code: string; name: string; credits: number; category: string; requirement: string; statusLabel: string;
  semesters: string; semesterNote: string | null;
  prerequisites: PrerequisiteView[]; noMandatory: boolean; unlocks: UnlockView[];
  nextSemester: string; approved: boolean;
}

const semesterName = (type: SemesterType) => type === 'SHORT' ? 'Short' : 'Normal';
function describeSemesters(types: SemesterType[]): { semesters: string; note: string | null } {
  const unique = [...new Set(types)];
  if (unique.length === 1 && unique[0] === 'SHORT') return { semesters: 'Short semester', note: 'Offered in Short semester (Semester 3) only' };
  if (unique.length === 1) return { semesters: 'Normal semesters', note: 'Offered in Normal semesters (Semester 1 and 2) only' };
  if (unique.length === 0) return { semesters: 'Not configured', note: null };
  return { semesters: unique.map(semesterName).join(' and ') + ' semesters', note: null };
}

/** Read-only view model for UC18. `approvedSubjectIds` is null when the next-semester list is unavailable. */
export function describeSubject(subject: ProgressSubject, progress: Pick<Progress, 'subjects' | 'links'>, approvedSubjectIds: ReadonlySet<number> | null): SubjectDetails {
  const byMapping = new Map(progress.subjects.map(item => [item.mappingId, item]));
  const prerequisites: PrerequisiteView[] = [];
  const unlocks: UnlockView[] = [];
  for (const link of progress.links ?? []) {
    if (link.from === subject.mappingId) {
      const required = byMapping.get(link.required);
      if (!required) continue;
      prerequisites.push({
        mappingId: required.mappingId, code: required.code, name: required.name, kind: link.kind, kindLabel: KIND_LABEL[link.kind],
        outcomeLabel: OUTCOME_LABEL[required.outcome], met: required.outcome === 'COMPLETED' || required.outcome === 'EXEMPTED', adviceOnly: link.kind === 'RECOMMENDED',
      });
    } else if (link.required === subject.mappingId) {
      const dependent = byMapping.get(link.from);
      if (dependent) unlocks.push({ mappingId: dependent.mappingId, code: dependent.code, name: dependent.name, kindLabel: KIND_LABEL[link.kind] });
    }
  }
  const order: Record<LinkKind, number> = { MANDATORY: 0, COREQUISITE: 1, RECOMMENDED: 2 };
  prerequisites.sort((a, b) => order[a.kind] - order[b.kind] || a.code.localeCompare(b.code));
  unlocks.sort((a, b) => a.code.localeCompare(b.code));
  const approved = approvedSubjectIds !== null && approvedSubjectIds.has(subject.subjectId);
  const { semesters, note } = describeSemesters(subject.semesterTypes);
  return {
    code: subject.code, name: subject.name, credits: subject.credits, category: subject.category,
    requirement: subject.compulsory ? 'Compulsory' : 'Optional / elective', statusLabel: OUTCOME_LABEL[subject.outcome],
    semesters, semesterNote: note, prerequisites, noMandatory: !prerequisites.some(item => item.kind === 'MANDATORY'), unlocks,
    nextSemester: approved ? APPROVED_TEXT : NOT_CONFIRMED_TEXT, approved,
  };
}

/** Subject ids from the semester-offerings response; null when the list is absent (selection not open) or malformed. */
export function approvedSubjectIdsFrom(value: unknown): ReadonlySet<number> | null {
  if (typeof value !== 'object' || value === null || !('subjects' in value) || !Array.isArray(value.subjects)) return null;
  const ids = new Set<number>();
  for (const item of value.subjects) {
    if (typeof item !== 'object' || item === null || !('subjectId' in item)) continue;
    const id = Number(item.subjectId);
    if (Number.isInteger(id)) ids.add(id);
  }
  return ids;
}
