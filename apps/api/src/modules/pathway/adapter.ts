import type { PathwayGraph, PathwayNodeStatus, PrerequisiteType } from './contracts';
import type { RawPathwayData } from './repository';
import { formatCurriculumPrerequisiteExpression, readCurriculumPrerequisiteDetails } from '../../../../../packages/shared/src/curriculum-reference';
import type { CurriculumPrerequisiteExpression } from '../../../../../packages/shared/src/curriculum-reference';

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
  const codes = new Set(raw.subjects.map(subject => subject.subjectCode));
  const duplicateCodes = codes.size !== raw.subjects.length;
  const detailsById = new Map<number, ReturnType<typeof readCurriculumPrerequisiteDetails>>();
  for (const subject of raw.subjects) {
    subjectIdByCurriculumSubjectId.set(subject.curriculumSubjectId, subject.subjectId);
    detailsById.set(subject.curriculumSubjectId, subject.prerequisiteDetails == null ? null : duplicateCodes ? null :
      readCurriculumPrerequisiteDetails(subject.prerequisiteDetails, codes, subject.subjectCode));
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
        : statusFor(subject.curriculumSubjectId, record?.status, satisfied, raw, subjectIdByCurriculumSubjectId,
          detailsById.get(subject.curriculumSubjectId) ?? null, subject),
      grade: ambiguousSubjects.has(subject.subjectId) ? null : record?.grade ?? null,
      recognizedCredits: ambiguousSubjects.has(subject.subjectId) ? null : record ? record.recognizedCredits : null,
      prerequisiteSummary: subject.prerequisiteDetails == null ? undefined : (() => {
        const details = detailsById.get(subject.curriculumSubjectId);
        return details ? [formatCurriculumPrerequisiteExpression(details.expression),
          ...details.conditions.map(condition => `${condition.type === 'cgpa' ? 'CGPA' : 'Completed credits'} ${condition.operator} ${condition.value}`),
          details.conditionNote].filter(Boolean).join('; ') || (details.topicDependent ? 'Prerequisite depends on topic' : null) : 'Prerequisite details unavailable';
      })(),
    };
  });

  const nodeIds = new Set(nodes.map(node => node.id));
  const codeByCurriculumSubjectId = new Map(raw.subjects.map(subject => [subject.curriculumSubjectId, subject.subjectCode]));
  const mandatoryAndCodes = new Map<number, Set<string>>();
  for (const subject of raw.subjects) {
    const details = detailsById.get(subject.curriculumSubjectId);
    if (details?.expression) mandatoryAndCodes.set(subject.curriculumSubjectId, directAndCourseCodes(details.expression));
  }
  const edges = raw.prerequisites
    .filter(prerequisite =>
      nodeIds.has(String(prerequisite.curriculumSubjectId)) &&
      nodeIds.has(String(prerequisite.requiredCurriculumSubjectId)) &&
      PREREQUISITE_TYPES.has(prerequisite.requirementType) && (() => {
        const source = raw.subjects.find(subject => subject.curriculumSubjectId === prerequisite.curriculumSubjectId);
        if (!source || source.prerequisiteDetails == null) return true;
        if (!detailsById.get(source.curriculumSubjectId)) return false;
        return prerequisite.requirementType !== 'MANDATORY' ||
          mandatoryAndCodes.get(source.curriculumSubjectId)?.has(codeByCurriculumSubjectId.get(prerequisite.requiredCurriculumSubjectId) ?? '') === true;
      })())
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

/** Only courses in an unconditional allOf branch may be drawn as mandatory edges. */
function directAndCourseCodes(expression: CurriculumPrerequisiteExpression): Set<string> {
  const codes = new Set<string>();
  const visit = (node: CurriculumPrerequisiteExpression, unconditional: boolean) => {
    if (node.operator === 'course') { if (unconditional) codes.add(node.code); return; }
    for (const operand of node.operands) visit(operand, unconditional && node.operator === 'allOf');
  };
  visit(expression, true);
  return codes;
}

function statusFor(
  curriculumSubjectId: number,
  recordStatus: string | undefined,
  satisfied: Set<number>,
  raw: RawPathwayData,
  subjectIdByCurriculumSubjectId: Map<number, number>,
  details: ReturnType<typeof readCurriculumPrerequisiteDetails> | null,
  subject: RawPathwayData['subjects'][number],
): PathwayNodeStatus {
  if (recordStatus === 'COMPLETED') return 'COMPLETED';
  if (recordStatus === 'EXEMPTED') return 'EXEMPTED';

  if (subject.prerequisiteDetails != null) {
    if (!details) return 'UNKNOWN';
    if (details.topicDependent || details.conditions.length > 0) return 'UNKNOWN';
    const evaluate = (expression: NonNullable<typeof details.expression>): boolean => {
      if (expression.operator === 'course') {
        const required = raw.subjects.find(candidate => candidate.subjectCode === expression.code);
        return required !== undefined && satisfied.has(required.subjectId);
      }
      const values = expression.operands.map(evaluate);
      return expression.operator === 'allOf' ? values.every(Boolean) : values.some(Boolean);
    };
    return details.expression && !evaluate(details.expression) ? 'LOCKED' : 'REMAINING';
  }

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
