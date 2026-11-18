/**
 * UC14–UC16 graduation planning contracts (M5). Shared by the API (which builds the input) and the
 * browser (which runs the engine for the baseline and for what-if scenarios). Pure data, no I/O.
 */
export type SemesterType = 'NORMAL' | 'SHORT';

export interface PlanningSubject {
  curriculumSubjectId: number;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  category: string;
  compulsory: boolean;
  /** Semester types the subject may run in. Empty means any type. */
  semesterTypes: SemesterType[];
  /** MANDATORY prerequisites (curriculum subject IDs). */
  prerequisites: number[];
  corequisites?: number[];
}

export interface PlanningRequirement {
  requirementType: string;
  requiredSubjects: number | null;
  requiredCredits: number | null;
}

export interface SemesterRef { academicYear: string; semesterNo: number }

/** A configured `academic_semester` row; `semesterId` is what a saved what-if stores (S3-P004-010). */
export interface SemesterLimit extends SemesterRef { semesterId: number; maxSubjects: number; maxCredits: number }

export interface PlanningInput {
  programmeName: string;
  curriculumVersion: string;
  totalCredits: number | null;
  earnedCredits: number;
  subjects: PlanningSubject[];
  requirements: PlanningRequirement[];
  /** Curriculum subjects with a COMPLETED or EXEMPTED attempt. */
  passed: number[];
  /** First semester to plan (the one after the system current semester); null = numbered semesters only. */
  start: SemesterRef | null;
  /** Configured semesters with their limits. */
  limits: SemesterLimit[];
  /** Subjects the coordinator approved for the first planned semester; null when none were decided. */
  approvedFirst: number[] | null;
  curriculumId?: number;
  recorded?: Record<number, { status: 'COMPLETED' | 'EXEMPTED'; recognizedCredits: number }>;
  baselineVersion?: string;
}

export type ScenarioChangeKind = 'POSTPONE' | 'FAIL' | 'WITHDRAW' | 'REPLACE' | 'PLACE';

export interface ScenarioChange {
  kind: ScenarioChangeKind;
  curriculumSubjectId: number;
  /** For REPLACE: the elective option taken instead. */
  replacementId?: number;
  /** PLACE: the semester the subject is pinned to. FAIL / WITHDRAW: where the retake is pinned, when the student moved it. */
  semester?: SemesterRef;
}

export interface PlannedSubject {
  curriculumSubjectId: number;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  category: string;
  compulsory: boolean;
  /** Set when the subject was picked from an elective group with more options than needed. */
  electiveChoice: { requirementType: string; needed: number; options: number } | null;
  /** Set when a scenario change affects this subject. */
  change: ScenarioChangeKind | null;
  /** True for the attempt a FAIL change says was failed: it uses the slot and credits but is taken again later. */
  failedAttempt: boolean;
  /** True when the student placed this subject in this semester (a PLACE, or a moved retake). */
  pinned: boolean;
}

export interface PlannedSemester extends SemesterRef {
  /** 1-based position in the plan. */
  index: number;
  semesterType: SemesterType;
  label: string;
  maxSubjects: number;
  maxCredits: number;
  subjects: PlannedSubject[];
  credits: number;
}

export interface Bottleneck {
  curriculumSubjectId: number;
  subjectCode: string;
  subjectName: string;
  /** Number of needed subjects that depend on this one, directly or not. */
  unlocks: number;
  /** Longest chain starting at this subject, as subject codes. */
  chain: string[];
  explanation: string;
}

export interface UnplannedSubject { curriculumSubjectId: number; subjectCode: string; subjectName: string; reason: string }

export interface PlanCompletion extends SemesterRef { index: number; label: string }

export interface GraduationPlan {
  /** DONE: nothing left to take. PLANNED: everything placed. INCOMPLETE: some subjects cannot be placed. */
  status: 'DONE' | 'PLANNED' | 'INCOMPLETE';
  remainingSubjects: number;
  remainingCredits: number;
  semesters: PlannedSemester[];
  completion: PlanCompletion | null;
  earliest: PlanCompletion | null;
  bottlenecks: Bottleneck[];
  unplanned: UnplannedSubject[];
  assumptions: string[];
}

export interface MovedSubject { curriculumSubjectId: number; subjectCode: string; subjectName: string; from: string | null; to: string | null }

export interface PlanComparison {
  baseline: PlanCompletion | null;
  scenario: PlanCompletion | null;
  /** Scenario semesters minus baseline semesters; null when either cannot complete. */
  semesterDifference: number | null;
  moved: MovedSubject[];
}
