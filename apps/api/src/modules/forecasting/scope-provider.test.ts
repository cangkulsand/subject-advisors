import { describe, expect, it, vi } from 'vitest';
import type { ProgrammeFaculty, LearningCentre } from '../../../../../packages/shared/src/admin/academic-setup';
import type { CoordinatorAssignment } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import { IMPORT_ALIASES } from '../../config/import-aliases';
import { createDbScopeProvider, viewAsScopeProvider, type ScopeSource } from './scope-provider';
import { testScopeProvider } from './scope-provider.test-support';

const programmes: ProgrammeFaculty[] = [
  { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Software Engineering', level: null, isActive: true, facultyId: 1, faculty: null, departmentId: null, department: null },
  { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Networks', level: null, isActive: true, facultyId: 1, faculty: null, departmentId: null, department: null },
];
const centres: LearningCentre[] = [
  { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur', isActive: true },
  { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru', isActive: true },
  { learningCentreId: 3, centreCode: 'OLD', centreName: 'Closed', isActive: false },
];

function source(assigned: CoordinatorAssignment[], current: number | null = 1) {
  const reader = {
    currentSemesterId: vi.fn(async () => current),
    listActiveLearningCentres: vi.fn(async () => centres),
    listScopes: vi.fn(async () => assigned),
    isScopeAssigned: vi.fn(async () => assigned.length > 0),
    listProgrammeFaculties: vi.fn(async () => programmes),
  } satisfies ScopeSource;
  return reader;
}

describe('DB scope provider', () => {
  it('maps live assignments to programme and centre options from the database rows', async () => {
    const reader = source([{ facultyId: 1, programmeId: 5, learningCentreId: 2 }, { facultyId: 1, programmeId: 7, learningCentreId: 1 }]);
    const scopes = await createDbScopeProvider(reader, async () => new Map()).listScopes('user_a');
    expect(reader.listScopes).toHaveBeenCalledWith('user_a');
    expect(scopes).toEqual([
      { programme: { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Software Engineering' }, centre: { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' } },
      { programme: { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Networks' }, centre: { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur' } },
    ]);
  });
  it('returns nothing, and reads nothing else, without assignments', async () => {
    const reader = source([]);
    expect(await createDbScopeProvider(reader, async () => new Map()).listScopes('user_a')).toEqual([]);
    expect(reader.listActiveLearningCentres).not.toHaveBeenCalled();
    expect(reader.listProgrammeFaculties).not.toHaveBeenCalled();
  });
  it('drops scopes whose centre is inactive or programme is unknown', async () => {
    const reader = source([{ facultyId: 1, programmeId: 5, learningCentreId: 3 }, { facultyId: 1, programmeId: 99, learningCentreId: 1 }]);
    expect(await createDbScopeProvider(reader, async () => new Map()).listScopes('user_a')).toEqual([]);
  });
  it('delegates assignment and current semester to the live reader on every call (no caching)', async () => {
    const reader = source([{ facultyId: 1, programmeId: 5, learningCentreId: 1 }], null);
    const provider = createDbScopeProvider(reader, async () => new Map());
    expect(await provider.currentSemesterId()).toBeNull();
    reader.currentSemesterId.mockResolvedValueOnce(2);
    expect(await provider.currentSemesterId()).toBe(2);
    expect(await provider.isScopeAssigned('user_a', 5, 1)).toBe(true);
    reader.isScopeAssigned.mockResolvedValueOnce(false);
    expect(await provider.isScopeAssigned('user_a', 5, 1)).toBe(false);
    expect(reader.isScopeAssigned).toHaveBeenCalledTimes(2);
  });
  it('studentLearningCentres reads the profile centres in one call and returns null when unset', async () => {
    const centresOf = vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, id === 123 ? 2 : null] as const)));
    const provider = createDbScopeProvider(source([]), centresOf);
    const centres = await provider.studentLearningCentres([123, 124]);
    expect(centres.get(123)).toBe(2);
    expect(centres.get(124)).toBeNull();
    expect(centresOf).toHaveBeenCalledTimes(1);
    expect(centresOf).toHaveBeenCalledWith([123, 124]);
  });
  it('keeps the import aliases', async () => {
    expect(await createDbScopeProvider(source([]), async () => new Map()).importAliases()).toBe(IMPORT_ALIASES);
  });
});

describe('View as Coordinator scope (S3-P004-033)', () => {
  const inactive: ProgrammeFaculty = { ...programmes[0]!, programmeId: 9, programmeCode: 'OLD', isActive: false };
  const noFaculty: ProgrammeFaculty = { ...programmes[0]!, programmeId: 11, programmeCode: 'NOFAC', facultyId: null };
  const reader = () => ({ ...source([]), listProgrammeFaculties: vi.fn(async () => [...programmes, inactive, noFaculty]) });
  it('finds an active programme with a faculty at an active centre', async () => {
    const provider = createDbScopeProvider(reader(), async () => new Map());
    expect(await provider.scopeFor!(5, 2)).toEqual({ programme: { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Software Engineering' }, centre: { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' } });
  });
  it.each([[9, 2, 'inactive programme'], [11, 2, 'programme without a faculty'], [5, 3, 'inactive centre'], [99, 2, 'unknown programme'], [5, 99, 'unknown centre']])('returns null for %i x %i (%s)', async (p, c) => {
    expect(await createDbScopeProvider(reader(), async () => new Map()).scopeFor!(p, c)).toBeNull();
  });
  it('pins listScopes and isScopeAssigned to the one chosen scope, whoever asks', async () => {
    const chosen = (await testScopeProvider.scopeFor!(5, 2))!;
    const provider = viewAsScopeProvider(testScopeProvider, chosen);
    expect(await provider.listScopes('user_admin')).toEqual([chosen]);
    expect(await provider.isScopeAssigned('user_admin', 5, 2)).toBe(true);
    expect(await provider.isScopeAssigned('user_admin', 5, 1)).toBe(false);
    expect(await provider.currentSemesterId()).toBe(1);
  });
  it('assigns nothing when the chosen scope does not exist', async () => {
    const provider = viewAsScopeProvider(testScopeProvider, null);
    expect(await provider.listScopes('user_admin')).toEqual([]);
    expect(await provider.isScopeAssigned('user_admin', 5, 2)).toBe(false);
  });
});
