import type { Curriculum, Department, Faculty, LearningCentre, ProgrammeFaculty } from '../../../../../packages/shared/src/admin/academic-setup';
import { AdminApiError } from './client';
import { errorText } from './AdminUserManagement';

/** Academic Structure (S3-P004-038): Faculty → Department → Programme → Curriculum, one address per level. */
export type StructureAddress =
  | { level: 'faculties' }
  | { level: 'faculty'; facultyId: number }
  | { level: 'department'; facultyId: number; departmentId: number }
  | { level: 'programme'; facultyId: number; departmentId: number; programmeId: number };
export type StructureData = { faculties: Faculty[]; departments: Department[]; programmes: ProgrammeFaculty[]; curricula: Curriculum[] };
export type ResolvedStructure =
  | { level: 'faculties' }
  | { level: 'faculty'; faculty: Faculty; departments: Department[] }
  | { level: 'department'; faculty: Faculty; department: Department; programmes: ProgrammeFaculty[] }
  | { level: 'programme'; faculty: Faculty; department: Department; programme: ProgrammeFaculty; curricula: Curriculum[] }
  | { level: 'missing' };

const ROOT = '/admin/faculties';
const MAX_ID = 2147483647;
function id(segment: string | undefined): number | null {
  if (!segment || !/^[1-9]\d*$/.test(segment)) return null;
  const value = Number(segment);
  return value <= MAX_ID ? value : null;
}

/** null when the path is not an Academic Structure address. */
export function parseStructurePath(pathname: string): StructureAddress | null {
  const trimmed = pathname.replace(/\/$/, '');
  if (trimmed === ROOT) return { level: 'faculties' };
  if (!trimmed.startsWith(ROOT + '/')) return null;
  const parts = trimmed.slice(ROOT.length + 1).split('/');
  const facultyId = id(parts[0]);
  if (facultyId === null) return null;
  if (parts.length === 1) return { level: 'faculty', facultyId };
  if (parts[1] !== 'departments') return null;
  const departmentId = id(parts[2]);
  if (departmentId === null) return null;
  if (parts.length === 3) return { level: 'department', facultyId, departmentId };
  if (parts[3] !== 'programmes' || parts.length !== 5) return null;
  const programmeId = id(parts[4]);
  return programmeId === null ? null : { level: 'programme', facultyId, departmentId, programmeId };
}

export function structurePath(address: StructureAddress): string {
  if (address.level === 'faculties') return ROOT;
  const faculty = `${ROOT}/${address.facultyId}`;
  if (address.level === 'faculty') return faculty;
  const department = `${faculty}/departments/${address.departmentId}`;
  return address.level === 'department' ? department : `${department}/programmes/${address.programmeId}`;
}

/** A child under a different parent than the address names is missing, never shown under the wrong parent. */
export function resolveStructure(address: StructureAddress, data: StructureData): ResolvedStructure {
  if (address.level === 'faculties') return { level: 'faculties' };
  const faculty = data.faculties.find(f => f.facultyId === address.facultyId);
  if (!faculty) return { level: 'missing' };
  if (address.level === 'faculty') return { level: 'faculty', faculty, departments: data.departments.filter(d => d.facultyId === faculty.facultyId) };
  const department = data.departments.find(d => d.departmentId === address.departmentId && d.facultyId === faculty.facultyId);
  if (!department) return { level: 'missing' };
  if (address.level === 'department') return { level: 'department', faculty, department, programmes: data.programmes.filter(p => p.departmentId === department.departmentId) };
  const programme = data.programmes.find(p => p.programmeId === address.programmeId && p.departmentId === department.departmentId);
  if (!programme) return { level: 'missing' };
  return { level: 'programme', faculty, department, programme, curricula: data.curricula.filter(c => c.programmeId === programme.programmeId) };
}

export function departmentCount(facultyId: number, data: StructureData): number { return data.departments.filter(d => d.facultyId === facultyId).length; }
export function programmeCount(departmentId: number, data: StructureData): number { return data.programmes.filter(p => p.departmentId === departmentId).length; }
export function curriculumCount(programmeId: number, data: StructureData): number { return data.curricula.filter(c => c.programmeId === programmeId).length; }
/** Programmes with no department cannot be reached through the hierarchy; the Faculties page lists them. */
export function orphanProgrammes(data: StructureData): ProgrammeFaculty[] { return data.programmes.filter(p => p.departmentId === null); }
export function countLabel(count: number, one: string, many: string): string { return count === 0 ? 'No ' + many : count === 1 ? '1 ' + one : count + ' ' + many; }

export type CodeOwner = { name: string; isActive: boolean };
type CodeRows = { faculties?: Faculty[]; departments?: Department[]; programmes?: ProgrammeFaculty[]; centres?: LearningCentre[] };
/** Codes are unique per table and case-sensitive in the database, so the match is exact after trimming. */
export function findCodeOwner(kind: 'faculty' | 'department' | 'programme' | 'centre', code: string, rows: CodeRows, exceptId?: number): CodeOwner | null {
  const wanted = code.trim();
  const candidates: { id: number; code: string; name: string; isActive: boolean }[] =
    kind === 'faculty' ? (rows.faculties ?? []).map(f => ({ id: f.facultyId, code: f.facultyCode, name: f.facultyName, isActive: f.isActive }))
    : kind === 'department' ? (rows.departments ?? []).map(d => ({ id: d.departmentId, code: d.departmentCode, name: d.departmentName, isActive: d.isActive }))
    : kind === 'programme' ? (rows.programmes ?? []).map(p => ({ id: p.programmeId, code: p.programmeCode, name: p.programmeName, isActive: p.isActive }))
    : (rows.centres ?? []).map(c => ({ id: c.learningCentreId, code: c.centreCode, name: c.centreName, isActive: c.isActive }));
  const owner = candidates.find(c => c.code === wanted && c.id !== exceptId);
  return owner ? { name: owner.name, isActive: owner.isActive } : null;
}
export function duplicateCodeMessage(code: string, owner: CodeOwner): string {
  return `${code} is already used by ${owner.name}${owner.isActive ? '' : ' (inactive)'}. Choose a different code.`;
}
export function curriculumVersionTaken(programmeId: number, version: string, curricula: Curriculum[], exceptId?: number): boolean {
  const wanted = version.trim();
  return curricula.some(c => c.programmeId === programmeId && c.curriculumVersion === wanted && c.curriculumId !== exceptId);
}

/** Moving a programme to another faculty is blocked while it has a live coordinator assignment; say so plainly. */
export function moveErrorText(error: unknown, programmeCode: string): string {
  if (error instanceof AdminApiError && error.code === 'ASSIGNMENT_ACTIVE')
    return `${programmeCode} has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty.`;
  return errorText(error);
}
