import { useEffect, useId, useMemo, useState } from 'react';
import type { GraduationPlan, PlanningInput, ScenarioChange, ScenarioChangeKind } from '../../../../../packages/shared/src/planning/contracts';
import { comparePlans, planBaseline, planScenario } from '../../../../../packages/shared/src/planning/engine';
import { errorMessage } from '../profile/client';
import type { PlanningClient } from './client';
import { CHANGE_LABEL, changeableSubjects, describeChange, differenceText, replacementOptions, subjectNote } from './plan-view';
import '../../app/typography.css';
import './planning-page.css';

function Timeline({ plan, heading }: { plan: GraduationPlan; heading: string }) {
  return <section className="planning-card" aria-labelledby="planning-timeline-heading">
    <h2 id="planning-timeline-heading">{heading}</h2>
    <ol className="planning-semesters">{plan.semesters.map(semester => <li key={semester.index} className="planning-semester">
      <div className="planning-semester-head"><h3>{semester.label}</h3>
        <span>{semester.subjects.length} of {semester.maxSubjects} subjects · {semester.credits} of {semester.maxCredits} credits</span></div>
      {semester.subjects.length === 0 ? <p className="planning-empty">Nothing can be taken this semester: the subjects left are waiting for a prerequisite or run in the other semester type.</p>
        : <div className="planning-table-scroll" role="region" aria-label={semester.label + ' subjects'} tabIndex={0}><table className="planning-table planning-table--semester">
          <thead><tr><th scope="col">Subject</th><th scope="col" className="planning-number">Credits</th><th scope="col">Note</th></tr></thead>
          <tbody>{semester.subjects.map(s => <tr key={s.curriculumSubjectId + (s.failedAttempt ? '-failed' : '')} data-subject={s.subjectCode} className={s.failedAttempt ? 'planning-failed' : undefined}>
            <th scope="row"><span className="planning-subject-name">{s.subjectName}</span><span className="planning-subject-code">{s.subjectCode}</span></th>
            <td className="planning-number">{s.creditHours}</td>
            <td>{subjectNote(s) ?? <span className="planning-muted">—</span>}</td>
          </tr>)}</tbody></table></div>}
    </li>)}</ol>
  </section>;
}

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

function WhatIf({ input, baseline, changes, setChanges }: { input: PlanningInput; baseline: GraduationPlan; changes: ScenarioChange[]; setChanges: (next: ScenarioChange[]) => void }) {
  const subjectField = useId(), actionField = useId(), replacementField = useId();
  const subjects = changeableSubjects(baseline);
  const [subjectId, setSubjectId] = useState<number | null>(subjects[0]?.curriculumSubjectId ?? null);
  const [kind, setKind] = useState<ScenarioChangeKind>('POSTPONE');
  const subject = subjects.find(s => s.curriculumSubjectId === subjectId) ?? subjects[0];
  const options = subject ? replacementOptions(input, baseline, subject) : [];
  const [replacementId, setReplacementId] = useState<number | null>(null);
  const replacement = options.find(o => o.curriculumSubjectId === replacementId) ?? options[0];
  const kinds = (Object.keys(CHANGE_LABEL) as ScenarioChangeKind[]).filter(k => k !== 'REPLACE' || options.length > 0);
  const action = kinds.includes(kind) ? kind : 'POSTPONE';
  if (!subject) return null;
  const add = () => setChanges([...changes, action === 'REPLACE' ? { kind: action, curriculumSubjectId: subject.curriculumSubjectId, replacementId: replacement?.curriculumSubjectId } : { kind: action, curriculumSubjectId: subject.curriculumSubjectId }]);
  return <section className="planning-card" aria-labelledby="planning-whatif-heading">
    <h2 id="planning-whatif-heading">What if…</h2>
    <p className="planning-lead">Try a change and compare it with your plan. Nothing is saved and your records do not change.</p>
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
    {changes.length > 0 && <>
      <h3>Your changes</h3>
      <ul className="planning-changes">{changes.map((change, index) => <li key={index}><span>{describeChange(change, input)}</span>
        <button type="button" className="planning-button" aria-label={'Remove: ' + describeChange(change, input)} onClick={() => setChanges(changes.filter((_, i) => i !== index))}>Remove</button></li>)}</ul>
      <button type="button" className="planning-button" onClick={() => setChanges([])}>Reset to my plan</button>
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

export function PlanningPage({ api }: { api: PlanningClient }) {
  const [input, setInput] = useState<PlanningInput>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [view, setView] = useState<'baseline' | 'scenario'>('scenario');
  useEffect(() => {
    const controller = new AbortController(); setInput(undefined); setError(''); setChanges([]);
    api.load(controller.signal).then(value => { if (!controller.signal.aborted) setInput(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, refresh]);
  const baseline = useMemo(() => input ? planBaseline(input) : null, [input]);
  const scenario = useMemo(() => input && changes.length ? planScenario(input, changes) : null, [input, changes]);
  const shown = scenario && view === 'scenario' ? scenario : baseline;
  return <section className="planning-page" aria-label="Graduation plan">
    <header><p className="planning-eyebrow">Graduation plan</p><h1>When could you finish?</h1>
      <p className="planning-lead">A semester-by-semester plan for the subjects you still need, using your records, your programme's rules and the semester limits.</p></header>
    {error && <div role="alert" className="planning-error"><p>{error}</p><button type="button" className="planning-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!input && !error && <p role="status">Loading your graduation plan…</p>}
    {input && baseline && <>
      <Summary plan={baseline}/>
      {baseline.status !== 'DONE' && <WhatIf input={input} baseline={baseline} changes={changes} setChanges={setChanges}/>}
      {scenario && <Comparison baseline={baseline} scenario={scenario}/>}
      {scenario && <div className="planning-toggle" role="group" aria-label="Plan shown">
        <button type="button" aria-pressed={view === 'baseline'} onClick={() => setView('baseline')}>Your plan</button>
        <button type="button" aria-pressed={view === 'scenario'} onClick={() => setView('scenario')}>With your changes</button>
      </div>}
      {shown && shown.semesters.length > 0 && <Timeline plan={shown} heading={shown === scenario ? 'Plan with your changes' : 'Your plan'}/>}
      {baseline.bottlenecks.length > 0 && <section className="planning-card" aria-labelledby="planning-bottleneck-heading">
        <h2 id="planning-bottleneck-heading">Subjects not to delay</h2>
        <ul className="planning-bottlenecks">{baseline.bottlenecks.map(b => <li key={b.curriculumSubjectId}><strong>{b.subjectName}</strong> <span className="planning-subject-code">{b.subjectCode}</span><p>{b.explanation}</p></li>)}</ul>
      </section>}
      <section className="planning-notice" aria-label="How this plan is made"><h2>How this plan is made</h2><ul>{(shown ?? baseline).assumptions.map(a => <li key={a}>{a}</li>)}</ul></section>
    </>}
  </section>;
}
