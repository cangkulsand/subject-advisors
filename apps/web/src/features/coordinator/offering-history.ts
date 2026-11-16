import type { SemesterOption } from '../../../../../packages/shared/src/forecasting/contracts';
import type { OfferingDecisionSet } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { selectionPhase } from '../../../../../packages/shared/src/forecasting/selection-window';

export interface HistoryRow { subjectId: number; code: string; name: string; credits: number; decision: 'Approved' | 'Removed'; picks: number | null }

/** Semesters whose selection window is CLOSED by the shared selectionPhase rule, newest closing first. */
export function closedSemesters(semesters: SemesterOption[], now: Date): SemesterOption[] {
  const closedAt = (semester: SemesterOption) => Date.parse(semester.selectionClosesAt ?? '');
  return semesters
    .filter(semester => !Number.isNaN(closedAt(semester)) && selectionPhase({ selectionOpensAt: semester.selectionOpensAt ?? null, selectionClosesAt: semester.selectionClosesAt ?? null }, now) === 'CLOSED')
    .sort((left, right) => closedAt(right) - closedAt(left));
}

/** One row per decided subject, by subject code: approved subjects carry their pick count (0 when nobody picked), removed subjects none. */
export function historyRows(set: OfferingDecisionSet): HistoryRow[] {
  const picked = new Map(set.pickCounts.map(item => [item.subjectId, item.pickCount]));
  return set.decisions.map(item => ({
    subjectId: item.subjectId, code: item.subjectCode, name: item.subjectName, credits: item.creditHours,
    decision: item.status === 'APPROVED' ? 'Approved' as const : 'Removed' as const,
    picks: item.status === 'APPROVED' ? picked.get(item.subjectId) ?? 0 : null,
  })).sort((left, right) => left.code.localeCompare(right.code));
}
