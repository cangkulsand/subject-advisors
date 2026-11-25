import { describe, expect, it } from 'vitest';
import type { Curriculum, Department, Faculty, LearningCentre, ProgrammeFaculty } from '../../../../../packages/shared/src/admin/academic-setup';
import { AdminApiError } from './client';
import {
  countLabel, curriculumCount, curriculumVersionTaken, departmentCount, duplicateCodeMessage, findCodeOwner, moveErrorText,
  orphanProgrammes, parseStructurePath, programmeCount, resolveStructure, structurePath, type StructureAddress, type StructureData,
} from './academic-structure';

const faculties: Faculty[] = [
  { facultyId: 1, facultyCode: 'FC', facultyName: 'Faculty of Computing', isActive: true },
  { facultyId: 2, facultyCode: 'OLD', facultyName: 'Old faculty', isActive: false },
];
const departments: Department[] = [
  { departmentId: 1, departmentCode: 'SECJ', departmentName: 'Software Engineering', facultyId: 1, isActive: true },
  { departmentId: 2, departmentCode: 'ECRH', departmentName: 'Computer Science', facultyId: 1, isActive: false },
  { departmentId: 3, departmentCode: 'X', departmentName: 'Other', facultyId: 2, isActive: true },
];
const programme = (programmeId: number, programmeCode: string, departmentId: number | null): ProgrammeFaculty => {
  const department = departments.find(d => d.departmentId === departmentId) ?? null;
  const faculty = faculties.find(f => f.facultyId === department?.facultyId) ?? null;
  return { programmeId, programmeCode, programmeName: programmeCode + ' name', level: null, isActive: true, facultyId: faculty?.facultyId ?? null, faculty, departmentId, department };
};
const programmes = [programme(1, 'SECJ', 1), programme(2, 'SECRH', 2), programme(3, 'LEG', null)];
const curriculum = (curriculumId: number, programmeId: number, curriculumVersion: string): Curriculum =>
  ({ curriculumId, programmeId, curriculumVersion, totalCreditRequired: 131, effectiveYear: 2022, isActive: true, subjectCount: 0, intakes: [] });
const curricula = [curriculum(10, 2, 'V1'), curriculum(11, 2, 'V2')];
const data: StructureData = { faculties, departments, programmes, curricula };
const centres: LearningCentre[] = [{ learningCentreId: 1, centreCode: 'JB', centreName: 'Johor Bahru', isActive: true }];

describe('structure addresses (S3-P004-038)', () => {
  it('parses each level and rejects anything else', () => {
    expect(parseStructurePath('/admin/faculties')).toEqual({ level: 'faculties' });
    expect(parseStructurePath('/admin/faculties/')).toEqual({ level: 'faculties' });
    expect(parseStructurePath('/admin/faculties/1')).toEqual({ level: 'faculty', facultyId: 1 });
    expect(parseStructurePath('/admin/faculties/1/departments/2')).toEqual({ level: 'department', facultyId: 1, departmentId: 2 });
    expect(parseStructurePath('/admin/faculties/1/departments/2/programmes/2')).toEqual({ level: 'programme', facultyId: 1, departmentId: 2, programmeId: 2 });
    for (const bad of ['/admin/faculties/x', '/admin/faculties/1/programmes/2', '/admin/faculties/0', '/admin/faculties/1/departments', '/admin/departments', '/admin/faculties/2147483648', '/admin/faculties/01'])
      expect(parseStructurePath(bad)).toBeNull();
  });
  it('builds the address of each level', () => {
    const addresses: StructureAddress[] = [{ level: 'faculties' }, { level: 'faculty', facultyId: 1 }, { level: 'department', facultyId: 1, departmentId: 2 }, { level: 'programme', facultyId: 1, departmentId: 2, programmeId: 2 }];
    for (const address of addresses) expect(parseStructurePath(structurePath(address))).toEqual(address);
    expect(structurePath({ level: 'programme', facultyId: 1, departmentId: 2, programmeId: 2 })).toBe('/admin/faculties/1/departments/2/programmes/2');
  });
});

describe('resolving a level shows only the parent\'s children', () => {
  it('lists children, inactive included', () => {
    const faculty = resolveStructure({ level: 'faculty', facultyId: 1 }, data);
    expect(faculty.level === 'faculty' && faculty.departments.map(d => d.departmentCode)).toEqual(['SECJ', 'ECRH']);
    const department = resolveStructure({ level: 'department', facultyId: 1, departmentId: 2 }, data);
    expect(department.level === 'department' && department.programmes.map(p => p.programmeCode)).toEqual(['SECRH']);
    const prog = resolveStructure({ level: 'programme', facultyId: 1, departmentId: 2, programmeId: 2 }, data);
    expect(prog.level === 'programme' && prog.curricula.map(c => c.curriculumId)).toEqual([10, 11]);
    expect(resolveStructure({ level: 'faculties' }, data)).toEqual({ level: 'faculties' });
  });
  it('a child under the wrong parent or an unknown id is missing', () => {
    expect(resolveStructure({ level: 'department', facultyId: 1, departmentId: 3 }, data)).toEqual({ level: 'missing' });
    expect(resolveStructure({ level: 'programme', facultyId: 1, departmentId: 1, programmeId: 2 }, data)).toEqual({ level: 'missing' });
    expect(resolveStructure({ level: 'programme', facultyId: 2, departmentId: 2, programmeId: 2 }, data)).toEqual({ level: 'missing' });
    expect(resolveStructure({ level: 'faculty', facultyId: 9 }, data)).toEqual({ level: 'missing' });
  });
  it('counts children and finds programmes with no department', () => {
    expect(departmentCount(1, data)).toBe(2);
    expect(programmeCount(1, data)).toBe(1);
    expect(curriculumCount(2, data)).toBe(2);
    expect(orphanProgrammes(data).map(p => p.programmeCode)).toEqual(['LEG']);
    expect(countLabel(0, 'programme', 'programmes')).toBe('No programmes');
    expect(countLabel(1, 'programme', 'programmes')).toBe('1 programme');
    expect(countLabel(2, 'programme', 'programmes')).toBe('2 programmes');
  });
});

describe('reused codes', () => {
  it('finds the owner by exact trimmed code, never the record itself', () => {
    expect(findCodeOwner('faculty', 'OLD', { faculties })).toEqual({ name: 'Old faculty', isActive: false });
    expect(findCodeOwner('faculty', 'old', { faculties })).toBeNull();
    expect(findCodeOwner('faculty', ' FC ', { faculties })).toEqual({ name: 'Faculty of Computing', isActive: true });
    expect(findCodeOwner('faculty', 'FC', { faculties }, 1)).toBeNull();
    expect(findCodeOwner('department', 'X', { departments })).toEqual({ name: 'Other', isActive: true });
    expect(findCodeOwner('programme', 'LEG', { programmes })).toEqual({ name: 'LEG name', isActive: true });
    expect(findCodeOwner('centre', 'JB', { centres })).toEqual({ name: 'Johor Bahru', isActive: true });
    expect(findCodeOwner('centre', 'KL', { centres })).toBeNull();
  });
  it('says who uses the code in plain words', () => {
    expect(duplicateCodeMessage('FC', { name: 'Faculty of Computing', isActive: false })).toBe('FC is already used by Faculty of Computing (inactive). Choose a different code.');
    expect(duplicateCodeMessage('FC', { name: 'Faculty of Computing', isActive: true })).toBe('FC is already used by Faculty of Computing. Choose a different code.');
  });
  it('a curriculum version is unique within its programme only', () => {
    expect(curriculumVersionTaken(2, 'V1', curricula)).toBe(true);
    expect(curriculumVersionTaken(2, ' V1 ', curricula)).toBe(true);
    expect(curriculumVersionTaken(2, 'V1', curricula, 10)).toBe(false);
    expect(curriculumVersionTaken(1, 'V1', curricula)).toBe(false);
  });
});

describe('move errors', () => {
  it('explains a coordinator assignment that blocks a move to another faculty', () => {
    expect(moveErrorText(new AdminApiError(409, 'ASSIGNMENT_ACTIVE', 'x'), 'SECJ')).toBe('SECJ has an active coordinator assignment. End it in Coordinator Assignments before moving the programme to another faculty.');
    expect(moveErrorText(new AdminApiError(409, 'REFERENCE_INACTIVE', 'The selected reference must be active.'), 'SECJ')).toBe('The selected reference must be active.');
    expect(moveErrorText(new Error('boom'), 'SECJ')).toBe('The change could not be completed. Please retry.');
  });
});
