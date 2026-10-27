import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AcademicRecord, RecordStatus } from '../../../../api/src/modules/records/contracts';
import type { ProfileOptions } from '../../../../api/src/modules/profile/contracts';
import { type AcademicClient, errorMessage } from '../profile/client';
import '../profile/profile.css';
const labels: Record<RecordStatus, string> = { COMPLETED: 'Completed', EXEMPTED: 'Exempted', FAILED: 'Failed', WITHDRAWN: 'Withdrawn' };
const blank = { subjectId: '', semesterId: '', status: 'COMPLETED' as RecordStatus, grade: '', credits: '', remarks: '' };
export function RecordsPage({ api }: { api: AcademicClient }) {
  const [rows, setRows] = useState<AcademicRecord[]>([]), [options, setOptions] = useState<ProfileOptions>({ curricula: [], subjects: [], semesters: [] });
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0), [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ ...blank }), [editing, setEditing] = useState<number | null>(null);
  const [initial, setInitial] = useState({ ...blank });
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const alert = useRef<HTMLParagraphElement>(null), formHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setLoaded(false);
    Promise.all([api<AcademicRecord[]>('/api/academic-records', { signal: controller.signal }), api<ProfileOptions>('/api/profile/options', { signal: controller.signal })])
      .then(([records, choices]) => { if (!controller.signal.aborted) { setRows(records); setOptions(choices); setLoaded(true); } })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, attempt]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const selected = options.subjects.find(s => String(s.subjectId) === draft.subjectId);
  function reset() { setDraft({ ...blank }); setInitial({ ...blank }); setEditing(null); setError(''); }
  function edit(row: AcademicRecord) {
    if (dirty && !window.confirm('Replace the current form with this saved attempt? Unsaved changes will be discarded.')) return;
    const value = { subjectId: String(row.subjectId), semesterId: row.semesterId === null ? '' : String(row.semesterId), status: row.status, grade: row.grade ?? '', credits: String(row.recognizedCredits), remarks: row.remarks ?? '' };
    setEditing(row.recordId); setDraft(value); setInitial(value);
    setError(''); setSuccess(''); formHeading.current?.focus();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setError(''); setSuccess('');
    try {
      const row = await api<AcademicRecord>('/api/academic-records' + (editing === null ? '' : '/' + editing), { method: editing === null ? 'POST' : 'PUT', body: {
        subjectId: Number(draft.subjectId), semesterId: draft.semesterId ? Number(draft.semesterId) : null, status: draft.status,
        grade: draft.grade.trim() || null, remarks: draft.remarks.trim() || null,
        recognizedCredits: draft.status === 'COMPLETED' ? null : draft.status === 'EXEMPTED' ? Number(draft.credits) : 0,
      } });
      setRows(old => [...old.filter(r => r.recordId !== row.recordId), row]); reset(); setSuccess('Academic record saved.');
      window.dispatchEvent(new Event('p001:records-changed'));
    } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  }
  return <section className="p001" aria-label="Academic subject records">
    <header><p className="p001-eyebrow">Academic records</p><h1>Your subject history</h1><p>Record each attempt separately. These records are student-reported and unverified.</p></header>
    {error && <p className="p001-alert" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    {!loaded && (error ? <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry loading records</button> : <p role="status">Loading your records…</p>)}
    {success && <p className="p001-success" role="status">{success}</p>}
    {loaded && <>
      <section className="p001-card" aria-label="Saved attempts"><h2>Saved attempts</h2>
        {!rows.length ? <p>No academic records yet. Add a subject below when your curriculum is configured.</p> : <ul className="p001-records">
          {rows.map(row => <li key={row.recordId} className="p001-record"><div><h3>{row.subjectCode} — {row.subjectName}</h3>
            <p>{row.academicYear ? `${row.academicYear} · Semester ${row.semesterNo}` : 'Semester not recorded'} · {row.creditHours} subject credits</p>
            <p><span className={'p001-badge p001-' + row.status.toLowerCase()}>{labels[row.status]}</span> <span>{row.recognizedCredits} recognized credits</span></p>
            {row.grade && <p>Grade: {row.grade}</p>}{row.remarks && <p className="p001-wrap">{row.remarks}</p>}</div>
            <button type="button" disabled={saving} onClick={() => edit(row)} aria-label={'Edit ' + row.subjectCode + ' ' + (row.academicYear ?? 'undated') + ' attempt'}>Edit attempt</button></li>)}
        </ul>}</section>
      {!options.subjects.length ? <div className="p001-card" role="status"><h2>No curriculum subjects are configured</h2><p>Ask the maintainer to configure subjects for your selected curriculum.</p></div> :
        <form className="p001-card" onSubmit={event => { void save(event); }} aria-busy={saving}>
          <h2 ref={formHeading} tabIndex={-1}>{editing === null ? 'Add a subject attempt' : 'Edit subject attempt'}</h2>
          <fieldset disabled={saving}><legend className="p001-help">One entry per subject and semester; one undated entry per subject.</legend><div className="p001-grid">
            <label>Subject<select aria-label="Subject" required value={draft.subjectId} onChange={e => setDraft(old => ({ ...old, subjectId: e.target.value }))}>
              <option value="">Select a subject</option>{options.subjects.map(s => <option key={s.subjectId} value={s.subjectId}>{s.subjectCode} — {s.subjectName}</option>)}</select></label>
            <label>Academic semester (optional)<select aria-label="Academic semester (optional)" value={draft.semesterId} onChange={e => setDraft(old => ({ ...old, semesterId: e.target.value }))}>
              <option value="">Not recorded</option>{options.semesters.map(s => <option key={s.semesterId} value={s.semesterId}>{s.academicYear} — Semester {s.semesterNo}</option>)}</select></label>
            <label>Recorded status<select aria-label="Recorded status" value={draft.status} onChange={e => setDraft(old => ({ ...old, status: e.target.value as RecordStatus, credits: '' }))}>
              {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Grade (optional)<input maxLength={5} value={draft.grade} onChange={e => setDraft(old => ({ ...old, grade: e.target.value }))} /></label>
            {draft.status === 'EXEMPTED' ? <label>Recognized credits<input type="number" inputMode="numeric" step={1} min={0} max={selected?.creditHours ?? 2147483647} required value={draft.credits} onChange={e => setDraft(old => ({ ...old, credits: e.target.value }))} aria-describedby="p001-credit-help" /></label>
              : <p className="p001-credit" role="status">Recognized credits: {draft.status === 'COMPLETED' ? selected?.creditHours ?? 'select a subject' : 0}</p>}
          </div><p id="p001-credit-help" className="p001-help">An exemption may satisfy a requirement with zero recognized credits. Only credit-bearing exemptions award credits. Institutional approval is not verified here.</p>
          <label>{draft.status === 'EXEMPTED' ? 'Exemption explanation' : 'Remarks (optional)'}<textarea maxLength={255} required={draft.status === 'EXEMPTED'} value={draft.remarks} onChange={e => setDraft(old => ({ ...old, remarks: e.target.value }))} /></label>
          </fieldset><div className="p001-actions"><button className="p001-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing === null ? 'Save record' : 'Update record'}</button>
            <button type="button" disabled={saving || (!dirty && editing === null)} onClick={() => { reset(); setSuccess('Unsaved changes cancelled.'); }}>Cancel changes</button></div>
        </form>}
      <p className="p001-help">Failed and withdrawn attempts earn zero credits. This page does not calculate graduation totals or officially register subjects.</p>
    </>}
  </section>;
}
