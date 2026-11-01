/** Transport contracts for planned UC20 operations. No runtime API behavior is implemented here. */
import type { CurriculumPrerequisiteSummary } from '../curriculum-reference';
export type { CurriculumPrerequisiteExpression } from '../curriculum-reference';

export const IMPORT_CSV_HEADER = [
  'external_reference', 'curriculum_version', 'cohort_status', 'history_completeness',
  'subject_code', 'subject_status', 'record_semester_id', 'recognized_credits', 'is_synthetic',
] as const;
export const IMPORTED_SUBJECT_STATUSES = ['COMPLETED', 'EXEMPTED', 'FAILED', 'IN_PROGRESS'] as const;
export const HISTORY_COMPLETENESS = ['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const;
export type HistoryCompleteness = (typeof HISTORY_COMPLETENESS)[number];
export type CompletenessAfterRejectedHistory = 'PARTIAL' | 'UNKNOWN';
export type Int32Id = number;
export type ClassType = 'LECTURE' | 'LAB' | null;
export type SubjectPrerequisiteRequirement = 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE';

export interface ForecastScope {
  programmeId: Int32Id;
  learningCentreId: Int32Id;
  targetSemesterId: Int32Id;
}
export interface ProgrammeOption { programmeId: Int32Id; programmeCode: string; programmeName: string }
export interface CentreOption { learningCentreId: Int32Id; centreCode: string; centreName: string }
export interface SemesterOption { semesterId: Int32Id; academicYear: string; semesterNumber: 1 | 2 | 3 }
export interface CurriculumOption { curriculumId: Int32Id; programmeId: Int32Id; curriculumVersion: string; effectiveYear?: number | null }

export type ConditionalPrerequisiteAvailability =
  | { status: 'AVAILABLE'; details: CurriculumPrerequisiteSummary }
  | { status: 'UNAVAILABLE'; reason: string };
export interface SubjectPrerequisiteLink {
  prerequisiteId: Int32Id;
  curriculumSubjectId: Int32Id;
  requiredCurriculumSubjectId: Int32Id;
  requirementType: SubjectPrerequisiteRequirement;
}
export interface ForecastSubjectOption {
  curriculumSubjectId: Int32Id;
  curriculumId: Int32Id;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  includeInOfferingForecast: boolean;
  exclusionReason: string | null;
  prerequisiteLinks: SubjectPrerequisiteLink[];
  conditionalPrerequisites: ConditionalPrerequisiteAvailability;
}
export interface ForecastContext {
  programmes: ProgrammeOption[];
  learningCentres: CentreOption[];
  targetSemesters: SemesterOption[];
  curricula: CurriculumOption[];
  subjects: ForecastSubjectOption[];
}

export interface ImportCsvRow {
  external_reference: string;
  curriculum_version: string;
  cohort_status: string;
  history_completeness: HistoryCompleteness;
  subject_code: string;
  subject_status: '' | (typeof IMPORTED_SUBJECT_STATUSES)[number];
  record_semester_id: string;
  recognized_credits: string;
  is_synthetic: '' | 'true' | 'false';
}
export interface ImportCounts {
  studentRows: number;
  uniqueStudents: number;
  validAttempts: number;
  rejectedRows: number;
  partialStudents: number;
  unknownHistoryStudents: number;
}
export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  row: number | null;
  field: string | null;
  message: string;
  correctiveAction: string;
}
export interface CompletenessChange {
  externalReference: string;
  before: HistoryCompleteness;
  after: CompletenessAfterRejectedHistory;
  rejectedRows: number;
}
export interface AcceptedSnapshotReceipt {
  importBatchId: Int32Id;
  acceptedAt: string;
  sourceFingerprint: string;
}
export interface ImportValidationReport {
  validationId: string;
  validationRevision: string;
  status: 'VALID' | 'CORRECTION_REQUIRED' | 'FILE_REJECTED';
  counts: ImportCounts;
  issues: ValidationIssue[];
  completenessChanges: CompletenessChange[];
  subsetAcknowledgementRequired: boolean;
  acceptedSnapshot: AcceptedSnapshotReceipt | null;
}
export interface ImportValidationEnvelope { error: { code: string; message: string; report: ImportValidationReport } }
export interface AcceptedImport extends ForecastScope {
  importBatchId: Int32Id;
  sourceDate: string;
  sourceLabel: string;
  acceptedAt: string;
  sourceFingerprint: string;
  counts: ImportCounts;
  snapshotStatus: 'ACCEPTED_IMMUTABLE';
  validationReport: ImportValidationReport;
}
export type ImportSummary = Omit<AcceptedImport, 'validationReport'>;
export interface ImportUploadRequest extends ForecastScope {
  sourceDate: string;
  sourceLabel: string;
  file: File;
}
export interface AcceptSubsetRequest extends ForecastScope {
  validationRevision: string;
  acknowledgeRejectedRows: true;
}

export type ForecastQualityStatus = 'SUPPORTED' | 'PRELIMINARY' | 'INSUFFICIENT_DATA';
export type ForecastConfigurationStatus = 'CONFIGURED' | 'CONFIGURATION_REQUIRED' | 'EXCLUDED';
export type UncertaintyReason =
  | 'COHORT_STATUS_UNMAPPED' | 'HISTORY_UNKNOWN' | 'HISTORY_PARTIAL' | 'SOURCE_STATUS_UNMAPPED'
  | 'RETAKE_OUTCOME_UNRESOLVED' | 'CREDIT_EVIDENCE_MISSING' | 'CGPA_EVIDENCE_MISSING'
  | 'PREREQUISITE_EVIDENCE_MISSING' | 'COREQUISITE_EVIDENCE_MISSING'
  | 'CURRICULUM_VERSION_UNRESOLVED' | 'REJECTED_HISTORY_ROW';
export interface ProposedSection {
  proposedSectionId: Int32Id;
  sectionNumber: number;
  expectedStudents: number;
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
  reviewStatus: 'PENDING' | 'REVIEWED' | 'APPROVED' | 'DEFERRED';
  justification?: string;
}
export interface SubjectDemand {
  subjectId: Int32Id;
  supportedEligibleCount: number;
  uncertainStudentCount: number;
  forecastCount: number | null;
  qualityStatus: ForecastQualityStatus;
  graduationCriticalSupportedCount?: number | null;
  uncertaintyReasons: UncertaintyReason[];
  configurationStatus: ForecastConfigurationStatus;
  configurationMessage?: string;
  exclusionReason?: string;
  sections: ProposedSection[];
}
export interface SubjectAllocation { proposedSectionId?: Int32Id; sectionNumber: number; expectedStudents: number; justification?: string }
export interface OriginalSubjectRecommendation { subjectId: Int32Id; sections: ProposedSection[] }

export interface CurriculumRequirementSnapshot {
  requirementId: Int32Id;
  curriculumId: Int32Id;
  requirementType: string;
  requiredCredits: number | null;
  requiredSubjects: number | null;
}
export interface SubjectSemesterRuleSnapshot {
  ruleId: Int32Id;
  curriculumSubjectId: Int32Id;
  semesterType: 'NORMAL' | 'SHORT';
}
export interface ForecastCurriculumSnapshot {
  curriculumId: Int32Id;
  curriculumVersion: string;
  catalogueFingerprint: string;
  requirements: CurriculumRequirementSnapshot[];
  subjectSemesterRules: SubjectSemesterRuleSnapshot[];
  subjects: ForecastSubjectOption[];
}
export interface ForecastRuleSnapshot extends ForecastScope {
  importBatchId: Int32Id;
  acceptedAt: string;
  sourceDate: string;
  sourceLabel: string;
  sourceFingerprint: string;
  curricula: ForecastCurriculumSnapshot[];
  exclusions: SubjectExclusion[];
  capacityRules: CapacityRule[];
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL';
  cohortStatusMappings: Record<string, string>;
  engineVersion: string;
}
export interface ForecastRunScope extends ForecastScope {
  forecastRunId: Int32Id;
  importBatchId: Int32Id;
  versionNumber: 1;
  parentForecastRunId: null;
  revision: string;
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL';
  engineVersion: string;
  generatedBy: string;
  generatedAt: string;
  demands: SubjectDemand[];
  qualityWarnings: ValidationIssue[];
  ruleSnapshot: ForecastRuleSnapshot;
  originalRecommendations: OriginalSubjectRecommendation[];
}
export type ForecastRun = ForecastRunScope & (
  | { status: 'DRAFT' | 'UNDER_REVIEW'; finalizedBy: null; finalizedAt: null }
  | { status: 'FINALIZED'; finalizedBy: string; finalizedAt: string }
);

export interface GenerateForecastRequest extends ForecastScope {
  importBatchId: Int32Id;
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL';
}
export interface StartForecastReviewRequest { scope: ForecastScope; action: 'START_REVIEW'; reason?: string }
export type SubjectAllocationDecision =
  | { subjectId: Int32Id; action: 'REVIEW' | 'APPROVE' | 'DEFER'; reason: string; approvalReference?: string }
  | { subjectId: Int32Id; action: 'REPLACE_ALLOCATION'; reason: string; approvalReference?: string; replacementSections: SubjectAllocation[] };
export interface DecisionBatchRequest { scope: ForecastScope; decisions: SubjectAllocationDecision[] }
export interface FinalizeForecastRequest { scope: ForecastScope; reason?: string; approvalReference?: string }

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
export interface ForecastAuditEntry {
  decisionAuditId: Int32Id;
  forecastRunId: Int32Id;
  scope: ForecastScope;
  subjectId: Int32Id | null;
  proposedSectionId: Int32Id | null;
  actionType: string;
  recordedBy: string;
  recordedAt: string;
  reason?: string;
  approvalReference?: string;
  before: JsonObject;
  after: JsonObject;
}

export interface CapacityRule {
  scopeKind: 'GLOBAL' | 'CENTRE' | 'SUBJECT_CENTRE';
  learningCentreId?: Int32Id;
  subjectId?: Int32Id;
  classType: 'LECTURE' | 'LAB';
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
  effectiveFromSemesterId: Int32Id;
  effectiveToSemesterId: Int32Id | null;
}
export interface SubjectExclusion {
  subjectId: Int32Id;
  reason: string;
  effectiveFromSemesterId: Int32Id;
  effectiveToSemesterId: Int32Id | null;
}
export interface ForecastConfiguration {
  revision: string;
  configurationVersion: number;
  capacityRules: CapacityRule[];
  subjectExclusions: SubjectExclusion[];
  staleSourceMaxAgeDays: number | null;
}
export interface ForecastConfigurationRequest {
  capacityRules: CapacityRule[];
  subjectExclusions: SubjectExclusion[];
  staleSourceMaxAgeDays?: number | null;
  baseRevision: string;
}

export interface OperationReceipt {
  resourceId: Int32Id;
  programmeId: Int32Id;
  learningCentreId: Int32Id;
  targetSemesterId: Int32Id;
  acceptedAt: string;
  revision: string;
}
export interface Envelope<T> { data: T }
export interface ErrorEnvelope { error: { code: string; message: string } }
export type OperationEnvelope<T = OperationReceipt> = Envelope<T>;
export type ForecastContextEnvelope = Envelope<ForecastContext>;
export type AcceptedImportEnvelope = Envelope<AcceptedImport>;
export type ForecastRunEnvelope = Envelope<ForecastRun>;
export type ForecastConfigurationEnvelope = Envelope<ForecastConfiguration>;
export type ForecastTemplateResponse = string;
export interface Paginated<T> { items: T[]; nextCursor?: string }
export type ImportListData = Paginated<ImportSummary>;
export type ForecastRunListData = Paginated<ForecastRun>;
export type ForecastAuditData = Paginated<ForecastAuditEntry>;
export type ImportListResponse = Envelope<ImportListData>;
export type ForecastRunListResponse = Envelope<ForecastRunListData>;
export type ForecastAuditResponse = Envelope<ForecastAuditData>;
