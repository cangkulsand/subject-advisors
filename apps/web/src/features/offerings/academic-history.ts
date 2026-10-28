import type { OfferingAcademicHistory, OfferingAcademicRecord, OfferingAcademicRecordStatus, OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';

const statuses = new Set<OfferingAcademicRecordStatus>(['COMPLETED', 'EXEMPTED', 'FAILED', 'WITHDRAWN']);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid academic history response');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid academic history response');
  return value;
}
function credits(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid academic history response');
  return value;
}

/** Project P001's own-record response into the smaller UC08 display contract. */
export function readOfferingAcademicHistory(value: unknown): OfferingAcademicHistory {
  if (!Array.isArray(value)) throw new Error('Invalid academic history response');
  const records: OfferingAcademicRecord[] = value.map(raw => {
    const record = object(raw);
    if (typeof record.status !== 'string' || !statuses.has(record.status as OfferingAcademicRecordStatus)) throw new Error('Invalid academic history response');
    return {
      subjectId: offeringId(record.subjectId),
      code: text(record.subjectCode),
      name: text(record.subjectName),
      status: record.status as OfferingAcademicRecordStatus,
      recognizedCredits: credits(record.recognizedCredits),
      creditHours: credits(record.creditHours),
    };
  });
  return { status: 'available', records };
}

export type OfferingHistoryState = 'taken' | 'exempted' | 'remaining' | 'ambiguous' | 'unknown';
export function offeringHistoryState(subject: OfferingSubject, history: OfferingAcademicHistory | undefined): OfferingHistoryState {
  if (!history || history.status !== 'available' || !subject.subjectId) return 'unknown';
  const matches = history.records.filter(record => record.subjectId === subject.subjectId);
  if (matches.length > 1) return 'ambiguous';
  if (!matches.length) return 'remaining';
  if (matches[0]!.status === 'COMPLETED') return 'taken';
  if (matches[0]!.status === 'EXEMPTED') return 'exempted';
  return 'remaining';
}

export interface OfferingHistorySummary {
  takenCount: number;
  exemptedCount: number;
  earnedCredits: number;
  exemptedCredits: number;
  /** False when subject identity or record history cannot be mapped one-to-one. */
  complete: boolean;
  unresolvedCount: number;
}
/** Counts only unique, current-curriculum records; duplicate legacy rows contribute nothing. */
export function summarizeOfferingHistory(subjects: readonly OfferingSubject[], history: OfferingAcademicHistory | undefined): OfferingHistorySummary | null {
  if (!history || history.status !== 'available') return null;
  const subjectIds = new Set(subjects.flatMap(subject => subject.subjectId ? [subject.subjectId] : []));
  let unresolvedCount = subjects.filter(subject => !subject.subjectId).length;
  unresolvedCount += subjects.length - subjectIds.size - (subjects.filter(subject => !subject.subjectId).length);
  const records = new Map<string, OfferingAcademicRecord[]>();
  for (const record of history.records) {
    if (!subjectIds.has(record.subjectId)) continue;
    const matches = records.get(record.subjectId) ?? [];
    matches.push(record);
    records.set(record.subjectId, matches);
  }
  let takenCount = 0, exemptedCount = 0, earnedCredits = 0, exemptedCredits = 0;
  for (const matches of records.values()) {
    if (matches.length !== 1) { unresolvedCount++; continue; }
    const record = matches[0]!;
    if (record.status === 'COMPLETED') { takenCount++; earnedCredits += record.recognizedCredits; }
    if (record.status === 'EXEMPTED') { exemptedCount++; exemptedCredits += record.recognizedCredits; }
  }
  if (!Number.isFinite(earnedCredits) || !Number.isFinite(exemptedCredits)) {
    return { takenCount, exemptedCount, earnedCredits: 0, exemptedCredits: 0, complete: false, unresolvedCount: Math.max(1, unresolvedCount) };
  }
  return { takenCount, exemptedCount, earnedCredits, exemptedCredits, complete: unresolvedCount === 0, unresolvedCount };
}
