import type { ForecastAuditEntry, ForecastConfigurationStatus, ForecastQualityStatus, ForecastScope, Int32Id, UncertaintyReason, ClassType } from '../../../../../packages/shared/src/forecasting/contracts';
import type {
  EngineCapacityRule, EngineCurriculum, EngineOriginalRecommendation, EngineRuleSnapshot, EngineSnapshot, EngineTargetSemester,
} from '../../../../../packages/shared/src/forecasting/engine/types';
import type { ForecastRunStatus, RunDecisionAction, RunSummary, SectionReviewStatus } from '../../../../../packages/shared/src/forecasting/runs';

/** A stored forecast_run with the audit count that, with the status, forms its revision. */
export interface RunRecord extends ForecastScope {
  forecastRunId: Int32Id;
  importBatchId: Int32Id;
  versionNumber: number;
  parentForecastRunId: Int32Id | null;
  status: ForecastRunStatus;
  engineVersion: string;
  generatedBy: string;
  generatedAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  auditCount: number;
}
export interface RunListRow extends RunRecord { summary: RunSummary }
/** The state a mutation was validated against; the transaction aborts when the stored run no longer matches. */
export interface RunExpectation { status: ForecastRunStatus; auditCount: number }

export interface RunSubjectRow {
  demandId: Int32Id;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  eligibleCount: number | null;
  forecastCount: number | null;
  uncertainCount: number;
  uncertaintyReasons: UncertaintyReason[];
  dataQualityStatus: ForecastQualityStatus;
  configurationStatus: ForecastConfigurationStatus;
}
export interface RunSectionRow {
  proposedSectionId: Int32Id;
  demandId: Int32Id;
  capacityRuleId: Int32Id;
  sectionNumber: number;
  expectedStudents: number;
  reviewStatus: SectionReviewStatus;
  justification: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
}
export interface RunDetailRows {
  run: RunRecord;
  scenarioAssumptions: Record<string, unknown>;
  ruleSnapshot: EngineRuleSnapshot;
  originalRecommendations: EngineOriginalRecommendation[];
  subjects: RunSubjectRow[];
  sections: RunSectionRow[];
}

/** Everything the pure engine needs, read from an ACCEPTED snapshot and the live catalogue/capacity rules. */
export interface EngineInputRows {
  target: EngineTargetSemester;
  snapshot: EngineSnapshot;
  curricula: EngineCurriculum[];
  capacityRules: EngineCapacityRule[];
}

export interface NewRunInput {
  scope: ForecastScope;
  importBatchId: Int32Id;
  actor: string;
  engineVersion: string;
  ruleSnapshot: EngineRuleSnapshot;
  originalRecommendations: EngineOriginalRecommendation[];
  scenarioAssumptions: Record<string, unknown>;
  demands: Array<{
    subjectId: Int32Id;
    eligibleCount: number;
    forecastCount: number | null;
    uncertainCount: number;
    uncertaintyReasons: UncertaintyReason[];
    dataQualityStatus: ForecastQualityStatus;
    configurationStatus: ForecastConfigurationStatus;
  }>;
  sections: Array<{ subjectId: Int32Id; sectionNumber: number; expectedStudents: number; capacityRuleId: Int32Id }>;
}

export interface SectionState { proposedSectionId: Int32Id; sectionNumber: number; expectedStudents: number; reviewStatus: SectionReviewStatus; justification: string | null }
/** One validated decision, ready to apply: the service computes everything, the repository only writes. */
export interface DecisionPlan {
  demandId: Int32Id;
  subjectId: Int32Id;
  action: RunDecisionAction;
  reason: string;
  approvalReference: string | null;
  /** Review status stamped on every current section (REVIEW, APPROVE, DEFER, and REPLACE_ALLOCATION: REVIEWED). */
  sectionStatus: SectionReviewStatus;
  /** Sections as they were when validated; the transaction guard guarantees nothing changed since. The after-state is read back from the table. */
  before: SectionState[];
  replace: null | {
    deleteSectionIds: Int32Id[];
    keep: Array<{ proposedSectionId: Int32Id; sectionNumber: number; expectedStudents: number; justification: string | null }>;
    insert: Array<{ sectionNumber: number; expectedStudents: number; justification: string | null; capacityRuleId: Int32Id }>;
  };
}

export interface ForecastRunsRepository {
  engineInputs(scope: ForecastScope, importBatchId: Int32Id): Promise<EngineInputRows>;
  findByImportBatch(importBatchId: Int32Id): Promise<RunRecord | null>;
  /** Highest version for the scope, or null. */
  latestVersion(scope: ForecastScope): Promise<{ forecastRunId: Int32Id; versionNumber: number; status: ForecastRunStatus } | null>;
  /** One transaction: run (next version in the namespace), demand rows, sections. Aborts with RUN_ALREADY_EXISTS when the batch already has a run. */
  createRun(input: NewRunInput): Promise<RunRecord>;
  getRun(forecastRunId: Int32Id): Promise<RunRecord | null>;
  getDetail(forecastRunId: Int32Id): Promise<RunDetailRows | null>;
  listRuns(scope: ForecastScope, limit: number, beforeRunId: number | null): Promise<RunListRow[]>;
  listAudit(forecastRunId: Int32Id, scope: ForecastScope, limit: number, beforeAuditId: number | null): Promise<ForecastAuditEntry[]>;
  /** One transaction: START_REVIEW audit row (run-level, written while DRAFT) and DRAFT -> UNDER_REVIEW. */
  startReview(forecastRunId: Int32Id, expected: RunExpectation, actor: string, reason: string): Promise<RunRecord>;
  applyDecisions(forecastRunId: Int32Id, expected: RunExpectation, actor: string, plans: DecisionPlan[]): Promise<RunRecord>;
  finalize(forecastRunId: Int32Id, expected: RunExpectation, actor: string, audit: { reason: string; approvalReference: string | null }): Promise<RunRecord>;
}
