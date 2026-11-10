import type { ClassType, ForecastScope, Int32Id, SemesterOption } from './contracts';
import type { SelectionPhase, SelectionWindow } from './selection-window';

/** No stored row means PENDING; only APPROVED and REMOVED are stored. */
export const OFFERING_DECISION_STATUSES = ['PENDING', 'APPROVED', 'REMOVED'] as const;
export type OfferingDecisionStatus = (typeof OFFERING_DECISION_STATUSES)[number];

export interface OfferingDecision {
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  status: 'APPROVED' | 'REMOVED';
  decidedBy: string;
  decidedAt: string;
}

export interface OfferingDecisionSet {
  scope: ForecastScope;
  semester: SemesterOption & SelectionWindow;
  phase: SelectionPhase;
  asOf: string;
  /** True only for the next semester while selection has not closed. */
  editable: boolean;
  decisions: OfferingDecision[];
  /** Students who picked each decided subject in this scope; subjects nobody picked are absent. */
  pickCounts: Array<{ subjectId: Int32Id; pickCount: number }>;
}

export interface DecideOfferingRequest {
  scope: ForecastScope;
  subjectId: Int32Id;
  /** The status to set; PENDING removes the stored decision. */
  status: OfferingDecisionStatus;
  /** The status the caller last saw; a different current status is a stale change (409 DECISION_STALE). */
  expectedStatus: OfferingDecisionStatus;
  /** The snapshot shown when deciding, kept in the audit. */
  importBatchId: Int32Id | null;
}

export interface DecideOfferingResult {
  subjectId: Int32Id;
  beforeStatus: OfferingDecisionStatus;
  afterStatus: OfferingDecisionStatus;
  affectedPicks: number;
  phase: SelectionPhase;
}

export interface OfferingDecisionAuditEntry {
  auditId: number;
  scope: ForecastScope;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  beforeStatus: OfferingDecisionStatus;
  afterStatus: OfferingDecisionStatus;
  importBatchId: Int32Id | null;
  affectedPicks: number;
  recordedBy: string;
  recordedAt: string;
}

export interface DecisionPicker {
  studentId: number;
  studentName: string;
  matricNo: string | null;
  /** Sign-in email, shown when there is no matric number or for contacting the student; null when unavailable. */
  email: string | null;
}

/** Students who picked one subject in a scope (personal data: served `no-store`). Sorted by name, then student id. */
export interface DecisionPickers {
  scope: ForecastScope;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  pickCount: number;
  /** False when the sign-in emails could not be read; matric numbers are still returned. */
  emailsAvailable: boolean;
  pickers: DecisionPicker[];
}
