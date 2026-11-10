import type * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { normaliseReason } from '../../../../../packages/shared/src/admin/admin';
import type { CoordinatorAssignment } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type { AcademicSetupRepository, AcademicScopeReader } from './academic-contracts';
import type { AdminQuery, AdminStatement, AdminTransaction } from './repository';
import { AcademicSetupDomainError, mapAcademicDatabaseError } from './academic-errors';

type Row = Record<string, unknown>;
const centreColumns = 'learning_centre_id AS "learningCentreId", centre_code AS "centreCode", centre_name AS "centreName", is_active AS "isActive"';
const facultyColumns = 'faculty_id AS "facultyId", faculty_code AS "facultyCode", faculty_name AS "facultyName", is_active AS "isActive"';
const semesterColumns = `semester_id AS "semesterId", academic_year AS "academicYear", semester_no AS "semesterNo",
  semester_type AS "semesterType", max_subjects AS "maxSubjects", max_credits AS "maxCredits",
  start_date::text AS "startDate", end_date::text AS "endDate", is_current AS "isCurrent",
  to_char(selection_opens_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "selectionOpensAt",
  to_char(selection_closes_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "selectionClosesAt"`;
const programmeSelect = `SELECT p.programme_id AS "programmeId", p.programme_code AS "programmeCode", p.programme_name AS "programmeName",
  p.faculty_id AS "facultyId", f.faculty_code AS "facultyCode", f.faculty_name AS "facultyName", f.is_active AS "isActive"
  FROM public.programme p LEFT JOIN public.faculty f ON f.faculty_id=p.faculty_id`;
const assignmentColumns = `assignment_id AS "assignmentId", access_assignment_id AS "accountId", faculty_id AS "facultyId",
  programme_id AS "programmeId", learning_centre_id AS "learningCentreId", started_at AS "startedAt", ended_at AS "endedAt"`;
const scopeSelect = `SELECT DISTINCT c.faculty_id AS "facultyId", c.programme_id AS "programmeId", c.learning_centre_id AS "learningCentreId"
  FROM public.coordinator_assignment c JOIN public.user_access_assignment a USING(access_assignment_id)
  JOIN public.user_role_assignment r ON r.access_assignment_id=a.access_assignment_id AND r.app_role='COORDINATOR'
  JOIN public.faculty f ON f.faculty_id=c.faculty_id AND f.is_active
  JOIN public.learning_centre l ON l.learning_centre_id=c.learning_centre_id AND l.is_active
  JOIN public.programme p ON p.programme_id=c.programme_id AND p.faculty_id=c.faculty_id
  WHERE a.clerk_user_id=$1 AND a.access_status='ACTIVE' AND c.ended_at IS NULL
  AND coalesce(upper(p.status),'ACTIVE')='ACTIVE'`;
const centre = (r: Row): C.LearningCentre => ({ learningCentreId: Number(r.learningCentreId), centreCode: String(r.centreCode), centreName: String(r.centreName), isActive: r.isActive === true });
const faculty = (r: Row): C.Faculty => ({ facultyId: Number(r.facultyId), facultyCode: String(r.facultyCode), facultyName: String(r.facultyName), isActive: r.isActive === true });
const semester = (r: Row): C.AcademicSemester => ({ semesterId: Number(r.semesterId), academicYear: String(r.academicYear), semesterNo: Number(r.semesterNo) as 1 | 2 | 3,
  semesterType: r.semesterType as C.SemesterType, maxSubjects: Number(r.maxSubjects), maxCredits: Number(r.maxCredits), startDate: r.startDate == null ? null : String(r.startDate), endDate: r.endDate == null ? null : String(r.endDate), isCurrent: r.isCurrent === true,
  selectionOpensAt: r.selectionOpensAt == null ? null : String(r.selectionOpensAt), selectionClosesAt: r.selectionClosesAt == null ? null : String(r.selectionClosesAt) });
const programme = (r: Row): C.ProgrammeFaculty => ({ programmeId: Number(r.programmeId), programmeCode: String(r.programmeCode), programmeName: String(r.programmeName), facultyId: r.facultyId == null ? null : Number(r.facultyId), faculty: r.facultyId == null ? null : faculty(r) });
const scope = (r: Row): CoordinatorAssignment => ({ facultyId: Number(r.facultyId), programmeId: Number(r.programmeId), learningCentreId: Number(r.learningCentreId) });
const timestamp = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();
const assignment = (r: Row): C.AdminCoordinatorAssignment => ({ ...scope(r), assignmentId: Number(r.assignmentId), accountId: Number(r.accountId), startedAt: timestamp(r.startedAt), endedAt: r.endedAt == null ? null : timestamp(r.endedAt) });
const semesterFields = { academicYear: 'academic_year', semesterNo: 'semester_no', semesterType: 'semester_type', maxSubjects: 'max_subjects', maxCredits: 'max_credits', startDate: 'start_date', endDate: 'end_date', selectionOpensAt: 'selection_opens_at', selectionClosesAt: 'selection_closes_at' };

/** Each mutation submits context + bound statements in one non-interactive transaction. */
export function createAcademicSetupRepository(query: AdminQuery, transaction: AdminTransaction): AcademicSetupRepository & AcademicScopeReader {
  async function read<T>(text: string, values: unknown[], map: (row: Row) => T): Promise<T[]> {
    try { return (await query(text, values)).map(map); }
    catch (error) { throw mapAcademicDatabaseError(error); }
  }
  async function write<T>(actor: string, reason: string, statements: AdminStatement[], map: (row: Row) => T): Promise<T> {
    const normalized = normaliseReason(reason);
    if (!actor.trim() || !normalized) throw new AcademicSetupDomainError('INVALID_REQUEST');
    try {
      const results = await transaction([{ text: "SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", values: [actor, normalized] }, ...statements]);
      const row = results.at(-1)?.[0];
      if (!row) throw new AcademicSetupDomainError('NOT_FOUND');
      return map(row);
    } catch (error) { throw mapAcademicDatabaseError(error); }
  }
  function patch(table: string, key: string, id: number, input: object, fields: Record<string, string>, columns: string): AdminStatement {
    const supplied = Object.entries(fields).filter(([field]) => Object.prototype.hasOwnProperty.call(input, field));
    if (!supplied.length) throw new AcademicSetupDomainError('INVALID_REQUEST');
    const record = input as Row;
    // Identifiers only come from closed maps below. Explicit null, false and zero remain supplied values.
    return { text: `UPDATE public.${table} SET ${supplied.map(([, column], i) => `${column}=$${i + 2}`).join(', ')} WHERE ${key}=$1 RETURNING ${columns}`,
      values: [id, ...supplied.map(([field]) => record[field])] };
  }
  const statement = (text: string, values: unknown[]): AdminStatement => ({ text, values });
  return {
    listLearningCentres: includeInactive => read(`SELECT ${centreColumns} FROM public.learning_centre ${includeInactive ? '' : 'WHERE is_active'} ORDER BY centre_code, learning_centre_id`, [], centre),
    createLearningCentre: (input, actor) => write(actor, input.reason, [statement(`INSERT INTO public.learning_centre(centre_code,centre_name) VALUES ($1,$2) RETURNING ${centreColumns}`, [input.centreCode, input.centreName])], centre),
    updateLearningCentre: (id, input, actor) => write(actor, input.reason, [patch('learning_centre', 'learning_centre_id', id, input, { centreCode: 'centre_code', centreName: 'centre_name', isActive: 'is_active' }, centreColumns)], centre),
    listFaculties: includeInactive => read(`SELECT ${facultyColumns} FROM public.faculty ${includeInactive ? '' : 'WHERE is_active'} ORDER BY faculty_code, faculty_id`, [], faculty),
    createFaculty: (input, actor) => write(actor, input.reason, [statement(`INSERT INTO public.faculty(faculty_code,faculty_name) VALUES ($1,$2) RETURNING ${facultyColumns}`, [input.facultyCode, input.facultyName])], faculty),
    updateFaculty: (id, input, actor) => write(actor, input.reason, [patch('faculty', 'faculty_id', id, input, { facultyCode: 'faculty_code', facultyName: 'faculty_name', isActive: 'is_active' }, facultyColumns)], faculty),
    listProgrammeFaculties: () => read(programmeSelect + ' ORDER BY p.programme_code, p.programme_id', [], programme),
    setProgrammeFaculty: (id, input, actor) => write(actor, input.reason, [statement(`UPDATE public.programme SET faculty_id=$2 WHERE programme_id=$1 RETURNING programme_id`, [id, input.facultyId]),
      statement(programmeSelect + ' WHERE p.programme_id=$1', [id])], programme),
    listAcademicSemesters: () => read(`SELECT ${semesterColumns} FROM public.academic_semester ORDER BY academic_year, semester_no, semester_id`, [], semester),
    createAcademicSemester: (input, actor) => write(actor, input.reason, [statement(`INSERT INTO public.academic_semester(academic_year,semester_no,semester_type,max_subjects,max_credits,start_date,end_date,selection_opens_at,selection_closes_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${semesterColumns}`, [input.academicYear, input.semesterNo, input.semesterType, input.maxSubjects, input.maxCredits, input.startDate, input.endDate, input.selectionOpensAt ?? null, input.selectionClosesAt ?? null])], semester),
    // A closing time without or not after the opening time is rejected atomically by academic_semester_selection_window_rule (23514 -> INVALID_REQUEST), like the other merged semester invariants.
    updateAcademicSemester: (id, input, actor) => write(actor, input.reason, [patch('academic_semester', 'semester_id', id, input, semesterFields, semesterColumns)], semester),
    async getCurrentAcademicSemester() { return (await read(`SELECT ${semesterColumns} FROM public.academic_semester WHERE is_current`, [], semester))[0] ?? null; },
    setCurrentAcademicSemester: (input, actor) => write(actor, input.reason, [statement('SELECT public.db_set_current_semester($1::integer)', [input.semesterId]),
      statement(`SELECT ${semesterColumns} FROM public.academic_semester WHERE semester_id=$1 AND is_current`, [input.semesterId])], semester),
    listCoordinatorAssignments: filters => read(`SELECT ${assignmentColumns} FROM public.coordinator_assignment
      WHERE ($1::integer IS NULL OR access_assignment_id=$1) AND ($2::integer IS NULL OR programme_id=$2)
      AND ($3::integer IS NULL OR learning_centre_id=$3) ORDER BY assignment_id DESC`, [filters.accountId ?? null, filters.programmeId ?? null, filters.learningCentreId ?? null], assignment),
    createCoordinatorAssignment: (input, actor) => write(actor, input.reason, [statement(`INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
      VALUES ($1,$2,$3,$4) RETURNING ${assignmentColumns}`, [input.accountId, input.facultyId, input.programmeId, input.learningCentreId])], assignment),
    endCoordinatorAssignment: (id, input, actor) => write(actor, input.reason, [statement(`UPDATE public.coordinator_assignment SET ended_at=clock_timestamp() WHERE assignment_id=$1 RETURNING ${assignmentColumns}`, [id])], assignment),
    async currentSemesterId() { return (await read('SELECT semester_id AS id FROM public.academic_semester WHERE is_current', [], row => Number(row.id)))[0] ?? null; },
    listActiveLearningCentres: () => read(`SELECT ${centreColumns} FROM public.learning_centre WHERE is_active ORDER BY centre_code, learning_centre_id`, [], centre),
    listScopes: clerkUserId => read(scopeSelect + ' ORDER BY "facultyId", "programmeId", "learningCentreId"', [clerkUserId], scope),
    async isScopeAssigned(clerkUserId, programmeId, learningCentreId) { return (await read(scopeSelect + ' AND c.programme_id=$2 AND c.learning_centre_id=$3 LIMIT 1', [clerkUserId, programmeId, learningCentreId], scope)).length > 0; },
  };
}
