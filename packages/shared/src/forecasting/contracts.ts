/** Transport contracts for planned UC20 operations. No runtime API behavior is implemented here. */
import type { CurriculumPrerequisiteSummary } from '../curriculum-reference';
export type { CurriculumPrerequisiteExpression } from '../curriculum-reference';

export const IMPORT_CSV_HEADER = [
  'external_reference', 'curriculum_version', 'cohort_status', 'history_completeness',
  'subject_code', 'subject_status', 'record_semester_id', 'recognized_credits', 'is_synthetic', 'student_name',
] as const;
/** Header of CSV v1 files written before the optional `student_name` column; still accepted (names stay blank). */
export const IMPORT_CSV_LEGACY_HEADER = IMPORT_CSV_HEADER.slice(0, 9);
/**
 * CSV v1 transport safeguards (Package 1). `maxExternalReferenceLength` is 100, not the 128 in the
 * earlier contract text, because `imported_student.external_reference` is varchar(100); longer
 * references are a correction finding rather than silently truncated.
 */
export const IMPORT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxDataRows: 10_000,
  maxExternalReferenceLength: 100,
  maxCohortStatusLength: 20,
  maxStudentNameLength: 255,
  maxSourceLabelLength: 255,
  maxIssues: 500,
} as const;
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
  /** Assigned programme x centre pairs (the Coordinator may only use these). */
  assignedScopes?: Array<{ programmeId: Int32Id; learningCentreId: Int32Id }>;
  /** System current semester (admin-managed marker); null when none is set. */
  currentSemesterId?: Int32Id | null;
  /** The only semester an import may target: the one after the current semester; null when unavailable. */
  targetSemesterId?: Int32Id | null;
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
  /** Optional display name (product owner decision 2026-11-01); blank allowed. Never a portal ID or credential. */
  student_name: string;
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
/**
 * Where an accepted import snapshot came from: an uploaded CSV, the students in the system (portal snapshot, MT8), or both
 * in one combined snapshot (MT9). The coordinator chooses per forecast.
 */
export type ImportSource = 'CSV' | 'SYSTEM' | 'COMBINED';
/** Where one retained student of a snapshot came from. In a COMBINED snapshot the system record always wins over a CSV record. */
export type StudentSource = 'SYSTEM' | 'CSV';
/** Extra coverage of a COMBINED snapshot; the system part is the MT8 `coverage`. */
export interface CombinedSnapshotCoverage {
  csv: { rows: number; students: number; rejectedRows: number };
  /** Students in the snapshot: system students plus the CSV students not already in the system. */
  students: number;
  /** CSV references skipped because the student is already in the system (matric number match, system record wins). */
  csvSkippedAlreadyInSystem: string[];
  /** CSV students with the same name as a system student but a different reference; both are included. */
  possibleDuplicates: Array<{ csvReference: string; systemReferences: string[] }>;
}
/**
 * Coverage of a system-students snapshot. Student-entered academic records count as COMPLETE history; students with no
 * academic record at all are UNKNOWN history and so count as uncertain in the forecast.
 */
export interface SystemSnapshotCoverage {
  studentsFound: number;
  studentsWithRecords: number;
  studentsWithoutRecords: number;
  recordsMapped: number;
  /** Records skipped because the subject is not part of the student's curriculum. */
  recordsUnmapped: number;
  /** Mapped records whose student-entered status was WITHDRAWN; stored as FAILED (not a passed status). */
  withdrawnStoredAsFailed: number;
  excluded: { otherProgramme: number; otherCentre: number; inactiveAccess: number };
  /** Documents the interim centre rule while student profiles have no learning centre. */
  centreNote: string;
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
  /** Absent on CSV snapshots written before MT8 (read as 'CSV'). */
  source?: ImportSource;
  /** Present on system-students and combined snapshots (the system part). */
  coverage?: SystemSnapshotCoverage;
  /** Present only on combined snapshots. */
  combined?: CombinedSnapshotCoverage;
}
/** Stable validation issue codes produced by the UC20 CSV validator (file, group, attempt and warning findings). */
export const IMPORT_FILE_ERROR_CODES = [
  'CSV_ENCODING_INVALID', 'CSV_MALFORMED', 'CSV_EMPTY', 'CSV_HEADER_INVALID', 'CSV_COLUMN_COUNT',
  'CSV_TOO_MANY_ROWS', 'CSV_NO_DATA_ROWS',
] as const;
export const IMPORT_ROW_ERROR_CODES = [
  'EXTERNAL_REFERENCE_REQUIRED', 'EXTERNAL_REFERENCE_TOO_LONG', 'CURRICULUM_VERSION_REQUIRED', 'CURRICULUM_VERSION_UNKNOWN',
  'COHORT_STATUS_REQUIRED', 'COHORT_STATUS_TOO_LONG', 'STUDENT_NAME_INVALID', 'HISTORY_COMPLETENESS_INVALID', 'STUDENT_METADATA_CONFLICT',
  'ATTEMPT_INCOMPLETE', 'UNKNOWN_SUBJECT_CODE', 'SUBJECT_NOT_IN_CURRICULUM', 'UNMAPPED_SUBJECT_STATUS',
  'SEMESTER_ID_INVALID', 'SEMESTER_NOT_FOUND', 'RECOGNIZED_CREDITS_INVALID', 'RECOGNIZED_CREDITS_EXCEEDS_SUBJECT',
  'RECOGNIZED_CREDITS_NOT_ALLOWED', 'IS_SYNTHETIC_INVALID', 'DUPLICATE_ATTEMPT',
] as const;
export const IMPORT_WARNING_CODES = [
  'RETAKE_OUTCOME_UNRESOLVED', 'HISTORY_UNKNOWN', 'HISTORY_PARTIAL', 'SYNTHETIC_ATTEMPT', 'SEMESTER_UNKNOWN',
  'CREDIT_EVIDENCE_MISSING', 'STALE_SOURCE_THRESHOLD_NOT_CONFIGURED', 'ISSUES_TRUNCATED',
  'POSSIBLE_DUPLICATE_STUDENT', 'CSV_STUDENTS_ALREADY_IN_SYSTEM',
  'POSSIBLE_DUPLICATE_STUDENT', 'CSV_STUDENTS_ALREADY_IN_SYSTEM',
] as const;
export type ImportIssueCode = (typeof IMPORT_FILE_ERROR_CODES)[number] | (typeof IMPORT_ROW_ERROR_CODES)[number] | (typeof IMPORT_WARNING_CODES)[number];
/**
 * Internal, non-public part of the stored `academic_import_batch.validation_summary` (never returned by the API).
 * `rejectedRowsByStudent` lists every retained student with at least one rejected history row, so the engine can
 * record REJECTED_HISTORY_ROW uncertainty even when completeness was already PARTIAL or UNKNOWN.
 */
export interface StoredValidationInternals {
  schemaVersion: 1;
  csvVersion: 1;
  /** 'PORTAL' marks a system-students snapshot built from student_profile / academic_record (MT8); 'COMBINED' a system + CSV snapshot (MT9); absent for CSV. */
  source?: 'PORTAL' | 'COMBINED';
  /** COMBINED only: where each retained student came from. */
  sourceByReference?: Record<string, StudentSource>;
  dataRows: number;
  rejectedRowsByStudent: Record<string, number>;
  subsetAcknowledgedBy?: string;
}
export interface ImportValidationEnvelope { error: { code: string; message: string; report: ImportValidationReport } }
/** One retained roster student of an accepted import (read by the Coordinator who manages the cohort). */
export interface ImportedStudentSummary {
  importedStudentId: Int32Id;
  externalReference: string;
  studentName: string | null;
  curriculumVersion: string;
  cohortStatus: string;
  historyCompleteness: HistoryCompleteness;
  /** Where the student came from (always SYSTEM or CSV, also in a COMBINED snapshot). */
  source: StudentSource;
}
export interface AcceptedImport extends ForecastScope {
  importBatchId: Int32Id;
  sourceDate: string;
  sourceLabel: string;
  acceptedAt: string;
  sourceFingerprint: string;
  /** 'SYSTEM' (students in the system), 'COMBINED' (system + CSV), otherwise 'CSV'. */
  source: ImportSource;
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
/** POST /api/coordinator/forecast-imports/system-snapshots; the response is an AcceptedImport (201 created, 200 replay). */
export interface SystemSnapshotRequest extends ForecastScope { sourceLabel?: string }
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
export type ImportStudentListData = Paginated<ImportedStudentSummary>;
export type ImportStudentListResponse = Envelope<ImportStudentListData>;
export type ForecastRunListData = Paginated<ForecastRun>;
export type ForecastAuditData = Paginated<ForecastAuditEntry>;
export type ImportListResponse = Envelope<ImportListData>;
export type ForecastRunListResponse = Envelope<ForecastRunListData>;
export type ForecastAuditResponse = Envelope<ForecastAuditData>;
