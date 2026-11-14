import { describe, expect, it } from 'vitest';
import {
  isAcademicSetupId, validateCreateLearningCentreRequest, validateUpdateLearningCentreRequest,
  validateCreateFacultyRequest, validateSetProgrammeDepartmentRequest, validateCreateDepartmentRequest, validateUpdateDepartmentRequest, validateCreateSemesterRequest,
  validateUpdateSemesterRequest, validateMergedSemester, validateSetCurrentSemesterRequest,
  validateCreateCoordinatorAssignmentRequest, validateEndCoordinatorAssignmentRequest,
  validateCreateProgrammeRequest, validateUpdateProgrammeRequest, validateCreateCurriculumRequest, validateUpdateCurriculumRequest,
  type AcademicSemester,
} from './academic-setup';

const semester: AcademicSemester = {
  semesterId: 1, academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL',
  maxSubjects: 5, maxCredits: 20, startDate: '2026-10-01', endDate: '2027-02-01', isCurrent: false,
  selectionOpensAt: null, selectionClosesAt: null,
};
const createSemester = { academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL',
  maxSubjects: 5, maxCredits: 20, startDate: null, endDate: null, reason: ' calendar ' };
const assignment = { accountId: 2, facultyId: 3, programmeId: 4, learningCentreId: 5, reason: ' appointment ' };

describe('academic setup reference requests', () => {
  it('normalises centre fields and requires an explicit reason', () => {
    expect(validateCreateLearningCentreRequest({ centreCode: '  JB ', centreName: ' Johor Bahru ', reason: ' setup ' }))
      .toEqual({ ok: true, value: { centreCode: 'JB', centreName: 'Johor Bahru', reason: 'setup' } });
    expect(validateCreateLearningCentreRequest({ centreCode: 'JB', centreName: 'Johor Bahru', reason: ' ' }).ok).toBe(false);
  });
  it('rejects invalid lengths, unknown fields and empty updates', () => {
    expect(validateCreateLearningCentreRequest({ centreCode: 'x'.repeat(11), centreName: 'x', reason: 'r' }).ok).toBe(false);
    expect(validateCreateLearningCentreRequest({ centreCode: 'x', centreName: 'x'.repeat(101), reason: 'r' }).ok).toBe(false);
    expect(validateCreateFacultyRequest({ facultyCode: 'F', facultyName: 'Faculty', reason: 'r', surprise: true }).ok).toBe(false);
    expect(validateUpdateLearningCentreRequest({ reason: 'r' }).ok).toBe(false);
    expect(validateUpdateLearningCentreRequest({ isActive: 'false', reason: 'r' }).ok).toBe(false);
    expect(validateUpdateLearningCentreRequest({ isActive: false, reason: 'r' }).ok).toBe(true);
  });
  it('allows an explicit null department but rejects absent or invalid IDs', () => {
    expect(validateSetProgrammeDepartmentRequest({ departmentId: null, reason: ' clear ' }))
      .toEqual({ ok: true, value: { departmentId: null, reason: 'clear' } });
    for (const departmentId of [undefined, 0, -1, 1.5, 2147483648, '1']) {
      expect(validateSetProgrammeDepartmentRequest({ departmentId, reason: 'r' }).ok).toBe(false);
    }
    expect(validateSetProgrammeDepartmentRequest({ departmentId: 3, facultyId: 1, reason: 'r' }).ok).toBe(false);
  });
  it('validates department create and update requests', () => {
    expect(validateCreateDepartmentRequest({ departmentCode: ' CS ', departmentName: ' Computer Science ', facultyId: 2, reason: ' add ' }))
      .toEqual({ ok: true, value: { departmentCode: 'CS', departmentName: 'Computer Science', facultyId: 2, reason: 'add' } });
    for (const bad of [{ departmentCode: 'x'.repeat(21) }, { departmentName: 'x'.repeat(256) }, { departmentName: ' ' }, { facultyId: 0 }, { facultyId: null }, { surprise: true }, { isActive: false }]) {
      expect(validateCreateDepartmentRequest({ departmentCode: 'CS', departmentName: 'Name', facultyId: 1, reason: 'r', ...bad }).ok).toBe(false);
    }
    expect(validateCreateDepartmentRequest({ departmentCode: 'CS', departmentName: 'Name', reason: 'r' }).ok).toBe(false);
    expect(validateCreateDepartmentRequest({ departmentCode: 'CS', departmentName: 'Name', facultyId: 1 }).ok).toBe(false);
    expect(validateUpdateDepartmentRequest({ isActive: false, reason: 'r' })).toEqual({ ok: true, value: { isActive: false, reason: 'r' } });
    expect(validateUpdateDepartmentRequest({ facultyId: 4, reason: 'move' }).ok).toBe(true);
    expect(validateUpdateDepartmentRequest({ reason: 'r' }).ok).toBe(false);
    expect(validateUpdateDepartmentRequest({ isActive: 'no', reason: 'r' }).ok).toBe(false);
    expect(validateUpdateDepartmentRequest({ facultyId: 'x', reason: 'r' }).ok).toBe(false);
  });
});
describe('academic semester requests', () => {
  it('accepts exact baseline ranges and nullable dates', () => {
    expect(validateCreateSemesterRequest({ ...createSemester, maxSubjects: 0, maxCredits: 32767 }).ok).toBe(true);
    expect(validateCreateSemesterRequest(createSemester)).toEqual({ ok: true, value: { ...createSemester, reason: 'calendar' } });
  });
  it.each([
    { academicYear: '2026-2027' }, { semesterNo: 0 }, { semesterNo: 4 },
    { semesterNo: 3 }, { semesterType: 'SHORT' },
    { maxSubjects: -1 }, { maxSubjects: 32768 }, { maxCredits: 2.5 },
    { startDate: '2026-02-30' }, { startDate: '0000-01-01' }, { endDate: '2027-13-01' }, { startDate: '2026-1-01' },
    { startDate: '2027-02-02', endDate: '2027-02-01' }, { isCurrent: true },
  ])('rejects invalid create fields %j', patch => {
    expect(validateCreateSemesterRequest({ ...createSemester, ...patch }).ok).toBe(false);
  });
  it('checks merged PATCH invariants against the stored row', () => {
    const typePatch = validateUpdateSemesterRequest({ semesterNo: 3, reason: 'r' });
    expect(typePatch.ok).toBe(true);
    if (typePatch.ok) expect(validateMergedSemester(semester, typePatch.value).ok).toBe(false);
    const datePatch = validateUpdateSemesterRequest({ startDate: '2027-02-02', reason: 'r' });
    expect(datePatch.ok).toBe(true);
    if (datePatch.ok) expect(validateMergedSemester(semester, datePatch.value).ok).toBe(false);
    expect(validateUpdateSemesterRequest({ semesterNo: 3, semesterType: 'SHORT', reason: 'r' }).ok).toBe(true);
    expect(validateUpdateSemesterRequest({ reason: 'r' }).ok).toBe(false);
  });
  it('accepts ISO selection dates or null and rejects other values', () => {
    expect(validateCreateSemesterRequest({ ...createSemester, selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: null }).ok).toBe(true);
    expect(validateCreateSemesterRequest({ ...createSemester, selectionOpensAt: 'tomorrow', selectionClosesAt: null }).ok).toBe(false);
    expect(validateUpdateSemesterRequest({ selectionClosesAt: 5, reason: 'r' }).ok).toBe(false);
  });
  it('rejects selectionClosesAt without or before selectionOpensAt', () => {
    const reason = 'r';
    expect(validateMergedSemester(semester, { selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);
    expect(validateMergedSemester({ ...semester, selectionOpensAt: '2026-12-02T00:00:00.000Z' }, { selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);
    expect(validateMergedSemester({ ...semester, selectionOpensAt: '2026-12-01T00:00:00.000Z' }, { selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);
    expect(validateMergedSemester(semester, { selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(true);
    expect(validateUpdateSemesterRequest({ selectionOpensAt: '2026-12-02T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }).ok).toBe(false);
  });
});
describe('current semester and coordinator assignment requests', () => {
  it('requires an explicit current semester ID', () => {
    expect(validateSetCurrentSemesterRequest({ semesterId: 1, reason: ' select ' }))
      .toEqual({ ok: true, value: { semesterId: 1, reason: 'select' } });
    expect(validateSetCurrentSemesterRequest({ semesterId: null, reason: 'r' }).ok).toBe(false);
    expect(validateSetCurrentSemesterRequest({ semesterId: 1, reason: 'r', isCurrent: true }).ok).toBe(false);
  });
  it('rejects bad assignment IDs and accepts a valid appointment', () => {
    expect(validateCreateCoordinatorAssignmentRequest(assignment)).toEqual({
      ok: true, value: { ...assignment, reason: 'appointment' },
    });
    for (const field of ['accountId', 'facultyId', 'programmeId', 'learningCentreId']) {
      expect(validateCreateCoordinatorAssignmentRequest({ ...assignment, [field]: 0 }).ok).toBe(false);
    }
    expect(validateCreateCoordinatorAssignmentRequest({ ...assignment, endedAt: null }).ok).toBe(false);
    expect(validateEndCoordinatorAssignmentRequest({ reason: ' end ' }))
      .toEqual({ ok: true, value: { reason: 'end' } });
    expect(validateEndCoordinatorAssignmentRequest({ reason: '' }).ok).toBe(false);
    expect(isAcademicSetupId(2147483647)).toBe(true);
    expect(isAcademicSetupId(2147483648)).toBe(false);
  });
});
describe('programme and curriculum validators', () => {
  const prog = { programmeCode: 'SECX', programmeName: 'Fictional', level: null, departmentId: 1, reason: 'r' };
  const cur = { programmeId: 1, curriculumVersion: '2026', totalCreditRequired: 120, effectiveYear: null, reason: 'r' };
  it('trims and accepts a programme create request', () => {
    expect(validateCreateProgrammeRequest({ ...prog, programmeCode: ' SECX ' })).toEqual({ ok: true, value: prog });
  });
  it('rejects invalid programme create requests', () => {
    expect(validateCreateProgrammeRequest({ ...prog, programmeCode: 'x'.repeat(21) })).toEqual({ ok: false, error: 'Invalid programmeCode.' });
    const { departmentId: _d, ...noDept } = prog;
    expect(validateCreateProgrammeRequest(noDept)).toEqual({ ok: false, error: 'Invalid departmentId.' });
    expect(validateCreateProgrammeRequest({ ...prog, level: 'x'.repeat(51) })).toEqual({ ok: false, error: 'Invalid level.' });
    expect(validateCreateProgrammeRequest({ ...prog, status: 'ACTIVE' })).toEqual({ ok: false, error: 'Unknown field: status.' });
    expect(validateCreateProgrammeRequest({ ...prog, reason: ' ' }).ok).toBe(false);
  });
  it('validates programme updates', () => {
    expect(validateUpdateProgrammeRequest({ reason: 'r' })).toEqual({ ok: false, error: 'At least one change is required.' });
    expect(validateUpdateProgrammeRequest({ isActive: false, reason: 'r' }).ok).toBe(true);
    expect(validateUpdateProgrammeRequest({ level: '', reason: 'r' })).toEqual({ ok: true, value: { level: null, reason: 'r' } });
    expect(validateUpdateProgrammeRequest({ departmentId: 2, reason: 'r' }).ok).toBe(false);
  });
  it('validates curriculum create requests', () => {
    expect(validateCreateCurriculumRequest(cur)).toEqual({ ok: true, value: cur });
    for (const totalCreditRequired of [-1, 1001, 1.5]) {
      expect(validateCreateCurriculumRequest({ ...cur, totalCreditRequired })).toEqual({ ok: false, error: 'Invalid totalCreditRequired.' });
    }
    expect(validateCreateCurriculumRequest({ ...cur, effectiveYear: 1899 })).toEqual({ ok: false, error: 'Invalid effectiveYear.' });
    expect(validateCreateCurriculumRequest({ ...cur, effectiveYear: 2026 }).ok).toBe(true);
  });
  it('validates curriculum updates and fixes the programme', () => {
    expect(validateUpdateCurriculumRequest({ programmeId: 1, reason: 'r' })).toEqual({ ok: false, error: 'Unknown field: programmeId.' });
    expect(validateUpdateCurriculumRequest({ reason: 'r' }).ok).toBe(false);
    expect(validateUpdateCurriculumRequest({ isActive: false, effectiveYear: null, reason: 'r' }))
      .toEqual({ ok: true, value: { isActive: false, effectiveYear: null, reason: 'r' } });
  });
});
