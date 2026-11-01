/** In-memory stand-in for the offerings repository, used by route tests only (never imported by production code). */
import type { ClassType, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ConfirmedOfferingAuditEntry } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import { ForecastingError } from './errors';
import type { ConfirmationHeader, OfferingRow, OfferingsRepository } from './offerings-contracts';

export interface FakeSubject { subjectCode: string; subjectName: string; creditHours: number; classType: ClassType }

export function fakeOfferingsRepository(subjects: Map<number, FakeSubject>) {
  const headers: ConfirmationHeader[] = [];
  const offerings = new Map<number, OfferingRow[]>();
  const audit: Array<ConfirmedOfferingAuditEntry & { confirmationId: number }> = [];
  let nextHeader = 1; let nextOffering = 1; let nextAudit = 1; let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 1, 12, 0, tick++)).toISOString();
  const scopeOf = (h: ConfirmationHeader): ForecastScope => ({ programmeId: h.programmeId, learningCentreId: h.learningCentreId, targetSemesterId: h.targetSemesterId });
  const find = (id: number) => headers.find((h) => h.confirmationId === id)!;
  const guard = (header: ConfirmationHeader, expected: number) => { if (header.revision !== expected) throw new ForecastingError('CONFIRMATION_REVISION_MISMATCH'); };
  const runAt = (header: ConfirmationHeader) => header.forecastRunId;
  const record = (header: ConfirmationHeader, entry: Omit<ConfirmedOfferingAuditEntry, 'auditId' | 'scope' | 'recordedAt' | 'forecastRunId'>) => {
    audit.push({ ...entry, auditId: nextAudit++, scope: scopeOf(header), recordedAt: clock(), forecastRunId: runAt(header), confirmationId: header.confirmationId });
  };
  const bump = (header: ConfirmationHeader, actor: string) => { header.revision += 1; header.updatedBy = actor; header.updatedAt = clock(); };

  const repository: OfferingsRepository = {
    get: async (scope) => {
      const header = headers.find((h) => h.programmeId === scope.programmeId && h.learningCentreId === scope.learningCentreId && h.targetSemesterId === scope.targetSemesterId);
      return header ? { header: { ...header }, offerings: structuredClone(offerings.get(header.confirmationId) ?? []).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode)) } : null;
    },
    confirm: async (input) => {
      let header: ConfirmationHeader;
      if (input.confirmationId === null || input.expectedRevision === null) {
        if (headers.some((h) => h.programmeId === input.scope.programmeId && h.learningCentreId === input.scope.learningCentreId && h.targetSemesterId === input.scope.targetSemesterId)) {
          throw new ForecastingError('CONFIRMATION_REVISION_MISMATCH');
        }
        header = {
          confirmationId: nextHeader++, ...input.scope, forecastRunId: input.forecastRunId, pickDeadline: input.pickDeadline, revision: 1,
          createdBy: input.actor, createdAt: clock(), updatedBy: input.actor, updatedAt: clock(),
        };
        headers.push(header); offerings.set(header.confirmationId, []);
        record(header, { subjectId: null, action: 'SET_DEADLINE', beforeStatus: null, afterStatus: null, beforeDeadline: null, afterDeadline: input.pickDeadline, recordedBy: input.actor, reason: input.reason });
      } else {
        header = find(input.confirmationId); guard(header, input.expectedRevision);
      }
      const rows = offerings.get(header.confirmationId)!;
      for (const subjectId of input.insertSubjectIds) {
        const meta = subjects.get(subjectId)!;
        rows.push({
          confirmedOfferingId: nextOffering++, subjectId, ...meta, status: 'CONFIRMED', confirmedBy: input.actor, confirmedAt: clock(), withdrawnBy: null, withdrawnAt: null,
          reason: input.reason, forecastRunId: header.forecastRunId,
        });
        record(header, { subjectId, action: 'CONFIRM', beforeStatus: null, afterStatus: 'CONFIRMED', beforeDeadline: null, afterDeadline: null, recordedBy: input.actor, reason: input.reason });
        bump(header, input.actor);
      }
      for (const subjectId of input.reconfirmSubjectIds) {
        const row = rows.find((r) => r.subjectId === subjectId && r.status === 'WITHDRAWN');
        if (!row) continue;
        Object.assign(row, { status: 'CONFIRMED', confirmedBy: input.actor, confirmedAt: clock(), withdrawnBy: null, withdrawnAt: null, reason: input.reason, forecastRunId: header.forecastRunId });
        record(header, { subjectId, action: 'CONFIRM', beforeStatus: 'WITHDRAWN', afterStatus: 'CONFIRMED', beforeDeadline: null, afterDeadline: null, recordedBy: input.actor, reason: input.reason });
        bump(header, input.actor);
      }
      return { ...header };
    },
    withdraw: async (input) => {
      const header = find(input.confirmationId); guard(header, input.expectedRevision);
      for (const subjectId of input.subjectIds) {
        const row = offerings.get(header.confirmationId)!.find((r) => r.subjectId === subjectId && r.status === 'CONFIRMED');
        if (!row) continue;
        Object.assign(row, { status: 'WITHDRAWN', withdrawnBy: input.actor, withdrawnAt: clock(), reason: input.reason });
        record(header, { subjectId, action: 'WITHDRAW', beforeStatus: 'CONFIRMED', afterStatus: 'WITHDRAWN', beforeDeadline: null, afterDeadline: null, recordedBy: input.actor, reason: input.reason });
        bump(header, input.actor);
      }
      return { ...header };
    },
    setDeadline: async (input) => {
      const header = find(input.confirmationId); guard(header, input.expectedRevision);
      const before = header.pickDeadline;
      header.pickDeadline = input.pickDeadline; header.forecastRunId = input.forecastRunId;
      bump(header, input.actor);
      record(header, { subjectId: null, action: 'SET_DEADLINE', beforeStatus: null, afterStatus: null, beforeDeadline: before, afterDeadline: input.pickDeadline, recordedBy: input.actor, reason: input.reason });
      return { ...header };
    },
    listAudit: async (header, limit, before) => audit.filter((entry) => entry.confirmationId === header.confirmationId && (before === null || entry.auditId < before))
      .sort((a, b) => b.auditId - a.auditId).slice(0, limit).map((entry) => { const { confirmationId, ...rest } = entry; void confirmationId; return rest; }),
  };
  return { repository, headers, offerings, audit };
}
