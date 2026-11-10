import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AdminApiError } from './client';
import { errorText } from './AdminUserManagement';
import { ADMIN_REASON_MAX_LENGTH, normaliseReason, type AdminValidation } from '../../../../../packages/shared/src/admin/admin';

export type Values = Record<string, string>;
export type Field = { key: string; label: string; type?: string; maxLength?: number; optional?: boolean; options?: { value: string; label: string }[] };
/** `datetime-local` values are local wall-clock time without a zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso), pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localToIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function checked<T>(result: AdminValidation<T>): T { if (!result.ok) throw new AdminApiError(400, 'INVALID_REQUEST', result.error); return result.value; }
export function useSetupRead<T>(load: (signal: AbortSignal) => Promise<T>, key = '') {
  const latest = useRef(load); latest.current = load;
  const [attempt, setAttempt] = useState(0), [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  useEffect(() => {
    const controller = new AbortController(); setState({ key });
    latest.current(controller.signal).then(data => { if (!controller.signal.aborted) setState({ key, data }); }, error => { if (!controller.signal.aborted) setState({ key, error: errorText(error) }); });
    return () => controller.abort();
  }, [key, attempt]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, refresh: () => setAttempt(v => v + 1) };
}
export function SetupCard({ title, data, error, refresh, children, action, success }: { title: string; data: unknown; error?: string; refresh: () => void; children: ReactNode; action?: ReactNode; success: string }) {
  return <section className="admin-card"><div className="admin-card-title"><h1>{title}</h1>{action}</div>
    <div id="admin-action-status" className="admin-status-region" role="status" tabIndex={-1}>{success && <p className="admin-success">{success}</p>}</div>
    {error ? <div><p role="alert" className="admin-form-error">{error}</p><button onClick={refresh}>Retry</button></div> : !data ? <p role="status">Loading academic setup…</p> : children}
  </section>;
}
export function SetupForm({ title, fields, initial, onSave, onClose, children }: { title: string; fields: Field[]; initial: Values; onSave: (v: Values, reason: string) => Promise<void>; onClose: () => void; children?: (v: Values, set: (key: string, value: string) => void) => ReactNode }) {
  const [values, setValues] = useState(initial), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), flight = useRef(false), id = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null; alive.current = true; dialog.current?.showModal(); dialog.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    return () => { alive.current = false; dialog.current?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById('admin-action-status')?.focus(); };
  }, []);
  const set = (key: string, value: string) => setValues(old => ({ ...old, [key]: value }));
  return <dialog ref={dialog} className="admin-reason-dialog" aria-modal="true" aria-labelledby={id} onCancel={e => { e.preventDefault(); if (!flight.current) onClose(); }}><form onSubmit={async event => {
    event.preventDefault(); if (flight.current) return; const clean = normaliseReason(reason); if (!clean) { setError('A reason is required.'); return; }
    flight.current = true; setBusy(true); setError('');
    try { await onSave(values, clean); } catch (failure) { if (alive.current) setError(errorText(failure)); } finally { flight.current = false; if (alive.current) setBusy(false); }
  }}><h2 id={id}>{title}</h2><fieldset disabled={busy} className="admin-setup-fields">
    {fields.map(f => <div className="admin-field" key={f.key}><label htmlFor={id + f.key}>{f.label}</label>{f.options ? <select id={id + f.key} required={!f.optional} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}><option value="">{f.optional ? 'None' : 'Choose…'}</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input id={id + f.key} type={f.type ?? 'text'} required={!f.optional} maxLength={f.maxLength} min={f.type === 'number' ? 0 : undefined} max={f.type === 'number' ? 32767 : undefined} step={f.type === 'number' ? 1 : undefined} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}/>}</div>)}
    {children?.(values, set)}
    <div className="admin-field"><label htmlFor={id + 'reason'}>Reason (recorded in the audit log)</label><textarea id={id + 'reason'} required maxLength={ADMIN_REASON_MAX_LENGTH} value={reason} onChange={e => setReason(e.target.value)}/><small>{reason.trim().length} / {ADMIN_REASON_MAX_LENGTH} characters · required</small></div></fieldset>
    {error && <p role="alert" className="admin-form-error">{error}</p>}<div className="admin-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={busy || !normaliseReason(reason)} aria-busy={busy}>{busy ? 'Working…' : 'Save'}</button></div></form></dialog>;
}
export function SetupTable({ headings, children, label = 'Academic setup records' }: { headings: string[]; children: ReactNode; label?: string }) { return <div className="admin-table-scroll" role="region" aria-label={label} tabIndex={0}><table className="admin-table"><thead><tr>{headings.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }