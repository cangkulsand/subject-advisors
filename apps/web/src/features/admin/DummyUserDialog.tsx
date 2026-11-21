import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AdminClient } from './client';
import type { AcademicSetupClient } from './academic-client';
import { ReasonField, errorText } from './AdminUserManagement';
import { DialogHead } from '../../components/dialog/DialogHead';
import { validateCreateDummyUserRequest, type DummyCapacity, type DummyCredentials, type DummyRole } from '../../../../../packages/shared/src/admin/dummy';
import type { AdminCurriculumOption } from '../../../../../packages/shared/src/admin/admin';

/** Dummy users (S3-P004-029): test logins with a generated password that the admin sees once. */
type Option = { value: number; label: string };

/** Native modal with focus return, shared by the create and reset dialogs. */
function useModal(onClose: () => void, busy: () => boolean) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      if (dialog.current?.open) dialog.current.close();
      if (opener?.isConnected) opener.focus(); else document.getElementById('admin-action-status')?.focus();
    };
  }, []);
  return { ref: dialog, onCancel: (event: { preventDefault(): void }) => { event.preventDefault(); if (!busy()) onClose(); } };
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => { if (state === 'idle') return; const timer = setTimeout(() => setState('idle'), 2000); return () => clearTimeout(timer); }, [state]);
  return <button type="button" className="admin-copy" aria-label={label} onClick={() => { navigator.clipboard.writeText(value).then(() => setState('copied'), () => setState('failed')); }}>
    {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}</button>;
}

/** The credentials, shown once. Nothing here is stored; closing the dialog drops them. */
export function OneTimeCredentials({ credentials }: { credentials: DummyCredentials }) {
  return <div className="admin-credentials">
    <p className="admin-credentials-warning" role="status">This password is shown only once. Copy it now.</p>
    <dl>
      <div><dt>Email</dt><dd><code>{credentials.email}</code><CopyButton label="Copy email" value={credentials.email}/></dd></div>
      <div><dt>Password</dt><dd><code>{credentials.password}</code><CopyButton label="Copy password" value={credentials.password}/></dd></div>
    </dl>
    <p className="admin-muted">Sign in at /sign-in with this email and password. If asked for a verification code, enter 424242.</p>
  </div>;
}

export function CreateDummyUserDialog({ client, academic, onClose, onCreated }: { client: AdminClient; academic: AcademicSetupClient; onClose: () => void; onCreated: (done: { text: string; accountId: number }) => void }) {
  const [role, setRole] = useState<DummyRole>('STUDENT');
  const [name, setName] = useState(''), [scope, setScope] = useState(''), [centre, setCentre] = useState(''), [reason, setReason] = useState('');
  const [capacity, setCapacity] = useState<DummyCapacity | null | 'unavailable'>(null);
  const [options, setOptions] = useState<{ curricula: Option[]; programmes: Option[]; centres: Option[] } | 'unavailable' | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ credentials: DummyCredentials; accountId: number } | null>(null);
  const inFlight = useRef(false), nameField = useRef<HTMLInputElement>(null);
  const modal = useModal(() => finish(), () => inFlight.current);
  const roleName = useId(), nameId = useId(), scopeId = useId(), centreId = useId();
  useEffect(() => {
    const controller = new AbortController();
    client.dummyCapacity(controller.signal).then(setCapacity, () => { if (!controller.signal.aborted) setCapacity('unavailable'); });
    Promise.all([client.curriculumOptions(controller.signal), academic.programmes(controller.signal), academic.centres(controller.signal)])
      .then(([curricula, programmes, centres]) => setOptions({
        curricula: curricula.map((item: AdminCurriculumOption) => ({ value: item.curriculumId, label: `${item.programmeName} (${item.curriculumVersion})` })),
        programmes: programmes.filter(item => item.isActive).map(item => ({ value: item.programmeId, label: `${item.programmeCode} — ${item.programmeName}` })),
        centres: centres.filter(item => item.isActive).map(item => ({ value: item.learningCentreId, label: item.centreName })),
      }), () => { if (!controller.signal.aborted) setOptions('unavailable'); });
    nameField.current?.focus();
    return () => controller.abort();
  }, [client, academic]);
  function finish() {
    if (created) onCreated({ text: `Dummy user ${created.credentials.email} created.`, accountId: created.accountId });
    else onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const body = role === 'STUDENT'
      ? { role, name, curriculumId: Number(scope), learningCentreId: Number(centre), reason }
      : { role, name, programmeId: Number(scope), learningCentreId: Number(centre), reason };
    const checked = validateCreateDummyUserRequest(body);
    if (!checked.ok) { setError(checked.error); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await client.createDummyUser(checked.value);
      setCreated({ credentials: result.credentials, accountId: result.account.accountId });
    } catch (failure) { setError(errorText(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const scopes = options && options !== 'unavailable' ? (role === 'STUDENT' ? options.curricula : options.programmes) : [];
  const centres = options && options !== 'unavailable' ? options.centres : [];
  return <dialog ref={modal.ref} className="admin-reason-dialog admin-add-user-dialog admin-dummy-dialog" aria-label="Create dummy user" aria-modal="true" onCancel={modal.onCancel}>
    {created ? <div className="admin-form">
      <DialogHead onClose={finish}><h2>Dummy user created</h2></DialogHead>
      <OneTimeCredentials credentials={created.credentials}/>
      <div className="admin-dialog-actions"><button type="button" className="admin-primary" onClick={finish}>Done</button></div>
    </div> : <form className="admin-form" onSubmit={submit} noValidate>
      <DialogHead onClose={onClose} disabled={busy}><h2>Create dummy user</h2>
        <p className="admin-muted">A test login that works straight away. The password is generated and shown once.</p></DialogHead>
      <p className="admin-muted admin-dummy-capacity">{capacity === null ? 'Checking Clerk usage…' : capacity === 'unavailable' ? 'Clerk usage is unavailable.' : `Clerk users: ${capacity.used} of ${capacity.limit}`}</p>
      <fieldset className="admin-modes" disabled={busy}><legend>Role</legend>
        {(['STUDENT', 'COORDINATOR'] as const).map(item => <label key={item} className="admin-check"><input type="radio" name={roleName} checked={role === item} onChange={() => { setRole(item); setScope(''); setError(''); }}/>{item === 'STUDENT' ? 'Student' : 'Coordinator'}</label>)}
      </fieldset>
      <div className="admin-field"><label htmlFor={nameId}>Name</label><input id={nameId} ref={nameField} autoComplete="off" maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></div>
      <SelectField id={scopeId} label="Programme" value={scope} onChange={setScope} disabled={busy} options={scopes}
        help={role === 'STUDENT' ? 'The student gets a complete profile in the current semester, with a fake DUMMY matric number.' : 'The programme this coordinator covers at the learning centre below.'}/>
      <SelectField id={centreId} label="Learning centre" value={centre} onChange={setCentre} disabled={busy} options={centres}/>
      {options === 'unavailable' && <p className="admin-form-error" role="alert">Programmes and learning centres could not be loaded. Close and retry.</p>}
      <ReasonField label="Reason (recorded in the audit log)" value={reason} onChange={setReason} disabled={busy}/>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="admin-primary" disabled={busy} aria-busy={busy}>{busy ? 'Working…' : 'Create dummy user'}</button></div>
    </form>}
  </dialog>;
}

function SelectField({ id, label, value, onChange, disabled, options, help }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; options: Option[]; help?: ReactNode }) {
  return <div className="admin-field"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} disabled={disabled} aria-describedby={help ? id + '-help' : undefined} onChange={event => onChange(event.target.value)}>
      <option value="">Choose…</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>{help && <small id={id + '-help'} className="admin-muted">{help}</small>}</div>;
}

/** Confirm, then show the new password once. */
export function ResetDummyPasswordDialog({ client, accountId, email, onClose }: { client: AdminClient; accountId: number; email: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [credentials, setCredentials] = useState<DummyCredentials | null>(null);
  const inFlight = useRef(false);
  const modal = useModal(onClose, () => inFlight.current);
  const titleId = useId();
  async function reset() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { setCredentials(await client.resetDummyPassword(accountId)); }
    catch (failure) { setError(errorText(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <dialog ref={modal.ref} className="admin-reason-dialog admin-dummy-dialog" aria-labelledby={titleId} aria-modal="true" onCancel={modal.onCancel}>
    <div className="admin-form">
      <DialogHead onClose={onClose} disabled={busy}><h2 id={titleId}>Reset password</h2></DialogHead>
      {credentials ? <OneTimeCredentials credentials={credentials}/> : <p className="admin-dialog-text">A new password is generated for <strong>{email}</strong>. The old password stops working straight away.</p>}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog-actions">{credentials ? <button type="button" className="admin-primary" onClick={onClose}>Done</button> : <>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-primary" disabled={busy} aria-busy={busy} onClick={reset}>{busy ? 'Working…' : 'Reset password'}</button></>}</div>
    </div>
  </dialog>;
}
