/**
 * UC20 Package 6 forecast-run transport contracts (S2-P004-007, MT5a): generate, read, review,
 * decide and finalize. These supersede the planned `ForecastRun` / `SubjectDemand` read shapes in
 * `contracts.ts`, which assumed a single immutable version 1 and the pre-engine rule snapshot.
 */
import type {
  ClassType, Envelope, ForecastAuditEntry, ForecastConfigurationStatus, ForecastQualityStatus, ForecastScope, Int32Id, OperationReceipt,
  ImportSource, Paginated, UncertaintyReason,
} from './contracts';
import type { ConfigurationIssueCode, DemandBreakdown, EngineOriginalRecommendation, EngineRuleSnapshot, UncertaintyReasonCount } from './engine/types';
import type { SubjectStudentOutcome } from './engine/subject-students';

export type { SubjectStudentOutcome, SubjectStudentOutcomeKind } from './engine/subject-students';

export const FORECAST_RUN_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'FINALIZED'] as const;
export type ForecastRunStatus = (typeof FORECAST_RUN_STATUSES)[number];
export const SECTION_REVIEW_STATUSES = ['PENDING', 'REVIEWED', 'APPROVED', 'DEFERRED'] as const;
export type SectionReviewStatus = (typeof SECTION_REVIEW_STATUSES)[number];
/** REOPEN puts a decided subject back to PENDING (for example, adding back a removed subject). */
export const RUN_DECISION_ACTIONS = ['REVIEW', 'APPROVE', 'DEFER', 'REOPEN', 'REPLACE_ALLOCATION'] as const;
export type RunDecisionAction = (typeof RUN_DECISION_ACTIONS)[number];
/** BELOW_MINIMUM / BELOW_OPTIMAL as the engine; ABOVE_NORMAL_MAXIMUM marks an approved exception (needs justification). */
export type RunSectionFlag = 'BELOW_MINIMUM' | 'BELOW_OPTIMAL' | 'ABOVE_NORMAL_MAXIMUM';

export const RUN_LIMITS = {
  maxDecisionsPerRequest: 200,
  maxSectionsPerSubject: 50,
  /** `forecast_adjustment_audit.reason` is 1-500 characters. */
  maxReasonLength: 500,
  maxApprovalReferenceLength: 100,
  maxJustificationLength: 500,
  defaultPageSize: 50,
  maxPageSize: 100,
  /** Newest audit entries embedded in the run detail; the full history is paged at `/audit`. */
  embeddedAuditEntries: 100,
} as const;

/** One proposed section with the stored capacity rule values; flags are recomputed from them on every read. */
export interface RunSection {
  proposedSectionId: Int32Id;
  sectionNumber: number;
  expectedStudents: number;
  capacityRuleId: Int32Id;
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
  reviewStatus: SectionReviewStatus;
  justification: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  flags: RunSectionFlag[];
}

/** NONE = no sections to decide; MIXED = sections are resolved but not all the same decision. */
export type SubjectDecisionStatus = 'NONE' | SectionReviewStatus | 'MIXED';

export interface RunSubject {
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  excluded: boolean;
  exclusionReason: string | null;
  /**
   * Normal/Short offering rule (subject_semester_rule): the subject does not run in this run's semester type. No demand, no sections,
   * not in totals, cannot be confirmed (422 SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE). Stored as configurationStatus EXCLUDED; never true with `excluded`.
   */
  semesterTypeExcluded: boolean;
  /** "Runs only in Short semesters" / "Runs only in Normal semesters"; null unless semesterTypeExcluded. */
  semesterTypeExclusionReason: string | null;
  /** Potential demand: the supported eligible pool (`eligible_count`). */
  supportedEligibleCount: number;
  /** Null for excluded subjects (never zero for unknown). */
  forecastCount: number | null;
  uncertainStudentCount: number;
  uncertaintyReasons: UncertaintyReason[];
  uncertaintyReasonCounts: UncertaintyReasonCount[];
  /** Information only; never part of the demand count. */
  nearGraduationCount: number;
  qualityStatus: ForecastQualityStatus;
  configurationStatus: ForecastConfigurationStatus;
  configurationIssue: ConfigurationIssueCode | null;
  configurationMessage: string | null;
  breakdown: DemandBreakdown | null;
  decisionStatus: SubjectDecisionStatus;
  /** Sum of the current section sizes (equals forecastCount until a REPLACE_ALLOCATION, which preserves it). */
  allocatedStudents: number;
  sections: RunSection[];
}

export interface RunSummary {
  subjects: number;
  excludedSubjects: number;
  /** Subjects not offered in the run's semester type (not part of excludedSubjects). */
  notOfferedInSemesterTypeSubjects: number;
  configurationRequiredSubjects: number;
  totalSupportedDemand: number;
  totalUncertain: number;
  totalSections: number;
  /** Sections still PENDING; finalization needs this to be 0. */
  pendingSections: number;
  sectionsBelowMinimum: number;
  sectionsBelowOptimal: number;
  /** Subjects with at least one PENDING section: the coordinator decides per subject. */
  pendingSubjects: number;
  /** Subjects whose potential demand is under the minimum enrolment (any section flagged BELOW_MINIMUM). */
  subjectsBelowMinimum: number;
}

/** OP1: informational only. Present when a later version exists for the same programme + centre + semester. */
export interface NewerForecastAvailable { forecastRunId: Int32Id; versionNumber: number; status: ForecastRunStatus }

export interface ForecastRunHeader extends ForecastScope {
  forecastRunId: Int32Id;
  importBatchId: Int32Id;
  versionNumber: number;
  parentForecastRunId: Int32Id | null;
  status: ForecastRunStatus;
  /** Optimistic-concurrency token; also sent as the quoted `ETag`. Mutations send it in `If-Match`. */
  revision: string;
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL';
  engineVersion: string;
  generatedBy: string;
  generatedAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  newerForecastAvailable: NewerForecastAvailable | null;
}
export interface ForecastRunSummary extends ForecastRunHeader { summary: RunSummary }
export interface ForecastRunDetail extends ForecastRunHeader {
  assumptionNote: string;
  /** Source of the import snapshot the forecast is based on; 'SYSTEM' means student-entered portal records. */
  dataSource: ImportSource;
  summary: RunSummary;
  subjects: RunSubject[];
  /** The immutable rule/capacity snapshot stored with the run. */
  ruleSnapshot: EngineRuleSnapshot;
  /** The engine's original recommendation, kept beside every later adjustment. */
  originalRecommendations: EngineOriginalRecommendation[];
  /** Newest first, at most `RUN_LIMITS.embeddedAuditEntries`; page the rest from `/audit`. */
  audit: ForecastAuditEntry[];
  auditTruncated: boolean;
}

export interface GenerateRunRequest extends ForecastScope { importBatchId: Int32Id; demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' }
export interface StartRunReviewRequest { scope: ForecastScope; action: 'START_REVIEW'; reason?: string }
export interface ReplacementSection { proposedSectionId?: Int32Id; sectionNumber: number; expectedStudents: number; justification?: string }
export type RunDecision =
  | { subjectId: Int32Id; action: 'REVIEW' | 'APPROVE' | 'DEFER' | 'REOPEN'; reason: string; approvalReference?: string }
  | { subjectId: Int32Id; action: 'REPLACE_ALLOCATION'; reason: string; approvalReference?: string; replacementSections: ReplacementSection[] };
export interface RunDecisionBatchRequest { scope: ForecastScope; decisions: RunDecision[] }
export interface FinalizeRunRequest { scope: ForecastScope; reason?: string; approvalReference?: string }

/** Read-only roster behind one subject's numbers (GET forecast-runs/{id}/subjects/{subjectId}/students). Never changes demand. */
export interface RunSubjectStudents {
  forecastRunId: Int32Id;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  /**
   * False when the live curriculum catalogue no longer matches the run's stored rule snapshot: the list was recomputed with the current
   * curriculum and may differ from the stored counts.
   */
  catalogueMatchesRun: boolean;
  summary: {
    inCurriculum: number;
    /** Supported students: the potential demand counted for the subject. */
    counted: number;
    uncertain: number;
    nearGraduation: number;
    /** Already passed + prerequisite not met + not offered this semester. */
    notCounted: number;
    breakdown: DemandBreakdown;
    uncertaintyReasonCounts: UncertaintyReasonCount[];
  };
  /** Sorted by matric (external reference). */
  /** False when sign-in emails could not be read from the identity provider; students then show their reference. */
  emailsAvailable: boolean;
  students: RunSubjectStudent[];
}
/**
 * A student row. For portal students (`PORTAL-<id>`), `matricNo` (from the profile) and `email` (sign-in email) are read live for display only;
 * both are null for CSV students, whose `externalReference` is already the matric number.
 */
export type RunSubjectStudent = SubjectStudentOutcome & { matricNo: string | null; email: string | null };
export type RunSubjectStudentsEnvelope = Envelope<RunSubjectStudents>;

export type ForecastRunDetailEnvelope = Envelope<ForecastRunDetail>;
export type ForecastRunSummaryList = Paginated<ForecastRunSummary>;
export type ForecastRunSummaryListEnvelope = Envelope<ForecastRunSummaryList>;
export type ForecastRunReceiptEnvelope = Envelope<OperationReceipt>;

/** Pure flag computation shared by the API and the screens (identical rules to the engine, plus the exception marker). */
export function sectionFlags(section: Pick<RunSection, 'expectedStudents' | 'minimumEnrollment' | 'breakEvenTarget' | 'normalMaximum'>): RunSectionFlag[] {
  const flags: RunSectionFlag[] = [];
  if (section.expectedStudents < section.minimumEnrollment) flags.push('BELOW_MINIMUM');
  if (section.expectedStudents < section.breakEvenTarget) flags.push('BELOW_OPTIMAL');
  if (section.expectedStudents > section.normalMaximum) flags.push('ABOVE_NORMAL_MAXIMUM');
  return flags;
}
export function subjectDecisionStatus(sections: ReadonlyArray<Pick<RunSection, 'reviewStatus'>>): SubjectDecisionStatus {
  if (sections.length === 0) return 'NONE';
  if (sections.some((section) => section.reviewStatus === 'PENDING')) return 'PENDING';
  const first = sections[0]!.reviewStatus;
  return sections.every((section) => section.reviewStatus === first) ? first : 'MIXED';
}
/** `fr<id>.<status>.<auditCount>`: changes with every decision (each writes an audit row) and every lifecycle step. */
export function runRevision(forecastRunId: number, status: ForecastRunStatus, auditCount: number): string {
  return `fr${forecastRunId}.${status}.${auditCount}`;
}
