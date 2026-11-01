import type { ImportSource } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ImportBatchRow } from './contracts';

/** 'SYSTEM' for snapshots built from the students in the system (internal marker PORTAL), otherwise 'CSV' (also all pre-MT8 snapshots). */
export const sourceOf = (batch: Pick<ImportBatchRow, 'summary'>): ImportSource =>
  batch.summary.internal?.source === 'PORTAL' || batch.summary.source === 'SYSTEM' ? 'SYSTEM' : 'CSV';
