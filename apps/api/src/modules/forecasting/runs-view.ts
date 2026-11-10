import type { ConfigurationIssueCode, DemandBreakdown, UncertaintyReasonCount } from '../../../../../packages/shared/src/forecasting/engine/types';
import { runRevision, sectionFlags, subjectDecisionStatus } from '../../../../../packages/shared/src/forecasting/runs';
import type {
  ForecastRunDetail, ForecastRunHeader, RunSection, RunSubject, RunSummary,
} from '../../../../../packages/shared/src/forecasting/runs';
import type { RunDetailRows, RunRecord, RunSectionRow, RunSubjectRow } from './runs-contracts';

/** Per-subject data the engine produces that has no column of its own; stored in `forecast_run.scenario_assumptions.subjects`. */
export interface StoredSubjectAssumptions {
  nearGraduationCount: number;
  breakdown: DemandBreakdown;
  uncertaintyReasonCounts: UncertaintyReasonCount[];
  configurationIssue: ConfigurationIssueCode | null;
  configurationMessage: string | null;
  exclusionReason: string | null;
  /** Absent in runs generated before engine 1.1.0 (treated as false). */
  semesterTypeExcluded?: boolean;
  semesterTypeExclusionReason?: string | null;
  capacityRuleId: number | null;
}

export const revisionOf = (run: Pick<RunRecord, 'forecastRunId' | 'status' | 'auditCount'>) => runRevision(run.forecastRunId, run.status, run.auditCount);

/** The "newer forecast" notice belonged to the removed forecast-version flow; a snapshot has exactly one forecast. */
export function headerOf(run: RunRecord): ForecastRunHeader {
  return {
    forecastRunId: run.forecastRunId, programmeId: run.programmeId, learningCentreId: run.learningCentreId, targetSemesterId: run.targetSemesterId,
    importBatchId: run.importBatchId, versionNumber: run.versionNumber, parentForecastRunId: run.parentForecastRunId, status: run.status, revision: revisionOf(run),
    demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', engineVersion: run.engineVersion, generatedBy: run.generatedBy, generatedAt: run.generatedAt,
    finalizedBy: run.finalizedBy, finalizedAt: run.finalizedAt, newerForecastAvailable: null,
  };
}

function sectionOf(row: RunSectionRow): RunSection {
  return {
    proposedSectionId: row.proposedSectionId, sectionNumber: row.sectionNumber, expectedStudents: row.expectedStudents, capacityRuleId: row.capacityRuleId,
    minimumEnrollment: row.minimumEnrollment, breakEvenTarget: row.breakEvenTarget, normalMaximum: row.normalMaximum, exceptionMaximum: row.exceptionMaximum,
    reviewStatus: row.reviewStatus, justification: row.justification, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt, flags: sectionFlags(row),
  };
}
export function assumptionsFor(rows: Pick<RunDetailRows, 'scenarioAssumptions'>, subjectId: number): StoredSubjectAssumptions | null {
  const subjects = rows.scenarioAssumptions.subjects as Record<string, StoredSubjectAssumptions> | undefined;
  return subjects?.[String(subjectId)] ?? null;
}

export function subjectOf(row: RunSubjectRow, stored: StoredSubjectAssumptions | null, sections: RunSectionRow[]): RunSubject {
  const own = sections.filter((section) => section.demandId === row.demandId).sort((a, b) => a.sectionNumber - b.sectionNumber).map(sectionOf);
  return {
    subjectId: row.subjectId, subjectCode: row.subjectCode, subjectName: row.subjectName, creditHours: row.creditHours, classType: row.classType,
    excluded: row.configurationStatus === 'EXCLUDED' && !stored?.semesterTypeExcluded, exclusionReason: stored?.exclusionReason ?? null,
    semesterTypeExcluded: stored?.semesterTypeExcluded === true, semesterTypeExclusionReason: stored?.semesterTypeExcluded ? stored.semesterTypeExclusionReason ?? null : null,
    supportedEligibleCount: row.eligibleCount ?? 0, forecastCount: row.forecastCount, uncertainStudentCount: row.uncertainCount,
    uncertaintyReasons: row.uncertaintyReasons, uncertaintyReasonCounts: stored?.uncertaintyReasonCounts ?? [], nearGraduationCount: stored?.nearGraduationCount ?? 0,
    qualityStatus: row.dataQualityStatus, configurationStatus: row.configurationStatus, configurationIssue: stored?.configurationIssue ?? null,
    configurationMessage: stored?.configurationMessage ?? null, breakdown: stored?.breakdown ?? null, decisionStatus: subjectDecisionStatus(own),
    allocatedStudents: own.reduce((sum, section) => sum + section.expectedStudents, 0), sections: own,
  };
}

export function summaryOf(subjects: RunSubject[]): RunSummary {
  const active = subjects.filter((subject) => !subject.excluded && !subject.semesterTypeExcluded);
  const sections = subjects.flatMap((subject) => subject.sections);
  return {
    subjects: subjects.length, excludedSubjects: subjects.filter((subject) => subject.excluded).length,
    notOfferedInSemesterTypeSubjects: subjects.filter((subject) => subject.semesterTypeExcluded).length,
    configurationRequiredSubjects: subjects.filter((subject) => subject.configurationStatus === 'CONFIGURATION_REQUIRED').length,
    totalSupportedDemand: active.reduce((sum, subject) => sum + subject.supportedEligibleCount, 0),
    totalUncertain: active.reduce((sum, subject) => sum + subject.uncertainStudentCount, 0),
    totalSections: sections.length, pendingSections: sections.filter((section) => section.reviewStatus === 'PENDING').length,
    sectionsBelowMinimum: sections.filter((section) => section.flags.includes('BELOW_MINIMUM')).length,
    sectionsBelowOptimal: sections.filter((section) => section.flags.includes('BELOW_OPTIMAL')).length,
    pendingSubjects: subjects.filter((subject) => subject.sections.some((section) => section.reviewStatus === 'PENDING')).length,
    subjectsBelowMinimum: subjects.filter((subject) => subject.sections.some((section) => section.flags.includes('BELOW_MINIMUM'))).length,
  };
}

export function detailOf(rows: RunDetailRows): ForecastRunDetail {
  const subjects = rows.subjects.map((row) => subjectOf(row, assumptionsFor(rows, row.subjectId), rows.sections));
  return {
    ...headerOf(rows.run), assumptionNote: rows.ruleSnapshot.assumptionNote, dataSource: rows.scenarioAssumptions.importSource === 'SYSTEM' || rows.scenarioAssumptions.importSource === 'COMBINED' ? rows.scenarioAssumptions.importSource : 'CSV', summary: summaryOf(subjects), subjects,
    ruleSnapshot: rows.ruleSnapshot, originalRecommendations: rows.originalRecommendations,
    audit: [], auditTruncated: false,
  };
}
