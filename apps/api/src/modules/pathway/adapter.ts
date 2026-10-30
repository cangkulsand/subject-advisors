import type { PathwayGraph, PathwayNodeStatus, PrerequisiteType } from './contracts';
import type { RawPathwayData } from './repository';

const SATISFIED = new Set(['COMPLETED', 'EXEMPTED']);
const PREREQUISITE_TYPES = new Set(['MANDATORY', 'RECOMMENDED', 'COREQUISITE']);

/**
 * Pure data-to-node/edge adapter for UC17. Derives only states that are supported
 * by stored records and configured prerequisites; every other visual state is UNKNOWN.
 * No hypothetical placement, scheduling or eligibility engine is applied here.
 */
export function buildPathwayGraph(raw: RawPathwayData): PathwayGraph {
  const recordsBySubject = new Map<number, RawPathwayData['records']>();
  for (const record of raw.records) {
    const attempts = recordsBySubject.get(record.subjectId) ?? [];
    attempts.push(record);
    recordsBySubject.set(record.subjectId, attempts);
  }

  // P001 treats duplicate saved attempts as unresolved until a user reconciles them.
  // Do not pick an arbitrary row or let any one attempt unlock dependent subjects.
  const recordBySubject = new Map<number, RawPathwayData['records'][number]>();
  const ambiguousSubjects = new Set<number>();
  const satisfied = new Set<number>();
  for (const [subjectId, attempts] of recordsBySubject) {
    if (attempts.length !== 1) {
      ambiguousSubjects.add(subjectId);
      continue;
    }
    const record = attempts[0]!;
    recordBySubject.set(subjectId, record);
    if (SATISFIED.has(record.status)) satisfied.add(subjectId);
  }

  // Prerequisites reference curriculum_subject_id; records reference subject_id.
  const subjectIdByCurriculumSubjectId = new Map<number, number>();
  for (const subject of raw.subjects) {
    subjectIdByCurriculumSubjectId.set(subject.curriculumSubjectId, subject.subjectId);
  }

  const nodes = raw.subjects.map(subject => {
    const record = recordBySubject.get(subject.subjectId);
    return {
      id: String(subject.curriculumSubjectId),
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      creditHours: subject.creditHours,
      isCompulsory: subject.isCompulsory === 1,
      subjectCategory: subject.subjectCategory,
      status: ambiguousSubjects.has(subject.subjectId)
        ? 'UNKNOWN'
        : statusFor(subject.curriculumSubjectId, record?.status, satisfied, raw, subjectIdByCurriculumSubjectId),
      grade: ambiguousSubjects.has(subject.subjectId) ? null : record?.grade ?? null,
      recognizedCredits: ambiguousSubjects.has(subject.subjectId) ? null : record ? record.recognizedCredits : null,
    };
  });

  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = raw.prerequisites
    .filter(prerequisite =>
      nodeIds.has(String(prerequisite.curriculumSubjectId)) &&
      nodeIds.has(String(prerequisite.requiredCurriculumSubjectId)) &&
      PREREQUISITE_TYPES.has(prerequisite.requirementType))
    .map(prerequisite => ({
      id: String(prerequisite.prerequisiteId),
      source: String(prerequisite.requiredCurriculumSubjectId),
      target: String(prerequisite.curriculumSubjectId),
      requirementType: prerequisite.requirementType as PrerequisiteType,
    }));

  return {
    curriculumId: raw.curriculumId,
    curriculumVersion: raw.curriculumVersion,
    programmeName: raw.programmeName,
    nodes,
    edges,
    demo: false,
  };
}

function statusFor(
  curriculumSubjectId: number,
  recordStatus: string | undefined,
  satisfied: Set<number>,
  raw: RawPathwayData,
  subjectIdByCurriculumSubjectId: Map<number, number>,
): PathwayNodeStatus {
  if (recordStatus === 'COMPLETED') return 'COMPLETED';
  if (recordStatus === 'EXEMPTED') return 'EXEMPTED';

  // A subject is locked only when a configured mandatory prerequisite is unmet.
  const mandatoryPrerequisites = raw.prerequisites.filter(prerequisite =>
    prerequisite.curriculumSubjectId === curriculumSubjectId && prerequisite.requirementType === 'MANDATORY');
  const blocked = mandatoryPrerequisites.some(prerequisite => {
    const requiredSubjectId = subjectIdByCurriculumSubjectId.get(prerequisite.requiredCurriculumSubjectId);
    return requiredSubjectId === undefined || !satisfied.has(requiredSubjectId);
  });

  // FAILED/WITHDRAWN and absent records are both outstanding work, not completion.
  return blocked ? 'LOCKED' : 'REMAINING';
}
