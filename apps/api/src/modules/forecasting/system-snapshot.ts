/**
 * "Use students in the system" snapshot (S2-P004-007, MT8).
 *
 * Builds an import snapshot from `student_profile` / `academic_record` instead of a CSV. Read-only on the student tables:
 * the selection is read, serialised to a stable fingerprint, and then stored with the same `storeImport` path as a CSV
 * snapshot (ACCEPTED batch + `imported_student` + `imported_subject_record`), so generate-run, review, finalize and
 * confirm work unchanged.
 *
 * Decisions (product owner, 2026-11-02): student-entered records count as COMPLETE history; a student with no
 * academic record at all has UNKNOWN history and is therefore uncertain in the forecast.
 */
import { IMPORT_LIMITS } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ForecastScope, SystemSnapshotCoverage, ValidationIssue } from '../../../../../packages/shared/src/forecasting/contracts';
import type { PortalStudentSelection, ProgrammeCatalogue, StoredValidationSummary } from './contracts';
import { bad, positive, readJson, sha256Hex } from './http';
import type { RecordToStore, StudentToStore } from './validation';

export const SYSTEM_SOURCE_LABEL = 'System students';
export const CENTRE_NOTE = 'Students are counted under the learning centre saved in their profile. Students without a learning centre are excluded (counted under other centre).';

export interface SystemSnapshotInput extends ForecastScope { sourceLabel: string }

export async function readSystemSnapshotRequest(request: Request): Promise<SystemSnapshotInput> {
  const key = request.headers.get('idempotency-key');
  if (key !== null && (key.length < 1 || key.length > 128)) bad('Idempotency-Key must be 1-128 characters.');
  const body = await readJson(request);
  const allowed = ['programmeId', 'learningCentreId', 'targetSemesterId', 'sourceLabel'];
  if (Object.keys(body).some((name) => !allowed.includes(name)) || ['programmeId', 'learningCentreId', 'targetSemesterId'].some((name) => !(name in body))) bad('The request must contain exactly the documented fields.');
  const idOf = (name: string) => typeof body[name] === 'number' && Number.isInteger(body[name]) ? positive(String(body[name]), name) : bad(name + ' must be a positive integer.');
  let sourceLabel = SYSTEM_SOURCE_LABEL;
  if (body.sourceLabel !== undefined) {
    if (typeof body.sourceLabel !== 'string') bad('sourceLabel must be text.');
    const label = (body.sourceLabel as string).trim();
    if (!label || label.length > IMPORT_LIMITS.maxSourceLabelLength || /[\u0000-\u001f\u007f]/.test(label)) bad('sourceLabel must be 1-255 printable characters.');
    sourceLabel = label;
  }
  return { programmeId: idOf('programmeId'), learningCentreId: idOf('learningCentreId'), targetSemesterId: idOf('targetSemesterId'), sourceLabel };
}

export interface BuiltSystemSnapshot {
  students: StudentToStore[];
  records: RecordToStore[];
  coverage: SystemSnapshotCoverage;
  /** sha256 of a stable serialisation of the selected data (independent of date, label and actor). */
  fingerprint: string;
  /** Matric number per system reference, in memory only (used to match CSV students of a combined snapshot; never stored). */
  matricByReference: Map<string, string | null>;
}

/** External reference of a system student: `PORTAL-<student_id>`. Stable, unique per batch and not personal data (matric numbers are not unique in the schema). */
export const portalReference = (studentId: number) => 'PORTAL-' + studentId;

/**
 * Pure selection and mapping.
 * - Selected: curriculum in the programme, centre equal to the requested one (via `ScopeProvider`), ACTIVE access with the STUDENT role.
 * - COMPLETED / EXEMPTED / FAILED map as-is. WITHDRAWN is not a passed status and is stored as FAILED (0 credits, as the portal already requires).
 * - A record whose subject is not in the student's curriculum is unmapped and skipped (counted in the coverage).
 * - Recognized credits above the subject's catalogue credits are not trusted and stored as unknown (null) so the engine treats credit evidence as missing.
 */
export async function buildSystemSnapshot(
  selection: PortalStudentSelection, catalogue: ProgrammeCatalogue, learningCentreId: number, centreOf: (studentId: number) => Promise<number | null>,
): Promise<BuiltSystemSnapshot> {
  const subjectsByCurriculum = new Map(catalogue.curricula.map((curriculum) => [curriculum.curriculumId, new Map(curriculum.subjects.map((subject) => [subject.subjectId, subject.creditHours]))]));
  const excluded = { otherProgramme: selection.otherProgrammeStudents, otherCentre: 0, inactiveAccess: 0 };
  const picked = [];
  for (const student of selection.students) {
    if (!student.eligible) { excluded.inactiveAccess += 1; continue; }
    if ((await centreOf(student.studentId)) !== learningCentreId) { excluded.otherCentre += 1; continue; }
    picked.push(student);
  }
  const recordsByStudent = new Map<number, typeof selection.records>();
  for (const record of selection.records) {
    const list = recordsByStudent.get(record.studentId) ?? [];
    list.push(record);
    recordsByStudent.set(record.studentId, list);
  }
  const students: StudentToStore[] = [];
  const records: RecordToStore[] = [];
  const matricByReference = new Map<string, string | null>();
  let withoutRecords = 0, unmapped = 0, withdrawn = 0;
  for (const student of picked) {
    const own = recordsByStudent.get(student.studentId) ?? [];
    const subjects = subjectsByCurriculum.get(student.curriculumId);
    const reference = portalReference(student.studentId);
    if (own.length === 0) withoutRecords += 1;
    matricByReference.set(reference, student.matricNo ?? null);
    students.push({ externalReference: reference, curriculumId: student.curriculumId, cohortStatus: 'ACTIVE', historyCompleteness: own.length > 0 ? 'COMPLETE' : 'UNKNOWN', studentName: student.studentName });
    for (const record of own) {
      const creditHours = subjects?.get(record.subjectId);
      const status = record.status === 'WITHDRAWN' ? 'FAILED' : record.status;
      if (creditHours === undefined || !(status === 'COMPLETED' || status === 'EXEMPTED' || status === 'FAILED')) { unmapped += 1; continue; }
      if (record.status === 'WITHDRAWN') withdrawn += 1;
      const passed = status !== 'FAILED';
      records.push({
        externalReference: reference, subjectId: record.subjectId, subjectStatus: status, semesterId: record.semesterId,
        recognizedCredits: passed ? (record.recognizedCredits > creditHours ? null : record.recognizedCredits) : 0, isSynthetic: false,
      });
    }
  }
  const coverage: SystemSnapshotCoverage = {
    studentsFound: students.length, studentsWithRecords: students.length - withoutRecords, studentsWithoutRecords: withoutRecords,
    recordsMapped: records.length, recordsUnmapped: unmapped, withdrawnStoredAsFailed: withdrawn, excluded, centreNote: CENTRE_NOTE,
  };
  const stable = records.map((r) => [r.externalReference, r.subjectId, r.subjectStatus, r.semesterId, r.recognizedCredits]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  const fingerprint = await sha256Hex(JSON.stringify({
    kind: 'system-students', v: 1, programmeId: catalogue.programmeId, learningCentreId,
    students: students.map((s) => [s.externalReference, s.studentName, s.curriculumId, s.historyCompleteness]), records: stable,
  }));
  return { students, records, coverage, fingerprint, matricByReference };
}

/** Public validation summary of a system snapshot: a VALID report with the coverage; the private marker says PORTAL. */
export async function systemSummary(built: BuiltSystemSnapshot, scope: ForecastScope, validationId: string): Promise<StoredValidationSummary> {
  const { coverage } = built;
  const issues: ValidationIssue[] = coverage.studentsWithoutRecords > 0 ? [{
    severity: 'WARNING', code: 'HISTORY_UNKNOWN', row: null, field: null,
    message: coverage.studentsWithoutRecords + (coverage.studentsWithoutRecords === 1 ? ' student has' : ' students have') + ' no academic records in the system, so their history is unknown.',
    correctiveAction: 'Eligibility for these students stays uncertain until they enter their academic records.',
  }] : [];
  const counts = {
    studentRows: coverage.studentsFound, uniqueStudents: coverage.studentsFound, validAttempts: coverage.recordsMapped, rejectedRows: 0,
    partialStudents: 0, unknownHistoryStudents: coverage.studentsWithoutRecords,
  };
  const validationRevision = 'sha256:' + await sha256Hex(JSON.stringify([built.fingerprint, scope.programmeId, scope.learningCentreId, scope.targetSemesterId, counts]));
  return {
    validationId, validationRevision, status: 'VALID', counts, issues, completenessChanges: [], subsetAcknowledgementRequired: false,
    source: 'SYSTEM', coverage,
    internal: { schemaVersion: 1, csvVersion: 1, source: 'PORTAL', dataRows: coverage.recordsMapped, rejectedRowsByStudent: {} },
  };
}
