import type { ApiResult } from '../auth/contracts';

/** Visual states required by UC17. UNKNOWN is used when a state cannot be derived in Sprint 1. */
export type PathwayNodeStatus =
  | 'COMPLETED'
  | 'EXEMPTED'
  | 'IN_PROGRESS'
  | 'ELIGIBLE'
  | 'LOCKED'
  | 'RECOMMENDED'
  | 'REMAINING'
  | 'UNKNOWN';

export type PrerequisiteType = 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE';

export interface PathwaySubjectNode {
  /** Stable node id: the curriculum_subject_id. */
  id: string;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  isCompulsory: boolean;
  subjectCategory: string | null;
  status: PathwayNodeStatus;
  grade: string | null;
  recognizedCredits: number | null;
  /** Bounded advisory summary from optional curriculum metadata. */
  prerequisiteSummary?: string | null;
}

export interface PathwayPrerequisiteEdge {
  /** Stable edge id: the prerequisite_id. */
  id: string;
  /** Required subject node id. */
  source: string;
  /** Dependent subject node id. */
  target: string;
  requirementType: PrerequisiteType;
}

export interface PathwayGraph {
  curriculumId: number;
  curriculumVersion: string;
  programmeName: string;
  nodes: PathwaySubjectNode[];
  edges: PathwayPrerequisiteEdge[];
  /** True only for clearly labelled non-production demo content. */
  demo: boolean;
}

export type PathwayApiResult = ApiResult<PathwayGraph>;

export interface GraduationRequirementStatus {
  requirementType: string;
  requiredCredits: number | null;
  requiredSubjects: number | null;
  satisfiedCredits: number;
  satisfiedSubjects: number;
  met: boolean;
}

export interface GraduationEligibility {
  eligible: boolean;
  totalCreditsRequired: number;
  totalCreditsRecognized: number;
  requirements: GraduationRequirementStatus[];
  outstanding: string[];
}

export type GraduationApiResult = ApiResult<GraduationEligibility>;

export interface ProjectedSubject {
  curriculumSubjectId: number;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  isCompulsory: boolean;
}

export interface ProjectedSemester {
  semesterNo: number;
  semesterType: 'NORMAL' | 'SHORT';
  subjects: ProjectedSubject[];
  totalCredits: number;
}

export interface ProjectedPathway {
  remainingSubjects: number;
  remainingCredits: number;
  semesters: ProjectedSemester[];
  estimatedCompletionSemesters: number;
  assumptions: string[];
}

export type ProjectionApiResult = ApiResult<ProjectedPathway>;
