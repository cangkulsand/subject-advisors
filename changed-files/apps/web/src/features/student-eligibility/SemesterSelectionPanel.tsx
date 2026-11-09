import { useEffect, useMemo, useRef, useState } from 'react';
import { registerUnsavedChanges } from '../../app/navigation';
import type { EligibilityResult } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import type { SemesterSelectionPageData } from '../../../../../packages/shared/src/forecasting/semester-selection-contracts';
import { StudentEligibilityApiError, type StudentSelectionClient } from './client';

const sameSet = (left: number[], right: number[]) => left.length === right.length && left.every(id => right.includes(id));
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

export function SemesterSelectionPanel({ client, onDirtyChange, refreshKey }: { client: StudentSelectionClient; onDirtyChange?: (dirty: boolean) => void; refreshKey?: number }) {
  const [data, setData] = useState<SemesterSelectionPageData | null>(null);
  const [draft, setDraft] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [issues, setIssues] = useState<Array<{ code: string; message: string; subjectId?: number }>>([]);
  const [attempt, setAttempt] = useState(0);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [stale, setStale] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const operation = useRef(0);
  const saveController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController(); let active = true; const current = ++operation.current;
    setLoading(true); setLoadError(null); setError(null); setSavedNotice('');
    client.load(controller.signal).then(value => { if (active && current === operation.current) { setData(value); setDraft([...value.plan.subjectIds]); setIssues(value.validation?.issues ?? []); setLoading(false); setStale(false); setDiscardConfirm(false); } }, reason => { if (active && current === operation.current) { setLoadError(reason); setLoading(false); } });
    return () => { active = false; controller.abort(); saveController.current?.abort(); };
  }, [client, attempt, refreshKey]);

  const saved = data?.plan.subjectIds ?? [];
  const dirty = !sameSet(draft, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const release = registerUnsavedChanges(() => dirty);
    window.addEventListener('beforeunload', warn);
    return () => { release(); window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  const rows = data?.eligibility.results ?? [];
  const allowed = useMemo(() => new Map(rows.filter((row): row is Extract<EligibilityResult, { status: 'ELIGIBLE' | 'CONDITIONAL' }> => row.status === 'ELIGIBLE' || row.status === 'CONDITIONAL').map(row => [row.subjectId, row])), [rows]);
  const chosen = draft.map(id => rows.find(row => row.subjectId === id)).filter((row): row is EligibilityResult => row !== undefined);
  const totalCredits = chosen.reduce((total, row) => total + row.creditHours, 0);
  const missingSavedIds = draft.filter(id => !rows.some(row => row.subjectId === id));
  const limits = data?.validation?.limits;
  const localIssues: Array<{ code: string; message: string; subjectId?: number }> = [];
  if (limits && draft.length > limits.maxSubjects) localIssues.push({ code: 'MAX_SUBJECTS_EXCEEDED', message: `Selection exceeds the configured maximum of ${limits.maxSubjects} subjects.` });
  if (limits && totalCredits > limits.maxCredits) localIssues.push({ code: 'MAX_CREDITS_EXCEEDED', message: `Selection exceeds the configured maximum of ${limits.maxCredits} credits.` });
  for (const id of draft) {
    const row = allowed.get(id);
    if (!row) localIssues.push({ code: 'SUBJECT_NOT_SELECTABLE', subjectId: id, message: 'A saved subject is no longer eligible in the current offering. Clear or revise the selection.' });
    if (row?.status === 'CONDITIONAL' && !row.requiredConcurrentSubjectIds.every(required => draft.includes(required))) localIssues.push({ code: 'MISSING_COREQUISITE', subjectId: id, message: `${row.subjectCode} must be selected with every required co-requisite.` });
  }
  const blocked = !data?.editingOpen || loading || saving;
  const saveBlocked = blocked || stale || loadError !== null || !dirty || localIssues.length > 0;
  const codes = new Map(rows.map(row => [row.subjectId, row.subjectCode]));

  function toggle(id: number) {
    if (blocked || !allowed.has(id)) return;
    setDraft(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setIssues([]); setError(null); setSavedNotice('');
  }
  function cancel() { setDraft([...saved]); setIssues(data?.validation?.issues ?? []); setError(null); setSavedNotice(''); setDiscardConfirm(false); }
  function reload() { if (dirty) setDiscardConfirm(true); else setAttempt(value => value + 1); }
  async function save() {
    if (saveBlocked || !data) return;
    const current = operation.current; const controller = new AbortController(); saveController.current = controller;
    setSaving(true); setError(null); setIssues([]); setSavedNotice('');
    try {
      const result = await client.save({ subjectIds: draft, sourceRevision: data.sourceRevision, planRevision: data.plan.revision }, controller.signal);
      if (current !== operation.current || controller.signal.aborted) return;
      setData(result); setDraft([...result.plan.subjectIds]); setIssues(result.validation?.issues ?? []); setSavedNotice('Selection saved.');
    } catch (reason) {
      if (current !== operation.current || controller.signal.aborted) return;
      setError(reason);
      if (reason instanceof StudentEligibilityApiError && reason.status === 409) setStale(true);
      if (reason instanceof StudentEligibilityApiError && reason.status === 422) setIssues(reason.issues ?? []);
    } finally { if (current === operation.current) setSaving(false); if (saveController.current === controller) saveController.current = null; }
  }
  const errorText = error instanceof StudentEligibilityApiError ? error.message : 'We could not reach semester selection services. Your draft and previous saved selection are still shown.';

  return <section className="student-eligibility-panel semester-selection" aria-busy={loading || saving} aria-labelledby="semester-selection-heading">
    <div className="semester-selection-heading"><div><h2 id="semester-selection-heading">Proposed semester selection</h2><p>This is a proposal for planning; it is not official registration.</p></div>
      {data && <span className={`student-eligibility-status ${data.editingOpen ? 'is-eligible' : 'is-uncertain'}`}>{data.editingOpen ? 'Picking open' : 'Picking closed'}</span>}</div>
    {loading && <p role="status">Loading your current selection and latest confirmed eligibility…</p>}
    {!loading && loadError !== null && <div className="semester-selection-error" role="alert"><p>{loadError instanceof StudentEligibilityApiError ? loadError.message : 'We could not load your selection. Please retry.'}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button></div>}
    {!loading && error !== null && <div className="semester-selection-error" role="alert"><p>{errorText}</p>{!stale && <button type="button" onClick={save} disabled={saving || !dirty || localIssues.length > 0}>Retry save</button>}</div>}
    {!loading && data && !(loadError instanceof StudentEligibilityApiError && [401, 403].includes(loadError.status)) && <>
      {stale && <div className="semester-selection-warning" role="alert"><p>The offering or saved plan changed. Saving is disabled until you reload. Reloading discards your current draft.</p>{!discardConfirm ? <button type="button" className="student-eligibility-secondary" onClick={() => setDiscardConfirm(true)}>Review reload</button> : <div className="semester-selection-actions"><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload and discard draft</button><button type="button" className="student-eligibility-secondary" onClick={() => setDiscardConfirm(false)}>Keep draft</button></div>}</div>}
      {!stale && discardConfirm && <div className="semester-selection-warning" role="alertdialog" aria-label="Discard draft before reload"><p>Reloading will discard your unsaved selection changes.</p><div className="semester-selection-actions"><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload and discard draft</button><button type="button" className="student-eligibility-secondary" onClick={() => setDiscardConfirm(false)}>Keep draft</button></div></div>}
      {data.eligibility.state === 'NO_ACTIVE_CONFIRMATION' ? <p role="status">Your coordinator has not confirmed an offering yet. Selection will be available after confirmation.</p> : <>
      <div className="semester-selection-facts"><p><strong>Semester:</strong> {data.scopeLabels?.targetSemesterLabel ?? 'Next semester'}</p><p><strong>Limits:</strong> {limits?.maxSubjects ?? 'Configured'} subjects · {limits?.maxCredits ?? 'configured'} credits</p><p><strong>Selected:</strong> {draft.length} subjects · {totalCredits}{missingSavedIds.length ? ' known' : ''} credits</p><p><strong>Pick deadline:</strong> {data.deadline ? dateLabel(data.deadline) : 'No deadline set'}</p></div>
      {missingSavedIds.length > 0 && <p className="semester-selection-warning" role="status">Some saved subjects are no longer in the confirmed list. Their codes and credits are unavailable in the current offering data; clear or revise the selection before saving.</p>}
      {!data.editingOpen && <p className="semester-selection-warning" role="status">Picking is closed. Your saved selection is read-only.</p>}
      <ul className="semester-selection-list" aria-label="Confirmed subjects available for selection">
        {rows.map(row => {
          const selectable = row.status === 'ELIGIBLE' || row.status === 'CONDITIONAL';
          const checked = draft.includes(row.subjectId);
          const requirements = row.status === 'CONDITIONAL' ? row.requiredConcurrentSubjectIds.map(id => codes.get(id) ?? `Subject ${id}`).join(', ') : '';
          return <li key={row.subjectId} className={checked ? 'is-selected' : ''}>
            {selectable ? <label><input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(row.subjectId)} /><span><strong>{row.subjectName}</strong><small>{row.subjectCode} · {row.creditHours} credits · {row.status === 'ELIGIBLE' ? 'Eligible' : `Conditional; select with ${requirements}`}</small></span></label> : <div className="semester-selection-readonly"><span><strong>{row.subjectName}</strong><small>{row.subjectCode} · {row.creditHours} credits · {row.status === 'UNCERTAIN' ? 'Needs review' : 'Ineligible'}</small></span>{checked && <span className="semester-selection-warning">Saved subject is no longer selectable</span>}</div>}
          </li>;
        })}
        {missingSavedIds.map(id => <li key={`missing-${id}`} className="is-selected"><div className="semester-selection-readonly"><span><strong>Previously saved subject</strong><small>No longer in the current confirmed offering</small></span><span className="semester-selection-warning">Read only</span></div></li>)}
      </ul>
      {(localIssues.length > 0 || issues.length > 0) && <div className="semester-selection-issues" role="alert"><h3>Review this selection</h3><ul>{[...issues, ...localIssues].map((issue, index) => <li key={`${issue.code}-${issue.subjectId ?? 'all'}-${index}`}>{issue.message}</li>)}</ul></div>}
      {savedNotice && <p className="semester-selection-saved" role="status">{savedNotice}</p>}
      {dirty && <p className="semester-selection-draft" role="status">Unsaved changes are kept in this page until saved or cancelled.</p>}
      <div className="semester-selection-actions">
        <button type="button" onClick={save} disabled={saveBlocked}>{saving ? 'Saving…' : 'Save selection'}</button>
        <button type="button" className="student-eligibility-secondary" onClick={cancel} disabled={!dirty || saving}>Cancel changes</button>
        <button type="button" className="student-eligibility-secondary" onClick={() => { setDraft([]); setIssues([]); setError(null); }} disabled={blocked || draft.length === 0}>Clear selection</button>
        <button type="button" className="student-eligibility-secondary" onClick={reload} disabled={saving}>Reload</button>
      </div>
      {data.plan.updatedAt && <p className="student-eligibility-basis">Last saved {dateLabel(data.plan.updatedAt)} · revision {data.plan.revision}</p>}
      <p className="student-eligibility-basis">{data.centreBasis}</p>
      </>}
    </>}
  </section>;
}
