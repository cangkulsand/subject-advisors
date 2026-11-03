import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { navigateApp, useAppLocation } from '../../app/navigation';
import { CoordinatorApiError } from './client';
import type { ForecastContext, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import { RUN_LIMITS } from '../../../../../packages/shared/src/forecasting/runs';
import '../../app/typography.css';
import './coordinator.css';

export const STATUS_REGION_ID = 'coordinator-action-status';
export function errorText(error: unknown, fallback = 'The request could not be completed. Please retry.') {
  return error instanceof CoordinatorApiError ? error.message : fallback;
}
export function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
export function semesterLabel(semester: { academicYear: string; semesterNumber: number } | undefined) {
  return semester ? `${semester.academicYear} · Semester ${semester.semesterNumber}` : 'Not configured';
}

/** Loads data for a key. Same-key `reload()` keeps the old data on screen while refreshing. */
export function useRead<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const latest = useRef(load); latest.current = load;
  const keyRef = useRef(key); keyRef.current = key;
  const mounted = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState(current => current.key === key ? { key, data: current.data } : { key });
    latest.current(controller.signal).then(data => { if (!controller.signal.aborted) setState({ key, data }); }, error => {
      if (!controller.signal.aborted) setState(current => ({ key, data: current.key === key ? current.data : undefined, error: errorText(error, 'Forecasting data could not be loaded. Please retry.') }));
    });
    return () => controller.abort();
  }, [key, attempt]);
  const reload = useCallback(async () => {
    const at = keyRef.current;
    try {
      const data = await latest.current(new AbortController().signal);
      if (mounted.current && keyRef.current === at) setState({ key: at, data });
    } catch (error) {
      if (mounted.current && keyRef.current === at) setState(current => ({ ...current, key: at, error: errorText(error, 'Forecasting data could not be loaded. Please retry.') }));
    }
  }, []);
  const current = state.key === key;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, retry: () => setAttempt(value => value + 1), reload };
}

export function Panel({ error, retry, label, children }: { error?: string; retry: () => void; label: string; children?: ReactNode }) {
  if (error) return <section className="admin-card admin-error"><p role="alert">{error}</p><button type="button" onClick={retry}>Retry</button></section>;
  if (!children) return <section className="admin-card admin-loading" role="status">Loading {label}…</section>;
  return <>{children}</>;
}

export type Notice = { kind: 'success' | 'warning'; text: string } | null;
/** One live region per page; success is polite (role=status), warnings are announced (role=alert). Focusable so dialogs can return focus here. */
export function StatusRegion({ notice }: { notice: Notice }) {
  return <div id={STATUS_REGION_ID} tabIndex={-1} className="admin-status-region">
    {notice && (notice.kind === 'success' ? <p className="admin-success" role="status">{notice.text}</p> : <p className="coordinator-warning" role="alert">{notice.text}</p>)}
  </div>;
}

export function PageHeading({ title, text, actions }: { title: string; text: string; actions?: ReactNode }) {
  return <header className="admin-page-heading"><div><p className="admin-eyebrow">COORDINATOR WORKSPACE</p><h1>{title}</h1><p>{text}</p></div>{actions}</header>;
}

/** Page-local scope, kept in the URL so links and reloads keep it. */
export function readScope(search: string): { programmeId: number | null; learningCentreId: number | null; extra: URLSearchParams } {
  const params = new URLSearchParams(search);
  const id = (name: string) => { const value = params.get(name); return value && /^[1-9]\d*$/.test(value) ? Number(value) : null; };
  return { programmeId: id('programmeId'), learningCentreId: id('learningCentreId'), extra: params };
}
export function scopeHref(path: string, scope: { programmeId: number; learningCentreId: number }, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ programmeId: String(scope.programmeId), learningCentreId: String(scope.learningCentreId) });
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return path + '?' + params.toString();
}
export function useSearch() { return new URL(useAppLocation(), window.location.origin).search; }

export interface ChosenScope extends ForecastScope { programmeLabel: string; centreLabel: string }
/** Programme, then learning centre (from the assigned scopes), and the read-only target semester from the context. */
function useScopeChoices({ context, path, programmeId, keep }: { context: ForecastContext; path: string; programmeId: number | null; keep?: Record<string, string> }) {
  const assigned = context.assignedScopes;
  const centres = context.learningCentres.filter(centre => !assigned || (programmeId !== null && assigned.some(pair => pair.programmeId === programmeId && pair.learningCentreId === centre.learningCentreId)));
  const target = context.targetSemesters.find(semester => semester.semesterId === context.targetSemesterId);
  const go = (nextProgramme: number | null, nextCentre: number | null) => {
    const params = new URLSearchParams(keep);
    if (nextProgramme) params.set('programmeId', String(nextProgramme));
    if (nextCentre) params.set('learningCentreId', String(nextCentre));
    navigateApp(path + (params.size ? '?' + params.toString() : ''), { replace: true, skipUnsaved: true });
  };
  return { centres, target, go };
}

export interface RadioOption { value: string; label: string; hint?: string }
/** A native radio group drawn as tiles with a large visible radio circle (one tab stop, arrow keys, whole tile clickable). */
export function RadioGroup({ legend, value, options, onChange, help, empty }: { legend: string; value: string; options: RadioOption[]; onChange: (value: string) => void; help?: string; empty?: string }) {
  const name = useId(), helpId = name + '-help';
  return <fieldset className="coordinator-radio-group" aria-describedby={help ? helpId : undefined}>
    <legend>{legend}</legend>
    {help && <p className="admin-muted" id={helpId}>{help}</p>}
    {options.length
      ? <div className="coordinator-segmented">{options.map(item => <label key={item.value} className={item.value === value ? 'is-selected' : undefined}>
        <input type="radio" name={name} value={item.value} checked={item.value === value} onChange={() => onChange(item.value)}/>
        <span className="coordinator-segmented-label">{item.label}</span>{item.hint && <small>{item.hint}</small>}</label>)}</div>
      : <p className="admin-muted">{empty}</p>}
  </fieldset>;
}

/** Card-less scope fields (programme and learning centre selects, read-only target semester) for the single setup card on Data Imports and Class Offering Forecast. */
export function ScopeFields({ context, path, programmeId, learningCentreId, keep }: { context: ForecastContext; path: string; programmeId: number | null; learningCentreId: number | null; keep?: Record<string, string> }) {
  const programmeField = useId(), centreField = useId(), semesterField = useId();
  const { centres, target, go } = useScopeChoices({ context, path, programmeId, keep });
  return <>
    <div className="coordinator-scope-grid">
      <div className="admin-field"><label htmlFor={programmeField}>Programme</label>
        <select id={programmeField} value={programmeId ?? ''} onChange={event => go(event.target.value ? Number(event.target.value) : null, null)}>
          <option value="">Select a programme</option>
          {context.programmes.map(item => <option key={item.programmeId} value={item.programmeId}>{item.programmeCode} · {item.programmeName}</option>)}
        </select></div>
      <div className="admin-field"><label htmlFor={centreField}>Learning centre</label>
        <select id={centreField} value={learningCentreId ?? ''} disabled={programmeId === null} onChange={event => go(programmeId, event.target.value ? Number(event.target.value) : null)}>
          <option value="">{programmeId === null ? 'Choose a programme first' : 'Select a learning centre'}</option>
          {centres.map(item => <option key={item.learningCentreId} value={item.learningCentreId}>{item.centreCode} · {item.centreName}</option>)}
        </select></div>
      <div className="coordinator-readonly"><span id={semesterField + '-label'}>Target semester</span>
        <output id={semesterField} aria-labelledby={semesterField + '-label'} className="coordinator-readonly-value">{semesterLabel(target)}</output>
        <small>Set by the system: the semester after the current one.</small></div>
    </div>
    {!context.programmes.length && <p className="admin-notice" role="status">You are not assigned to any programme and learning centre yet. Ask a system administrator to assign you in Coordinator Assignments.</p>}
    {context.currentSemesterId == null
      ? <p className="admin-notice" role="status">No current semester is set. Ask a system administrator to set it in Academic Semesters.</p>
      : context.targetSemesterId == null && <p className="admin-notice" role="status">No target semester is configured yet, so imports are unavailable.</p>}
  </>;
}

export function ScopePicker({ context, path, programmeId, learningCentreId, keep }: { context: ForecastContext; path: string; programmeId: number | null; learningCentreId: number | null; keep?: Record<string, string> }) {
  const heading = useId();
  return <section className="admin-card" aria-labelledby={heading}>
    <div className="admin-card-title"><div><h2 id={heading}>Forecast scope</h2><p className="admin-muted">Choose a programme, then a learning centre. Imports and forecasts are kept separately for each scope.</p></div></div>
    <ScopeFields context={context} path={path} programmeId={programmeId} learningCentreId={learningCentreId} keep={keep}/>
  </section>;
}
export function chooseScope(context: ForecastContext, programmeId: number | null, learningCentreId: number | null): ChosenScope | null {
  if (programmeId === null || learningCentreId === null || context.targetSemesterId == null) return null;
  const programme = context.programmes.find(item => item.programmeId === programmeId), centre = context.learningCentres.find(item => item.learningCentreId === learningCentreId);
  if (!programme || !centre) return null;
  if (context.assignedScopes && !context.assignedScopes.some(pair => pair.programmeId === programmeId && pair.learningCentreId === learningCentreId)) return null;
  return { programmeId, learningCentreId, targetSemesterId: context.targetSemesterId, programmeLabel: `${programme.programmeCode} · ${programme.programmeName}`, centreLabel: `${centre.centreCode} · ${centre.centreName}` };
}

export interface ActionDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Null hides the reason field. */
  reasonLabel?: string | null;
  /** Requires this checkbox before the action can be confirmed. */
  acknowledgement?: string;
  wide?: boolean;
  /** Extra form content shown between the description and the reason (receives busy state). */
  children?: (busy: boolean) => ReactNode;
  /** Returns a message to block submission before the request is sent. */
  validate?: () => string | null;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}
/**
 * In-page confirmation for every mutation (no window.confirm). A native modal dialog gives focus containment, Escape and an inert
 * background. It stays open on failure so the server message is shown inline, and returns focus to the opener when it closes.
 */
export function ActionDialog({ title, description, confirmLabel, danger, reasonLabel = 'Reason (recorded in the audit history)', acknowledgement, wide, children, validate, onSubmit, onCancel }: ActionDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null), firstField = useRef<HTMLTextAreaElement>(null), inFlight = useRef(false), mounted = useRef(true);
  const [reason, setReason] = useState(''), [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const titleId = useId(), reasonId = useId(), ackId = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    mounted.current = true; dialog.current?.showModal();
    (firstField.current ?? dialog.current?.querySelector<HTMLElement>('input, select, button'))?.focus();
    return () => {
      mounted.current = false;
      if (dialog.current?.open) dialog.current.close();
      if (opener?.isConnected) opener.focus(); else document.getElementById(STATUS_REGION_ID)?.focus();
    };
  }, []);
  const clean = reason.trim(), over = clean.length > RUN_LIMITS.maxReasonLength;
  const needsReason = reasonLabel !== null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (needsReason && (!clean || over)) { setError(`A reason of 1-${RUN_LIMITS.maxReasonLength} characters is required.`); firstField.current?.focus(); return; }
    if (acknowledgement && !acknowledged) { setError('Tick the acknowledgement to continue.'); return; }
    const blocked = validate?.() ?? null;
    if (blocked) { setError(blocked); return; }
    inFlight.current = true; setBusy(true); setError('');
    try { await onSubmit(clean); }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <dialog ref={dialog} className={'admin-reason-dialog' + (wide ? ' coordinator-wide-dialog' : '')} aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onCancel(); }}>
    <form onSubmit={submit} noValidate>
      <h2 id={titleId}>{title}</h2>
      <div className="admin-dialog-text">{description}</div>
      {children?.(busy)}
      {needsReason && <div className="admin-field"><label htmlFor={reasonId}>{reasonLabel}</label>
        <textarea id={reasonId} ref={firstField} rows={3} value={reason} disabled={busy} aria-describedby={reasonId + '-count'} aria-invalid={over || undefined} onChange={event => setReason(event.target.value)}/>
        <small id={reasonId + '-count'} className={over ? 'admin-counter admin-counter-over' : 'admin-counter'}>{clean.length} / {RUN_LIMITS.maxReasonLength} characters · required</small></div>}
      {acknowledgement && <label className="admin-check" htmlFor={ackId}><input id={ackId} type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)}/>{acknowledgement}</label>}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={danger ? 'admin-danger' : 'admin-primary'} disabled={busy} aria-busy={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </form>
  </dialog>;
}

export function LoadMore({ cursor, busy, onMore, label = 'Load more' }: { cursor: string | undefined; busy: boolean; onMore: () => void; label?: string }) {
  if (!cursor) return null;
  return <div className="coordinator-more"><button type="button" onClick={onMore} disabled={busy} aria-busy={busy}>{busy ? 'Loading…' : label}</button></div>;
}

/** Accumulating cursor pages: the first page is loaded by key, later pages append; `refresh` reloads from the first page. */
export function usePagedList<T>(first: (signal: AbortSignal) => Promise<{ items: T[]; nextCursor?: string }>, next: (cursor: string) => Promise<{ items: T[]; nextCursor?: string }>, key: string) {
  const read = useRead(first, key);
  const [extra, setExtra] = useState<{ items: T[]; cursor?: string | null }>({ items: [] });
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  useEffect(() => { setExtra({ items: [] }); setFailure(''); }, [key]);
  const items = [...(read.data?.items ?? []), ...extra.items];
  const cursor = extra.cursor !== undefined ? extra.cursor ?? undefined : read.data?.nextCursor;
  async function more() {
    if (!cursor || busy) return;
    setBusy(true); setFailure('');
    try {
      const page = await next(cursor);
      setExtra(current => ({ items: [...current.items, ...page.items], cursor: page.nextCursor ?? null }));
    } catch (error) { setFailure(errorText(error)); }
    finally { setBusy(false); }
  }
  async function refresh() { setExtra({ items: [] }); await read.reload(); }
  return { data: read.data, error: read.error, retry: read.retry, refresh, items, cursor, loadingMore: busy, loadMoreError: failure, more };
}
