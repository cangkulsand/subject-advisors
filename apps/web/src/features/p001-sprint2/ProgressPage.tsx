import { useEffect, useRef, useState } from 'react';
import type { Progress, ProgressSubject } from '../../../../api/src/modules/p001-sprint2/contracts';
import { AppLink } from '../../app/navigation';
import type { AcademicClient } from '../profile/client';
import { errorMessage } from '../profile/client';
import type { Sprint2Client } from './client';
import { SubjectDetailsPanel } from './SubjectDetailsPanel';
import { approvedSubjectIdsFrom, describeSubject, OUTCOME_LABEL } from './subject-details';
import '../../app/typography.css';
import './progress-page.css';
import { IconButton } from '../../components/icon-button/IconButton';

/** `offerings` reads GET /api/semester-offerings once; any failure leaves next-semester availability unconfirmed. */
export function ProgressPage({ api, offerings }: { api: Sprint2Client; offerings?: AcademicClient }) {
  const [data, setData] = useState<Progress>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [approved, setApproved] = useState<ReadonlySet<number> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const openers = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    const controller = new AbortController(); setData(undefined); setError('');
    api<Progress>('/progress', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, refresh]);
  useEffect(() => {
    setApproved(null);
    if (!offerings) return;
    const controller = new AbortController();
    offerings<unknown>('/api/semester-offerings', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setApproved(approvedSubjectIdsFrom(value)); })
      .catch(() => { if (!controller.signal.aborted) setApproved(null); });
    return () => controller.abort();
  }, [offerings]);
  useEffect(() => {
    const reload = () => setRefresh(n => n + 1);
    window.addEventListener('p001:records-changed', reload); window.addEventListener('focus', reload);
    return () => { window.removeEventListener('p001:records-changed', reload); window.removeEventListener('focus', reload); };
  }, []);
  const subject: ProgressSubject | undefined = data?.subjects.find(item => item.mappingId === selected);
  function closeDetails() {
    const mappingId = selected; setSelected(null);
    if (mappingId !== null) requestAnimationFrame(() => openers.current.get(mappingId)?.focus());
  }
  return <section className="progress-page" aria-label="Academic progress">
    <header><p className="progress-eyebrow">Academic progress</p><h1>Your programme progress</h1><p className="progress-lead">Credits and subject completion from your saved academic history.</p></header>
    <p className="progress-notice">Student-reported information. This summary does not confirm official graduation eligibility.</p>
    <div className="progress-actions"><AppLink className="progress-button" href="/student/records">Update subject records</AppLink><IconButton icon="refresh" label="Refresh progress" onClick={() => setRefresh(n => n + 1)}/></div>
    {error && <p role="alert" className="progress-error">{error}</p>}
    {!data && !error && <p role="status">Loading academic progress…</p>}
    {data && <>
      <h2>{data.programme}</h2><p className="progress-summary">Curriculum {data.version}</p>
      {data.noHistory && <p role="status" className="progress-note">No academic history yet. Add your completed, exempted, failed or withdrawn subjects to begin.</p>}
      {data.warnings.length > 0 && <section aria-label="Information to review" className="progress-card"><h2>Information to review</h2><ul>{data.warnings.map(w => <li key={w}>{w}</li>)}</ul></section>}
      <dl className="progress-metrics">
        <div><dt>Earned credits</dt><dd>{data.earnedCredits}</dd></div><div><dt>Required credits</dt><dd>{data.totalCredits ?? 'Not configured'}</dd></div>
        <div><dt>Remaining credits</dt><dd>{data.remainingCredits ?? 'Unavailable'}</dd></div><div><dt>Outstanding compulsory subjects</dt><dd>{data.outstandingCompulsory}</dd></div>
      </dl>
      <section className="progress-card" aria-label="Credit completion">
        {data.percent !== null && <div className="progress-bar"><label htmlFor="credit-progress">Credit completion: {data.percent}%</label><progress id="credit-progress" value={data.percent} max={100} /></div>}
        <p>{data.completedCredits} completed credits · {data.exemptionCredits} recognized exemption credits.</p>
        <p>{data.completedSubjects} completed subjects · {data.exemptedSubjects} exempted subjects, including {data.zeroCreditExemptions} without awarded credits.</p>
        <p className="progress-note">Retakes count once per subject. Failed and withdrawn attempts earn zero credits. Credit completion and prescribed-subject completion are separate checks.</p>
      </section>
      <section className="progress-card"><h2>Subjects and outstanding work</h2>
        <label className="progress-filter">Show subjects<select value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All subjects</option><option value="REMAINING">Remaining subjects</option><option value="COMPLETED">Completed subjects</option><option value="EXEMPTED">Exempted subjects</option></select></label>
        <ul className="progress-list">{data.subjects.filter(s => filter === 'ALL' || s.outcome === filter).map(s => <li key={s.mappingId}>
          <div><strong>{s.code} — {s.name}</strong><p>{s.category} · {s.compulsory ? 'Compulsory' : 'Optional / elective'} · {s.credits} subject credits</p></div>
          <div className="progress-row-end"><span>{OUTCOME_LABEL[s.outcome]} · {s.earnedCredits} earned credits</span>
            <button type="button" className="progress-button" aria-label={'Details for ' + s.code} ref={node => { if (node) openers.current.set(s.mappingId, node); else openers.current.delete(s.mappingId); }} onClick={() => setSelected(s.mappingId)}>Details</button></div>
        </li>)}</ul>
        {!data.subjects.some(s => filter === 'ALL' || s.outcome === filter) && <p>No subjects match this view.</p>}
      </section>
      <section className="progress-card"><h2>Configured requirement groups</h2><p>Read-only progress against existing classifications and thresholds. Unmatched groups need review.</p>
        <ul className="progress-list">{data.requirements.map((r, i) => <li key={i}><div><strong>{r.type}</strong><p>Credits: {r.earnedCredits ?? 'Unassessed'} / {r.credits ?? 'No credit threshold'} · Subjects: {r.satisfiedSubjects ?? 'Unassessed'} / {r.subjects ?? 'No subject threshold'}</p></div><span>{r.status === 'MET' ? 'Thresholds met' : r.status === 'OUTSTANDING' ? 'Outstanding' : 'Needs review'}</span></li>)}</ul>
        {!data.requirements.length && <p>No requirement groups are configured.</p>}
      </section>
      {subject && <SubjectDetailsPanel details={describeSubject(subject, data, approved)} onClose={closeDetails} />}
    </>}
  </section>;
}
