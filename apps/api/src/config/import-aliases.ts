/**
 * Coordinator-export vocabulary for the UC20 CSV import (S2-P004-010, moved here by S2-P004-011).
 *
 * No table holds these yet, so they stay configuration served by the forecasting `ScopeProvider`.
 * TODO: move to an admin-managed table when the subject/degree/faculty registration module exists.
 */
export interface ImportAliases { programmes: Readonly<Record<string, string>>; centres: Readonly<Record<string, string>> }

/**
 * Coordinator export programme codes that map to a system programme. A code equal to a programme_code always maps
 * to itself (SECRH). Other export programmes (SCSEH, SCSJ, SCSR, SCSV ...) are skipped until the registration module exists.
 */
export const IMPORT_PROGRAMME_ALIASES: Readonly<Record<string, string>> = { SECJH: 'SECJ' };
/** Coordinator export centre names -> centre code (the code itself is accepted too). */
export const IMPORT_CENTRE_ALIASES: Readonly<Record<string, string>> = { 'KUALA LUMPUR': 'KL', 'JOHOR BAHRU': 'JB', 'PULAU PINANG': 'PENANG' };

export const IMPORT_ALIASES: ImportAliases = { programmes: IMPORT_PROGRAMME_ALIASES, centres: IMPORT_CENTRE_ALIASES };
