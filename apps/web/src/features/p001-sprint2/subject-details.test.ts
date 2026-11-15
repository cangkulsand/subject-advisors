import { describe, expect, it } from 'vitest';
import type { Progress, ProgressSubject } from '../../../../api/src/modules/p001-sprint2/contracts';
import { approvedSubjectIdsFrom, describeSubject } from './subject-details';

const make = (id: number, outcome: ProgressSubject['outcome'], extra: Partial<ProgressSubject> = {}): ProgressSubject => ({
  mappingId: id, subjectId: id + 100, code: 'DEMO' + id, name: 'Fictional ' + id, credits: 3, category: 'CORE', compulsory: true,
  semesterTypes: ['NORMAL', 'SHORT'], outcome, earnedCredits: outcome === 'REMAINING' ? 0 : 3, ...extra,
});
const subjects: [ProgressSubject, ProgressSubject, ProgressSubject, ProgressSubject] = [make(1, 'COMPLETED'), make(2, 'REMAINING'), make(3, 'EXEMPTED'), make(4, 'REMAINING', { semesterTypes: ['SHORT'] })];
const progress = (links: Progress['links']): Pick<Progress, 'subjects' | 'links'> => ({ subjects, links });

describe('describeSubject', () => {
  it('marks a mandatory link to a completed or exempted subject as Met', () => {
    const view = describeSubject(subjects[3], progress([{ id: 1, from: 4, required: 1, kind: 'MANDATORY' }, { id: 2, from: 4, required: 3, kind: 'MANDATORY' }]), null);
    expect(view.prerequisites.map(item => item.met)).toEqual([true, true]);
    expect(view.noMandatory).toBe(false);
  });
  it('marks a mandatory link to a remaining subject as Not met', () => {
    const view = describeSubject(subjects[0], progress([{ id: 1, from: 1, required: 2, kind: 'MANDATORY' }]), null);
    expect(view.prerequisites[0]).toMatchObject({ code: 'DEMO2', met: false, outcomeLabel: 'Remaining' });
  });
  it('lists co-requisite and recommended links with labels and flags advice only', () => {
    const view = describeSubject(subjects[3], progress([{ id: 1, from: 4, required: 2, kind: 'RECOMMENDED' }, { id: 2, from: 4, required: 1, kind: 'COREQUISITE' }]), null);
    expect(view.prerequisites.map(item => [item.kindLabel, item.adviceOnly])).toEqual([['Co-requisite', false], ['Recommended', true]]);
    expect(view.noMandatory).toBe(true);
  });
  it('reports no mandatory prerequisite when there are no links', () => {
    const view = describeSubject(subjects[0], progress([]), null);
    expect(view.prerequisites).toEqual([]);
    expect(view.noMandatory).toBe(true);
  });
  it('lists the subjects that require this one under Unlocks', () => {
    const view = describeSubject(subjects[0], progress([{ id: 1, from: 2, required: 1, kind: 'MANDATORY' }, { id: 2, from: 4, required: 1, kind: 'RECOMMENDED' }]), null);
    expect(view.unlocks.map(item => item.code)).toEqual(['DEMO2', 'DEMO4']);
  });
  it('explains a Short-semester-only subject', () => {
    expect(describeSubject(subjects[3], progress([]), null).semesterNote).toBe('Offered in Short semester (Semester 3) only');
    expect(describeSubject(subjects[0], progress([]), null).semesterNote).toBeNull();
  });
  it('reports approval only when the subject id is in the approved set', () => {
    expect(describeSubject(subjects[1], progress([]), new Set([102])).nextSemester).toBe('Approved for next semester');
    expect(describeSubject(subjects[1], progress([]), new Set([999])).nextSemester).toBe('Availability not confirmed');
    expect(describeSubject(subjects[1], progress([]), null).nextSemester).toBe('Availability not confirmed');
  });
});

describe('approvedSubjectIdsFrom', () => {
  it('reads string subject ids as numbers and rejects missing lists', () => {
    expect(approvedSubjectIdsFrom({ subjects: [{ subjectId: '102' }, { code: 'x' }] })).toEqual(new Set([102]));
    expect(approvedSubjectIdsFrom({ window: { status: 'NOT_OPEN' } })).toBeNull();
    expect(approvedSubjectIdsFrom(null)).toBeNull();
  });
});
