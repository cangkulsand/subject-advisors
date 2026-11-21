import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GraduationPlan, PlanningInput, ScenarioChange } from '../../../../../packages/shared/src/planning/contracts';
import type { PlanAssessment, RequirementProgress } from '../../../../../packages/shared/src/planning/assessment';
import { assessPlan } from '../../../../../packages/shared/src/planning/assessment';
import { comparePlans, planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { removeChange, validateChanges } from '../../../../../packages/shared/src/planning/placement';
import { toSaved } from '../../../../../packages/shared/src/planning/saved';
import { AcademicApiError, errorMessage } from '../profile/client';
import type { PlanningClient } from './client';
import { CheckIcon, SpinnerIcon, WarningIcon } from './icons';
import { PlanBoard } from './PlanBoard';
import { PlanDependencies } from './PlanDependencies';
import { describeChange, differenceText, restoreChanges } from './plan-view';
import { SaveQueue, type SaveStatus } from './save-queue';
import '../../app/typography.css';
import './planning-page.css';
import { DialogHead } from '../../components/dialog/DialogHead';
import { IconButton } from '../../components/icon-button/IconButton';
import { ToastStack } from '../../components/feedback/ToastStack';
import { useToastNotifications } from '../../components/feedback/useToastNotifications';

const STATUS_LABEL: Record<RequirementProgress['status'], string> = {
  MET: 'Met', PROJECTED: 'Projected', OUTSTANDING: 'Outstanding', UNVERIFIED: 'Cannot verify',
};

/** What the board alone cannot say: nothing left to plan, or subjects that cannot be placed at all. */
function PlanNotices({ plan }: { plan: GraduationPlan }) {
  return <>
    {plan.status === 'DONE' && <p className="planning-status planning-status--met" role="status">No subjects left to plan</p>}
    {plan.unplanned.length > 0 && <div className="planning-warning" role="status"><h3>Some subjects cannot be planned</h3>
      <ul>{plan.unplanned.map(u => <li key={u.curriculumSubjectId}><strong>{u.subjectCode}</strong> {u.subjectName}: {u.reason}</li>)}</ul></div>}
  </>;
}

/** The what-if changes as a compact list with Remove, and Reset (the changes themselves are made on the board). */
function ChangesBar({ input, changes, apply, confirmReset, onRefuse }: { input: PlanningInput; changes: ScenarioChange[]; apply: (next: ScenarioChange[] | null) => string | null; confirmReset: (trigger: HTMLElement) => void; onRefuse: (reason: string) => void }) {
  if (changes.length === 0) return null;
  return <section className="planning-changes-bar" aria-label="Your changes">
    <ul className="planning-changes">{changes.map((change, index) => <li key={index}><span>{describeChange(change, input)}</span>
      <button type="button" className="planning-chip-remove" aria-label={'Remove: ' + describeChange(change, input)} onClick={() => { const refusal = apply(removeChange(changes, index)); if (refusal) onRefuse(refusal); }}>×</button></li>)}</ul>
    <button type="button" className="planning-button" onClick={event => confirmReset(event.currentTarget)}>Reset to my plan</button>
  </section>;
}

function Comparison({ input, baseline, scenario }: { input: PlanningInput; baseline: GraduationPlan; scenario: GraduationPlan }) {
  const comparison = comparePlans(baseline, scenario);
  const before = assessPlan(input, baseline);
  const after = assessPlan(input, scenario);
  const reliable = before.complete && after.complete;
  const sideLabel = (assessment: PlanAssessment, plan: GraduationPlan, completion: GraduationPlan['completion']) =>
    !assessment.complete ? 'Cannot confirm yet'
      : plan.status === 'DONE' ? 'Nothing left to schedule'
      : completion?.label ?? 'Cannot be completed';
  const afterByKey = new Map(after.requirements.map(r => [r.key, r]));
  return <section className="planning-card" aria-labelledby="planning-compare-heading">
    <h2 id="planning-compare-heading">Compare with your plan</h2>
    <dl className="planning-summary">
      <div><dt>Baseline plan</dt><dd>{sideLabel(before, baseline, comparison.baseline)}</dd></div>
      <div><dt>With your changes</dt><dd>{sideLabel(after, scenario, comparison.scenario)}</dd></div>
      <div><dt>Difference</dt><dd className={reliable && comparison.semesterDifference && comparison.semesterDifference > 0 ? 'planning-later' : undefined}>
        {reliable ? differenceText(comparison.semesterDifference) : 'Cannot compare reliably'}</dd>
        {!reliable && <p>Projection cannot be confirmed for every requirement, so no completion delay is shown.</p>}</div>
    </dl>
    <details className="planning-requirements">
      <summary>Requirement changes</summary>
      <div className="planning-table-scroll" role="region" aria-label="Requirement comparison" tabIndex={0}>
        <table className="planning-table">
          <thead><tr><th scope="col">Requirement</th><th scope="col">Baseline plan</th><th scope="col">With your changes</th></tr></thead>
          <tbody>{before.requirements.map(row => {
            const other = afterByKey.get(row.key);
            const cell = (r: RequirementProgress | undefined) => r === undefined ? '—'
              : `${STATUS_LABEL[r.status]}${r.status === 'PROJECTED' && r.completion ? ` by ${r.completion.label}` : ''}`;
            return <tr key={row.key}><th scope="row">{row.name}</th><td>{cell(row)}</td><td>{cell(other)}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </details>
    {comparison.moved.length === 0 ? <p className="planning-empty">No subject moves to a different semester.</p>
      : <div className="planning-table-scroll" role="region" aria-label="Subjects that move" tabIndex={0}><table className="planning-table">
        <thead><tr><th scope="col">Subject</th><th scope="col">Your plan</th><th scope="col">With your changes</th></tr></thead>
        <tbody>{comparison.moved.map(m => <tr key={m.curriculumSubjectId} data-subject={m.subjectCode}>
          <th scope="row"><span className="planning-subject-name">{m.subjectName}</span><span className="planning-subject-code">{m.subjectCode}</span></th>
          <td>{m.from ?? 'Not in plan'}</td><td>{m.to ?? 'Not in plan'}</td></tr>)}</tbody></table></div>}
  </section>;
}

function SaveState({ status, retry }: { status: SaveStatus; retry?: () => void }) {
  return <div className="planning-save" role="status">
    {status === 'saving' && <><SpinnerIcon /><span>Saving…</span></>}
    {status === 'saved' && <><CheckIcon /><span>Saved</span></>}
    {status === 'failed' && <><WarningIcon /><span>Not saved</span>{retry && <button type="button" className="planning-button" onClick={retry}>Try again</button>}</>}
  </div>;
}

function ConfirmDialog({ title, lead, confirm, onCancel, onConfirm }: { title: string; lead: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const leadId = useId();
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={ref} className="planning-dialog" aria-labelledby={titleId} aria-describedby={leadId} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <DialogHead onClose={onCancel}><h3 id={titleId}>{title}</h3></DialogHead>
    <p className="planning-dialog-lead" id={leadId}>{lead}</p>
    <div className="planning-dialog-actions">
      <button type="button" className="planning-button" onClick={onCancel}>Cancel</button>
      <button type="button" className="planning-button planning-button--primary" onClick={onConfirm}>{confirm}</button>
    </div>
  </dialog>;
}

export function PlanningPage({ api }: { api: PlanningClient }) {
  const [input, setInput] = useState<PlanningInput>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [stale, setStale] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [board, setBoard] = useState<'plan' | 'dependencies'>('plan');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const queueRef = useRef<SaveQueue | null>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const [pendingFocus, setPendingFocus] = useState<HTMLElement | null>(null);
  // Errors are toasts as well as inline state, so the student sees them without scrolling back to the top (S3-P004-028).
  const { toasts, notify, dismissToast, onToastAnimationEnd } = useToastNotifications();
  const warn = (reason: string) => notify(reason, 'warning');
  useEffect(() => { if (status === 'failed' && !outdated) notify('Your last change was not saved. Use Try again at the top of the plan.', 'danger'); }, [status]);
  useEffect(() => { if (outdated) notify('This plan view is out of date, so your latest change was not saved. Refresh the plan to keep working.', 'warning'); }, [outdated]);
  useEffect(() => {
    if (confirmReset || confirmRefresh || !pendingFocus) return;
    const target = pendingFocus.isConnected ? pendingFocus : refreshButtonRef.current;
    if (!target) { setPendingFocus(null); return; }
    if (target instanceof HTMLButtonElement && target.disabled) return;
    target.focus();
    setPendingFocus(null);
  }, [confirmReset, confirmRefresh, pendingFocus, status]);
  useEffect(() => {
    const controller = new AbortController();
    const queue = new SaveQueue(async (value, version) => {
      if (value === null || value.length === 0) await api.clearScenario(); else await api.saveScenario(value, version);
    }, setStatus, reason => {
      if (reason instanceof AcademicApiError && (reason.code === 'PLANNING_BASELINE_CHANGED' || reason.code === 'SCENARIO_INVALID')) { setOutdated(true); return true; }
      return false;
    });
    queueRef.current = queue;
    setInput(undefined); setError(''); setChanges([]); setStale(false); setOutdated(false); setStatus('idle');
    Promise.all([api.load(controller.signal), api.loadScenario(controller.signal)]).then(([value, saved]) => {
      if (controller.signal.aborted) return;
      const restored = restoreChanges(value, saved);
      setInput(value); setChanges(restored.changes);
      if (restored.dropped > 0) { setStale(true); queue.push(toSaved(value, restored.changes), value.baselineVersion); }
    }).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => { controller.abort(); queue.dispose(); queueRef.current = null; };
  }, [api, refresh]);
  const baseline = useMemo(() => input ? planBaseline(input) : null, [input]);
  const scenario = useMemo(() => input && changes.length ? planScenario(input, changes) : null, [input, changes]);
  /** Shows and saves a list already checked by the engine; null resets. Returns a refusal when the list no longer holds. */
  const apply = (next: ScenarioChange[] | null): string | null => {
    if (!input) return null;
    if (outdated) return 'This view is out of date. Refresh the plan to keep working.';
    if (next !== null && next.length) {
      const check = validateChanges(input, next);
      if (!check.ok) return check.reason;
    }
    const list = next ?? [];
    setChanges(list); setStale(false);
    queueRef.current?.push(list.length ? toSaved(input, list) : null, input.baselineVersion);
    return null;
  };
  const requestRefresh = (trigger: HTMLElement | null) => {
    dialogTriggerRef.current = trigger;
    if (changes.length > 0) setConfirmRefresh(true);
    else setRefresh(n => n + 1);
  };
  const shown = scenario ?? baseline;
  const saving = status === 'saving';
  const closeDialog = (after: 'trigger' | 'refresh') => {
    setPendingFocus(after === 'trigger' ? dialogTriggerRef.current : refreshButtonRef.current);
  };
  return <section className="planning-page" aria-label="Graduation plan">
    <header className="planning-head"><div><p className="planning-eyebrow">Graduation plan</p><h1>When could you finish?</h1></div>
      <div className="planning-header-actions">
        <IconButton ref={refreshButtonRef} icon="refresh" label="Refresh plan" disabled={saving} onClick={() => requestRefresh(refreshButtonRef.current)}/>
        <SaveState status={status} retry={outdated ? undefined : () => queueRef.current?.retry()}/>
      </div></header>
    {error && <div role="alert" className="planning-error"><p>{error}</p><button type="button" className="planning-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!input && !error && <p role="status">Loading your graduation plan…</p>}
    {input && baseline && shown && <>
      {outdated && <div className="planning-stale" role="status"><WarningIcon /><span>This plan view is out of date: your programme, records or semester setup changed, so your latest change was not saved. Refresh the plan to keep working.</span>
        <button type="button" className="planning-button" disabled={saving} onClick={event => requestRefresh(event.currentTarget)}>Refresh plan</button></div>}
      {stale && <p className="planning-stale" role="status"><WarningIcon />Some saved changes no longer apply and were removed.</p>}
      {outdated && changes.length > 0 && <p className="planning-stale" role="status"><WarningIcon />Your unsaved what-if changes are still shown below, out of date; nothing more will be saved until you refresh.</p>}
      <PlanNotices plan={shown}/>
      {shown && <div className="planning-toolbar">
        <div className="planning-toggle" role="group" aria-label="Plan view">
          <button type="button" aria-pressed={board === 'plan'} onClick={() => setBoard('plan')}>Semester plan</button>
          <button type="button" aria-pressed={board === 'dependencies'} onClick={() => setBoard('dependencies')}>Dependencies</button>
        </div>
        {!outdated && <ChangesBar input={input} changes={changes} apply={apply} confirmReset={trigger => { dialogTriggerRef.current = trigger; setConfirmReset(true); }} onRefuse={warn}/>}
      </div>}
      {shown && board === 'plan' && shown.semesters.length > 0 && <PlanBoard input={input} plan={shown} baseline={baseline} changes={changes} editable={!outdated && baseline.status !== 'DONE'}
        heading={shown === scenario ? 'Plan with your changes' : 'Your plan'}
        onChange={next => { const refusal = apply(next); if (refusal) warn(refusal); }} onRefuse={warn}/>}
      {shown && board === 'dependencies' && <PlanDependencies input={input} plan={shown} baseline={scenario ? baseline : null}/>}
      {!outdated && scenario && <Comparison input={input} baseline={baseline} scenario={scenario}/>}
      {baseline.bottlenecks.length > 0 && <section className="planning-card" aria-labelledby="planning-bottleneck-heading">
        <h2 id="planning-bottleneck-heading">Subjects not to delay</h2>
        <ul className="planning-bottlenecks">{baseline.bottlenecks.map(b => <li key={b.curriculumSubjectId}><strong>{b.subjectName}</strong> <span className="planning-subject-code">{b.subjectCode}</span><p>{b.explanation}</p></li>)}</ul>
      </section>}
      <section className="planning-notice" aria-label="How this plan is made"><h2>How this plan is made</h2><ul>{(shown ?? baseline).assumptions.map(a => <li key={a}>{a}</li>)}</ul></section>
    </>}
    {confirmReset && <ConfirmDialog title="Reset to your plan?" lead="This discards every what-if change you made and shows your plan again. Your records do not change."
      confirm="Reset to my plan" onCancel={() => { setConfirmReset(false); closeDialog('trigger'); }}
      onConfirm={() => { setConfirmReset(false); apply(null); closeDialog('refresh'); }}/>}
    {confirmRefresh && <ConfirmDialog title="Refresh the plan?" lead="This loads the latest plan and discards your unsaved what-if changes. Cancel keeps them on screen."
      confirm="Refresh plan" onCancel={() => { setConfirmRefresh(false); closeDialog('trigger'); }}
      onConfirm={() => { setConfirmRefresh(false); setRefresh(n => n + 1); closeDialog('refresh'); }}/>}
    <ToastStack toasts={toasts} onDismiss={dismissToast} onExitAnimationEnd={onToastAnimationEnd}/>
  </section>;
}
