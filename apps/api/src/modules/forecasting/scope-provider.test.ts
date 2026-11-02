import { describe, expect, it, vi } from 'vitest';
import type { ProgrammeFaculty, LearningCentre } from '../../../../../packages/shared/src/admin/academic-setup';
import type { CoordinatorAssignment } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import { IMPORT_ALIASES } from '../../config/import-aliases';
import { createDbScopeProvider, DEFAULT_STUDENT_CENTRE_ID, type ScopeSource } from './scope-provider';

const programmes: ProgrammeFaculty[] = [
  { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Software Engineering', facultyId: 1, faculty: null },
  { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Networks', facultyId: 1, faculty: null },
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
    const scopes = await createDbScopeProvider(reader).listScopes('user_a');
    expect(reader.listScopes).toHaveBeenCalledWith('user_a');
    expect(scopes).toEqual([
      { programme: { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Software Engineering' }, centre: { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' } },
      { programme: { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Networks' }, centre: { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur' } },
    ]);
  });
  it('returns nothing, and reads nothing else, without assignments', async () => {
    const reader = source([]);
    expect(await createDbScopeProvider(reader).listScopes('user_a')).toEqual([]);
    expect(reader.listActiveLearningCentres).not.toHaveBeenCalled();
    expect(reader.listProgrammeFaculties).not.toHaveBeenCalled();
  });
  it('drops scopes whose centre is inactive or programme is unknown', async () => {
    const reader = source([{ facultyId: 1, programmeId: 5, learningCentreId: 3 }, { facultyId: 1, programmeId: 99, learningCentreId: 1 }]);
    expect(await createDbScopeProvider(reader).listScopes('user_a')).toEqual([]);
  });
  it('delegates assignment and current semester to the live reader on every call (no caching)', async () => {
    const reader = source([{ facultyId: 1, programmeId: 5, learningCentreId: 1 }], null);
    const provider = createDbScopeProvider(reader);
    expect(await provider.currentSemesterId()).toBeNull();
    reader.currentSemesterId.mockResolvedValueOnce(2);
    expect(await provider.currentSemesterId()).toBe(2);
    expect(await provider.isScopeAssigned('user_a', 5, 1)).toBe(true);
    reader.isScopeAssigned.mockResolvedValueOnce(false);
    expect(await provider.isScopeAssigned('user_a', 5, 1)).toBe(false);
    expect(reader.isScopeAssigned).toHaveBeenCalledTimes(2);
  });
  it('keeps the interim student centre and the import aliases', async () => {
    const provider = createDbScopeProvider(source([]));
    expect(await provider.studentLearningCentreId(123)).toBe(DEFAULT_STUDENT_CENTRE_ID);
    expect(await provider.importAliases()).toBe(IMPORT_ALIASES);
  });
});
