import type { OfferingPageData, OfferingSelection, OfferingSemester, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';

function id(value: unknown): string {
  try { return offeringId(value); } catch { throw new Error('Invalid offerings response'); }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid offerings response');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid offerings response');
  return value;
}
function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) throw new Error('Invalid offerings response');
  return values;
}
export function readSelection(value: unknown): OfferingSelection {
  const entry = object(value);
  if (!Array.isArray(entry.curriculumSubjectIds)) throw new Error('Invalid offerings response');
  return { semesterId: id(entry.semesterId), curriculumSubjectIds: unique(entry.curriculumSubjectIds.map(id)) };
}
export function readPageData(value: unknown): OfferingPageData {
  const data = object(value);
  const curriculum = object(data.curriculum);
  if (!Array.isArray(data.subjects) || !Array.isArray(data.semesters)) throw new Error('Invalid offerings response');
  const subjects = data.subjects.map((value): OfferingSubject => {
    const subject = object(value);
    if (typeof subject.creditHours !== 'number' || !Number.isFinite(subject.creditHours) || subject.creditHours < 0) throw new Error('Invalid offerings response');
    return { curriculumSubjectId: id(subject.curriculumSubjectId), code: text(subject.code), name: text(subject.name), creditHours: subject.creditHours };
  });
  const semesters = data.semesters.map((value): OfferingSemester => {
    const semester = object(value);
    if (semester.semesterNo !== 1 && semester.semesterNo !== 2 && semester.semesterNo !== 3) throw new Error('Invalid offerings response');
    return { semesterId: id(semester.semesterId), academicYear: text(semester.academicYear), semesterNo: semester.semesterNo };
  });
  unique(subjects.map(subject => subject.curriculumSubjectId));
  unique(semesters.map(semester => semester.semesterId));
  const selection = data.selection === null ? null : readSelection(data.selection);
  if (selection && (!semesters.some(semester => semester.semesterId === selection.semesterId) ||
      selection.curriculumSubjectIds.some(id => !subjects.some(subject => subject.curriculumSubjectId === id)))) throw new Error('Invalid offerings response');
  return {
    curriculum: { curriculumId: id(curriculum.curriculumId), name: text(curriculum.name), programmeName: text(curriculum.programmeName) },
    subjects, semesters, selection,
  };
}
