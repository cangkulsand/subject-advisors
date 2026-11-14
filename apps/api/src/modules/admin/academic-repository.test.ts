import { describe, expect, it, vi } from 'vitest';
import { createAcademicSetupRepository } from './academic-repository';
import { AcademicSetupDomainError, mapAcademicDatabaseError } from './academic-errors';
import type { AdminStatement } from './repository';

describe('academic SQL boundary', () => {
  it.each([
    ['23505', 'coordinator_assignment_one_live_scope_idx', 'ASSIGNMENT_ACTIVE'],
    ['23505', 'faculty_faculty_code_key', 'CONFLICT'], ['23503', '', 'NOT_FOUND'],
    ['23514', '', 'INVALID_REQUEST'], ['23502', '', 'INVALID_REQUEST'],
    ['22001', '', 'INVALID_REQUEST'], ['22003', '', 'INVALID_REQUEST'],
    ['22007', '', 'INVALID_REQUEST'], ['22008', '', 'INVALID_REQUEST'], ['22P02', '', 'INVALID_REQUEST'],
    ['40001', '', 'CONFLICT'], ['40P01', '', 'CONFLICT'], ['08006', '', 'DEPENDENCY_UNAVAILABLE'],
  ])('sanitizes SQLSTATE %s / %s', (code, constraint, expected) => {
    const result = mapAcademicDatabaseError({ code, constraint, message: 'private driver SQL and credentials' });
    expect(result.code).toBe(expected);
    expect(result.message).not.toContain('private');
    expect(result).not.toHaveProperty('cause');
  });
  it.each(['INVALID_REQUEST', 'NOT_FOUND', 'ACCOUNT_INACTIVE', 'REFERENCE_INACTIVE', 'COORDINATOR_ROLE_REQUIRED', 'PROGRAMME_FACULTY_MISMATCH', 'ASSIGNMENT_ACTIVE', 'ASSIGNMENT_ENDED', 'DEPARTMENT_HAS_PROGRAMMES'])('maps only exact database domain marker %s', code => {
    expect(mapAcademicDatabaseError({ code: '23514', message: 'ACADEMIC_SETUP:' + code }).code).toBe(code);
    expect(mapAcademicDatabaseError({ code: '08006', message: 'ACADEMIC_SETUP:' + code }).code).toBe('DEPENDENCY_UNAVAILABLE');
  });
  it('preserves domain errors and sanitizes arbitrary thrown values and read failures', async () => {
    const domain = new AcademicSetupDomainError('NOT_FOUND');
    expect(mapAcademicDatabaseError(domain)).toBe(domain);
    expect(mapAcademicDatabaseError('secret').code).toBe('DEPENDENCY_UNAVAILABLE');
    const repository = createAcademicSetupRepository(async () => { throw new Error('secret database URL'); }, vi.fn());
    await expect(repository.listAcademicSemesters()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    await expect(repository.listScopes('user_actor')).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('binds untrusted strings, normalizes reason, and limits PATCH to supplied whitelisted fields', async () => {
    const transaction = vi.fn<(statements: AdminStatement[]) => Promise<Record<string, unknown>[][]>>().mockResolvedValue([[], [{ semesterId: 1, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL', maxSubjects: 0, maxCredits: 12, startDate: null, endDate: null, isCurrent: false }]]);
    const query = vi.fn();
    const repository = createAcademicSetupRepository(query, transaction);
    await repository.updateAcademicSemester(1, { maxSubjects: 0, startDate: null, reason: '  Correct limits  ', isCurrent: true, access_actor: 'user_spoof' } as never, 'user_verified');
    const [context, update] = transaction.mock.calls[0]![0];
    expect(context).toEqual({ text: "SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", values: ['user_verified', 'Correct limits'] });
    expect(update!.text.split(' RETURNING ')[0]).toBe('UPDATE public.academic_semester SET max_subjects=$2, start_date=$3 WHERE semester_id=$1');
    expect(update!.values).toEqual([1, 0, null]);
    expect(query).not.toHaveBeenCalled();
    expect(() => repository.updateAcademicSemester(1, { reason: 'Only unknown', isCurrent: true } as never, 'user_verified')).toThrow(new AcademicSetupDomainError('INVALID_REQUEST'));
    const bad = "'); DROP TABLE public.faculty; --";
    await repository.createFaculty({ facultyCode: bad, facultyName: bad, reason: 'Reviewed' }, 'user_verified');
    expect(transaction.mock.calls[1]![0][1]!.text).not.toContain(bad);
    expect(transaction.mock.calls[1]![0][1]!.values).toEqual([bad, bad]);
  });
  it('derives the programme faculty from the department in one bound statement and binds department input', async () => {
    const row = { programmeId: 3, programmeCode: 'P', programmeName: 'Prog', facultyId: 2, facultyCode: 'F', facultyName: 'Fac', isActive: true, departmentId: 5, departmentCode: 'D', departmentName: 'Dept', departmentFacultyId: 2, departmentIsActive: true };
    const transaction = vi.fn<(statements: AdminStatement[]) => Promise<Record<string, unknown>[][]>>().mockResolvedValue([[], [{ programme_id: 3 }], [row]]);
    const repository = createAcademicSetupRepository(vi.fn(), transaction);
    const result = await repository.setProgrammeDepartment(3, { departmentId: 5, reason: 'Assign' }, 'user_verified');
    expect(result).toMatchObject({ programmeId: 3, facultyId: 2, departmentId: 5, department: { departmentId: 5, facultyId: 2, departmentName: 'Dept' } });
    const [, update, readback] = transaction.mock.calls[0]![0];
    expect(update!.text).toContain('department_id=$2::integer');
    expect(update!.text).toContain('SELECT d.faculty_id FROM public.department d');
    expect(update!.values).toEqual([3, 5]);
    expect(readback!.text).toContain('LEFT JOIN public.department d');
    const bad = "'); DROP TABLE public.department; --";
    await repository.createDepartment({ departmentCode: bad, departmentName: bad, facultyId: 2, reason: 'Reviewed' }, 'user_verified');
    expect(transaction.mock.calls[1]![0][1]!.text).not.toContain(bad);
    expect(transaction.mock.calls[1]![0][1]!.values).toEqual([bad, bad, 2]);
    await repository.updateDepartment(5, { facultyId: 4, isActive: false, reason: 'Move' }, 'user_verified');
    expect(transaction.mock.calls[2]![0][1]!.text.split(' RETURNING ')[0]).toBe('UPDATE public.department SET faculty_id=$2, is_active=$3 WHERE department_id=$1');
  });
  it('maps the department move guard marker and unique department code', () => {
    expect(mapAcademicDatabaseError({ code: '23514', message: 'ACADEMIC_SETUP:DEPARTMENT_HAS_PROGRAMMES' })).toMatchObject({ code: 'DEPARTMENT_HAS_PROGRAMMES', status: 409 });
    expect(mapAcademicDatabaseError({ code: '23505', constraint: 'department_department_code_key' }).code).toBe('CONFLICT');
  });
  it('submits the void current setter and readback in the same transaction after context', async () => {
    const transaction = vi.fn<(statements: AdminStatement[]) => Promise<Record<string, unknown>[][]>>().mockResolvedValue([[], [{ db_set_current_semester: null }], [{ semesterId: 4, academicYear: '2026/2027', semesterNo: 2, semesterType: 'NORMAL', maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, isCurrent: true }]]);
    const query = vi.fn();
    const repository = createAcademicSetupRepository(query, transaction);
    expect(await repository.setCurrentAcademicSemester({ semesterId: 4, reason: 'Switch' }, 'user_verified')).toMatchObject({ semesterId: 4, isCurrent: true });
    expect(transaction.mock.calls[0]![0]).toHaveLength(3);
    expect(transaction.mock.calls[0]![0][1]).toEqual({ text: 'SELECT public.db_set_current_semester($1::integer)', values: [4] });
    expect(query).not.toHaveBeenCalled();
  });
});
