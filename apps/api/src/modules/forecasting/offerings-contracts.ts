import type { ClassType, ForecastScope, Int32Id } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ConfirmedOfferingAuditEntry, ConfirmedOfferingStatus } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';

/** `offering_confirmation` row. `revision` is the DB counter; the API revision string is derived by `revisionOf`. */
export interface ConfirmationHeader extends ForecastScope {
  confirmationId: Int32Id;
  forecastRunId: Int32Id;
  pickDeadline: string;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}
export interface OfferingRow {
  confirmedOfferingId: Int32Id;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  status: ConfirmedOfferingStatus;
  confirmedBy: string;
  confirmedAt: string;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  /** Reason and source run of the latest audit entry of this subject. */
  reason: string;
  forecastRunId: Int32Id | null;
}
export interface ConfirmationRows { header: ConfirmationHeader; offerings: OfferingRow[] }

interface MutationBase { actor: string; reason: string }
export interface ConfirmInput extends MutationBase {
  scope: ForecastScope;
  forecastRunId: Int32Id;
  pickDeadline: string;
  /** Null creates the header; otherwise the existing header and the DB revision the request was validated against. */
  confirmationId: Int32Id | null;
  expectedRevision: number | null;
  insertSubjectIds: Int32Id[];
  reconfirmSubjectIds: Int32Id[];
}
export interface WithdrawInput extends MutationBase {
  confirmationId: Int32Id;
  expectedRevision: number;
  subjectIds: Int32Id[];
}
export interface SetDeadlineInput extends MutationBase {
  confirmationId: Int32Id;
  expectedRevision: number;
  pickDeadline: string;
  forecastRunId: Int32Id;
}

/** Data access for coordinator offering confirmation. Every mutation is one atomic transaction that also writes the audit. */
export interface OfferingsRepository {
  get(scope: ForecastScope): Promise<ConfirmationRows | null>;
  /** First call creates the header (expectedRevision null). The transaction aborts with CONFIRMATION_REVISION_MISMATCH when the stored revision differs. */
  confirm(input: ConfirmInput): Promise<ConfirmationHeader>;
  withdraw(input: WithdrawInput): Promise<ConfirmationHeader>;
  setDeadline(input: SetDeadlineInput): Promise<ConfirmationHeader>;
  listAudit(header: ConfirmationHeader, limit: number, beforeAuditId: number | null): Promise<ConfirmedOfferingAuditEntry[]>;
}
