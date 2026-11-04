import type { ForecastQualityStatus, ForecastSubjectOption, Int32Id, SubjectExclusion, UncertaintyReason } from '../contracts';
import { ALLOCATION_POLICY_VERSION, allocateSections, resolveCapacityRule } from './capacity';
import { buildStudentContext, evaluateStudentSubject, indexCurriculum, newAccumulator, recordOutcome, SUPPORTED_COHORT_STATUSES, type CurriculumIndex, type SubjectAccumulator } from './demand';
import { fingerprint } from './hash';
import { NEAR_GRADUATION_POLICY_VERSION, PREREQUISITE_POLICY_VERSION, RETAKE_POLICY_VERSION } from './policy';
import type {
  EngineOriginalRecommendation, EngineRuleSnapshot, EngineSubjectDemand, EngineSummary, ForecastEngineInput, ForecastEngineResult, UncertaintyReasonCount,
} from './types';

export const ENGINE_VERSION = 'uc20-engine-1.1.0';
export const DEMAND_ASSUMPTION_NOTE =
  'Potential demand: the supported eligible pool (students who have not passed the subject and meet its supported prerequisites). ' +
  'It is not confirmed registration or a feasible semester workload; student picks after confirmation show real demand. ' +
  'Unknown evidence is counted separately as uncertain and never added to supported demand.';

function qualityOf(supported: number, uncertain: number): ForecastQualityStatus {
  if (uncertain === 0) return 'SUPPORTED';
  return supported === 0 ? 'INSUFFICIENT_DATA' : 'PRELIMINARY';
}

export const semesterTypeReason = (offeredIn: string[]) =>
  offeredIn.length === 1 && offeredIn[0] === 'SHORT' ? 'Runs only in Short semesters' : 'Runs only in Normal semesters';

/**
 * Offering rule (subject_semester_rule): a subject is not offered in the target semester type when every curriculum that contains it
 * has rule rows for it and none of them is the target type. A curriculum with no rule rows for the subject leaves it unrestricted.
 */
function semesterTypeRestriction(subjectId: Int32Id, curricula: Array<{ curriculum: { subjects: ForecastSubjectOption[] }; semesterTypes: Map<Int32Id, Set<string>> }>, targetType: string): string[] | null {
  const offered = new Set<string>();
  let containing = 0;
  for (const { curriculum, semesterTypes } of curricula) {
    const subject = curriculum.subjects.find((s) => s.subjectId === subjectId);
    if (!subject) continue;
    containing += 1;
    const types = semesterTypes.get(subject.curriculumSubjectId);
    if (!types || types.size === 0 || types.has(targetType)) return null;
    types.forEach((type) => offered.add(type));
  }
  return containing > 0 ? [...offered].sort() : null;
}

function reasonCountsOf(accumulator: SubjectAccumulator): UncertaintyReasonCount[] {
  return [...accumulator.reasonCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([reason, count]) => ({ reason: reason as UncertaintyReason, count }));
}

/**
 * Pure, deterministic UC20 forecast: demand (plan section 5) then capacity-based allocation (section 6).
 * Does not mutate its input. Same input gives an identical result (stable ordering throughout).
 */
export function runForecastEngine(input: ForecastEngineInput): ForecastEngineResult {
  const { scope, target, snapshot } = input;
  const curricula = [...input.curricula].sort((a, b) => a.curriculumId - b.curriculumId);
  const indexes = new Map<Int32Id, CurriculumIndex>(curricula.map((curriculum) => [curriculum.curriculumId, indexCurriculum(curriculum)]));

  // Subject universe (by subject id; metadata from the lowest curriculum id that has the subject).
  const subjectMeta = new Map<Int32Id, ForecastSubjectOption>();
  for (const curriculum of curricula) {
    for (const subject of curriculum.subjects) if (!subjectMeta.has(subject.subjectId)) subjectMeta.set(subject.subjectId, subject);
  }
  const accumulators = new Map<Int32Id, SubjectAccumulator>([...subjectMeta.keys()].map((id) => [id, newAccumulator()]));

  const students = [...snapshot.students].sort((a, b) => (a.externalReference < b.externalReference ? -1 : a.externalReference > b.externalReference ? 1 : 0));
  let unresolved = 0;
  for (const student of students) {
    const index = indexes.get(student.curriculumId);
    if (!index) { unresolved += 1; continue; }
    const context = buildStudentContext(student, index, snapshot.rejectedRowsByStudent[student.externalReference] ?? 0);
    for (const option of index.curriculum.subjects) {
      const outcome = evaluateStudentSubject(context, option, index, target);
      recordOutcome(accumulators.get(option.subjectId) as SubjectAccumulator, outcome, context, index.curriculum.totalCreditsRequired, target);
    }
  }

  const indexList = curricula.map((curriculum) => indexes.get(curriculum.curriculumId) as CurriculumIndex);
  const demands: EngineSubjectDemand[] = [];
  const semesterTypeExclusions: EngineRuleSnapshot['semesterTypeExclusions'] = [];
  const exclusions: SubjectExclusion[] = [];
  for (const subjectId of [...subjectMeta.keys()].sort((a, b) => a - b)) {
    const meta = subjectMeta.get(subjectId) as ForecastSubjectOption;
    const accumulator = accumulators.get(subjectId) as SubjectAccumulator;
    const { supported, uncertain } = accumulator.breakdown;
    const reasonCounts = reasonCountsOf(accumulator);
    const excluded = curricula.some((curriculum) => curriculum.subjects.some((s) => s.subjectId === subjectId && !s.includeInOfferingForecast));
    const exclusionReason = excluded ? meta.exclusionReason ?? 'EXCLUDED' : null;
    if (excluded) exclusions.push({ subjectId, reason: exclusionReason as string, effectiveFromSemesterId: target.semesterId, effectiveToSemesterId: null });

    const restriction = excluded ? null : semesterTypeRestriction(subjectId, indexList, target.semesterType);
    const semesterTypeExcluded = restriction !== null;
    const semesterTypeExclusionReason = restriction ? semesterTypeReason(restriction) : null;
    if (restriction) semesterTypeExclusions.push({ subjectId, offeredIn: restriction as Array<'NORMAL' | 'SHORT'>, reason: semesterTypeExclusionReason as string });

    const base = {
      subjectId, subjectCode: meta.subjectCode, subjectName: meta.subjectName, classType: meta.classType, excluded, exclusionReason,
      semesterTypeExcluded, semesterTypeExclusionReason,
      supportedDemand: supported, uncertainCount: uncertain, uncertaintyReasonCounts: reasonCounts,
      uncertaintyReasons: reasonCounts.map((entry) => entry.reason), nearGraduationCount: accumulator.nearGraduationCount,
      qualityStatus: qualityOf(supported, uncertain), insufficientData: supported === 0 && uncertain > 0, breakdown: accumulator.breakdown,
    };
    if (excluded) {
      demands.push({ ...base, forecastCount: null, configurationStatus: 'EXCLUDED', configurationIssue: null, configurationMessage: exclusionReason, capacityRuleId: null, sections: [] });
      continue;
    }
    if (semesterTypeExcluded) {
      // No demand, no sections, not counted in totals; supported/uncertain are forced to 0 so the stored row never looks like demand.
      demands.push({
        ...base, supportedDemand: 0, uncertainCount: 0, uncertaintyReasonCounts: [], uncertaintyReasons: [], nearGraduationCount: 0, qualityStatus: 'SUPPORTED', insufficientData: false,
        forecastCount: null, configurationStatus: 'EXCLUDED', configurationIssue: null, configurationMessage: semesterTypeExclusionReason, capacityRuleId: null, sections: [],
      });
      continue;
    }
    const resolution = resolveCapacityRule({ subjectId, classType: meta.classType }, scope.learningCentreId, input.capacityRules);
    if (resolution.status === 'CONFIGURATION_REQUIRED') {
      demands.push({ ...base, forecastCount: supported, configurationStatus: 'CONFIGURATION_REQUIRED', configurationIssue: resolution.issue, configurationMessage: resolution.message, capacityRuleId: null, sections: [] });
      continue;
    }
    demands.push({
      ...base, forecastCount: supported, configurationStatus: 'CONFIGURED', configurationIssue: null, configurationMessage: null,
      capacityRuleId: resolution.rule.capacityRuleId, sections: allocateSections(supported, resolution.rule),
    });
  }

  const curriculumFingerprints = curriculumFingerprintsOf(curricula);
  const ruleSnapshot: EngineRuleSnapshot = {
    ...scope,
    engineVersion: ENGINE_VERSION,
    demandAssumption: 'SUPPORTED_ELIGIBLE_POOL',
    assumptionNote: DEMAND_ASSUMPTION_NOTE,
    policyVersions: { nearGraduation: NEAR_GRADUATION_POLICY_VERSION, retake: RETAKE_POLICY_VERSION, prerequisite: PREREQUISITE_POLICY_VERSION, allocation: ALLOCATION_POLICY_VERSION },
    supportedCohortStatuses: [...SUPPORTED_COHORT_STATUSES],
    targetSemester: { ...target },
    capacityRules: [...input.capacityRules].sort((a, b) => a.capacityRuleId - b.capacityRuleId).map((rule) => ({ ...rule })),
    exclusions,
    semesterTypeExclusions,
    curricula: curriculumFingerprints,
    catalogueFingerprint: catalogueFingerprintOf(curriculumFingerprints),
    snapshotStudentCount: students.length,
  };

  const originalRecommendations: EngineOriginalRecommendation[] = demands
    .filter((demand) => demand.sections.length > 0).map((demand) => ({ subjectId: demand.subjectId, sections: demand.sections }));
  const active = demands.filter((demand) => !demand.excluded && !demand.semesterTypeExcluded);
  const allSections = demands.flatMap((demand) => demand.sections);
  const totalSupported = active.reduce((sum, demand) => sum + demand.supportedDemand, 0);
  const totalUncertain = active.reduce((sum, demand) => sum + demand.uncertainCount, 0);
  const summary: EngineSummary = {
    studentsInSnapshot: students.length,
    studentsWithUnresolvedCurriculum: unresolved,
    subjects: demands.length,
    excludedSubjects: demands.filter((demand) => demand.excluded).length,
    notOfferedInSemesterTypeSubjects: demands.filter((demand) => demand.semesterTypeExcluded).length,
    configurationRequiredSubjects: demands.filter((demand) => demand.configurationStatus === 'CONFIGURATION_REQUIRED').length,
    insufficientDataSubjects: active.filter((demand) => demand.insufficientData).length,
    subjectsWithSections: originalRecommendations.length,
    totalSupportedDemand: totalSupported,
    totalUncertain,
    totalSections: allSections.length,
    sectionsBelowMinimum: allSections.filter((section) => section.flags.includes('BELOW_MINIMUM')).length,
    sectionsBelowOptimal: allSections.filter((section) => section.flags.includes('BELOW_OPTIMAL')).length,
    qualityStatus: qualityOf(totalSupported, totalUncertain + unresolved),
  };
  return { engineVersion: ENGINE_VERSION, ruleSnapshot, demands, originalRecommendations, summary };
}

function curriculumFingerprintsOf(curricula: ForecastEngineInput['curricula']) {
  return [...curricula].sort((a, b) => a.curriculumId - b.curriculumId).map((curriculum) => ({
    curriculumId: curriculum.curriculumId, curriculumVersion: curriculum.curriculumVersion, totalCreditsRequired: curriculum.totalCreditsRequired,
    fingerprint: fingerprint({
      id: curriculum.curriculumId, total: curriculum.totalCreditsRequired,
      requirements: [...curriculum.requirements].sort((a, b) => a.requirementId - b.requirementId),
      rules: [...curriculum.subjectSemesterRules].sort((a, b) => a.ruleId - b.ruleId),
      subjects: [...curriculum.subjects].sort((a, b) => a.curriculumSubjectId - b.curriculumSubjectId),
    }),
  }));
}
const catalogueFingerprintOf = (entries: Array<{ curriculumId: number; fingerprint: string }>) => fingerprint(entries.map((entry) => [entry.curriculumId, entry.fingerprint]));

/** The run's `ruleSnapshot.catalogueFingerprint` for these curricula, without running the forecast. */
export const catalogueFingerprint = (curricula: ForecastEngineInput['curricula']): string => catalogueFingerprintOf(curriculumFingerprintsOf(curricula));
