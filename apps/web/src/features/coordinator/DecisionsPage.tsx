import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { CoordinatorApiError, type ConfirmationWithRevision, type CoordinatorClient, type MutationResult } from './client';
import {
  ActionDialog, LoadMore, PageHeading, Panel, ScopePicker, StatusRegion, chooseScope, readScope, scopeHref, usePagedList, useRead, when,
  type ChosenScope, type Notice,
} from './coordinator-ui';
import {
  CONFIRMED_OFFERING_LABEL, CONFIRMED_OFFERING_NOTICE, isPickWindowOpen,
  type ConfirmedOffering, type ConfirmedOfferingAuditEntry, type ConfirmedOfferingSet,
} from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type { RunSubject } from '../../../../../packages/shared/src/forecasting/runs';

const classLabel = (classType: string | null) => classType === 'LAB' ? 'Lab' : classType === 'LECTURE' ? 'Lecture' : 'Not set';
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;
const runStatusLabel = { DRAFT: 'draft', UNDER_REVIEW: 'under review', FINALIZED: 'finalized' } as const;

/** `datetime-local` values are local wall-clock time without a zone. */
function toLocalInput(iso: string) {
  const date = new Date(iso), pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function localToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function deadlineProblem(value: string): string | null {
  const iso = localToIso(value);
  if (!iso) return 'Choose the date and time students can pick until.';
  if (Date.parse(iso) <= Date.now()) return 'The pick deadline must be in the future.';
  return null;
}
const sectionsText = (subject: RunSubject) => subject.sections.length ? `${plural(subject.sections.length, 'class', 'classes')} (${subject.sections.map(section => section.expectedStudents).join(' + ')})` : 'None proposed';

function DeadlineField({ id, label, value, error, invalid, onChange, disabled }: { id: string; label: string; value: string; error?: string | null; invalid?: boolean; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="admin-field coordinator-deadline-field"><label htmlFor={id}>{label}</label>
    <input id={id} type="datetime-local" value={value} disabled={disabled} aria-invalid={error || invalid ? true : undefined} aria-describedby={id + '-hint'} onChange={event => onChange(event.target.value)}/>
    <small id={id + '-hint'} className={error ? 'coordinator-field-error' : 'admin-muted'} role={error ? 'alert' : undefined}>{error ?? 'Your local time. Students can pick and change picks until then; afterwards picks are closed.'}</small></div>;
}

/** Forecast numbers beside checkboxes. Excluded subjects are disabled with their reason; `locked` carries other disabled reasons. */
function SubjectPicker({ label, subjects, selected, locked, onChange }: { label: string; subjects: RunSubject[]; selected: number[]; locked: Map<number, string>; onChange: (next: number[]) => void }) {
  const base = useId();
  const off = (subject: RunSubject) => subject.excluded || subject.semesterTypeExcluded;
  const available = subjects.filter(subject => !off(subject) && !locked.has(subject.subjectId)).map(subject => subject.subjectId);
  const toggle = (id: number, on: boolean) => onChange(on ? [...selected, id] : selected.filter(item => item !== id));
  return <>
    <div className="coordinator-pick-tools">
      <button type="button" className="admin-row-action" disabled={available.length === 0 || selected.length === available.length} onClick={() => onChange(available)}>Select all available</button>
      <button type="button" className="admin-row-action" disabled={selected.length === 0} onClick={() => onChange([])}>Clear selection</button>
      <span className="admin-muted" aria-live="polite">{plural(selected.length, 'subject')} selected</span>
    </div>
    <div className="admin-table-scroll coordinator-table coordinator-picker" role="region" aria-label={label} tabIndex={0}>
      <table><thead><tr><th scope="col">Confirm</th><th scope="col">Subject</th><th scope="col">Class type</th><th scope="col">Potential demand</th><th scope="col">Proposed classes</th><th scope="col">Near graduation</th></tr></thead>
        <tbody>{subjects.map(subject => {
          const reason = subject.semesterTypeExcluded ? subject.semesterTypeExclusionReason ?? 'Not offered in this semester type.' : subject.excluded ? subject.exclusionReason ?? 'Excluded in the subject catalogue.' : locked.get(subject.subjectId) ?? null, noteId = `${base}-n${subject.subjectId}`;
          return <tr key={subject.subjectId} data-subject={subject.subjectCode} className={reason ? 'coordinator-row-disabled' : undefined}>
            <td><input type="checkbox" className="coordinator-check" checked={selected.includes(subject.subjectId)} disabled={reason !== null} aria-label={`Select ${subject.subjectCode}`} aria-describedby={reason ? noteId : undefined}
              onChange={event => toggle(subject.subjectId, event.target.checked)}/></td>
            <th scope="row"><strong>{subject.subjectCode}</strong><span>{subject.subjectName}</span><span className="admin-audit-id">{subject.creditHours} credit hours</span>
              {reason && <span id={noteId} className="coordinator-disabled-reason">{off(subject) ? 'Cannot be confirmed: ' : ''}{reason}</span>}
              {!reason && subject.configurationStatus === 'CONFIGURATION_REQUIRED' && <span className="coordinator-config-issue">No classes proposed: configuration required.</span>}</th>
            <td>{classLabel(subject.classType)}</td>
            <td>{off(subject) ? '—' : <strong className="coordinator-number">{subject.supportedEligibleCount}</strong>}</td>
            <td>{off(subject) ? '—' : sectionsText(subject)}</td>
            <td>{off(subject) ? '—' : <>{subject.nearGraduationCount}<span className="admin-audit-id">information only</span></>}</td>
          </tr>;
        })}</tbody></table>
    </div></>;
}

function ConfirmNotice() {
  return <p className="coordinator-assumption" role="note"><strong>{CONFIRMED_OFFERING_LABEL}.</strong> Students will see the subjects you confirm as confirmed by the coordinator. This is not an official registration and not a guaranteed timetable.</p>;
}

interface Hooks { client: CoordinatorClient; scope: ChosenScope; announce: (notice: Notice) => void; reload: () => Promise<void> }

/** Shared mutation wrapper: 412 reloads with a notice; other errors stay in the dialog. */
function useGuardedMutation({ announce, reload }: Pick<Hooks, 'announce' | 'reload'>, close: () => void) {
  return async (operation: () => Promise<MutationResult>, success: string) => {
    try { await operation(); }
    catch (error) {
      if (error instanceof CoordinatorApiError && error.code === 'CONFIRMATION_REVISION_MISMATCH') { close(); announce({ kind: 'warning', text: 'This confirmation changed; reloaded.' }); await reload(); return; }
      throw error;
    }
    close(); announce({ kind: 'success', text: success }); await reload();
  };
}

function NoFinalizedForecast({ scope }: { scope: ChosenScope }) {
  return <section className="admin-card admin-empty" aria-labelledby="decisions-nofinal-heading"><h2 id="decisions-nofinal-heading">No finalized forecast yet</h2>
    <p>Offerings can only be confirmed from a finalized forecast for this programme, learning centre and semester. Review and finalize a forecast first.</p>
    <AppLink className="coordinator-link-button" href={scopeHref('/coordinator/forecasts', scope)}>Go to Class Offering Forecast</AppLink></section>;
}

function CreateConfirmation({ client, scope, announce, reload }: Hooks) {
  const runs = useRead(signal => client.listRuns(scope, { limit: 100 }, signal), `finalized|${scope.programmeId}|${scope.learningCentreId}`);
  const [chosen, setChosen] = useState<number | null>(null);
  const runField = useId();
  return <Panel error={runs.error} retry={runs.retry} label="forecasts">{runs.data && (() => {
    const finalized = runs.data.items.filter(run => run.status === 'FINALIZED');
    if (!finalized.length) return <NoFinalizedForecast scope={scope}/>;
    const runId = chosen !== null && finalized.some(run => run.forecastRunId === chosen) ? chosen : finalized[0]!.forecastRunId;
    return <>
      <section className="admin-card" aria-labelledby="decisions-start-heading">
        <div className="admin-card-title"><div><h2 id="decisions-start-heading">Confirm offerings for this semester</h2><p className="admin-muted">Nothing is confirmed yet for this scope. Choose the finalized forecast to base the decision on, pick the subjects to offer, and set the date students can pick until.</p></div></div>
        <div className="admin-field coordinator-run-select"><label htmlFor={runField}>Finalized forecast</label>
          <select id={runField} value={runId} onChange={event => setChosen(Number(event.target.value))}>
            {finalized.map(run => <option key={run.forecastRunId} value={run.forecastRunId}>Version {run.versionNumber} · finalized {when(run.finalizedAt)}</option>)}
          </select></div>
        <ConfirmNotice/>
      </section>
      <CreateForm key={runId} client={client} scope={scope} announce={announce} reload={reload} runId={runId}/>
    </>;
  })()}</Panel>;
}

function CreateForm({ client, scope, announce, reload, runId }: Hooks & { runId: number }) {
  const read = useRead(signal => client.getRun(runId, signal), 'run|' + runId);
  const [selected, setSelected] = useState<number[]>([]), [deadline, setDeadline] = useState(''), [problem, setProblem] = useState<string | null>(null), [dialog, setDialog] = useState(false);
  const deadlineId = useId();
  const guarded = useGuardedMutation({ announce, reload }, () => setDialog(false));
  return <Panel error={read.error} retry={read.retry} label="forecast subjects">{read.data && (() => {
    const run = read.data.run;
    const open = () => {
      const found = deadlineProblem(deadline);
      setProblem(found);
      if (found) { document.getElementById(deadlineId)?.focus(); return; }
      setDialog(true);
    };
    const picks = run.subjects.filter(subject => selected.includes(subject.subjectId));
    return <section className="admin-card" aria-labelledby="decisions-pick-heading">
      <div className="admin-card-title"><div><h2 id="decisions-pick-heading">Subjects in forecast version {run.versionNumber}</h2><p className="admin-muted">Potential demand is the supported eligible pool, shown to help you decide. It is not registration.</p></div></div>
      {run.subjects.length === 0 ? <p className="admin-empty">This forecast has no subjects.</p> : <SubjectPicker label="Subjects to confirm table" subjects={run.subjects} selected={selected} locked={new Map()} onChange={setSelected}/>}
      <div className="coordinator-confirm-bar">
        <DeadlineField id={deadlineId} label="Pick deadline" value={deadline} error={problem} onChange={value => { setDeadline(value); setProblem(null); }}/>
        <button type="button" className="admin-primary" disabled={selected.length === 0} onClick={open}>{selected.length ? `Confirm ${plural(selected.length, 'subject')}` : 'Select subjects to confirm'}</button>
      </div>
      {dialog && <ActionDialog wide title="Confirm offerings" confirmLabel={`Confirm ${plural(selected.length, 'subject')}`} onCancel={() => setDialog(false)}
        description={<>
          <p>Confirm {plural(selected.length, 'subject')} for {scope.programmeLabel}, {scope.centreLabel}. Students can pick until <strong>{when(localToIso(deadline))}</strong>.</p>
          <ul className="coordinator-dialog-list">{picks.map(subject => <li key={subject.subjectId}>{subject.subjectCode} {subject.subjectName}</li>)}</ul>
          <p className="admin-muted">{CONFIRMED_OFFERING_NOTICE}.</p></>}
        onSubmit={async reason => guarded(() => client.confirmOfferings({ scope, forecastRunId: run.forecastRunId, subjectIds: [...selected].sort((a, b) => a - b), reason, pickDeadline: localToIso(deadline)!, revision: null }),
          `${plural(selected.length, 'subject')} confirmed by coordinator. Students can pick until ${when(localToIso(deadline))}.`)}/>}
    </section>;
  })()}</Panel>;
}

function DeadlineDialog({ client, scope, set, onCancel, onSubmit }: { client: CoordinatorClient; scope: ChosenScope; set: ConfirmedOfferingSet; onCancel: () => void; onSubmit: (input: { pickDeadline: string; forecastRunId?: number }, reason: string) => Promise<void> }) {
  const [value, setValue] = useState(() => toLocalInput(set.pickDeadline!)), [runId, setRunId] = useState<number>(set.forecastRunId!), [problem, setProblem] = useState<string | null>(null);
  const runs = useRead(signal => client.listRuns(scope, { limit: 100 }, signal), `deadline-runs|${scope.programmeId}|${scope.learningCentreId}`);
  const deadlineId = useId(), runField = useId();
  const finalized = (runs.data?.items ?? []).filter(run => run.status === 'FINALIZED');
  const runOptions = [...finalized.map(run => ({ id: run.forecastRunId, text: `Version ${run.versionNumber} · finalized ${when(run.finalizedAt)}${run.forecastRunId === set.forecastRunId ? ' · current' : ''}` })),
    ...(finalized.some(run => run.forecastRunId === set.forecastRunId) ? [] : [{ id: set.forecastRunId!, text: `Current forecast (#${set.forecastRunId}) · current` }])];
  const unchangedDeadline = value === toLocalInput(set.pickDeadline!);
  const check = () => unchangedDeadline && runId === set.forecastRunId ? 'Nothing to change: choose a new deadline or another forecast.' : unchangedDeadline ? null : deadlineProblem(value);
  return <ActionDialog wide title="Change pick deadline" confirmLabel="Change deadline" onCancel={onCancel}
    description={<>Students can pick until <strong>{when(set.pickDeadline)}</strong>. The change is recorded in the audit history.</>}
    validate={() => { const found = check(); setProblem(found); return found; }}
    onSubmit={async reason => onSubmit({ pickDeadline: unchangedDeadline ? set.pickDeadline! : localToIso(value)!, ...(runId !== set.forecastRunId ? { forecastRunId: runId } : {}) }, reason)}>
    {busy => <>
      <DeadlineField id={deadlineId} label="New pick deadline" value={value} disabled={busy} invalid={problem !== null} onChange={next => { setValue(next); setProblem(null); }}/>
      <div className="admin-field"><label htmlFor={runField}>Forecast this confirmation is based on</label>
        <select id={runField} value={runId} disabled={busy || runs.data === undefined} onChange={event => { setRunId(Number(event.target.value)); setProblem(null); }}>
          {runOptions.map(option => <option key={option.id} value={option.id}>{option.text}</option>)}
        </select>
        <small className="admin-muted">Switching the forecast only changes which forecast the confirmation points to. Confirmed subjects stay as they are.</small>
        {runs.error && <small className="coordinator-field-error">Other forecasts could not be loaded. You can still change the deadline.</small>}</div>
    </>}
  </ActionDialog>;
}

function AuditCard({ client, scope, set }: { client: CoordinatorClient; scope: ChosenScope; set: ConfirmedOfferingSet }) {
  const audit = usePagedList<ConfirmedOfferingAuditEntry>(signal => client.listConfirmationAudit(scope, { limit: 20 }, signal), cursor => client.listConfirmationAudit(scope, { limit: 20, cursor }), 'audit|' + scope.programmeId + '|' + scope.learningCentreId);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } void audit.refresh(); }, [set.revision]);
  const codes = new Map(set.offerings.map(offering => [offering.subjectId, offering.subjectCode]));
  const action = (entry: ConfirmedOfferingAuditEntry) => entry.action === 'CONFIRM' ? (entry.beforeStatus === 'WITHDRAWN' ? 'Re-confirmed' : 'Confirmed by coordinator')
    : entry.action === 'WITHDRAW' ? 'Withdrawn' : entry.beforeDeadline ? 'Pick deadline changed' : 'Pick deadline set';
  const detail = (entry: ConfirmedOfferingAuditEntry) => entry.action === 'SET_DEADLINE'
    ? <span className="admin-audit-id">{entry.beforeDeadline ? `${when(entry.beforeDeadline)} → ` : ''}{when(entry.afterDeadline)} · forecast #{entry.forecastRunId ?? '—'}</span> : null;
  return <section className="admin-card" aria-labelledby="decisions-audit-heading">
    <div className="admin-card-title"><div><h2 id="decisions-audit-heading">Audit history</h2><p className="admin-muted">Every confirmation, withdrawal and deadline change, newest first.</p></div></div>
    <Panel error={audit.error} retry={audit.retry} label="audit history">{audit.data && (audit.items.length === 0 ? <p className="admin-empty">Nothing recorded yet.</p> :
      <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Offering audit history table" tabIndex={0}>
        <table><thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Subject</th><th scope="col">By</th><th scope="col">Reason</th></tr></thead>
          <tbody>{audit.items.map(entry => <tr key={entry.auditId}><td>{when(entry.recordedAt)}</td><td>{action(entry)}{detail(entry)}</td>
            <td>{entry.subjectId ? codes.get(entry.subjectId) ?? `#${entry.subjectId}` : 'Whole confirmation'}</td><td className="admin-actor">{entry.recordedBy}</td><td className="admin-reason">{entry.reason}</td></tr>)}</tbody></table></div>
        {audit.loadMoreError && <p className="admin-form-error" role="alert">{audit.loadMoreError}</p>}
        <LoadMore cursor={audit.cursor} busy={audit.loadingMore} onMore={() => void audit.more()} label="Load older entries"/></>)}
    </Panel>
  </section>;
}

type Dialog = null | { kind: 'withdraw'; offering: ConfirmedOffering } | { kind: 'reconfirm'; offering: ConfirmedOffering } | { kind: 'deadline' } | { kind: 'add' };

function ExistingConfirmation({ client, scope, announce, reload, data }: Hooks & { data: ConfirmationWithRevision }) {
  const { set, revision } = data;
  const source = useRead(signal => client.getRun(set.forecastRunId!, signal), 'source|' + set.forecastRunId);
  const picks = useRead(signal => client.pickCounts(scope, signal), `picks|${scope.programmeId}|${scope.learningCentreId}`);
  const [dialog, setDialog] = useState<Dialog>(null), [adding, setAdding] = useState<number[]>([]);
  const guarded = useGuardedMutation({ announce, reload }, () => setDialog(null));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const open = set.pickWindow ? set.pickWindow === 'OPEN' : isPickWindowOpen(set.pickDeadline!);
  const numbers = new Map((source.data?.run.subjects ?? []).map(subject => [subject.subjectId, subject]));
  const known = new Set(set.offerings.map(offering => offering.subjectId));
  const addable = (source.data?.run.subjects ?? []).filter(subject => !known.has(subject.subjectId));
  const confirmedCount = set.offerings.filter(offering => offering.status === 'CONFIRMED').length;
  const newer = set.newerForecastAvailable;
  const rev = revision!;
  return <>
    <section className="admin-card" aria-labelledby="decisions-summary-heading">
      <div className="admin-card-title"><div><h2 id="decisions-summary-heading" tabIndex={-1} ref={heading}>Confirmed offerings <span className={'admin-pill ' + (open ? 'coordinator-pill-success' : 'coordinator-pill-muted')}>{open ? 'Pick window open' : 'Pick window closed'}</span></h2>
        <p className="admin-muted">{open ? 'Open until ' : 'Closed on '}<strong>{when(set.pickDeadline)}</strong> · based on {source.data ? `forecast version ${source.data.run.versionNumber}` : `forecast #${set.forecastRunId}`} · last updated {when(set.updatedAt)} by <span className="admin-actor">{set.updatedBy}</span></p></div>
        <div className="coordinator-head-actions"><button type="button" onClick={() => void reload()}>Refresh</button><button type="button" className="admin-primary" onClick={() => setDialog({ kind: 'deadline' })}>Change pick deadline</button></div></div>
      <dl className="coordinator-counts" aria-label="Confirmation summary"><div><dt>Confirmed by coordinator</dt><dd>{confirmedCount}</dd></div><div><dt>Withdrawn</dt><dd>{set.offerings.length - confirmedCount}</dd></div></dl>
      <p className="coordinator-assumption" role="note"><strong>{CONFIRMED_OFFERING_LABEL}.</strong> Students see these subjects as confirmed by the coordinator. This is not an official registration and not a guaranteed timetable. Picks close at the deadline.</p>
      {newer && <p className="coordinator-newer-notice" role="note"><strong>Newer forecast available.</strong> Version {newer.versionNumber} ({runStatusLabel[newer.status]}) exists for this scope. This is information only: your confirmed offerings are not changed and need no re-confirmation.
        {' '}<AppLink href={scopeHref('/coordinator/forecasts', scope, { run: newer.forecastRunId })}>View version {newer.versionNumber}</AppLink>. To base this confirmation on another finalized forecast, use Change pick deadline.</p>}
    </section>
    <section className="admin-card" aria-labelledby="decisions-list-heading">
      <div className="admin-card-title"><div><h2 id="decisions-list-heading">Subjects</h2><p className="admin-muted">Forecast numbers come from the forecast this confirmation is based on.</p></div></div>
      {source.error && <p className="admin-notice" role="status">Forecast numbers could not be loaded. <button type="button" className="admin-row-action" onClick={source.retry}>Retry</button></p>}
      {set.offerings.length === 0 ? <p className="admin-empty">No subjects yet.</p> :
        <div className="admin-table-scroll coordinator-table coordinator-offerings" role="region" aria-label="Confirmed offerings table" tabIndex={0}>
          <table><thead><tr><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Potential demand</th><th scope="col">Proposed classes</th><th scope="col">Near graduation</th><th scope="col">Student picks</th><th scope="col">Last change</th><th scope="col">Actions</th></tr></thead>
            <tbody>{set.offerings.map(offering => {
              const forecast = numbers.get(offering.subjectId), withdrawn = offering.status === 'WITHDRAWN', pick = picks.data?.counts.find(item => item.subjectId === offering.subjectId);
              return <tr key={offering.subjectId} data-subject={offering.subjectCode} className={withdrawn ? 'coordinator-row-disabled' : undefined}>
                <th scope="row"><strong>{offering.subjectCode}</strong><span>{offering.subjectName}</span><span className="admin-audit-id">{offering.creditHours} credit hours · {classLabel(offering.classType)}</span></th>
                <td><span className={'admin-pill ' + (withdrawn ? 'coordinator-pill-muted' : 'coordinator-pill-success')}>{withdrawn ? 'Withdrawn' : CONFIRMED_OFFERING_LABEL}</span></td>
                <td>{forecast ? <strong className="coordinator-number">{forecast.supportedEligibleCount}</strong> : '—'}</td>
                <td>{forecast ? sectionsText(forecast) : '—'}</td>
                <td>{forecast ? forecast.nearGraduationCount : '—'}</td>
                <td>{withdrawn ? '—' : picks.error ? 'Not available' : picks.data?.picksAvailable === false || !pick ? <span className="coordinator-no-picks">No student picks yet</span> : pick.pickCount}</td>
                <td className="admin-reason">{offering.reason}<span className="admin-audit-id">{when(withdrawn ? offering.withdrawnAt : offering.confirmedAt)} · {withdrawn ? offering.withdrawnBy : offering.confirmedBy}</span></td>
                <td>{withdrawn
                  ? <button type="button" className="admin-row-action" aria-label={`Re-confirm ${offering.subjectCode}`} onClick={() => setDialog({ kind: 'reconfirm', offering })}>Re-confirm</button>
                  : <button type="button" className="admin-row-action admin-danger-action" aria-label={`Withdraw ${offering.subjectCode}`} onClick={() => setDialog({ kind: 'withdraw', offering })}>Withdraw</button>}</td>
              </tr>;
            })}</tbody></table></div>}
      <p className="coordinator-picks-note admin-muted">Student picks arrive with the student offerings page. Until then there is nothing to count.</p>
    </section>
    <section className="admin-card" aria-labelledby="decisions-add-heading">
      <div className="admin-card-title"><div><h2 id="decisions-add-heading">Add more subjects</h2><p className="admin-muted">Subjects from the same forecast that are not confirmed yet. Withdrawn subjects are re-confirmed from the list above.</p></div></div>
      {!source.data ? (source.error ? null : <p className="admin-muted" role="status">Loading forecast subjects…</p>) : addable.length === 0 ? <p className="admin-empty">Every subject of this forecast is already in the list.</p> : <>
        <SubjectPicker label="Subjects to add table" subjects={addable} selected={adding} locked={new Map()} onChange={setAdding}/>
        <div className="coordinator-confirm-bar"><button type="button" className="admin-primary" disabled={adding.length === 0} onClick={() => setDialog({ kind: 'add' })}>{adding.length ? `Add ${plural(adding.length, 'subject')}` : 'Select subjects to add'}</button></div></>}
    </section>
    <AuditCard client={client} scope={scope} set={set}/>
    {dialog?.kind === 'withdraw' && <ActionDialog title={`Withdraw ${dialog.offering.subjectCode}`} confirmLabel="Withdraw subject" danger onCancel={() => setDialog(null)}
      description={<>{dialog.offering.subjectName}. Students will no longer see this subject as confirmed. You can re-confirm it later.</>}
      onSubmit={reason => guarded(() => client.withdrawOfferings(scope, rev, [dialog.offering.subjectId], reason), `${dialog.offering.subjectCode} withdrawn.`)}/>}
    {dialog?.kind === 'reconfirm' && <ActionDialog title={`Re-confirm ${dialog.offering.subjectCode}`} confirmLabel="Re-confirm subject" onCancel={() => setDialog(null)}
      description={<>{dialog.offering.subjectName}. It will be shown again as confirmed by the coordinator, with the current pick deadline.</>}
      onSubmit={reason => guarded(() => client.confirmOfferings({ scope, forecastRunId: set.forecastRunId!, subjectIds: [dialog.offering.subjectId], reason, pickDeadline: set.pickDeadline!, revision: rev }), `${dialog.offering.subjectCode} re-confirmed.`)}/>}
    {dialog?.kind === 'add' && <ActionDialog title="Add subjects" confirmLabel={`Add ${plural(adding.length, 'subject')}`} onCancel={() => setDialog(null)}
      description={<><p>Confirm {plural(adding.length, 'more subject')} from this forecast. The pick deadline stays {when(set.pickDeadline)}.</p>
        <ul className="coordinator-dialog-list">{addable.filter(subject => adding.includes(subject.subjectId)).map(subject => <li key={subject.subjectId}>{subject.subjectCode} {subject.subjectName}</li>)}</ul></>}
      onSubmit={reason => guarded(async () => { const result = await client.confirmOfferings({ scope, forecastRunId: set.forecastRunId!, subjectIds: [...adding].sort((a, b) => a - b), reason, pickDeadline: set.pickDeadline!, revision: rev }); setAdding([]); return result; }, `${plural(adding.length, 'subject')} added.`)}/>}
    {dialog?.kind === 'deadline' && <DeadlineDialog client={client} scope={scope} set={set} onCancel={() => setDialog(null)}
      onSubmit={(input, reason) => guarded(() => client.setPickDeadline(scope, rev, { ...input, reason }), input.forecastRunId ? 'Pick deadline and forecast updated.' : `Pick deadline changed to ${when(input.pickDeadline)}.`)}/>}
  </>;
}

function Decisions({ client, scope }: { client: CoordinatorClient; scope: ChosenScope }) {
  const read = useRead(signal => client.getConfirmation(scope, signal), `confirmation|${scope.programmeId}|${scope.learningCentreId}`);
  const [notice, setNotice] = useState<Notice>(null);
  const announce = (next: Notice) => { setNotice(next); requestAnimationFrame(() => document.getElementById('coordinator-action-status')?.focus()); };
  const hooks: Hooks = { client, scope, announce, reload: read.reload };
  return <>
    <StatusRegion notice={notice}/>
    <Panel error={read.error} retry={read.retry} label="offering decisions">{read.data && (read.data.revision === null
      ? <CreateConfirmation {...hooks}/>
      : <ExistingConfirmation {...hooks} data={read.data}/>)}</Panel>
  </>;
}

export function DecisionsPage({ client, search }: { client: CoordinatorClient; search: string }): ReactNode {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  const { programmeId, learningCentreId } = readScope(search);
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  return <>
    <PageHeading title="Offering Decisions" text="Confirm the subjects offered next semester for your programme and learning centre, and set the date students can pick until."/>
    <Panel error={context.error} retry={context.retry} label="decision scope">{context.data && <>
      <ScopePicker context={context.data} path="/coordinator/decisions" programmeId={programmeId} learningCentreId={learningCentreId}/>
      {scope ? <Decisions key={`${scope.programmeId}-${scope.learningCentreId}`} client={client} scope={scope}/>
        : <section className="admin-card admin-empty"><h2>Choose a scope</h2><p>Select a programme and a learning centre to confirm its offerings.</p></section>}
    </>}</Panel>
  </>;
}

