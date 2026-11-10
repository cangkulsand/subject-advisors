import type { OfferingPageData, OfferingPickLimits, OfferingRequirementType, OfferingSelection, OfferingSemester, OfferingSubject, OfferingWindow, WithdrawnOffering } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';
import { readCurriculumPrerequisiteSummary } from '../../../../../packages/shared/src/curriculum-reference';

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
const WINDOW_STATUSES: readonly OfferingWindow['status'][] = ['NO_NEXT_SEMESTER', 'NO_LEARNING_CENTRE', 'NOT_SCHEDULED', 'NOT_OPEN', 'OPEN', 'CLOSED'];
function dateOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('Invalid offerings response');
  return value;
}
function readWindow(value: unknown): OfferingWindow {
  const window = object(value);
  if (typeof window.status !== 'string' || !WINDOW_STATUSES.includes(window.status as OfferingWindow['status'])) throw new Error('Invalid offerings response');
  if (window.learningCentreName !== null && typeof window.learningCentreName !== 'string') throw new Error('Invalid offerings response');
  return {
    status: window.status as OfferingWindow['status'],
    targetSemesterId: window.targetSemesterId === null ? null : id(window.targetSemesterId),
    selectionOpensAt: dateOrNull(window.selectionOpensAt), selectionClosesAt: dateOrNull(window.selectionClosesAt),
    learningCentreName: window.learningCentreName,
  };
}
function readLimits(value: unknown): OfferingPickLimits {
  const limits = object(value);
  const whole = (n: unknown): number => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 2147483647) throw new Error('Invalid offerings response');
    return n;
  };
  return { maxSubjects: whole(limits.maxSubjects), maxCredits: whole(limits.maxCredits) };
}
function readWithdrawn(value: unknown): WithdrawnOffering[] {
  if (!Array.isArray(value)) throw new Error('Invalid offerings response');
  const rows = (value as unknown[]).map((row): WithdrawnOffering => {
    const entry = object(row);
    return { subjectId: id(entry.subjectId), code: text(entry.code), name: text(entry.name), withdrawnAt: text(dateOrNull(entry.withdrawnAt)) };
  });
  unique(rows.map(row => row.subjectId));
  return rows;
}
function readSubject(value: unknown): OfferingSubject {
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
  const subjects = rawSubjects.map(readSubject);
  // Prerequisites of an offered subject resolve against the whole curriculum, not only what is offered.
  const catalogue = data.prerequisiteCatalogue === undefined ? subjects : (Array.isArray(data.prerequisiteCatalogue) ? data.prerequisiteCatalogue.map(readSubject) : (() => { throw new Error('Invalid offerings response'); })());
  const semesters = data.semesters.map((value): OfferingSemester => {
    const semester = object(value);
    if (semester.semesterNo !== 1 && semester.semesterNo !== 2 && semester.semesterNo !== 3) throw new Error('Invalid offerings response');
    return { semesterId: id(semester.semesterId), academicYear: text(semester.academicYear), semesterNo: semester.semesterNo };
  });
  unique(subjects.map(subject => subject.curriculumSubjectId));
  unique(subjects.flatMap(subject => subject.subjectId ? [subject.subjectId] : []));
  unique(catalogue.map(subject => subject.curriculumSubjectId));
  if (subjects.some(subject => !catalogue.some(item => item.curriculumSubjectId === subject.curriculumSubjectId))) throw new Error('Invalid offerings response');
  unique(semesters.map(semester => semester.semesterId));
  const subjectsByCurriculumId = new Map(catalogue.map(subject => [subject.curriculumSubjectId, subject]));
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
      const details = candidate.details === undefined ? undefined : readCurriculumPrerequisiteSummary(
        candidate.details, new Set(catalogue.map(item => item.code)), subject.code,
      );
      if (candidate.details !== undefined && details === null) throw new Error('Invalid prerequisite details');
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
      return { ...subject, prerequisites: { status: 'available', items, ...(details ? { details } : {}) } };
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
    ...(data.window === undefined ? {} : { window: readWindow(data.window) }),
    ...(data.limits === undefined ? {} : { limits: readLimits(data.limits) }),
    ...(data.prerequisiteCatalogue === undefined ? {} : { prerequisiteCatalogue: catalogue }),
    ...(data.withdrawnSubjects === undefined ? {} : { withdrawnSubjects: readWithdrawn(data.withdrawnSubjects) }),
  };
}
