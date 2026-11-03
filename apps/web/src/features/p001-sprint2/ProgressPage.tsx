import { useEffect,useState } from 'react';
import type { Progress } from '../../../../api/src/modules/p001-sprint2/contracts';
import { errorMessage } from '../profile/client';
import type { Sprint2Client } from './client';
import '../../app/typography.css';
import './sprint2.css';
export function ProgressPage({api}:{api:Sprint2Client}) {
  const [data,setData]=useState<Progress>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [filter,setFilter]=useState('ALL');
  useEffect(()=>{
    const controller=new AbortController();setData(undefined);setError('');
    api<Progress>('/progress',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(reason=>{if(!controller.signal.aborted)setError(errorMessage(reason));});
    return ()=>controller.abort();
  },[api,refresh]);
  useEffect(()=>{const reload=()=>setRefresh(n=>n+1);window.addEventListener('p001:records-changed',reload);window.addEventListener('focus',reload);
    return()=>{window.removeEventListener('p001:records-changed',reload);window.removeEventListener('focus',reload);};},[]);
  return <section className="s2" aria-label="Academic progress">
    <header><p className="s2-eyebrow">Academic progress</p><h1>Your programme progress</h1><p>Credits and subject completion from your saved academic history.</p></header>
    <p className="s2-note">Student-reported information. This summary does not confirm official graduation eligibility.</p>
    <div className="s2-actions"><a href="/student/records">Update subject records</a><button onClick={()=>setRefresh(n=>n+1)}>Refresh progress</button></div>
    {error&&<p role="alert" className="s2-error">{error}</p>}
    {!data&&!error&&<p role="status">Loading academic progress…</p>}
    {data&&<>
      <h2>{data.programme}</h2><p>Curriculum {data.version}</p>
      {data.noHistory&&<p role="status">No academic history yet. Add your completed, exempted, failed or withdrawn subjects to begin.</p>}
      {data.warnings.length>0&&<section aria-label="Information to review"><h2>Information to review</h2><ul>{data.warnings.map(w=><li key={w}>{w}</li>)}</ul></section>}
      <dl className="s2-metrics">
        <div><dt>Earned credits</dt><dd>{data.earnedCredits}</dd></div><div><dt>Required credits</dt><dd>{data.totalCredits??'Not configured'}</dd></div>
        <div><dt>Remaining credits</dt><dd>{data.remainingCredits??'Unavailable'}</dd></div><div><dt>Outstanding compulsory subjects</dt><dd>{data.outstandingCompulsory}</dd></div>
      </dl>
      {data.percent!==null&&<div className="s2-progress"><label htmlFor="credit-progress">Credit completion: {data.percent}%</label><progress id="credit-progress" value={data.percent} max={100}/></div>}
      <p>{data.completedCredits} completed credits · {data.exemptionCredits} recognized exemption credits.</p>
      <p>{data.completedSubjects} completed subjects · {data.exemptedSubjects} exempted subjects, including {data.zeroCreditExemptions} without awarded credits.</p>
      <p className="s2-note">Retakes count once per subject. Failed and withdrawn attempts earn zero credits. Credit completion and prescribed-subject completion are separate checks.</p>
      <section><h2>Subjects and outstanding work</h2><label>Show subjects<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All subjects</option><option value="REMAINING">Remaining subjects</option><option value="COMPLETED">Completed subjects</option><option value="EXEMPTED">Exempted subjects</option></select></label>
        <ul className="s2-list">{data.subjects.filter(s=>filter==='ALL'||s.outcome===filter).map(s=><li key={s.mappingId}><div><strong>{s.code} — {s.name}</strong><p>{s.category} · {s.compulsory?'Compulsory':'Optional / elective'} · {s.credits} subject credits</p></div><span>{s.outcome==='REMAINING'?'Remaining':s.outcome==='COMPLETED'?'Completed':'Exempted'} · {s.earnedCredits} earned credits</span></li>)}</ul>
        {!data.subjects.some(s=>filter==='ALL'||s.outcome===filter)&&<p>No subjects match this view.</p>}
      </section>
      <section><h2>Configured requirement groups</h2><p>Read-only progress against existing classifications and thresholds. Unmatched groups need review.</p>
        <ul className="s2-list">{data.requirements.map((r,i)=><li key={i}><div><strong>{r.type}</strong><p>Credits: {r.earnedCredits??'Unassessed'} / {r.credits??'No credit threshold'} · Subjects: {r.satisfiedSubjects??'Unassessed'} / {r.subjects??'No subject threshold'}</p></div><span>{r.status==='MET'?'Thresholds met':r.status==='OUTSTANDING'?'Outstanding':'Needs review'}</span></li>)}</ul>
        {!data.requirements.length&&<p>No requirement groups are configured.</p>}
      </section>
    </>}
  </section>;
}
