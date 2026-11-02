import type { ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ClassType, ImportedStudentSummary } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ForecastingRepository, ImportBatchRow, StoredStudentSummary, ImportBatchStatus, PortalStudentSelection, ProgrammeCatalogue, StoredValidationSummary, StoreImportInput } from './contracts';
import { mapForecastingDatabaseError } from './errors';
import type { CatalogueCurriculum, CatalogueSubject } from './validation';

export type ForecastingQuery = (text: string, values: unknown[]) => Promise<Record<string, unknown>[]>;
export interface ForecastingStatement { text: string; values: unknown[] }
export type ForecastingTransaction = (statements: ForecastingStatement[]) => Promise<Record<string, unknown>[][]>;

const integer = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unexpected numeric database value');
  return number;
};
const text = (value: unknown): string => String(value ?? '');

/** Identity value of the batch inserted earlier in the same transaction (one connection, so currval is exact). */
const CURRENT_BATCH = "currval(pg_get_serial_sequence('public.academic_import_batch','import_batch_id'))";
const BATCH_COLUMNS = `import_batch_id, programme_id, learning_centre_id, target_semester_id, import_status,
  to_char(snapshot_date,'YYYY-MM-DD') AS source_date, source_label, provided_by, source_fingerprint,
  to_char(accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS accepted_at, accepted_by, validation_summary`;
/** Programme-scoped (UC20) batches only; legacy batches without a programme are never exposed. */
const SCOPED = 'programme_id=$1 AND learning_centre_id=$2 AND target_semester_id=$3';

function batchFrom(row: Record<string, unknown>): ImportBatchRow {
  const raw = row.validation_summary;
  const summary = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredValidationSummary | null;
  if (!summary || typeof summary !== 'object') throw new Error('Import batch has no validation summary');
  return {
    importBatchId: integer(row.import_batch_id), programmeId: integer(row.programme_id), learningCentreId: integer(row.learning_centre_id),
    targetSemesterId: integer(row.target_semester_id), status: text(row.import_status) as ImportBatchStatus,
    sourceDate: text(row.source_date), sourceLabel: text(row.source_label), providedBy: text(row.provided_by),
    sourceFingerprint: text(row.source_fingerprint), acceptedAt: row.accepted_at == null ? null : text(row.accepted_at),
    acceptedBy: row.accepted_by == null ? null : text(row.accepted_by), summary,
  };
}

export function createForecastingRepository(query: ForecastingQuery, transaction: ForecastingTransaction): ForecastingRepository {
  const read = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { throw mapForecastingDatabaseError(error); }
  };
  return {
    semesters: () => read(async () => (await query('SELECT semester_id, academic_year, semester_no FROM public.academic_semester ORDER BY academic_year, semester_no', []))
      .map((row) => ({ semesterId: integer(row.semester_id), academicYear: text(row.academic_year), semesterNumber: integer(row.semester_no) as 1 | 2 | 3 }))),

    catalogue: (programmeId) => read(async (): Promise<ProgrammeCatalogue | null> => {
      const [programme, curricula, subjects, prerequisites, codes, semesters] = await Promise.all([
        query('SELECT programme_id FROM public.programme WHERE programme_id=$1', [programmeId]),
        query('SELECT curriculum_id, curriculum_version, effective_year FROM public.curriculum WHERE programme_id=$1 ORDER BY curriculum_id', [programmeId]),
        query(`SELECT cs.curriculum_subject_id, cs.curriculum_id, s.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, s.include_in_offering_forecast
          FROM public.curriculum_subject cs JOIN public.curriculum c ON c.curriculum_id=cs.curriculum_id JOIN public.subject s ON s.subject_id=cs.subject_id
          WHERE c.programme_id=$1 ORDER BY cs.curriculum_id, s.subject_code`, [programmeId]),
        query(`SELECT p.prerequisite_id, p.curriculum_subject_id, p.required_curriculum_subject_id, p.requirement_type
          FROM public.subject_prerequisite p JOIN public.curriculum_subject cs ON cs.curriculum_subject_id=p.curriculum_subject_id
          JOIN public.curriculum c ON c.curriculum_id=cs.curriculum_id WHERE c.programme_id=$1 ORDER BY p.prerequisite_id`, [programmeId]),
        query('SELECT subject_code FROM public.subject', []),
        query('SELECT semester_id FROM public.academic_semester', []),
      ]);
      if (!programme[0]) return null;
      const byCurriculum = new Map<number, CatalogueSubject[]>();
      for (const row of subjects) {
        const list = byCurriculum.get(integer(row.curriculum_id)) ?? [];
        list.push({
          curriculumSubjectId: integer(row.curriculum_subject_id), subjectId: integer(row.subject_id), subjectCode: text(row.subject_code),
          subjectName: text(row.subject_name), creditHours: integer(row.credit_hours), classType: (row.class_type == null ? null : text(row.class_type)) as ClassType,
          includeInOfferingForecast: row.include_in_offering_forecast === true,
        });
        byCurriculum.set(integer(row.curriculum_id), list);
      }
      return {
        programmeId,
        curricula: curricula.map((row): CatalogueCurriculum => ({
          curriculumId: integer(row.curriculum_id), curriculumVersion: text(row.curriculum_version),
          effectiveYear: row.effective_year == null ? null : integer(row.effective_year), subjects: byCurriculum.get(integer(row.curriculum_id)) ?? [],
        })),
        prerequisites: prerequisites.map((row) => ({
          prerequisiteId: integer(row.prerequisite_id), curriculumSubjectId: integer(row.curriculum_subject_id),
          requiredCurriculumSubjectId: integer(row.required_curriculum_subject_id), requirementType: text(row.requirement_type) as 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE',
        })),
        knownSubjectCodes: new Set(codes.map((row) => text(row.subject_code))),
        semesterIds: new Set(semesters.map((row) => integer(row.semester_id))),
      };
    }),

    systemStudents: (programmeId) => read(async (): Promise<PortalStudentSelection> => {
      // Read-only. The student must have an ACTIVE access assignment that also holds the STUDENT role (user_role_assignment, 0004).
      const [students, other] = await Promise.all([
        query(`SELECT sp.student_id, sp.student_name, sp.matric_no, sp.curriculum_id,
            EXISTS (SELECT 1 FROM public.user_access_assignment ua JOIN public.user_role_assignment ur ON ur.access_assignment_id = ua.access_assignment_id
              WHERE ua.clerk_user_id = sp.clerk_user_id AND ua.access_status = 'ACTIVE' AND ur.app_role = 'STUDENT') AS eligible
          FROM public.student_profile sp JOIN public.curriculum c ON c.curriculum_id = sp.curriculum_id WHERE c.programme_id = $1 ORDER BY sp.student_id`, [programmeId]),
        query(`SELECT count(*) AS total FROM public.student_profile sp JOIN public.curriculum c ON c.curriculum_id = sp.curriculum_id WHERE c.programme_id <> $1`, [programmeId]),
      ]);
      const records = await query(`SELECT ar.student_id, ar.subject_id, ar.status, ar.semester_id, ar.recognized_credits FROM public.academic_record ar
        JOIN public.student_profile sp ON sp.student_id = ar.student_id JOIN public.curriculum c ON c.curriculum_id = sp.curriculum_id
        WHERE c.programme_id = $1 ORDER BY ar.student_id, ar.record_id`, [programmeId]);
      return {
        students: students.map((row) => ({ studentId: integer(row.student_id), studentName: text(row.student_name), matricNo: row.matric_no == null ? null : text(row.matric_no), curriculumId: integer(row.curriculum_id), eligible: row.eligible === true })),
        records: records.map((row) => ({ studentId: integer(row.student_id), subjectId: integer(row.subject_id), status: text(row.status), semesterId: row.semester_id == null ? null : integer(row.semester_id), recognizedCredits: integer(row.recognized_credits) })),
        otherProgrammeStudents: integer(other[0]?.total ?? 0),
      };
    }),

    findAcceptedByFingerprint: (scope: ForecastScope, fingerprint) => read(async () => {
      const rows = await query(`SELECT ${BATCH_COLUMNS} FROM public.academic_import_batch
        WHERE ${SCOPED} AND import_status='ACCEPTED' AND source_fingerprint=$4 ORDER BY import_batch_id DESC LIMIT 1`,
      [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, fingerprint]);
      return rows[0] ? batchFrom(rows[0]) : null;
    }),

    storeImport: (input: StoreImportInput) => read(async () => {
      const statements: ForecastingStatement[] = [{
        text: `INSERT INTO public.academic_import_batch(learning_centre_id, snapshot_date, provided_by, source_label, import_status, programme_id, target_semester_id, source_fingerprint, validation_summary)
          VALUES ($1, $2::date, $3, $4, 'UPLOADED', $5, $6, $7, $8::jsonb)`,
        values: [input.learningCentreId, input.sourceDate, input.actor, input.sourceLabel, input.programmeId, input.targetSemesterId, input.sourceFingerprint, JSON.stringify(input.summary)],
      }];
      if (input.students.length) {
        statements.push({
          text: `INSERT INTO public.imported_student(import_batch_id, curriculum_id, external_reference, cohort_status, history_completeness, student_name)
            SELECT ${CURRENT_BATCH}, s.curriculum_id, s.external_reference, s.cohort_status, s.history_completeness, s.student_name
            FROM jsonb_to_recordset($1::jsonb) AS s(curriculum_id integer, external_reference text, cohort_status text, history_completeness text, student_name text)`,
          values: [JSON.stringify(input.students.map((s) => ({ curriculum_id: s.curriculumId, external_reference: s.externalReference, cohort_status: s.cohortStatus, history_completeness: s.historyCompleteness, student_name: s.studentName })))],
        });
      }
      if (input.records.length) {
        statements.push({
          text: `INSERT INTO public.imported_subject_record(imported_student_id, subject_id, subject_status, semester_id, is_synthetic, recognized_credits)
            SELECT st.imported_student_id, r.subject_id, r.subject_status, r.semester_id, r.is_synthetic, r.recognized_credits
            FROM jsonb_to_recordset($1::jsonb) AS r(external_reference text, subject_id integer, subject_status text, semester_id integer, is_synthetic boolean, recognized_credits integer)
            JOIN public.imported_student st ON st.external_reference=r.external_reference AND st.import_batch_id=${CURRENT_BATCH}`,
          values: [JSON.stringify(input.records.map((r) => ({ external_reference: r.externalReference, subject_id: r.subjectId, subject_status: r.subjectStatus, semester_id: r.semesterId, is_synthetic: r.isSynthetic, recognized_credits: r.recognizedCredits })))],
        });
      }
      statements.push({
        text: `UPDATE public.academic_import_batch SET import_status=$1 WHERE import_batch_id=${CURRENT_BATCH}`,
        values: [input.outcome === 'REJECTED' ? 'REJECTED' : 'VALIDATED'],
      });
      if (input.outcome === 'ACCEPTED') {
        statements.push({ text: `UPDATE public.academic_import_batch SET import_status='ACCEPTED', accepted_by=$1 WHERE import_batch_id=${CURRENT_BATCH}`, values: [input.actor] });
      }
      statements.push({ text: `SELECT ${BATCH_COLUMNS} FROM public.academic_import_batch WHERE import_batch_id=${CURRENT_BATCH}`, values: [] });
      const results = await transaction(statements);
      const row = results[results.length - 1]?.[0];
      if (!row) throw new Error('Import batch was not stored');
      return batchFrom(row);
    }),

    getBatch: (importBatchId) => read(async () => {
      const rows = await query(`SELECT ${BATCH_COLUMNS} FROM public.academic_import_batch WHERE import_batch_id=$1 AND programme_id IS NOT NULL`, [importBatchId]);
      return rows[0] ? batchFrom(rows[0]) : null;
    }),

    findByValidationId: (validationId) => read(async () => {
      const rows = await query(`SELECT ${BATCH_COLUMNS} FROM public.academic_import_batch WHERE programme_id IS NOT NULL AND validation_summary->>'validationId'=$1::text`, [validationId]);
      return rows[0] ? batchFrom(rows[0]) : null;
    }),

    listAccepted: (scope, limit, before) => read(async () => (await query(`SELECT ${BATCH_COLUMNS} FROM public.academic_import_batch
      WHERE ${SCOPED} AND import_status='ACCEPTED' AND ($5::integer IS NULL OR import_batch_id<$5::integer)
      ORDER BY import_batch_id DESC LIMIT $4`, [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, limit, before])).map(batchFrom)),

    listStudents: (importBatchId, limit, afterId) => read(async () => (await query(`SELECT s.imported_student_id, s.external_reference, s.student_name, c.curriculum_version, s.cohort_status, s.history_completeness
      FROM public.imported_student s JOIN public.curriculum c ON c.curriculum_id=s.curriculum_id
      WHERE s.import_batch_id=$1 AND ($3::integer IS NULL OR s.imported_student_id>$3::integer) ORDER BY s.imported_student_id LIMIT $2`, [importBatchId, limit, afterId]))
      .map((row): StoredStudentSummary => ({ importedStudentId: integer(row.imported_student_id), externalReference: text(row.external_reference), studentName: row.student_name == null ? null : text(row.student_name),
        curriculumVersion: text(row.curriculum_version), cohortStatus: text(row.cohort_status), historyCompleteness: text(row.history_completeness) as ImportedStudentSummary['historyCompleteness'] }))),

    acceptValidated: (importBatchId, actor) => read(async () => {
      // Status-guarded single statement: a concurrent or repeated acceptance matches no row. The database
      // trigger stamps accepted_at and then freezes the batch and its student/record rows.
      const rows = await query(`UPDATE public.academic_import_batch SET import_status='ACCEPTED', accepted_by=$2::text,
        validation_summary=jsonb_set(validation_summary, '{internal,subsetAcknowledgedBy}', to_jsonb($2::text), true)
        WHERE import_batch_id=$1 AND import_status='VALIDATED' AND programme_id IS NOT NULL
        RETURNING ${BATCH_COLUMNS}`, [importBatchId, actor]);
      return rows[0] ? batchFrom(rows[0]) : null;
    }),
  };
}
