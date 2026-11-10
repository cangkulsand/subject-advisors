/** In-memory stand-in for the offering decisions repository, used by route tests only (never imported by production code). */
import type { ClassType, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { OfferingDecisionAuditEntry } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { ForecastingError } from './errors';
import type { DecisionRow, OfferingDecisionsRepository, PickerRow } from './decisions-contracts';

export interface FakeDecisionSubject { subjectCode: string; subjectName: string; creditHours: number; classType: ClassType }

export function fakeDecisionsRepository(subjects: Map<number, FakeDecisionSubject>) {
  const decisions = new Map<string, DecisionRow>();
  const audit: OfferingDecisionAuditEntry[] = [];
  // Picks and the withdrawal records, keyed like the decisions.
  const picks = new Map<string, PickerRow[]>();
  const withdrawals: Array<{ auditId: number; studentId: number; subjectId: number }> = [];
  let nextAudit = 1; let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 1, 12, 0, tick++)).toISOString();
  const scopeKey = (scope: ForecastScope) => scope.programmeId + ':' + scope.learningCentreId + ':' + scope.targetSemesterId;

  const repository: OfferingDecisionsRepository = {
    get: async (scope) => [...decisions.entries()].filter(([key]) => key.startsWith(scopeKey(scope) + '|')).map(([, row]) => structuredClone(row))
      .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode)),
    decide: async (input) => {
      const key = scopeKey(input.scope) + '|' + input.subjectId;
      const current = decisions.get(key)?.status ?? 'PENDING';
      if (current !== input.expectedStatus) throw new ForecastingError('DECISION_STALE');
      const meta = subjects.get(input.subjectId)!;
      if (input.status === 'PENDING') decisions.delete(key);
      else decisions.set(key, { subjectId: input.subjectId, ...meta, status: input.status, decidedBy: input.actor, decidedAt: clock() });
      // Leaving APPROVED withdraws the scoped picks, as the SQL repository does in the same transaction.
      const withdrawn = current === 'APPROVED' ? picks.get(key) ?? [] : [];
      if (withdrawn.length) picks.delete(key);
      const auditId = nextAudit++;
      for (const picker of withdrawn) withdrawals.push({ auditId, studentId: picker.studentId, subjectId: input.subjectId });
      audit.push({
        auditId, scope: { ...input.scope }, subjectId: input.subjectId, subjectCode: meta.subjectCode, subjectName: meta.subjectName,
        beforeStatus: current, afterStatus: input.status, importBatchId: input.importBatchId, affectedPicks: withdrawn.length, recordedBy: input.actor, recordedAt: clock(),
      });
      return { beforeStatus: current, afterStatus: input.status, affectedPicks: withdrawn.length };
    },
    listAudit: async (scope, limit, before) => audit.filter((entry) => scopeKey(entry.scope) === scopeKey(scope) && (before === null || entry.auditId < before))
      .sort((a, b) => b.auditId - a.auditId).slice(0, limit).map((entry) => structuredClone(entry)),
    pickCounts: async (scope) => [...picks.entries()].filter(([key, rows]) => key.startsWith(scopeKey(scope) + '|') && rows.length)
      .map(([key, rows]) => ({ subjectId: Number(key.split('|')[1]), pickCount: rows.length })).sort((a, b) => a.subjectId - b.subjectId),
    pickers: async (scope, subjectId) => [...(picks.get(scopeKey(scope) + '|' + subjectId) ?? [])]
      .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.studentId - b.studentId),
  };
  const seedPicks = (scope: ForecastScope, subjectId: number, students: PickerRow[]) => { picks.set(scopeKey(scope) + '|' + subjectId, students.map((student) => ({ ...student }))); };
  return { repository, decisions, audit, picks, withdrawals, seedPicks };
}
