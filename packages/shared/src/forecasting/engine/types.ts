import type {
  ClassType, ForecastConfigurationStatus, ForecastCurriculumSnapshot, ForecastQualityStatus, ForecastScope, HistoryCompleteness,
  Int32Id, SubjectExclusion, UncertaintyReason,
} from '../contracts';

/** One imported record. `semesterId` null = undated; `recognizedCredits` null = blank evidence (never zero). */
export interface EngineRecord {
  subjectId: Int32Id;
  status: 'COMPLETED' | 'EXEMPTED' | 'FAILED' | 'IN_PROGRESS';
  semesterId: Int32Id | null;
  recognizedCredits: number | null;
}
export interface EngineStudent {
  /** `imported_student.external_reference`; also the key of `rejectedRowsByStudent`. */
  externalReference: string;
  studentName: string | null;
  curriculumId: Int32Id;
  /** Raw source token; only ACTIVE is supported. */
  cohortStatus: string;
  historyCompleteness: HistoryCompleteness;
  records: EngineRecord[];
}
export interface EngineSnapshot {
  students: EngineStudent[];
  /** Keyed by external reference (from `academic_import_batch.validation_summary.internal`). */
  rejectedRowsByStudent: Record<string, number>;
}
/** `ForecastCurriculumSnapshot` plus the curriculum's required total credits (`curriculum.total_credit_required`). */
export interface EngineCurriculum extends ForecastCurriculumSnapshot {
  totalCreditsRequired: number | null;
}
export interface EngineTargetSemester {
  semesterId: Int32Id;
  semesterType: 'NORMAL' | 'SHORT';
  maxSubjects: number;
  maxCredits: number;
}
/** A `class_capacity_rule` row (global per class type today) with room for richer scopes. */
export interface EngineCapacityRule {
  capacityRuleId: Int32Id;
  scopeKind?: 'GLOBAL' | 'CENTRE' | 'SUBJECT_CENTRE';
  learningCentreId?: Int32Id;
  subjectId?: Int32Id;
  classType: 'LECTURE' | 'LAB';
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
  isActive: boolean;
}
export interface ForecastEngineInput {
  scope: ForecastScope;
  target: EngineTargetSemester;
  snapshot: EngineSnapshot;
  curricula: EngineCurriculum[];
  capacityRules: EngineCapacityRule[];
}

export type ConfigurationIssueCode = 'CLASS_TYPE_MISSING' | 'NO_ACTIVE_CAPACITY_RULE' | 'AMBIGUOUS_CAPACITY_RULE' | 'INVALID_CAPACITY_RULE';
export type SectionFlag = 'BELOW_MINIMUM' | 'BELOW_OPTIMAL';

export interface EngineSection {
  sectionNumber: number;
  expectedStudents: number;
  /** `proposed_class_section.capacity_rule_id` */
  capacityRuleId: Int32Id;
  minimumEnrollment: number;
  breakEvenTarget: number;
  normalMaximum: number;
  exceptionMaximum: number | null;
  flags: SectionFlag[];
  /** Always PENDING: nothing is cancelled or approved automatically. */
  reviewStatus: 'PENDING';
}
export interface UncertaintyReasonCount { reason: UncertaintyReason; count: number }
export interface DemandBreakdown {
  /** Students of curricula that contain the subject. */
  inCurriculum: number;
  alreadyPassed: number;
  notOfferedInSemesterType: number;
  prerequisiteNotMet: number;
  supported: number;
  uncertain: number;
  /** Students with a pass plus another attempt, resolved as passed (retake policy v1). */
  retakeResolvedAsPassed: number;
}
export interface EngineSubjectDemand {
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  classType: ClassType;
  excluded: boolean;
  exclusionReason: string | null;
  /**
   * True when every curriculum containing the subject has semester rules that exclude the target semester type
   * (Normal/Short offering rule). Such a subject has no demand, no sections and is not counted in totals; it is stored as
   * configurationStatus EXCLUDED with forecastCount null. A subject with no rule rows is unrestricted. Never true together with `excluded`.
   */
  semesterTypeExcluded: boolean;
  /** "Runs only in Short semesters" / "Runs only in Normal semesters"; null unless semesterTypeExcluded. */
  semesterTypeExclusionReason: string | null;
  /** `forecast_subject_demand.eligible_count`: supported eligible pool (potential demand). */
  supportedDemand: number;
  /** `forecast_subject_demand.forecast_count`: equals supportedDemand; null for excluded subjects. */
  forecastCount: number | null;
  uncertainCount: number;
  /** Sorted by reason; count = students carrying that reason (a student may carry several). */
  uncertaintyReasonCounts: UncertaintyReasonCount[];
  /** Reason codes only, sorted. */
  uncertaintyReasons: UncertaintyReason[];
  nearGraduationCount: number;
  qualityStatus: ForecastQualityStatus;
  configurationStatus: ForecastConfigurationStatus;
  configurationIssue: ConfigurationIssueCode | null;
  configurationMessage: string | null;
  capacityRuleId: Int32Id | null;
  /** True when supportedDemand is 0 while uncertainCount > 0. */
  insufficientData: boolean;
  breakdown: DemandBreakdown;
  sections: EngineSection[];
}
export interface EngineRuleSnapshot extends ForecastScope {
  engineVersion: string;
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL';
  assumptionNote: string;
  policyVersions: { nearGraduation: number; retake: number; prerequisite: number; allocation: number };
  supportedCohortStatuses: string[];
  targetSemester: EngineTargetSemester;
  capacityRules: EngineCapacityRule[];
  exclusions: SubjectExclusion[];
  /** Subjects not offered in the target semester type under the subject_semester_rule data (offering rule). */
  semesterTypeExclusions: Array<{ subjectId: Int32Id; offeredIn: Array<'NORMAL' | 'SHORT'>; reason: string }>;
  curricula: Array<{ curriculumId: Int32Id; curriculumVersion: string; totalCreditsRequired: number | null; fingerprint: string }>;
  catalogueFingerprint: string;
  snapshotStudentCount: number;
}
export interface EngineSummary {
  studentsInSnapshot: number;
  /** Students whose curriculum is not in the supplied catalogue; they are in no subject count. */
  studentsWithUnresolvedCurriculum: number;
  subjects: number;
  excludedSubjects: number;
  /** Subjects not offered in the target semester type (not part of excludedSubjects). */
  notOfferedInSemesterTypeSubjects: number;
  configurationRequiredSubjects: number;
  insufficientDataSubjects: number;
  subjectsWithSections: number;
  totalSupportedDemand: number;
  totalUncertain: number;
  totalSections: number;
  sectionsBelowMinimum: number;
  sectionsBelowOptimal: number;
  qualityStatus: ForecastQualityStatus;
}
export interface EngineOriginalRecommendation { subjectId: Int32Id; sections: EngineSection[] }
export interface ForecastEngineResult {
  engineVersion: string;
  ruleSnapshot: EngineRuleSnapshot;
  /** Sorted by subjectId. */
  demands: EngineSubjectDemand[];
  /** Same sections as `demands`, subjects with at least one section only (for `forecast_run.original_recommendations`). */
  originalRecommendations: EngineOriginalRecommendation[];
  summary: EngineSummary;
}
