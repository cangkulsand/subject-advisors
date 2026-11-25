import { describe, expect, it } from 'vitest';
import { curriculumOptionText, intakeYears, resolveIntakeCurriculum, savedIntakeSummary } from './programme-resolution';
import type { CurriculumOption } from '../../../../api/src/modules/profile/contracts';

const option = (curriculumId: number, programmeId: number, curriculumVersion: string, effectiveYear: number | null, totalCreditRequired = 131): CurriculumOption =>
  ({ curriculumId, curriculumVersion, programmeId, programmeCode: 'P' + programmeId, programmeName: 'Programme ' + programmeId, effectiveYear, totalCreditRequired });
const curricula: CurriculumOption[] = [
  option(3, 1, 'V1', 2022), option(8, 1, 'V2', 2026, 120),
  option(10, 2, 'A', 2020), option(11, 2, 'B', 2020, 128),
  option(20, 3, 'Only', 2025),
];

describe('resolveIntakeCurriculum', () => {
  it('waits until both the programme and the intake year are chosen', () => {
    expect(resolveIntakeCurriculum(curricula, '', '2022', '')).toEqual({ kind: 'pending' });
    expect(resolveIntakeCurriculum(curricula, '1', '', '')).toEqual({ kind: 'pending' });
  });
  it('picks the latest curriculum effective by the intake year', () => {
    expect(resolveIntakeCurriculum(curricula, '1', '2024', '')).toEqual({ kind: 'single', curriculum: curricula[0] });
    expect(resolveIntakeCurriculum(curricula, '1', '2026', '')).toEqual({ kind: 'single', curriculum: curricula[1] });
  });
  it('ignores a manual choice when one curriculum wins', () => {
    expect(resolveIntakeCurriculum(curricula, '1', '2026', '3')).toEqual({ kind: 'single', curriculum: curricula[1] });
  });
  it('a single offered curriculum is the answer even before its effective year', () => {
    expect(resolveIntakeCurriculum(curricula, '3', '2020', '')).toEqual({ kind: 'single', curriculum: curricula[4] });
  });
  it('a tie asks the student to choose and keeps only a choice from the tie', () => {
    expect(resolveIntakeCurriculum(curricula, '2', '2023', '')).toEqual({ kind: 'choose', options: [curricula[2], curricula[3]], selected: null });
    expect(resolveIntakeCurriculum(curricula, '2', '2023', '11')).toEqual({ kind: 'choose', options: [curricula[2], curricula[3]], selected: curricula[3] });
    expect(resolveIntakeCurriculum(curricula, '2', '2023', '3')).toEqual({ kind: 'choose', options: [curricula[2], curricula[3]], selected: null });
  });
  it('no curriculum effective by the intake year offers all of the programme', () => {
    expect(resolveIntakeCurriculum(curricula, '1', '2020', '')).toEqual({ kind: 'choose', options: [curricula[0], curricula[1]], selected: null });
  });
});

describe('profile intake text', () => {
  it('labels a curriculum with its effective year and credits', () => {
    expect(curriculumOptionText(curricula[0]!)).toBe('V1 (from 2022) · 131 credits');
    expect(curriculumOptionText(option(5, 9, 'X', null, 100))).toBe('X · 100 credits');
  });
  it('lists intake years newest first across the allowed range', () => {
    const years = intakeYears(new Date('2026-06-01T00:00:00Z'));
    expect(years[0]).toBe(2026); expect(years.at(-1)).toBe(2014); expect(years).toHaveLength(13);
  });
  it('summarises a saved profile, falling back to the saved version when the curriculum is no longer offered', () => {
    expect(savedIntakeSummary({ intakeYear: 2022, curriculumId: 3, curriculumVersion: 'V1', totalCreditRequired: 131 }, curricula)).toBe('Intake 2022 · Curriculum V1 (from 2022) · 131 credits');
    expect(savedIntakeSummary({ intakeYear: null, curriculumId: 3, curriculumVersion: 'V1', totalCreditRequired: 131 }, curricula)).toBe('Intake year: not set · Curriculum V1 (from 2022) · 131 credits');
    expect(savedIntakeSummary({ intakeYear: 2019, curriculumId: 99, curriculumVersion: 'OLD', totalCreditRequired: 140 }, curricula)).toBe('Intake 2019 · Curriculum OLD · 140 credits');
    expect(savedIntakeSummary({ intakeYear: 2019, curriculumId: 99, curriculumVersion: 'OLD', totalCreditRequired: null }, curricula)).toBe('Intake 2019 · Curriculum OLD');
  });
});
