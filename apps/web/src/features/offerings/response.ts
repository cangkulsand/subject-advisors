import type { OfferingPageData, OfferingRequirementType, OfferingSelection, OfferingSemester, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
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
  if (curriculum.totalCreditRequired !== undefined &&
      (typeof curriculum.totalCreditRequired !== 'number' || !Number.isInteger(curriculum.totalCreditRequired) || curriculum.totalCreditRequired < 0 || curriculum.totalCreditRequired > 2147483647)) {
    throw new Error('Invalid offerings response');
  }
  if (!Array.isArray(data.subjects) || !Array.isArray(data.semesters)) throw new Error('Invalid offerings response');
  const rawSubjects: unknown[] = data.subjects;
  const subjects = rawSubjects.map((value): OfferingSubject => {
    const subject = object(value);
    if (typeof subject.creditHours !== 'number' || !Number.isFinite(subject.creditHours) || subject.creditHours < 0) throw new Error('Invalid offerings response');
    if (subject.subjectCategory !== undefined && subject.subjectCategory !== null && typeof subject.subjectCategory !== 'string') throw new Error('Invalid offerings response');
    if (subject.isCompulsory !== undefined && subject.isCompulsory !== 0 && subject.isCompulsory !== 1) throw new Error('Invalid offerings response');
    return {
      curriculumSubjectId: id(subject.curriculumSubjectId),
      ...(subject.subjectId === undefined ? {} : { subjectId: id(subject.subjectId) }),
      code: text(subject.code), name: text(subject.name), creditHours: subject.creditHours,
      ...(subject.subjectCategory === undefined ? {} : { subjectCategory: subject.subjectCategory === null || !subject.subjectCategory.trim() ? null : subject.subjectCategory }),
      ...(subject.isCompulsory === undefined ? {} : { isCompulsory: subject.isCompulsory }),
    };
  });
  const semesters = data.semesters.map((value): OfferingSemester => {
    const semester = object(value);
    if (semester.semesterNo !== 1 && semester.semesterNo !== 2 && semester.semesterNo !== 3) throw new Error('Invalid offerings response');
    return { semesterId: id(semester.semesterId), academicYear: text(semester.academicYear), semesterNo: semester.semesterNo };
  });
  unique(subjects.map(subject => subject.curriculumSubjectId));
  unique(subjects.flatMap(subject => subject.subjectId ? [subject.subjectId] : []));
  unique(semesters.map(semester => semester.semesterId));
  const subjectsByCurriculumId = new Map(subjects.map(subject => [subject.curriculumSubjectId, subject]));
  const allowedRequirementTypes = new Set<OfferingRequirementType>(['MANDATORY', 'RECOMMENDED', 'COREQUISITE']);
  const enrichedSubjects = subjects.map((subject, index): OfferingSubject => {
    const raw = object(rawSubjects[index]);
    const metadata = raw.prerequisites;
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return { ...subject, prerequisites: { status: 'unavailable' } };
    }
    const candidate = metadata as Record<string, unknown>;
    if (candidate.status === 'unavailable') return { ...subject, prerequisites: { status: 'unavailable' } };
    if (candidate.status !== 'available' || !Array.isArray(candidate.items)) {
      return { ...subject, prerequisites: { status: 'unavailable' } };
    }
    const seen = new Set<string>();
    const items: Array<{ requiredCurriculumSubjectId: string; requirementType: OfferingRequirementType }> = [];
    try {
      for (const value of candidate.items) {
        const item = object(value);
        if (typeof item.requiredCurriculumSubjectId !== 'string' || typeof item.requirementType !== 'string' ||
            !allowedRequirementTypes.has(item.requirementType as OfferingRequirementType)) throw new Error('Invalid prerequisite metadata');
        const requiredId = id(item.requiredCurriculumSubjectId);
        if (requiredId !== item.requiredCurriculumSubjectId || requiredId === subject.curriculumSubjectId ||
            !subjectsByCurriculumId.has(requiredId)) throw new Error('Invalid prerequisite metadata');
        const requirementType = item.requirementType as OfferingRequirementType;
        const key = `${requiredId}:${requirementType}`;
        if (seen.has(key)) throw new Error('Duplicate prerequisite metadata');
        seen.add(key);
        items.push({ requiredCurriculumSubjectId: requiredId, requirementType });
      }
      return { ...subject, prerequisites: { status: 'available', items } };
    } catch {
      return { ...subject, prerequisites: { status: 'unavailable' } };
    }
  });
  const currentSemesterId = data.currentSemesterId === undefined ? undefined : id(data.currentSemesterId);
  if (currentSemesterId !== undefined && !semesters.some(semester => semester.semesterId === currentSemesterId)) throw new Error('Invalid offerings response');
  const selection = data.selection === null ? null : readSelection(data.selection);
  if (selection && (!semesters.some(semester => semester.semesterId === selection.semesterId) ||
      selection.curriculumSubjectIds.some(id => !subjects.some(subject => subject.curriculumSubjectId === id)))) throw new Error('Invalid offerings response');
  return {
    curriculum: {
      curriculumId: id(curriculum.curriculumId), name: text(curriculum.name), programmeName: text(curriculum.programmeName),
      ...(curriculum.totalCreditRequired === undefined ? {} : { totalCreditRequired: curriculum.totalCreditRequired }),
    },
    ...(currentSemesterId === undefined ? {} : { currentSemesterId }),
    subjects: enrichedSubjects, semesters, selection,
  };
}
