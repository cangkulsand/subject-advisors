import type { StudentEligibilityProjection } from './student-eligibility';
import type { SemesterSelectionValidation } from './semester-selection';

export interface SemesterSelectionPlanState {
  revision: number;
  subjectIds: number[];
  updatedAt: string | null;
}

/** Authenticated student's persisted selection plus the current eligibility and deadline state. */
export interface SemesterSelectionPageData {
  eligibility: StudentEligibilityProjection;
  centreBasis: string;
  scopeLabels?: { programmeName: string; learningCentreName: string; targetSemesterLabel: string };
  sourceRevision: string;
  deadline: string | null;
  editingOpen: boolean;
  plan: SemesterSelectionPlanState;
  validation: SemesterSelectionValidation | null;
}

/** Minimal mutation payload. The server derives credits, identity, and policy from its fresh read. */
export interface SaveSemesterSelection {
  subjectIds: number[];
  sourceRevision: string;
  planRevision: number;
}
