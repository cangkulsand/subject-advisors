import { fields, invalid, nonnegative, positiveId, text, P001Error } from '../profile/validation';
import type { CurriculumData, LinkInput, PrerequisiteSelection, SubjectInput } from './contracts';
export function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) invalid('Reload the curriculum before saving.');
  return value;
}
export function subjectInput(value: unknown, editing: boolean): SubjectInput {
  const b = fields(value, ['revision','existingSubjectId','code','name','credits','category','compulsory','semesterTypes','confirmSharedChanges','prerequisites']);
  const existingSubjectId = b.existingSubjectId == null ? null : positiveId(b.existingSubjectId, 'Existing subject');
  if (editing && existingSubjectId !== null) invalid('An existing mapping cannot be moved to another subject.');
  if (editing && b.prerequisites !== undefined) invalid('Initial prerequisites can only be selected when creating a subject.');
  let prerequisites: PrerequisiteSelection[] | undefined;
  if (!editing && b.prerequisites !== undefined) {
    if (!Array.isArray(b.prerequisites)) invalid('Prerequisites must be a list of curriculum subject selections.');
    prerequisites = b.prerequisites.map(entry => {
      const p = fields(entry, ['mappingId','code']);
      return { mappingId: positiveId(p.mappingId, 'Prerequisite subject'), code: text(p.code, 'Prerequisite subject code', 20, true)! };
    });
    if (new Set(prerequisites.map(p => p.mappingId)).size !== prerequisites.length) invalid('Remove duplicate prerequisite selections.');
  }
  if (typeof b.compulsory !== 'boolean') invalid('Specify whether the subject is compulsory.');
  if (!Array.isArray(b.semesterTypes) || !b.semesterTypes.length || b.semesterTypes.length > 2 ||
      b.semesterTypes.some(t => t !== 'NORMAL' && t !== 'SHORT') || new Set(b.semesterTypes).size !== b.semesterTypes.length) invalid('Select permitted semester types without duplicates.');
  if (editing && b.confirmSharedChanges !== true) invalid('Confirm that subject details are shared across curriculum versions.');
  return { revision: revision(b.revision), existingSubjectId,
    code: existingSubjectId ? '' : text(b.code, 'Subject code', 20, true)!,
    name: existingSubjectId ? '' : text(b.name, 'Subject name', 255, true)!,
    credits: existingSubjectId ? 0 : nonnegative(b.credits, 'Credit hours'),
    category: text(b.category, 'Classification', 50, true)!, compulsory: b.compulsory,
    semesterTypes: b.semesterTypes as SubjectInput['semesterTypes'], confirmSharedChanges: b.confirmSharedChanges === true, prerequisites };
}
/** Initial prerequisites must already be mapped subjects of this curriculum and match their canonical code. */
export function validatePrerequisites(data: CurriculumData, prerequisites: PrerequisiteSelection[]): void {
  const codes = new Map(data.subjects.map(s => [s.mappingId, s.code]));
  for (const p of prerequisites) if (codes.get(p.mappingId) !== p.code) invalid('Every prerequisite must be a subject in this curriculum. Reload and select it again.');
}
export function linkInput(value: unknown): LinkInput {
  const b = fields(value, ['revision','from','required','kind']);
  if (!['MANDATORY','COREQUISITE','RECOMMENDED'].includes(String(b.kind))) invalid('Select a supported relationship type.');
  const from = positiveId(b.from,'Dependent subject'), required = positiveId(b.required,'Required subject');
  if (from === required) invalid('A subject cannot depend on itself.');
  return { revision: revision(b.revision), from, required, kind: b.kind as LinkInput['kind'] };
}
export function validateDependency(data: CurriculumData, input: LinkInput, editingId: number | null = null): void {
  const ids = new Set(data.subjects.map(s => s.mappingId));
  if (!ids.has(input.from) || !ids.has(input.required)) invalid('Both subjects must belong to this curriculum.');
  if (editingId !== null && !data.links.some(l => l.id === editingId)) throw new P001Error(404,'LINK_NOT_FOUND','The relationship is unavailable.');
  const links = data.links.filter(l => l.id !== editingId);
  if (links.some(l => l.from === input.from && l.required === input.required && l.kind === input.kind)) throw new P001Error(409,'DUPLICATE_LINK','That relationship already exists.');
  if (input.kind !== 'MANDATORY') return;
  const pending = [input.required], visited = new Set<number>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === input.from) invalid('This mandatory prerequisite would create a cycle.');
    if (visited.has(id)) continue;
    visited.add(id);
    for (const link of links) if (link.from === id && link.kind === 'MANDATORY') pending.push(link.required);
  }
}
