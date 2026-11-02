import type { ProjectedPathway, ProjectedSemester, ProjectedSubject } from './contracts';
import type { RawPathwayData, RawSemesterRuleRow, RawSubjectRow } from './repository';

const SATISFIED = new Set(['COMPLETED', 'EXEMPTED']);

/**
 * Pure UC14 projected-pathway scheduler. Produces an advisory semester-by-semester
 * plan for the remaining subjects using configured limits, semester-type rules and
 * mandatory prerequisite chains. It never mutates records or fabricates offerings.
 */
export function buildProjectedPathway(raw: RawPathwayData): ProjectedPathway {
  const curriculumSubjectIdBySubjectId = new Map<number, number>();
  for (const subject of raw.subjects) {
    curriculumSubjectIdBySubjectId.set(subject.subjectId, subject.curriculumSubjectId);
  }

  const recordsBySubject = new Map<number, RawPathwayData['records']>();
  for (const record of raw.records) {
    const attempts = recordsBySubject.get(record.subjectId) ?? [];
    attempts.push(record);
    recordsBySubject.set(record.subjectId, attempts);
  }

  const satisfied = new Set<number>(); // curriculumSubjectId
  for (const [subjectId, attempts] of recordsBySubject) {
    if (attempts.length !== 1) continue; // ambiguous duplicate -> unresolved
    const record = attempts[0]!;
    if (!SATISFIED.has(record.status)) continue;
    const curriculumSubjectId = curriculumSubjectIdBySubjectId.get(subjectId);
    if (curriculumSubjectId !== undefined) satisfied.add(curriculumSubjectId);
  }

  const remaining = raw.subjects.filter(subject => !satisfied.has(subject.curriculumSubjectId));
  const remainingCredits = remaining.reduce((sum, subject) => sum + subject.creditHours, 0);

  const mandatoryPrereqs = new Map<number, number[]>();
  for (const prerequisite of raw.prerequisites) {
    if (prerequisite.requirementType !== 'MANDATORY') continue;
    const list = mandatoryPrereqs.get(prerequisite.curriculumSubjectId) ?? [];
    list.push(prerequisite.requiredCurriculumSubjectId);
    mandatoryPrereqs.set(prerequisite.curriculumSubjectId, list);
  }

  const normal = raw.semesters.find(semester => semester.semesterType === 'NORMAL');
  const short = raw.semesters.find(semester => semester.semesterType === 'SHORT');
  const normalLimits = { maxSubjects: normal?.maxSubjects ?? 3, maxCredits: normal?.maxCredits ?? 10 };
  const shortLimits = { maxSubjects: short?.maxSubjects ?? 3, maxCredits: short?.maxCredits ?? 6 };

  const order = topologicalOrder(remaining, mandatoryPrereqs);
  const scheduled = new Set<number>(); // subjects scheduled in previous semesters
  const semesters: ProjectedSemester[] = [];
  let semesterIndex = 0;
  let noProgress = 0;

  while (scheduled.size < remaining.length && noProgress < 3) {
    const isShort = semesterIndex % 3 === 2;
    const limits = isShort ? shortLimits : normalLimits;
    const semesterType = isShort ? 'SHORT' : 'NORMAL';

    const subjects: ProjectedSubject[] = [];
    const assignedThisSemester = new Set<number>();
    let totalCredits = 0;

    for (const subject of order) {
      if (scheduled.has(subject.curriculumSubjectId) || assignedThisSemester.has(subject.curriculumSubjectId)) continue;
      if (subjects.length >= limits.maxSubjects) break;
      if (totalCredits + subject.creditHours > limits.maxCredits) continue;
      const prereqs = mandatoryPrereqs.get(subject.curriculumSubjectId) ?? [];
      if (!prereqs.every(requiredId => satisfied.has(requiredId) || scheduled.has(requiredId))) continue;
      if (!isPermitted(subject.curriculumSubjectId, semesterType, raw.semesterRules)) continue;

      assignedThisSemester.add(subject.curriculumSubjectId);
      subjects.push({
        curriculumSubjectId: subject.curriculumSubjectId,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        creditHours: subject.creditHours,
        isCompulsory: subject.isCompulsory === 1,
      });
      totalCredits += subject.creditHours;
    }

    if (subjects.length === 0) {
      noProgress++;
      semesterIndex++;
      continue;
    }

    noProgress = 0;
    for (const id of assignedThisSemester) scheduled.add(id);
    semesters.push({ semesterNo: semesters.length + 1, semesterType, subjects, totalCredits });
    semesterIndex++;
  }

  const assumptions: string[] = [];
  if (raw.semesters.length === 0) {
    assumptions.push('No configured academic semesters; using default limits (NORMAL 3 subjects/10 credits, SHORT 3 subjects/6 credits).');
  }
  assumptions.push('Future subject offerings are not confirmed; this projection is advisory.');

  return {
    remainingSubjects: remaining.length,
    remainingCredits,
    semesters,
    estimatedCompletionSemesters: semesters.length,
    assumptions,
  };
}

function topologicalOrder(subjects: RawSubjectRow[], mandatoryPrereqs: Map<number, number[]>): RawSubjectRow[] {
  const byId = new Map(subjects.map(subject => [subject.curriculumSubjectId, subject]));
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const order: RawSubjectRow[] = [];

  function visit(id: number) {
    if (visited.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const requiredId of mandatoryPrereqs.get(id) ?? []) {
      if (byId.has(requiredId)) visit(requiredId);
    }
    visiting.delete(id);
    visited.add(id);
    order.push(byId.get(id)!);
  }

  for (const subject of subjects) visit(subject.curriculumSubjectId);
  return order;
}

function isPermitted(curriculumSubjectId: number, semesterType: string, rules: RawSemesterRuleRow[]): boolean {
  const subjectRules = rules.filter(rule => rule.curriculumSubjectId === curriculumSubjectId);
  if (subjectRules.length === 0) return true; // no restriction -> any semester type
  return subjectRules.some(rule => rule.semesterType === semesterType);
}
