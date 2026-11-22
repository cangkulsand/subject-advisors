import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { AdminClient } from './client';
import type { AcademicSetupClient } from './academic-client';
import { errorText } from './AdminUserManagement';
import { DialogHead } from '../../components/dialog/DialogHead';
import { startViewAs } from '../auth/view-as';
import type { AdminAccount } from '../../../../../packages/shared/src/admin/admin';

/** System Admin "View as" (S3-P004-033): Coordinator for a programme x centre (can act), or one student (read only). */
type Option = { value: number; label: string; code?: string };
type Role = 'COORDINATOR' | 'STUDENT';

export function ViewAsButton({ client, academic }: { client: AdminClient; academic: AcademicSetupClient }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="admin-view-as-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>View as</button>
    {open && <ViewAsDialog client={client} academic={academic} onClose={() => setOpen(false)}/>}
  </>;
}

export function ViewAsDialog({ client, academic, onClose }: { client: AdminClient; academic: AcademicSetupClient; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<Role>('COORDINATOR');
  const [options, setOptions] = useState<{ programmes: Option[]; centres: Option[] } | 'unavailable' | null>(null);
  const [programme, setProgramme] = useState(''), [centre, setCentre] = useState('');
  const [query, setQuery] = useState(''), [results, setResults] = useState<AdminAccount[] | null>(null);
  const [noProfile, setNoProfile] = useState<Set<number>>(new Set());
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const roleName = useId(), programmeId = useId(), centreId = useId(), queryId = useId(), titleId = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (dialog.current?.open) dialog.current.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([academic.programmes(controller.signal), academic.centres(controller.signal)]).then(([programmes, centres]) => setOptions({
      programmes: programmes.filter(item => item.isActive).map(item => ({ value: item.programmeId, label: `${item.programmeCode} — ${item.programmeName}`, code: item.programmeCode })),
      centres: centres.filter(item => item.isActive).map(item => ({ value: item.learningCentreId, label: item.centreName })),
    }), () => { if (!controller.signal.aborted) setOptions('unavailable'); });
    return () => controller.abort();
  }, [academic]);

  function startCoordinator(event: FormEvent) {
    event.preventDefault();
    if (!options || options === 'unavailable') return;
    const p = options.programmes.find(item => String(item.value) === programme), c = options.centres.find(item => String(item.value) === centre);
    if (!p || !c) { setError('Choose a programme and a learning centre.'); return; }
    startViewAs({ role: 'COORDINATOR', programmeId: p.value, learningCentreId: c.value, label: `${p.code}, ${c.label}` });
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) { setError('Enter a name, email or matric number.'); return; }
    setBusy(true); setError('');
    try { setResults((await client.users({ page: 1, q: query.trim(), role: 'STUDENT', status: 'ACTIVE' })).items); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  async function viewStudent(account: AdminAccount) {
    setBusy(true); setError('');
    try {
      const profile = await client.studentProgramme(account.accountId);
      if (!profile) { setNoProfile(previous => new Set(previous).add(account.accountId)); return; }
      startViewAs({ role: 'STUDENT', studentId: profile.studentId, label: profile.studentName || account.identity.name || 'Student' });
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  const ready = options && options !== 'unavailable' ? options : null;
  return <dialog ref={dialog} className="admin-reason-dialog admin-view-as-dialog" aria-labelledby={titleId} aria-modal="true" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="admin-form">
      <DialogHead onClose={onClose} disabled={busy}><h2 id={titleId}>View as</h2>
        <p className="admin-muted">See the system as a coordinator or a student. As a coordinator you can act, and your changes show as yours. A student is read only.</p></DialogHead>
      <fieldset className="admin-modes" disabled={busy}><legend>Role</legend>
        {(['COORDINATOR', 'STUDENT'] as const).map(item => <label key={item} className="admin-check"><input type="radio" name={roleName} checked={role === item} onChange={() => { setRole(item); setError(''); }}/>{item === 'COORDINATOR' ? 'Coordinator' : 'Student'}</label>)}
      </fieldset>
      {role === 'COORDINATOR' ? <form onSubmit={startCoordinator} noValidate className="admin-view-as-section">
        {options === 'unavailable' && <p className="admin-form-error" role="alert">Programmes and learning centres could not be loaded. Close and retry.</p>}
        <div className="admin-field"><label htmlFor={programmeId}>Programme</label>
          <select id={programmeId} value={programme} onChange={event => setProgramme(event.target.value)}><option value="">Choose…</option>{ready?.programmes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="admin-field"><label htmlFor={centreId}>Learning centre</label>
          <select id={centreId} value={centre} onChange={event => setCentre(event.target.value)}><option value="">Choose…</option>{ready?.centres.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        <div className="admin-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={!ready}>Start view</button></div>
      </form> : <div className="admin-view-as-section">
        <form onSubmit={search} noValidate className="admin-view-as-search">
          <div className="admin-field"><label htmlFor={queryId}>Find a student</label>
            <input id={queryId} type="search" autoComplete="off" maxLength={100} placeholder="Name, email or matric" value={query} disabled={busy} onChange={event => setQuery(event.target.value)}/></div>
          <button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </form>
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        {results && (results.length === 0 ? <p className="admin-empty">No active students match.</p> :
          <ul className="admin-view-as-results" aria-label="Students">{results.map(account => <li key={account.accountId}>
            <span><strong>{account.identity.name ?? 'Unnamed student'}</strong><small className="admin-muted">{account.identity.email ?? ''}</small></span>
            {noProfile.has(account.accountId) ? <span className="admin-muted">Profile not set up yet</span> :
              <button type="button" disabled={busy} onClick={() => void viewStudent(account)} aria-label={`View as ${account.identity.name ?? 'this student'}`}>View</button>}
          </li>)}</ul>)}
        <div className="admin-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
      </div>}
    </div>
  </dialog>;
}
