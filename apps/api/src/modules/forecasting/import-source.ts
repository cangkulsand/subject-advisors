import type { ImportSource, StudentSource } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ImportBatchRow } from './contracts';

/** 'COMBINED' (system + CSV, MT9), 'SYSTEM' (students in the system, internal marker PORTAL), otherwise 'CSV' (also all pre-MT8 snapshots). */
export const sourceOf = (batch: Pick<ImportBatchRow, 'summary'>): ImportSource =>
  batch.summary.internal?.source === 'COMBINED' || batch.summary.source === 'COMBINED' ? 'COMBINED'
    : batch.summary.internal?.source === 'PORTAL' || batch.summary.source === 'SYSTEM' ? 'SYSTEM' : 'CSV';

/** Per-student source: from the stored map for COMBINED, otherwise uniform. */
export function studentSourceOf(batch: Pick<ImportBatchRow, 'summary'>, externalReference: string): StudentSource {
  const source = sourceOf(batch);
  if (source === 'COMBINED') return batch.summary.internal.sourceByReference?.[externalReference] ?? 'CSV';
  return source === 'SYSTEM' ? 'SYSTEM' : 'CSV';
}
