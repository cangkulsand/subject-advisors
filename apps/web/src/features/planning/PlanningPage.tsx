import { useEffect, useId, useMemo, useState } from 'react';
import type { GraduationPlan, PlanningInput, ScenarioChange, ScenarioChangeKind } from '../../../../../packages/shared/src/planning/contracts';
import { comparePlans, planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { checkChange, removeChange, validateChanges } from '../../../../../packages/shared/src/planning/placement';
import { toSaved } from '../../../../../packages/shared/src/planning/saved';
import { errorMessage } from '../profile/client';
import type { PlanningClient } from './client';
import { CheckIcon, SpinnerIcon, WarningIcon } from './icons';
import { PlanBoard } from './PlanBoard';
import { CHANGE_LABEL, changeableSubjects, describeChange, differenceText, replacementOptions, restoreChanges } from './plan-view';
import { SaveQueue, type SaveStatus } from './save-queue';
import '../../app/typography.css';
import './planning-page.css';

function Summary({ plan }: { plan: GraduationPlan }) {
  if (plan.status === 'DONE') return <section className="planning-card" aria-label="Plan summary"><p className="planning-status planning-status--met">No subjects left to plan</p><p className="planning-lead">Your records already cover every subject your programme needs. Check the Graduation check page for the rest.</p></section>;
  return <section className="planning-card" aria-label="Plan summary">
    <dl className="planning-summary">
      <div><dt>Estimated completion</dt><dd>{plan.completion?.label ?? 'Cannot be planned yet'}</dd>{plan.completion && <p>{plan.completion.index} semester{plan.completion.index === 1 ? '' : 's'} from now</p>}</div>
      <div><dt>Earliest possible</dt><dd>{plan.earliest?.label ?? '—'}</dd><p>If nothing else held you back</p></div>
      <div><dt>Still to take</dt><dd>{plan.remainingSubjects} subjects</dd><p>{plan.remainingCredits} credits</p></div>
    </dl>
    {plan.unplanned.length > 0 && <div className="planning-warning" role="status"><h3>Some subjects cannot be planned</h3>
      <ul>{plan.unplanned.map(u => <li key={u.curriculumSubjectId}><strong>{u.subjectCode}</strong> {u.subjectName}: {u.reason}</li>)}</ul></div>}
  </section>;
}

function WhatIf({ input, baseline, changes, apply }: { input: PlanningInput; baseline: GraduationPlan; changes: ScenarioChange[]; apply: (next: ScenarioChange[] | null) => string | null }) {
  const subjectField = useId(), actionField = useId(), replacementField = useId();
  const subjects = changeableSubjects(baseline);
  const [subjectId, setSubjectId] = useState<number | null>(subjects[0]?.curriculumSubjectId ?? null);
  const [kind, setKind] = useState<ScenarioChangeKind>('POSTPONE');
  const [refusal, setRefusal] = useState('');
  const subject = subjects.find(s => s.curriculumSubjectId === subjectId) ?? subjects[0];
  const options = subject ? replacementOptions(input, baseline, subject) : [];
  const [replacementId, setReplacementId] = useState<number | null>(null);
  const replacement = options.find(o => o.curriculumSubjectId === replacementId) ?? options[0];
  const kinds = (Object.keys(CHANGE_LABEL) as ScenarioChangeKind[]).filter(k => k !== 'PLACE' && (k !== 'REPLACE' || options.length > 0));
  const action = kinds.includes(kind) ? kind : 'POSTPONE';
  if (!subject) return null;
  const add = () => {
    const change: ScenarioChange = action === 'REPLACE' ? { kind: action, curriculumSubjectId: subject.curriculumSubjectId, replacementId: replacement?.curriculumSubjectId } : { kind: action, curriculumSubjectId: subject.curriculumSubjectId };
    const check = checkChange(input, changes, change);
    if (!check.ok) { setRefusal(check.reason); return; }
    setRefusal(apply(check.changes) ?? '');
  };
  const remove = (index: number) => setRefusal(apply(removeChange(changes, index)) ?? '');
  return <section className="planning-card" aria-labelledby="planning-whatif-heading">
    <h2 id="planning-whatif-heading">What if…</h2>
    <p className="planning-lead">Try a change, or move subjects in the plan below, and compare with your plan. Your changes are saved for next time; your records do not change.</p>
    <div className="planning-form">
      <div className="planning-field"><label htmlFor={subjectField}>Subject</label>
        <select id={subjectField} value={subject.curriculumSubjectId} onChange={e => { setSubjectId(Number(e.target.value)); setReplacementId(null); }}>
          {subjects.map(s => <option key={s.curriculumSubjectId} value={s.curriculumSubjectId}>{s.subjectName} ({s.subjectCode})</option>)}
        </select></div>
      <div className="planning-field"><label htmlFor={actionField}>Change</label>
        <select id={actionField} value={action} onChange={e => setKind(e.target.value as ScenarioChangeKind)}>
          {kinds.map(k => <option key={k} value={k}>{CHANGE_LABEL[k]}</option>)}
        </select></div>
      {action === 'REPLACE' && replacement && <div className="planning-field"><label htmlFor={replacementField}>Take instead</label>
        <select id={replacementField} value={replacement.curriculumSubjectId} onChange={e => setReplacementId(Number(e.target.value))}>
          {options.map(o => <option key={o.curriculumSubjectId} value={o.curriculumSubjectId}>{o.subjectName} ({o.subjectCode})</option>)}
        </select></div>}
      <button type="button" className="planning-button planning-button--primary" onClick={add}>Add change</button>
    </div>
    <p className="planning-move-message" role="status">{refusal && <><WarningIcon />{refusal}</>}</p>
    {changes.length > 0 && <>
      <h3>Your changes</h3>
      <ul className="planning-changes">{changes.map((change, index) => <li key={index}><span>{describeChange(change, input)}</span>
        <button type="button" className="planning-button" aria-label={'Remove: ' + describeChange(change, input)} onClick={() => remove(index)}>Remove</button></li>)}</ul>
      <button type="button" className="planning-button" onClick={() => { setRefusal(''); apply(null); }}>Reset to my plan</button>
    </>}
  </section>;
}

function Comparison({ baseline, scenario }: { baseline: GraduationPlan; scenario: GraduationPlan }) {
  const comparison = comparePlans(baseline, scenario);
  return <section className="planning-card" aria-labelledby="planning-compare-heading">
    <h2 id="planning-compare-heading">Compare with your plan</h2>
    <dl className="planning-summary">
      <div><dt>Your plan</dt><dd>{comparison.baseline?.label ?? 'Cannot be completed'}</dd></div>
      <div><dt>With your changes</dt><dd>{comparison.scenario?.label ?? 'Cannot be completed'}</dd></div>
      <div><dt>Difference</dt><dd className={comparison.semesterDifference && comparison.semesterDifference > 0 ? 'planning-later' : undefined}>{differenceText(comparison.semesterDifference)}</dd></div>
    </dl>
    {comparison.moved.length === 0 ? <p className="planning-empty">No subject moves to a different semester.</p>
      : <div className="planning-table-scroll" role="region" aria-label="Subjects that move" tabIndex={0}><table className="planning-table">
        <thead><tr><th scope="col">Subject</th><th scope="col">Your plan</th><th scope="col">With your changes</th></tr></thead>
        <tbody>{comparison.moved.map(m => <tr key={m.curriculumSubjectId} data-subject={m.subjectCode}>
          <th scope="row"><span className="planning-subject-name">{m.subjectName}</span><span className="planning-subject-code">{m.subjectCode}</span></th>
          <td>{m.from ?? 'Not in plan'}</td><td>{m.to ?? 'Not in plan'}</td></tr>)}</tbody></table></div>}
  </section>;
}

function SaveState({ status, retry }: { status: SaveStatus; retry: () => void }) {
  return <div className="planning-save" role="status">
    {status === 'saving' && <><SpinnerIcon /><span>Saving…</span></>}
    {status === 'saved' && <><CheckIcon /><span>Saved</span></>}
    {status === 'failed' && <><WarningIcon /><span>Not saved</span><button type="button" className="planning-button" onClick={retry}>Try again</button></>}
  </div>;
}

export function PlanningPage({ api }: { api: PlanningClient }) {
  const [input, setInput] = useState<PlanningInput>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [view, setView] = useState<'baseline' | 'scenario'>('scenario');
  const queue = useMemo(() => new SaveQueue(async value => {
    if (value === null || value.length === 0) await api.clearScenario(); else await api.saveScenario(value);
  }, setStatus), [api]);
  useEffect(() => {
    const controller = new AbortController(); setInput(undefined); setError(''); setChanges([]); setStale(false);
    Promise.all([api.load(controller.signal), api.loadScenario(controller.signal)]).then(([value, saved]) => {
      if (controller.signal.aborted) return;
      const restored = restoreChanges(value, saved);
      setInput(value); setChanges(restored.changes);
      if (restored.dropped > 0) { setStale(true); queue.push(toSaved(value, restored.changes)); }
    }).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, refresh, queue]);
  const baseline = useMemo(() => input ? planBaseline(input) : null, [input]);
  const scenario = useMemo(() => input && changes.length ? planScenario(input, changes) : null, [input, changes]);
  /** Shows and saves a list already checked by the engine; null resets. Returns a refusal when the list no longer holds. */
  const apply = (next: ScenarioChange[] | null): string | null => {
    if (!input) return null;
    if (next !== null && next.length) {
      const check = validateChanges(input, next);
      if (!check.ok) return check.reason;
    }
    const list = next ?? [];
    setChanges(list); setStale(false);
    if (list.length === 0) setView('scenario');
    queue.push(list.length ? toSaved(input, list) : null);
    return null;
  };
  const showBaseline = scenario !== null && view === 'baseline';
  const shown = showBaseline ? baseline : scenario ?? baseline;
  return <section className="planning-page" aria-label="Graduation plan">
    <header><p className="planning-eyebrow">Graduation plan</p><h1>When could you finish?</h1>
      <p className="planning-lead">A semester-by-semester plan for the subjects you still need, using your records, your programme's rules and the semester limits.</p></header>
    {error && <div role="alert" className="planning-error"><p>{error}</p><button type="button" className="planning-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!input && !error && <p role="status">Loading your graduation plan…</p>}
    {input && baseline && <>
      <Summary plan={baseline}/>
      {stale && <p className="planning-stale" role="status"><WarningIcon />Some saved changes no longer apply and were removed.</p>}
      {baseline.status !== 'DONE' && <WhatIf input={input} baseline={baseline} changes={changes} apply={apply}/>}
      {scenario && <Comparison baseline={baseline} scenario={scenario}/>}
      {scenario && <div className="planning-toggle" role="group" aria-label="Plan shown">
        <button type="button" aria-pressed={view === 'baseline'} onClick={() => setView('baseline')}>Your plan</button>
        <button type="button" aria-pressed={view === 'scenario'} onClick={() => setView('scenario')}>With your changes</button>
      </div>}
      {shown && shown.semesters.length > 0 && <PlanBoard input={input} plan={shown} changes={changes} editable={!showBaseline}
        heading={shown === scenario ? 'Plan with your changes' : 'Your plan'} status={<SaveState status={status} retry={() => queue.retry()}/>}
        onChange={next => { apply(next); }}/>}
      {baseline.bottlenecks.length > 0 && <section className="planning-card" aria-labelledby="planning-bottleneck-heading">
        <h2 id="planning-bottleneck-heading">Subjects not to delay</h2>
        <ul className="planning-bottlenecks">{baseline.bottlenecks.map(b => <li key={b.curriculumSubjectId}><strong>{b.subjectName}</strong> <span className="planning-subject-code">{b.subjectCode}</span><p>{b.explanation}</p></li>)}</ul>
      </section>}
      <section className="planning-notice" aria-label="How this plan is made"><h2>How this plan is made</h2><ul>{(shown ?? baseline).assumptions.map(a => <li key={a}>{a}</li>)}</ul></section>
    </>}
  </section>;
}
