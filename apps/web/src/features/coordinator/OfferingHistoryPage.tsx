import { useEffect, useId, useRef, useState } from 'react';
import type { ForecastContext, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { CoordinatorClient } from './client';
import { PageHeading, semesterLabel, useRead } from './coordinator-ui';
import { closedSemesters, historyRows } from './offering-history';
import { SubjectPickersDialog, type PickerListCache } from './SubjectPickersDialog';

const DESCRIPTION = "Look back at past semesters' offering decisions and how many students picked each subject.";
const NO_CLOSED = 'No semester has closed subject selection yet.';
const NO_DECISIONS = 'No offering decisions were recorded for this programme, learning centre and semester.';

function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return <section className="admin-card admin-error"><p role="alert">{message}</p><button type="button" onClick={retry}>Try again</button></section>;
}

/** Decisions and pick counts of one scope and past semester: read only. */
function History({ client, scope }: { client: CoordinatorClient; scope: ForecastScope }) {
  const key = [scope.programmeId, scope.learningCentreId, scope.targetSemesterId].join('|');
  const decisions = useRead(signal => client.getDecisions(scope, signal), 'history|' + key);
  const pickerCache = useRef<PickerListCache>(new Map());
  const [viewing, setViewing] = useState<{ subjectId: number; code: string } | null>(null);
  // Picker lists hold personal data: memory only. Chooser remounts History per scope (key), so each scope or
  // semester gets a fresh cache and dialog state; a late response from an old scope lands in a discarded cache.
  useEffect(() => { const cache = pickerCache.current; return () => cache.clear(); }, []);
  if (decisions.error) return <ErrorBox message={decisions.error} retry={decisions.retry}/>;
  if (!decisions.data) return <section className="admin-card admin-loading" role="status">Loading offering history…</section>;
  const rows = historyRows(decisions.data);
  return <section className="admin-card" aria-labelledby="coordinator-history-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-history-heading">Decisions and picks</h2><p className="admin-muted">Read only. Removed subjects were not offered, so nobody could pick them.</p></div></div>
    {rows.length === 0 ? <p className="admin-empty" role="status">{NO_DECISIONS}</p>
      : <div className="admin-table-scroll coordinator-table" role="region" aria-label="Offering history table" tabIndex={0}>
        <table><thead><tr><th scope="col">Subject</th><th scope="col">Credits</th><th scope="col">Decision</th><th scope="col">Picked by</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.subjectId} data-subject={row.code}>
            <th scope="row"><strong>{row.name}</strong><span className="coordinator-subject-code">{row.code}</span></th>
            <td>{row.credits}</td>
            <td><span className={'admin-pill ' + (row.decision === 'Approved' ? 'coordinator-pill-success' : 'coordinator-pill-muted')}>{row.decision}</span></td>
            <td><div className="coordinator-pick-cell"><strong className="coordinator-number">{row.picks ?? '—'}</strong>
              {row.picks ? <button type="button" className="coordinator-expander coordinator-students-button" aria-haspopup="dialog" aria-label={`View students for ${row.code}`} onClick={() => setViewing({ subjectId: row.subjectId, code: row.code })}>View students</button> : null}</div></td>
          </tr>)}</tbody></table></div>}
    {viewing && <SubjectPickersDialog client={client} scope={scope} subjectId={viewing.subjectId} subjectCode={viewing.code} cache={pickerCache.current} onClose={() => setViewing(null)}/>}
  </section>;
}

interface Pair { programmeId: number; learningCentreId: number }
const assignedPairs = (context: ForecastContext): Pair[] => context.assignedScopes ?? [];

function Chooser({ client, context }: { client: CoordinatorClient; context: ForecastContext }) {
  const programmeField = useId(), centreField = useId(), semesterField = useId();
  const pairs = assignedPairs(context), semesters = closedSemesters(context.semesters ?? [], new Date());
  const [programmeId, setProgramme] = useState<number | null>(pairs[0]?.programmeId ?? null);
  const [centreId, setCentre] = useState<number | null>(pairs[0]?.learningCentreId ?? null);
  const [semesterId, setSemester] = useState<number | null>(semesters[0]?.semesterId ?? null);
  if (pairs.length === 0) return <section className="admin-card"><p className="admin-notice" role="status">You are not assigned to any programme and learning centre yet. Ask a system administrator to assign you in Coordinator Assignments.</p></section>;
  if (semesters.length === 0) return <section className="admin-card"><p className="admin-empty" role="status">{NO_CLOSED}</p></section>;
  const programmes = context.programmes.filter(programme => pairs.some(pair => pair.programmeId === programme.programmeId));
  const centres = context.learningCentres.filter(centre => pairs.some(pair => pair.programmeId === programmeId && pair.learningCentreId === centre.learningCentreId));
  const scope: ForecastScope | null = programmeId !== null && centreId !== null && semesterId !== null && pairs.some(pair => pair.programmeId === programmeId && pair.learningCentreId === centreId)
    ? { programmeId, learningCentreId: centreId, targetSemesterId: semesterId } : null;
  return <>
    <section className="admin-card coordinator-setup" aria-labelledby="coordinator-history-scope-heading">
      <div className="admin-card-title"><div><h2 id="coordinator-history-scope-heading">Scope</h2><p className="admin-muted">Choose a programme, a learning centre and a past semester.</p></div></div>
      <div className="coordinator-scope-grid">
        <div className="admin-field"><label htmlFor={programmeField} className="coordinator-field-label">Programme</label>
          <select id={programmeField} value={programmeId ?? ''} onChange={event => { const next = Number(event.target.value); setProgramme(next); setCentre(pairs.find(pair => pair.programmeId === next)?.learningCentreId ?? null); }}>
            {programmes.map(item => <option key={item.programmeId} value={item.programmeId}>{item.programmeCode} · {item.programmeName}</option>)}
          </select></div>
        <div className="admin-field"><label htmlFor={centreField} className="coordinator-field-label">Learning centre</label>
          <select id={centreField} value={centreId ?? ''} onChange={event => setCentre(Number(event.target.value))}>
            {centres.map(item => <option key={item.learningCentreId} value={item.learningCentreId}>{item.centreCode} · {item.centreName}</option>)}
          </select></div>
        <div className="admin-field"><label htmlFor={semesterField} className="coordinator-field-label">Semester</label>
          <select id={semesterField} value={semesterId ?? ''} onChange={event => setSemester(Number(event.target.value))}>
            {semesters.map(item => <option key={item.semesterId} value={item.semesterId}>{semesterLabel(item)}</option>)}
          </select></div>
      </div>
    </section>
    {scope && <History key={[scope.programmeId, scope.learningCentreId, scope.targetSemesterId].join('|')} client={client} scope={scope}/>}
  </>;
}

export function OfferingHistoryPage({ client }: { client: CoordinatorClient }) {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  return <>
    <PageHeading title="Offering History" text={DESCRIPTION}/>
    {context.error ? <ErrorBox message={context.error} retry={context.retry}/>
      : context.data ? <Chooser client={client} context={context.data}/>
        : <section className="admin-card admin-loading" role="status">Loading offering history…</section>}
  </>;
}
