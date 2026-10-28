import type { AcademicRecord } from '../../../../api/src/modules/records/contracts';
import type { SubjectOption } from '../../../../api/src/modules/profile/contracts';

export interface RecordedCreditSummary {
  earnedCredits: number;
  exemptedCredits: number;
  takenCount: number;
  exemptedCount: number;
  /** A total percentage is valid only when every current-curriculum subject maps once. */
  complete: boolean;
  unresolvedCount: number;
  mappedSubjectCount: number;
}

/** Totals only unique records whose subject IDs map to one current-curriculum subject. */
export function summarizeRecordedCredits(subjects: readonly SubjectOption[], records: readonly AcademicRecord[]): RecordedCreditSummary {
  const mappings = new Map<number, number>();
  let unresolvedCount = 0;
  for (const subject of subjects) {
    if (!Number.isInteger(subject.subjectId) || subject.subjectId <= 0) { unresolvedCount++; continue; }
    mappings.set(subject.subjectId, (mappings.get(subject.subjectId) ?? 0) + 1);
  }

  const rowsBySubject = new Map<number, AcademicRecord[]>();
  for (const record of records) {
    if (!mappings.has(record.subjectId)) continue;
    const rows = rowsBySubject.get(record.subjectId) ?? [];
    rows.push(record); rowsBySubject.set(record.subjectId, rows);
  }

  let earnedCredits = 0, exemptedCredits = 0, takenCount = 0, exemptedCount = 0, mappedSubjectCount = 0;
  for (const [subjectId, mappingCount] of mappings) {
    if (mappingCount !== 1) { unresolvedCount++; continue; }
    mappedSubjectCount++;
    const rows = rowsBySubject.get(subjectId) ?? [];
    if (rows.length > 1) { unresolvedCount++; continue; }
    if (!rows.length) continue;
    const record = rows[0]!;
    if (record.status === 'COMPLETED' || record.status === 'EXEMPTED') {
      if (!Number.isFinite(record.recognizedCredits) || record.recognizedCredits < 0) { unresolvedCount++; continue; }
      if (record.status === 'COMPLETED') { takenCount++; earnedCredits += record.recognizedCredits; }
      else { exemptedCount++; exemptedCredits += record.recognizedCredits; }
    } else if (record.recognizedCredits !== 0) unresolvedCount++;
  }

  if (!mappedSubjectCount) unresolvedCount = Math.max(1, unresolvedCount);
  if (!Number.isFinite(earnedCredits) || !Number.isFinite(exemptedCredits)) unresolvedCount = Math.max(1, unresolvedCount);
  return {
    earnedCredits: Number.isFinite(earnedCredits) ? earnedCredits : 0,
    exemptedCredits: Number.isFinite(exemptedCredits) ? exemptedCredits : 0,
    takenCount, exemptedCount, complete: unresolvedCount === 0, unresolvedCount, mappedSubjectCount,
  };
}
