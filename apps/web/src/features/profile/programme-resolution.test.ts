import { describe, expect, it } from 'vitest';
import { resolveProgrammeCurriculum } from './programme-resolution';
import type { CurriculumOption } from '../../../../api/src/modules/profile/contracts';

const curricula: CurriculumOption[] = [
  { curriculumId: 10, curriculumVersion: 'A', programmeId: 1, programmeCode: 'P1', programmeName: 'Programme 1' },
  { curriculumId: 11, curriculumVersion: 'B', programmeId: 1, programmeCode: 'P1', programmeName: 'Programme 1' },
  { curriculumId: 20, curriculumVersion: 'A', programmeId: 2, programmeCode: 'P2', programmeName: 'Programme 2' },
];

describe('resolveProgrammeCurriculum', () => {
  it('resolves a programme with one active curriculum', () => {
    expect(resolveProgrammeCurriculum(curricula, '2')).toBe(20);
  });
  it('retains the saved curriculum when it remains valid for the programme', () => {
    expect(resolveProgrammeCurriculum(curricula, '1', 11)).toBe(11);
  });
  it('does not guess when a new programme selection has multiple curricula', () => {
    expect(resolveProgrammeCurriculum(curricula, '1')).toBeNull();
  });
  it('does not retain a saved curriculum from a different programme', () => {
    expect(resolveProgrammeCurriculum(curricula, '2', 10)).toBe(20);
  });
});
