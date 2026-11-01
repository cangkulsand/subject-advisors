import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { AdminApiError, type AdminClient } from './client';
import { ADMIN_REASON_MAX_LENGTH, ADMIN_ROLES, normaliseReason, validateCreateAccountRequest, validateCreateInvitationRequest } from '../../../../../packages/shared/src/admin/admin';
import type { AdminRole } from '../../../../../packages/shared/src/admin/admin';

export const roleLabels: Record<AdminRole, string> = { STUDENT: 'Student', COORDINATOR: 'Coordinator', SYSTEM_ADMIN: 'System Admin' };
export function errorText(error: unknown) { return error instanceof AdminApiError ? error.message : 'The change could not be completed. Please retry.'; }

/** A reason field with a live character counter; the counter turns into an error state beyond the limit. */
function ReasonField({ label, value, onChange, disabled, autoFocus, textareaRef }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean; textareaRef?: React.Ref<HTMLTextAreaElement> }) {
  const id = useId(), length = value.trim().length, over = length > ADMIN_REASON_MAX_LENGTH;
  return <div className="admin-field"><label htmlFor={id}>{label}</label>
    <textarea id={id} ref={textareaRef} rows={3} value={value} disabled={disabled} autoFocus={autoFocus} aria-describedby={id + '-count'} aria-invalid={over || undefined} onChange={event => onChange(event.target.value)}/>
    <small id={id + '-count'} className={over ? 'admin-counter admin-counter-over' : 'admin-counter'}>{length} / {ADMIN_REASON_MAX_LENGTH} characters · required</small></div>;
}

/**
 * In-page confirmation for every mutation. A native modal dialog gives focus containment, Escape and an
 * inert background without any window.confirm/alert/prompt. It stays open on failure so the server message is shown inline.
 */
export function ReasonDialog({ title, description, confirmLabel, danger, onSubmit, onCancel }: { title: string; description: ReactNode; confirmLabel: string; danger?: boolean; onSubmit: (reason: string) => Promise<void>; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), field = useRef<HTMLTextAreaElement>(null), inFlight = useRef(false), mounted = useRef(true);
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const titleId = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    mounted.current = true; dialog.current?.showModal(); field.current?.focus();
    return () => {
      mounted.current = false;
      if (dialog.current?.open) dialog.current.close();
      if (opener?.isConnected) opener.focus(); else document.getElementById('admin-action-status')?.focus();
    };
  }, []);
  const valid = normaliseReason(reason) !== null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const clean = normaliseReason(reason);
    if (!clean) { setError(`Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).`); return; }
    inFlight.current = true; setBusy(true); setError('');
    try { await onSubmit(clean); }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="admin-reason-dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onCancel(); }}>
    <form onSubmit={submit} noValidate>
      <h2 id={titleId}>{title}</h2>
      <div className="admin-dialog-text">{description}</div>
      <ReasonField label="Reason (recorded in the audit log)" value={reason} onChange={setReason} disabled={busy} textareaRef={field}/>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={danger ? 'admin-danger' : 'admin-primary'} disabled={busy || !valid} aria-busy={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </form>
  </dialog>;
}

function RoleChecks({ roles, onChange, disabled }: { roles: AdminRole[]; onChange: (roles: AdminRole[]) => void; disabled: boolean }) {
  return <fieldset className="admin-checks" disabled={disabled}><legend>Roles</legend>
    {ADMIN_ROLES.map(item => <label key={item} className="admin-check"><input type="checkbox" checked={roles.includes(item)} onChange={event => onChange(event.target.checked ? [...roles, item] : roles.filter(role => role !== item))}/>{roleLabels[item]}</label>)}
  </fieldset>;
}

type Mode = 'existing' | 'invite';
export function AddUserPanel({ client, onChanged }: { client: AdminClient; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<Mode>('existing');
  const [email, setEmail] = useState(''), [roles, setRoles] = useState<AdminRole[]>([]), [reason, setReason] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState<{ text: string; accountId?: number }>();
  const inFlight = useRef(false), status = useRef<HTMLDivElement>(null), emailField = useRef<HTMLInputElement>(null);
  const modeName = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const input = { email, roles, reason };
    const checked = mode === 'existing' ? validateCreateAccountRequest(input) : validateCreateInvitationRequest(input);
    if (!checked.ok) { setError(checked.error); return; }
    inFlight.current = true; setBusy(true); setError(''); setDone(undefined);
    try {
      if (mode === 'existing') { const created = await client.createAccount(checked.value); setDone({ text: `Account added for ${checked.value.email}.`, accountId: created.accountId }); }
      else { await client.createInvitation(checked.value); setDone({ text: `Invitation sent to ${checked.value.email}. It expires in 7 days.` }); }
      setEmail(''); setRoles([]); setReason(''); onChanged();
      queueMicrotask(() => status.current?.focus());
    } catch (failure) { setError(errorText(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="admin-card admin-add-user" aria-labelledby="admin-add-user-title">
    <div className="admin-card-title"><div><h2 id="admin-add-user-title">Add a user</h2><p className="admin-muted">Give an existing sign-in account access, or invite someone who has not signed up yet.</p></div>
      <button type="button" className={open ? undefined : 'admin-primary'} aria-expanded={open} aria-controls="admin-add-user-body" onClick={() => { setOpen(value => !value); if (!open) queueMicrotask(() => emailField.current?.focus()); }}>{open ? 'Hide form' : 'Add user'}</button></div>
    <div ref={status} id="admin-add-user-status" tabIndex={-1} className="admin-status-region">{done && <p className="admin-success" role="status">{done.text} {done.accountId && <AppLink href={'/admin/users/' + done.accountId}>View account →</AppLink>}</p>}</div>
    {open && <form id="admin-add-user-body" className="admin-form" onSubmit={submit} noValidate>
      <fieldset className="admin-modes" disabled={busy}><legend>Method</legend>
        <label className="admin-check"><input type="radio" name={modeName} checked={mode === 'existing'} onChange={() => { setMode('existing'); setError(''); }}/>Add existing user</label>
        <label className="admin-check"><input type="radio" name={modeName} checked={mode === 'invite'} onChange={() => { setMode('invite'); setError(''); }}/>Send invitation</label>
      </fieldset>
      <p className="admin-muted">{mode === 'existing' ? 'For someone who already has a sign-in account. They are found by their verified email address.' : 'For someone with no sign-in account yet. They receive an email and the roles apply when they first sign in with that address.'}</p>
      <div className="admin-field"><label htmlFor="admin-add-email">Email address</label><input id="admin-add-email" ref={emailField} type="email" autoComplete="off" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></div>
      <RoleChecks roles={roles} onChange={setRoles} disabled={busy}/>
      <ReasonField label="Reason (recorded in the audit log)" value={reason} onChange={setReason} disabled={busy}/>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-form-actions"><button type="submit" className="admin-primary" disabled={busy} aria-busy={busy}>{busy ? 'Working…' : mode === 'existing' ? 'Add user' : 'Send invitation'}</button></div>
    </form>}
  </section>;
}
