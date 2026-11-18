import type { PlanningInput, ScenarioChange, ScenarioChangeKind } from './contracts';

/**
 * The student's saved what-if (S3-P004-010): one scenario per student in `simulation_scenario`, one row per subject in
 * `simulation_subject`, ordered by `simulation_subject_id`. Shared by the API (rows) and the browser (wire format).
 */
export interface SavedChange { kind: ScenarioChangeKind; curriculumSubjectId: number; semesterId?: number; replacementId?: number }
export interface SavedScenario { changes: SavedChange[]; savedAt: string }
export type ScenarioRowType = 'PLACE' | 'POSTPONE' | 'FAIL' | 'WITHDRAW' | 'REPLACE' | 'REPLACEMENT';
export interface ScenarioRow {
  curriculumSubjectId: number;
  changeType: ScenarioRowType;
  proposedSemesterId: number | null;
  hypotheticalStatus: 'FAILED' | 'WITHDRAWN' | null;
}

export const MAX_SAVED_CHANGES = 60;
const KINDS: readonly ScenarioChangeKind[] = ['POSTPONE', 'FAIL', 'WITHDRAW', 'REPLACE', 'PLACE'];
const STATUS = { FAIL: 'FAILED', WITHDRAW: 'WITHDRAWN' } as const;

/**
 * Changes -> rows. A swap is a REPLACE row for the original subject followed straight by a REPLACEMENT row for the
 * subject taken instead; a later move of that replacement is stored on its REPLACEMENT row (one row per subject).
 */
export function toRows(changes: SavedChange[]): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  for (const change of changes) {
    const replacementRow = rows.find(r => r.changeType === 'REPLACEMENT' && r.curriculumSubjectId === change.curriculumSubjectId);
    if (change.kind === 'PLACE' && replacementRow) { replacementRow.proposedSemesterId = change.semesterId ?? null; continue; }
    if (change.kind === 'REPLACE') {
      rows.push({ curriculumSubjectId: change.curriculumSubjectId, changeType: 'REPLACE', proposedSemesterId: null, hypotheticalStatus: null });
      rows.push({ curriculumSubjectId: change.replacementId!, changeType: 'REPLACEMENT', proposedSemesterId: null, hypotheticalStatus: null });
      continue;
    }
    rows.push({
      curriculumSubjectId: change.curriculumSubjectId, changeType: change.kind, proposedSemesterId: change.semesterId ?? null,
      hypotheticalStatus: change.kind === 'FAIL' || change.kind === 'WITHDRAW' ? STATUS[change.kind] : null,
    });
  }
  return rows;
}

/** Rows (in ID order) -> changes. A REPLACE without its REPLACEMENT row, or a stray REPLACEMENT, is dropped. */
export function fromRows(rows: ScenarioRow[]): SavedChange[] {
  const changes: SavedChange[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.changeType === 'REPLACEMENT') continue;
    if (row.changeType === 'REPLACE') {
      const next = rows[i + 1];
      if (next?.changeType !== 'REPLACEMENT') continue;
      changes.push({ kind: 'REPLACE', curriculumSubjectId: row.curriculumSubjectId, replacementId: next.curriculumSubjectId });
      if (next.proposedSemesterId !== null) changes.push({ kind: 'PLACE', curriculumSubjectId: next.curriculumSubjectId, semesterId: next.proposedSemesterId });
      i++;
      continue;
    }
    changes.push({ kind: row.changeType, curriculumSubjectId: row.curriculumSubjectId, ...(row.proposedSemesterId !== null ? { semesterId: row.proposedSemesterId } : {}) });
  }
  return changes;
}

/** Engine changes -> wire format; semesters become their configured `academic_semester` IDs. */
export function toSaved(input: Pick<PlanningInput, 'limits'>, changes: ScenarioChange[]): SavedChange[] {
  return changes.flatMap(change => {
    const saved: SavedChange = { kind: change.kind, curriculumSubjectId: change.curriculumSubjectId };
    if (change.replacementId !== undefined) saved.replacementId = change.replacementId;
    if (change.semester) {
      const row = input.limits.find(l => l.academicYear === change.semester!.academicYear && l.semesterNo === change.semester!.semesterNo);
      if (!row) return change.kind === 'PLACE' ? [] : [saved];
      saved.semesterId = row.semesterId;
    }
    return [saved];
  });
}

/** Wire format -> engine changes. An unknown semester ID becomes an empty semester, which `cleanChanges` drops. */
export function fromSaved(input: Pick<PlanningInput, 'limits'>, saved: SavedChange[]): ScenarioChange[] {
  return saved.map(item => {
    const change: ScenarioChange = { kind: item.kind, curriculumSubjectId: item.curriculumSubjectId };
    if (item.replacementId !== undefined) change.replacementId = item.replacementId;
    if (item.semesterId !== undefined) {
      const row = input.limits.find(l => l.semesterId === item.semesterId);
      change.semester = row ? { academicYear: row.academicYear, semesterNo: row.semesterNo } : { academicYear: '', semesterNo: 0 };
    }
    return change;
  });
}

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;

/** Shape check for `PUT /api/planning/scenario`; the API then checks the list against the student's plan. */
export function validateSavedBody(body: unknown): { ok: true; value: SavedChange[]; baselineVersion?: string } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'Request body must be an object.' };
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== 'changes' && key !== 'baselineVersion')) return { ok: false, error: 'Only "changes" may be sent.' };
  const baselineVersion = record.baselineVersion;
  if (baselineVersion !== undefined && (typeof baselineVersion !== 'string' || !/^[0-9a-f]{64}$/.test(baselineVersion))) return { ok: false, error: 'Invalid baseline version.' };
  const list = record.changes;
  if (!Array.isArray(list) || list.length > MAX_SAVED_CHANGES) return { ok: false, error: `Send up to ${MAX_SAVED_CHANGES} changes.` };
  const value: SavedChange[] = [];
  const seen = new Set<number>();
  const replacements = new Set<number>();
  for (const item of list) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { ok: false, error: 'Each change must be an object.' };
    const c = item as Record<string, unknown>;
    if (Object.keys(c).some(key => !['kind', 'curriculumSubjectId', 'semesterId', 'replacementId'].includes(key))) return { ok: false, error: 'Unknown change field.' };
    const kind = c.kind as ScenarioChangeKind;
    if (!KINDS.includes(kind) || !isId(c.curriculumSubjectId)) return { ok: false, error: 'Invalid change.' };
    const semesterAllowed = kind === 'PLACE' || kind === 'FAIL' || kind === 'WITHDRAW';
    if (c.semesterId !== undefined && (!semesterAllowed || !isId(c.semesterId))) return { ok: false, error: 'Invalid semester.' };
    if (kind === 'PLACE' && c.semesterId === undefined) return { ok: false, error: 'A move needs a semester.' };
    if (c.replacementId !== undefined && (kind !== 'REPLACE' || !isId(c.replacementId))) return { ok: false, error: 'Invalid replacement.' };
    if (kind === 'REPLACE' && c.replacementId === undefined) return { ok: false, error: 'A swap needs a replacement.' };
    const id = c.curriculumSubjectId;
    const movingReplacement = kind === 'PLACE' && replacements.has(id);
    if (movingReplacement) replacements.delete(id);
    else if (seen.has(id)) return { ok: false, error: 'Each subject can have one change.' };
    seen.add(id);
    if (kind === 'REPLACE') {
      const replacement = c.replacementId as number;
      if (seen.has(replacement) || replacement === id) return { ok: false, error: 'Each subject can have one change.' };
      seen.add(replacement); replacements.add(replacement);
    }
    value.push({ kind, curriculumSubjectId: id, ...(c.semesterId !== undefined ? { semesterId: c.semesterId as number } : {}),
      ...(c.replacementId !== undefined ? { replacementId: c.replacementId as number } : {}) });
  }
  return { ok: true, value, ...(baselineVersion !== undefined ? { baselineVersion } : {}) };
}
