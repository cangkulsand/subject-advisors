import { describe, expect, it } from 'vitest';
import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringPrerequisiteDisplay } from './prerequisites';

const subject = (id: string, code: string, name: string): OfferingSubject => ({ curriculumSubjectId: id, code, name, creditHours: 3 });

describe('offering prerequisite display model', () => {
  it('groups relationship types in a stable order and sorts each by full-catalogue code then ID', () => {
    const targetA = subject('12', 'DEMO20', 'Fictional second');
    const targetB = subject('11', 'DEMO3', 'Fictional first');
    const source = { ...subject('10', 'DEMO1', 'Fictional source'), prerequisites: { status: 'available' as const, items: [
      { requiredCurriculumSubjectId: '12', requirementType: 'RECOMMENDED' as const },
      { requiredCurriculumSubjectId: '12', requirementType: 'MANDATORY' as const },
      { requiredCurriculumSubjectId: '11', requirementType: 'MANDATORY' as const },
      { requiredCurriculumSubjectId: '11', requirementType: 'COREQUISITE' as const },
    ] } };
    expect(offeringPrerequisiteDisplay(source, [source, targetA, targetB]).groups.map(group => [group.label, group.subjects.map(value => value.code)])).toEqual([
      ['Prerequisites', ['DEMO3', 'DEMO20']], ['Corequisites', ['DEMO3']], ['Recommended preparation', ['DEMO20']],
    ]);
  });
  it('keeps unavailable distinct from available with no configured edges', () => {
    expect(offeringPrerequisiteDisplay(subject('1', 'FIX1', 'Fictional'), []).status).toBe('unavailable');
    expect(offeringPrerequisiteDisplay({ ...subject('1', 'FIX1', 'Fictional'), prerequisites: { status: 'available', items: [] } }, []).groups).toEqual([]);
  });
});
