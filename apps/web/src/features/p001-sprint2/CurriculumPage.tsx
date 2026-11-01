import { useEffect,useRef,useState,type FormEvent } from 'react';
import type { Catalogue,CurriculumSnapshot,CurriculumSubject,Dependency,LinkKind,SemesterType } from '../../../../api/src/modules/p001-sprint2/contracts';
import { errorMessage } from '../profile/client';
import type { Sprint2Client } from './client';
import './sprint2.css';
const blankSubject={existingSubjectId:'',code:'',name:'',credits:'',category:'',compulsory:false,semesterTypes:[] as SemesterType[],confirmSharedChanges:false};
const blankLink={from:'',required:'',kind:'MANDATORY' as LinkKind};
const labels:Record<LinkKind,string>={MANDATORY:'Mandatory prerequisite',COREQUISITE:'Co-requisite / concurrent study',RECOMMENDED:'Recommended prior knowledge (advisory)'};
export function CurriculumPage({api}:{api:Sprint2Client}) {
  const [catalogue,setCatalogue]=useState<Catalogue>(),[id,setId]=useState(''),[snapshot,setSnapshot]=useState<CurriculumSnapshot>();
  const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [draft,setDraft]=useState({...blankSubject}),[editing,setEditing]=useState<number|null>(null),[link,setLink]=useState({...blankLink}),[linkId,setLinkId]=useState<number|null>(null);
  const [review,setReview]=useState<{summary:string;run:()=>Promise<CurriculumSnapshot>}|null>(null);
  const reviewHeading=useRef<HTMLHeadingElement>(null),alert=useRef<HTMLParagraphElement>(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(blankSubject)||JSON.stringify(link)!==JSON.stringify(blankLink)||editing!==null||linkId!==null;
  useEffect(()=>{const c=new AbortController();api<Catalogue>('/curricula',{signal:c.signal}).then(v=>{if(!c.signal.aborted)setCatalogue(v);}).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));});return()=>c.abort();},[api,attempt]);
  useEffect(()=>{
    if(!id){setSnapshot(undefined);return;}
    const c=new AbortController();setLoading(true);setSnapshot(undefined);setError('');
    api<CurriculumSnapshot>('/curricula/'+id,{signal:c.signal}).then(v=>{if(!c.signal.aborted)setSnapshot(v);}).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[api,id,attempt]);
  useEffect(()=>{if(review)reviewHeading.current?.focus();},[review]);
  useEffect(()=>{if(error)alert.current?.focus();},[error]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function reset(){setDraft({...blankSubject});setEditing(null);setLink({...blankLink});setLinkId(null);setReview(null);}
  function changeCurriculum(value:string){if(dirty&&!window.confirm('Discard unsaved curriculum changes?'))return;reset();setId(value);setSuccess('');}
  function editSubject(s:CurriculumSubject){if(dirty&&!window.confirm('Replace unsaved changes with this subject?'))return;reset();setDraft({existingSubjectId:'',code:s.code,name:s.name,credits:String(s.credits),category:s.category,compulsory:s.compulsory,semesterTypes:[...s.semesterTypes],confirmSharedChanges:false});setEditing(s.mappingId);setError('');setSuccess('');}
  function editLink(l:Dependency){if(dirty&&!window.confirm('Replace unsaved changes with this relationship?'))return;reset();setLink({from:String(l.from),required:String(l.required),kind:l.kind});setLinkId(l.id);setError('');}
  function saveSubject(e:FormEvent){e.preventDefault();if(!snapshot)return;
    const body={...draft,existingSubjectId:draft.existingSubjectId?Number(draft.existingSubjectId):null,credits:Number(draft.credits),revision:snapshot.revision};
    const subjectLabel=draft.existingSubjectId?catalogue?.subjects.find(s=>String(s.subjectId)===draft.existingSubjectId)?.code:draft.code;
    setReview({summary:`${editing===null?'Add':'Update'} ${subjectLabel}: ${draft.category}, ${draft.compulsory?'compulsory':'optional / elective'}, permitted in ${draft.semesterTypes.join(' and ')||'no semester types'}. Subject code, name and credits are shared across curriculum versions.`,run:()=>api('/curricula/'+id+'/subjects'+(editing===null?'':'/'+editing),{method:editing===null?'POST':'PUT',body})});setError('');setSuccess('');
  }
  function saveLink(e:FormEvent){e.preventDefault();if(!snapshot)return;
    setReview({summary:`Save ${labels[link.kind]}: ${name(Number(link.from))} requires ${name(Number(link.required))}.`,run:()=>api('/curricula/'+id+'/dependencies'+(linkId===null?'':'/'+linkId),{method:linkId===null?'POST':'PUT',body:{revision:snapshot.revision,from:Number(link.from),required:Number(link.required),kind:link.kind}})});setError('');setSuccess('');
  }
  function remove(l:Dependency){if(!snapshot)return;if(dirty&&!window.confirm('Discard form changes before removing this relationship?'))return;reset();
    setReview({summary:`Remove ${labels[l.kind]}: ${name(l.from)} requires ${name(l.required)}.`,run:()=>api('/curricula/'+id+'/dependencies/'+l.id,{method:'DELETE',body:{revision:snapshot.revision}})});setError('');setSuccess('');
  }
  async function confirm(){if(!review||busy)return;setBusy(true);setError('');
    try{setSnapshot(await review.run());reset();setSuccess('Curriculum change saved.');
      const fresh=await api<Catalogue>('/curricula').catch(()=>null);if(fresh)setCatalogue(fresh);
    }catch(e){setError(errorMessage(e));setReview(null);}finally{setBusy(false);}
  }
  function name(mappingId:number){return snapshot?.data.subjects.find(s=>s.mappingId===mappingId)?.code??String(mappingId);}
  const disabled=busy||review!==null;
  return <section className="s2" aria-label="Curriculum management"><header><p className="s2-eyebrow">Curriculum management</p><h1>Subjects and prerequisites</h1><p>Maintain the selected curriculum’s subjects, relationships and permitted semester types.</p></header>
    <p className="s2-note">Use verified programme rules. Mandatory prerequisites, concurrent study and advisory prior knowledge are separate relationship types.</p>
    {error&&<p ref={alert} tabIndex={-1} role="alert" className="s2-error">{error}</p>}{success&&<p role="status" className="s2-success">{success}</p>}
    <div className="s2-actions"><label>Curriculum<select aria-label="Curriculum" value={id} disabled={disabled} onChange={e=>changeCurriculum(e.target.value)}><option value="">Select an existing curriculum</option>{catalogue?.curricula.map(c=><option key={c.curriculumId} value={c.curriculumId}>{c.programme} · {c.version}</option>)}</select></label>
      <button disabled={disabled} onClick={()=>{if(dirty&&!window.confirm('Discard unsaved changes and reload?'))return;reset();setAttempt(n=>n+1);setSuccess('');}}>Reload saved data</button></div>
    {!catalogue&&!error&&<p role="status">Loading curricula…</p>}{catalogue&&!catalogue.curricula.length&&<p>No curricula are configured. The programme/curriculum foundation must be supplied before managing subjects.</p>}{loading&&<p role="status">Loading curriculum…</p>}
    {review&&<section className="s2-review" aria-label="Review change"><h2 ref={reviewHeading} tabIndex={-1}>Review change</h2><p>{review.summary}</p><div className="s2-actions"><button disabled={busy} onClick={()=>void confirm()}>{busy?'Saving…':'Confirm save'}</button><button disabled={busy} onClick={()=>setReview(null)}>Back to editing</button></div></section>}
    {snapshot&&<>
      <h2>{snapshot.data.programme} · {snapshot.data.version}</h2>
      <section><h2>Curriculum subjects</h2><ul className="s2-list">{snapshot.data.subjects.map(s=><li key={s.mappingId}><div><strong>{s.code} — {s.name}</strong><p>{s.credits} credits · {s.category} · {s.compulsory?'Compulsory':'Optional / elective'}</p><p>Permitted semesters: {s.semesterTypes.join(', ')||'Not configured'}</p></div><button disabled={disabled} onClick={()=>editSubject(s)} aria-label={'Edit subject '+s.code}>Edit</button></li>)}</ul>{!snapshot.data.subjects.length&&<p>No subjects are mapped to this curriculum yet.</p>}</section>
      <form onSubmit={saveSubject} className="s2-form"><h2>{editing===null?'Add curriculum subject':'Edit curriculum subject'}</h2><fieldset disabled={disabled}><legend>Subject and classification</legend>
        <div className="s2-grid">{editing===null&&<label>Existing catalogue subject (optional)<select aria-label="Existing catalogue subject (optional)" value={draft.existingSubjectId} onChange={e=>setDraft(d=>({...d,existingSubjectId:e.target.value}))}><option value="">Create a new subject</option>{catalogue?.subjects.map(s=><option key={s.subjectId} value={s.subjectId}>{s.code} — {s.name} ({s.credits} credits)</option>)}</select></label>}
          {!draft.existingSubjectId&&<><label>Subject code<input required maxLength={20} value={draft.code} onChange={e=>setDraft(d=>({...d,code:e.target.value}))}/></label><label>Subject name<input required maxLength={255} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></label><label>Credit hours<input type="number" min={0} max={2147483647} step={1} required value={draft.credits} onChange={e=>setDraft(d=>({...d,credits:e.target.value}))}/></label></>}
          <label>Classification<input required maxLength={50} list="s2-categories" value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}/><datalist id="s2-categories">{['CORE','ELECTIVE','FYP1','FYP2','INDUSTRIAL_TRAINING'].map(c=><option key={c} value={c}/>)}</datalist></label>
        </div><label className="s2-check"><input type="checkbox" checked={draft.compulsory} onChange={e=>setDraft(d=>({...d,compulsory:e.target.checked}))}/>Compulsory subject in this curriculum</label>
        <fieldset><legend>Permitted semester types</legend>{(['NORMAL','SHORT'] as const).map(type=><label className="s2-check" key={type}><input type="checkbox" checked={draft.semesterTypes.includes(type)} onChange={e=>setDraft(d=>({...d,semesterTypes:e.target.checked?[...d.semesterTypes,type]:d.semesterTypes.filter(t=>t!==type)}))}/>{type==='NORMAL'?'Normal semester (1 or 2)':'Short semester (3)'}</label>)}<p className="s2-note">Configure the verified subject rule explicitly. Two-credit subjects normally use the short semester; Final Year Project 1 may have a normal-semester exception. Credit value alone does not establish availability.</p></fieldset>
        {editing!==null&&<label className="s2-check"><input required type="checkbox" checked={draft.confirmSharedChanges} onChange={e=>setDraft(d=>({...d,confirmSharedChanges:e.target.checked}))}/>I understand that code, name and credit changes affect every curriculum using this subject.</label>}
      </fieldset><div className="s2-actions"><button disabled={disabled} type="submit">Review subject change</button><button disabled={busy} type="button" onClick={reset}>Cancel changes</button></div></form>
      <section><h2>Saved relationships</h2><ul className="s2-list">{snapshot.data.links.map(l=><li key={l.id}><div><strong>{name(l.from)} requires {name(l.required)}</strong><p>{labels[l.kind]}</p></div><div className="s2-actions"><button disabled={disabled} onClick={()=>editLink(l)} aria-label={'Edit relationship '+l.id}>Edit</button><button disabled={disabled} onClick={()=>remove(l)} aria-label={'Remove relationship '+l.id}>Remove</button></div></li>)}</ul>{!snapshot.data.links.length&&<p>No prerequisite relationships are configured.</p>}</section>
      <form className="s2-form" onSubmit={saveLink}><h2>{linkId===null?'Add relationship':'Edit relationship'}</h2><fieldset disabled={disabled}><legend>Dependency rules</legend><div className="s2-grid">
        <label>Dependent subject<select aria-label="Dependent subject" required value={link.from} onChange={e=>setLink(d=>({...d,from:e.target.value}))}><option value="">Select a subject</option>{snapshot.data.subjects.map(s=><option key={s.mappingId} value={s.mappingId}>{s.code} — {s.name}</option>)}</select></label>
        <label>Required or related subject<select aria-label="Required or related subject" required value={link.required} onChange={e=>setLink(d=>({...d,required:e.target.value}))}><option value="">Select a subject</option>{snapshot.data.subjects.map(s=><option key={s.mappingId} value={s.mappingId}>{s.code} — {s.name}</option>)}</select></label>
        <label>Relationship type<select aria-label="Relationship type" value={link.kind} onChange={e=>setLink(d=>({...d,kind:e.target.value as LinkKind}))}>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      </div><p className="s2-note">Mandatory prerequisites cannot form cycles. Co-requisites describe concurrent study; advisory links are not hard eligibility restrictions. Configure verified English 1 → English 2 → English 3 as two mandatory links.</p></fieldset><div className="s2-actions"><button type="submit" disabled={disabled||snapshot.data.subjects.length<2}>Review relationship change</button><button type="button" disabled={busy} onClick={reset}>Cancel changes</button></div></form>
    </>}
  </section>;
}
