/**
 * Coordinator export format (S2-P004-010). The coordinators' own spreadsheet export is accepted next to the native template and
 * auto-detected from the header row. It is normalised into the native row model BEFORE the shared per-student validation, keeping
 * the original CSV row number on every row so issues point at the uploaded file. Pure and deterministic.
 *
 * Rules (product owner, 2026-11-02): rows of other programmes / centres, inactive (status N) rows, in-progress (blank or NULL grade)
 * rows and subjects outside the curriculum are skipped and counted; only the latest attempt per student + subject is kept (an
 * exemption replaces a non-passed attempt, a COMPLETED attempt wins over an exemption). The e-mail column is never read.
 */
import type { CoordinatorExportSummary } from '../../../../../packages/shared/src/forecasting/contracts';
import type { CsvRecord } from './csv';
import type { ImportCatalogue } from './validation';

/** One native-model row (all values trimmed strings). `row` is the 1-based record number of the uploaded file. */
export interface ImportRow { row: number; ref: string; version: string; cohort: string; history: string; code: string; status: string; semester: string; credits: string; synthetic: string; name: string }

/** Where the selected scope stands in the coordinator's vocabulary. Aliases map an export value to the system code. */
export interface ImportFormatContext {
  programmeCode: string; centreCode: string;
  programmeAliases: Readonly<Record<string, string>>; centreAliases: Readonly<Record<string, string>>;
}
export const NO_FORMAT_CONTEXT: ImportFormatContext = { programmeCode: '', centreCode: '', programmeAliases: {}, centreAliases: {} };

export const COORDINATOR_REQUIRED_COLUMNS = ['courseCode', 'subjCode', 'centerName', 'stuname', 'stuMetricNo', 'grade'] as const;
export const COORDINATOR_HEADER = ['courseCode', 'subjCode', 'centerName', 'stuname', 'stuMetricNo', 'eMail', 'SemesterMohon', 'grade', 'status'] as const;
const PASSING_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+']);
const EXEMPTION_GRADES = new Set(['EX', 'PENGECUALIAN']);

export type CoordinatorColumns = Record<(typeof COORDINATOR_REQUIRED_COLUMNS)[number] | 'semesterMohon' | 'status', number>;

/** Column positions when the header is a coordinator export (case-insensitive, any order, extra columns ignored); otherwise null. */
export function detectCoordinatorHeader(names: readonly string[]): CoordinatorColumns | null {
  const lower = names.map((name) => name.trim().toLowerCase());
  const find = (name: string): number => {
    const key = name.toLowerCase();
    const first = lower.indexOf(key);
    return first >= 0 && lower.indexOf(key, first + 1) < 0 ? first : -1; // a repeated column is ambiguous
  };
  const index: CoordinatorColumns = {
    courseCode: find('courseCode'), subjCode: find('subjCode'), centerName: find('centerName'), stuname: find('stuname'),
    stuMetricNo: find('stuMetricNo'), grade: find('grade'), semesterMohon: find('SemesterMohon'), status: find('status'),
  };
  return COORDINATOR_REQUIRED_COLUMNS.every((name) => index[name] >= 0) ? index : null;
}

/** Latest semester wins; `YYYY/YYYY N` compares by year then semester number, anything else (blank) sorts oldest. */
export function semesterOrder(value: string): number {
  const match = /^(\d{4})\s*\/\s*(\d{4})\s+(\d+)$/.exec(value.trim());
  return match ? Number(match[1]) * 1000 + Number(match[3]) : -1;
}

const clean = (value: string | undefined): string => (value ?? '').trim();
/** Trims the name and strips one stray leading apostrophe. */
export const cleanName = (value: string | undefined): string => clean(value).replace(/^'/, '').trim();
type Mapped = 'COMPLETED' | 'EXEMPTED' | 'FAILED';
interface Candidate { row: number; ref: string; code: string; status: Mapped; semester: number; credits: number | null }

export interface NormalisedCoordinator { rows: ImportRow[]; summary: CoordinatorExportSummary }

export function normaliseCoordinatorRows(body: readonly CsvRecord[], columns: CoordinatorColumns, catalogue: ImportCatalogue, context: ImportFormatContext): NormalisedCoordinator {
  const summary: CoordinatorExportSummary = {
    rowsRead: body.length, skippedOtherProgramme: 0, skippedOtherCentre: 0, skippedInactive: 0, skippedInactiveStudents: 0, unknownStatusRows: 0, unknownStatusValues: [], skippedInProgress: 0,
    olderAttemptsDropped: 0, skippedSubjectNotInCurriculum: 0, subjectsNotInCurriculum: [],
  };
  const upper = (value: string) => value.trim().toUpperCase();
  const programmeCode = upper(context.programmeCode);
  const centreCode = upper(context.centreCode);
  const mapped = (aliases: Readonly<Record<string, string>>, value: string): string => {
    const key = upper(value);
    for (const [alias, target] of Object.entries(aliases)) if (upper(alias) === key) return upper(target);
    return key;
  };
  // The programme's single curriculum decides "in the curriculum"; with several, any known subject passes and validation asks for the version.
  const curriculum = catalogue.curricula.length === 1 ? catalogue.curricula[0] : undefined;
  const credits = new Map<string, number>();
  for (const item of curriculum ? [curriculum] : catalogue.curricula) for (const subject of item.subjects) if (!credits.has(subject.subjectCode)) credits.set(subject.subjectCode, subject.creditHours);
  // Status belongs to the student (stuMetricNo): any N row makes the student inactive across the WHOLE file, so exemption rows
  // (which have no status) cannot bring an inactive student back. Blank inherits; all blank or no status column is active.
  const inactive = new Set<string>();
  if (columns.status >= 0) for (const record of body) if (upper(clean(record.fields[columns.status])) === 'N') inactive.add(clean(record.fields[columns.stuMetricNo]));
  const inactiveSeen = new Set<string>();
  const unknownStatus = new Map<string, number>();
  const names = new Map<string, string>();
  const missing = new Map<string, number>();
  const groups = new Map<string, Candidate[]>();
  for (const record of body) {
    const field = (column: number) => clean(record.fields[column]);
    if (!programmeCode || mapped(context.programmeAliases, field(columns.courseCode)) !== programmeCode) { summary.skippedOtherProgramme += 1; continue; }
    if (!centreCode || mapped(context.centreAliases, field(columns.centerName)) !== centreCode) { summary.skippedOtherCentre += 1; continue; }
    const rawStatus = columns.status >= 0 ? upper(field(columns.status)) : '';
    if (rawStatus && rawStatus !== 'A' && rawStatus !== 'N') { summary.unknownStatusRows += 1; unknownStatus.set(rawStatus, (unknownStatus.get(rawStatus) ?? 0) + 1); }
    if (inactive.has(field(columns.stuMetricNo))) { summary.skippedInactive += 1; inactiveSeen.add(field(columns.stuMetricNo)); continue; }
    const grade = upper(field(columns.grade));
    if (!grade || grade === 'NULL') { summary.skippedInProgress += 1; continue; }
    const code = upper(field(columns.subjCode));
    const known = credits.get(code);
    if (code && known === undefined) {
      summary.skippedSubjectNotInCurriculum += 1;
      missing.set(code, (missing.get(code) ?? 0) + 1);
      continue;
    }
    const ref = field(columns.stuMetricNo);
    const name = cleanName(record.fields[columns.stuname]);
    if (name && !names.has(ref)) names.set(ref, name);
    const status: Mapped = EXEMPTION_GRADES.has(grade) ? 'EXEMPTED' : PASSING_GRADES.has(grade) ? 'COMPLETED' : 'FAILED';
    const semester = columns.semesterMohon >= 0 ? semesterOrder(field(columns.semesterMohon)) : -1;
    const candidate: Candidate = { row: record.row, ref, code, status, semester, credits: status === 'FAILED' ? null : known ?? null };
    const key = ref + '|' + code;
    const list = groups.get(key);
    if (list) list.push(candidate); else groups.set(key, [candidate]);
  }
  summary.skippedInactiveStudents = inactiveSeen.size;
  summary.unknownStatusValues = [...unknownStatus].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  summary.subjectsNotInCurriculum = [...missing].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1));

  const kept: Candidate[] = [];
  for (const list of groups.values()) {
    // Latest attempt first; the same semester prefers a pass, then the later row. An exemption replaces a non-passed attempt only.
    const attempts = list.filter((c) => c.status !== 'EXEMPTED').sort((a, b) => b.semester - a.semester || Number(b.status === 'COMPLETED') - Number(a.status === 'COMPLETED') || b.row - a.row);
    const exemption = list.find((c) => c.status === 'EXEMPTED');
    const winner = attempts[0] && (attempts[0].status === 'COMPLETED' || !exemption) ? attempts[0] : exemption ?? attempts[0]!;
    kept.push(winner);
    summary.olderAttemptsDropped += list.length - 1;
  }
  kept.sort((a, b) => a.row - b.row);
  const rows = kept.map((c): ImportRow => ({
    row: c.row, ref: c.ref, version: '', cohort: 'ACTIVE', history: 'COMPLETE', code: c.code, status: c.status, semester: '',
    credits: c.credits === null ? '' : String(c.credits), synthetic: 'false', name: names.get(c.ref) ?? '',
  }));
  return { rows, summary };
}

/** Template for the coordinator export: header plus two synthetic rows. */
export const COORDINATOR_TEMPLATE_ROWS: readonly (readonly string[])[] = [
  COORDINATOR_HEADER,
  ['SECJH', 'SECJ1013', 'KUALA LUMPUR', 'ALI BIN ABU', 'SX230001ECJHF04', 'ali@example.com', '2023/2024 1', 'B+', 'A'],
  ['SECJH', 'SECJ1013', 'KUALA LUMPUR', 'ALI BIN ABU', 'SX230001ECJHF04', '', '', 'EX', 'A'],
];
