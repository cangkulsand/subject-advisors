import type { ForecastScope, Int32Id } from '../../../../../packages/shared/src/forecasting/contracts';
import type { OfferingDecision, OfferingDecisionAuditEntry, OfferingDecisionStatus } from '../../../../../packages/shared/src/forecasting/offering-decisions';

/** One stored decision (`offering_decision`); no row means Pending. */
export type DecisionRow = OfferingDecision;

export interface DecideInput {
  scope: ForecastScope;
  subjectId: Int32Id;
  /** The status the caller saw; the transaction aborts with DECISION_STALE when the stored one differs. */
  expectedStatus: OfferingDecisionStatus;
  status: OfferingDecisionStatus;
  actor: string;
  importBatchId: Int32Id | null;
}
/** One student who picked a subject in a scope. */
export interface PickerRow { studentId: number; studentName: string; matricNo: string | null }
export interface DecideOutcome { beforeStatus: OfferingDecisionStatus; afterStatus: OfferingDecisionStatus; affectedPicks: number }

/**
 * Data access for coordinator offering decisions. `decide` is one atomic transaction that also writes the audit and,
 * when an approved subject stops being approved, withdraws the scoped student picks and records the withdrawals.
 */
export interface OfferingDecisionsRepository {
  get(scope: ForecastScope): Promise<DecisionRow[]>;
  decide(input: DecideInput): Promise<DecideOutcome>;
  /** Newest first, keyset by audit id. */
  listAudit(scope: ForecastScope, limit: number, beforeAuditId: number | null): Promise<OfferingDecisionAuditEntry[]>;
  /** Picks per subject for the scope (programme + centre + semester); subjects nobody picked are absent. */
  pickCounts(scope: ForecastScope): Promise<Array<{ subjectId: Int32Id; pickCount: number }>>;
  /** Students who picked the subject in the scope, sorted by name then id. */
  pickers(scope: ForecastScope, subjectId: Int32Id): Promise<PickerRow[]>;
}
