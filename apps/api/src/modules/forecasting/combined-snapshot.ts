/**
 * "Both" snapshot (S2-P004-009, MT9): the students in the system (MT8 selection and mapping) plus the students of an
 * uploaded CSV who are not already in the system, in ONE snapshot.
 *
 * Duplicate rule (product owner, 2026-11-02): the SYSTEM record wins.
 * - A CSV student is skipped when its `external_reference` equals a system student's `matric_no` (trimmed, case-insensitive),
 *   and only when that matric_no is non-empty and unique among the selected system students. A CSV reference equal to a
 *   system `PORTAL-<id>` reference is the same student and is skipped as well.
 * - A CSV student whose name equals a system student's name (normalised) but whose reference differs is INCLUDED and
 *   reported as a possible duplicate (WARNING). Records are never merged on name.
 * Matric numbers are used in memory only; they are not stored in the snapshot.
 */
import type {
  CombinedSnapshotCoverage, CompletenessChange, ForecastScope, ImportCounts, StudentSource, ValidationIssue,
} from '../../../../../packages/shared/src/forecasting/contracts';
import type { StoredValidationSummary } from './contracts';
import { sha256Hex } from './http';
import type { BuiltSystemSnapshot } from './system-snapshot';
import { issue, type RecordToStore, type StudentToStore, type ValidationOutcome } from './validation';

/** Matric numbers compare trimmed and case-insensitively. */
export const normaliseMatric = (value: string): string => value.trim().toLowerCase();
/** Names compare after Unicode normalisation, trimming, whitespace collapsing and case folding. */
export const normaliseName = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export interface CombinedMerge {
  students: StudentToStore[];
  records: RecordToStore[];
  sourceByReference: Record<string, StudentSource>;
  skipped: string[];
  possibleDuplicates: Array<{ csvReference: string; systemReferences: string[] }>;
}

/** Normalised matric -> system reference, only for non-empty matrics held by exactly one selected system student. */
export function matricTableOf(system: BuiltSystemSnapshot): Array<[string, string]> {
  const holders = new Map<string, string[]>();
  for (const [reference, matric] of system.matricByReference) {
    const key = matric === null ? '' : normaliseMatric(matric);
    if (!key) continue;
    holders.set(key, [...(holders.get(key) ?? []), reference]);
  }
  return [...holders].filter(([, refs]) => refs.length === 1).map(([key, refs]): [string, string] => [key, refs[0]!]).sort((a, b) => a[0] < b[0] ? -1 : 1);
}

/** The fingerprint covers the CSV bytes and the system data (and the match table, which decides which CSV students are skipped). */
export async function combinedFingerprint(csvFingerprint: string, system: BuiltSystemSnapshot, scope: Pick<ForecastScope, 'programmeId' | 'learningCentreId'>): Promise<string> {
  return sha256Hex(JSON.stringify({ kind: 'combined-students', v: 1, programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, csv: csvFingerprint, system: system.fingerprint, matrics: matricTableOf(system) }));
}

export function mergeCombined(system: BuiltSystemSnapshot, csv: ValidationOutcome): CombinedMerge {
  const byMatric = new Map(matricTableOf(system));
  const systemRefs = new Set(system.students.map((student) => student.externalReference.toLowerCase()));
  const namesToRefs = new Map<string, string[]>();
  for (const student of system.students) {
    if (!student.studentName) continue;
    const key = normaliseName(student.studentName);
    if (key) namesToRefs.set(key, [...(namesToRefs.get(key) ?? []), student.externalReference]);
  }
  const skipped: string[] = [];
  const possibleDuplicates: CombinedMerge['possibleDuplicates'] = [];
  const keptCsv: StudentToStore[] = [];
  for (const student of csv.students) {
    const reference = student.externalReference;
    if (byMatric.has(normaliseMatric(reference)) || systemRefs.has(reference.toLowerCase())) { skipped.push(reference); continue; }
    keptCsv.push(student);
    const key = student.studentName ? normaliseName(student.studentName) : '';
    const matches = key ? namesToRefs.get(key) : undefined;
    if (matches?.length) possibleDuplicates.push({ csvReference: reference, systemReferences: matches });
  }
  const skippedSet = new Set(skipped);
  const sourceByReference: Record<string, StudentSource> = {};
  for (const student of system.students) sourceByReference[student.externalReference] = 'SYSTEM';
  for (const student of keptCsv) sourceByReference[student.externalReference] = 'CSV';
  return {
    students: [...system.students, ...keptCsv],
    records: [...system.records, ...csv.records.filter((record) => !skippedSet.has(record.externalReference))],
    sourceByReference, skipped, possibleDuplicates,
  };
}

/** Public validation summary of a combined snapshot: the CSV report (same validation) plus the system coverage and the merge findings. */
export async function combinedSummary(system: BuiltSystemSnapshot, csv: ValidationOutcome, merge: CombinedMerge, scope: ForecastScope, validationId: string, fingerprint: string): Promise<StoredValidationSummary> {
  const kept = new Set(merge.students.map((student) => student.externalReference));
  const keptCsvStudents = merge.students.filter((student) => merge.sourceByReference[student.externalReference] === 'CSV');
  const completenessChanges: CompletenessChange[] = csv.report.completenessChanges.filter((change) => kept.has(change.externalReference));
  const rejectedRowsByStudent = Object.fromEntries(Object.entries(csv.rejectedRowsByStudent).filter(([reference]) => kept.has(reference)));
  const unknown = system.coverage.studentsWithoutRecords + keptCsvStudents.filter((student) => student.historyCompleteness === 'UNKNOWN').length;
  const partial = keptCsvStudents.filter((student) => student.historyCompleteness === 'PARTIAL').length;
  const counts: ImportCounts = {
    studentRows: system.coverage.studentsFound + csv.report.counts.studentRows, uniqueStudents: merge.students.length, validAttempts: merge.records.length,
    rejectedRows: csv.report.counts.rejectedRows, partialStudents: partial, unknownHistoryStudents: unknown,
  };
  const extra: ValidationIssue[] = [];
  const noRecords = system.coverage.studentsWithoutRecords;
  if (noRecords > 0) {
    extra.push(issue('WARNING', 'HISTORY_UNKNOWN', null, null, noRecords + (noRecords === 1 ? ' system student has' : ' system students have') + ' no academic records, so their history is unknown.'));
  }
  if (merge.skipped.length) {
    extra.push(issue('WARNING', 'CSV_STUDENTS_ALREADY_IN_SYSTEM', null, 'external_reference', merge.skipped.length + (merge.skipped.length === 1 ? ' CSV student was' : ' CSV students were')
      + ' skipped because the student is already in the system (the system record is used): ' + merge.skipped.slice(0, 20).join(', ') + (merge.skipped.length > 20 ? ', ...' : '') + '.'));
  }
  for (const duplicate of merge.possibleDuplicates) {
    extra.push(issue('WARNING', 'POSSIBLE_DUPLICATE_STUDENT', null, 'student_name', 'CSV student ' + duplicate.csvReference + ' has the same name as ' + duplicate.systemReferences.join(', ') + ' in the system but a different reference. Both are included.'));
  }
  const combined: CombinedSnapshotCoverage = {
    csv: { rows: csv.report.counts.studentRows, students: csv.students.length, rejectedRows: csv.report.counts.rejectedRows },
    students: merge.students.length, csvSkippedAlreadyInSystem: merge.skipped, possibleDuplicates: merge.possibleDuplicates,
  };
  const hasErrors = csv.report.status === 'CORRECTION_REQUIRED';
  const revision = 'sha256:' + await sha256Hex(JSON.stringify([fingerprint, scope.programmeId, scope.learningCentreId, scope.targetSemesterId, counts, csv.report.issues.length, extra.length]));
  return {
    validationId, validationRevision: revision, status: csv.report.status, counts, issues: [...csv.report.issues, ...extra], completenessChanges,
    subsetAcknowledgementRequired: hasErrors && merge.students.length > 0, source: 'COMBINED', coverage: system.coverage, combined,
    ...(csv.report.format ? { format: csv.report.format, coordinatorExport: csv.report.coordinatorExport } : {}),
    internal: { schemaVersion: 1, csvVersion: 1, source: 'COMBINED', dataRows: csv.dataRows, rejectedRowsByStudent, sourceByReference: merge.sourceByReference },
  };
}
