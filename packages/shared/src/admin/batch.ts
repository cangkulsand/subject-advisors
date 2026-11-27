/** Batch correction of programme and intake year by matric number (S3-P004-039). Pure rules shared by the page and the API. */
import { ADMIN_INTAKE_YEAR_MAX, ADMIN_INTAKE_YEAR_MIN, ADMIN_REASON_MAX_LENGTH, asRecord, normaliseReason, type AdminStatus, type AdminValidation } from './admin';
import { MATRIC_BATCH_MAX, normaliseMatric, readMatric } from '../profile/matric';

export interface BatchMatch {
  matricNo: string; accountId: number; studentId: number; studentName: string; programmeCode: string;
  curriculumId: number; curriculumVersion: string; intakeYear: number | null; accountStatus: AdminStatus; isStudent: boolean;
}
export type BatchProblemKind = 'NOT_FOUND' | 'DUPLICATE' | 'NO_ACCOUNT';
export interface BatchProblem { matricNo: string; kind: BatchProblemKind }
export interface BatchPreview { matches: BatchMatch[]; problems: BatchProblem[] }
export type BatchIntake = { mode: 'keep' } | { mode: 'set'; year: number } | { mode: 'matric' };
export interface BatchExpected { matricNo: string; studentId: number; curriculumId: number; intakeYear: number | null }
export interface BatchPreviewRequest { matricNos: string[] }
export interface BatchApplyRequest { matricNos: string[]; curriculumId: number | null; intake: BatchIntake; reason: string; expected: BatchExpected[] }
export interface BatchResult { corrected: number; intakeChanges: number; programmeChanges: number; removedPicks: number }
export interface BatchRow { match: BatchMatch; after: { curriculumId: number; intakeYear: number | null }; changes: boolean; problem?: 'INTAKE_UNREADABLE' }
export interface BatchPlan { rows: BatchRow[]; intakeChanges: number; programmeChanges: number; unchanged: number; problems: number }

export const BATCH_PROBLEM_TEXT: Record<BatchProblemKind | 'INTAKE_UNREADABLE', string> = {
  NOT_FOUND: 'Not found',
  DUPLICATE: 'Used by more than one student',
  NO_ACCOUNT: 'No account for this student',
  INTAKE_UNREADABLE: 'Intake year cannot be read from this matric number',
};

/** What each student becomes. A row with a problem never changes; an unchanged row is skipped and gets no audit row. */
export function planBatch(matches: BatchMatch[], curriculumId: number | null, intake: BatchIntake, now: Date = new Date()): BatchPlan {
  // A matric year after this year is a typo, not an intake (review fix).
  const latest = Math.min(ADMIN_INTAKE_YEAR_MAX, now.getUTCFullYear());
  let intakeChanges = 0, programmeChanges = 0, unchanged = 0, problems = 0;
  const rows = matches.map((match): BatchRow => {
    let intakeYear = match.intakeYear;
    if (intake.mode === 'set') intakeYear = intake.year;
    if (intake.mode === 'matric') {
      const read = readMatric(match.matricNo)?.intakeYear;
      if (read === undefined || read < ADMIN_INTAKE_YEAR_MIN || read > latest) {
        problems += 1;
        return { match, after: { curriculumId: match.curriculumId, intakeYear: match.intakeYear }, changes: false, problem: 'INTAKE_UNREADABLE' };
      }
      intakeYear = read;
    }
    const after = { curriculumId: curriculumId ?? match.curriculumId, intakeYear };
    const intakeChanged = after.intakeYear !== match.intakeYear, programmeChanged = after.curriculumId !== match.curriculumId;
    if (intakeChanged) intakeChanges += 1;
    if (programmeChanged) programmeChanges += 1;
    if (!intakeChanged && !programmeChanged) unchanged += 1;
    return { match, after, changes: intakeChanged || programmeChanged };
  });
  return { rows, intakeChanges, programmeChanges, unchanged, problems };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** "Applies to 324 students: 290 intake years change, 0 programmes change, 34 already correct." */
export function batchSummary(plan: BatchPlan): string {
  return `Applies to ${plural(plan.rows.length - plan.problems, 'student', 'students')}: ${plural(plan.intakeChanges, 'intake year changes', 'intake years change')}, `
    + `${plural(plan.programmeChanges, 'programme changes', 'programmes change')}, ${plan.unchanged} already correct.`;
}

/** Import aliases (copied from the API's import config): a matric programme code is compared as 'S' + code after these. */
const PROGRAMME_ALIASES: Readonly<Record<string, string>> = { SECJH: 'SECJ' };
const canonical = (code: string) => PROGRAMME_ALIASES[code] ?? code;
/** A warning only; it never blocks. Null when the matric number has no programme code or it matches. */
export function programmeWarning(matricNo: string, programmeCode: string): string | null {
  const code = readMatric(matricNo)?.programmeCode;
  if (!code) return null;
  return canonical('S' + code) === canonical(programmeCode) ? null : `Matric says ${code}, programme is ${programmeCode}`;
}

function matricList(value: unknown): string[] | string {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return 'Paste at least one matric number.';
  const list = [...new Set((value as string[]).map(normaliseMatric).filter(Boolean))];
  if (!list.length) return 'Paste at least one matric number.';
  if (list.length > MATRIC_BATCH_MAX) return `Paste at most ${MATRIC_BATCH_MAX} matric numbers.`;
  if (list.some(item => !/^[A-Z0-9]{1,30}$/.test(item))) return 'Matric numbers may contain only letters and digits.';
  return list;
}
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;

export function validateBatchPreviewRequest(body: unknown): AdminValidation<BatchPreviewRequest> {
  const record = asRecord(body, ['matricNos']);
  if (typeof record === 'string') return { ok: false, error: record };
  const matricNos = matricList(record.matricNos);
  return typeof matricNos === 'string' ? { ok: false, error: matricNos } : { ok: true, value: { matricNos } };
}

function intakeOf(value: unknown): BatchIntake | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.mode === 'keep' && Object.keys(record).length === 1) return { mode: 'keep' };
  if (record.mode === 'matric' && Object.keys(record).length === 1) return { mode: 'matric' };
  if (record.mode === 'set' && Object.keys(record).length === 2 && typeof record.year === 'number' && Number.isInteger(record.year)
    && record.year >= ADMIN_INTAKE_YEAR_MIN && record.year <= ADMIN_INTAKE_YEAR_MAX) return { mode: 'set', year: record.year };
  return null;
}
function expectedOf(value: unknown): BatchExpected[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MATRIC_BATCH_MAX) return null;
  const rows: BatchExpected[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.matricNo !== 'string' || !isId(row.studentId) || !isId(row.curriculumId)) return null;
    if (row.intakeYear !== null && !(typeof row.intakeYear === 'number' && Number.isInteger(row.intakeYear))) return null;
    rows.push({ matricNo: normaliseMatric(row.matricNo), studentId: row.studentId, curriculumId: row.curriculumId, intakeYear: row.intakeYear as number | null });
  }
  return rows;
}

export function validateBatchApplyRequest(body: unknown): AdminValidation<BatchApplyRequest> {
  const record = asRecord(body, ['matricNos', 'curriculumId', 'intake', 'reason', 'expected']);
  if (typeof record === 'string') return { ok: false, error: record };
  const matricNos = matricList(record.matricNos);
  if (typeof matricNos === 'string') return { ok: false, error: matricNos };
  const curriculumId = record.curriculumId ?? null;
  if (curriculumId !== null && !isId(curriculumId)) return { ok: false, error: 'Choose a programme.' };
  const intake = intakeOf(record.intake);
  if (!intake) return { ok: false, error: `Choose how to set the intake year (a year from ${ADMIN_INTAKE_YEAR_MIN} to ${ADMIN_INTAKE_YEAR_MAX}).` };
  if (curriculumId === null && intake.mode === 'keep') return { ok: false, error: 'Choose a programme or an intake year to change.' };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
  const expected = expectedOf(record.expected);
  if (!expected) return { ok: false, error: 'Check the matric numbers again before applying.' };
  return { ok: true, value: { matricNos, curriculumId, intake, reason, expected } };
}
