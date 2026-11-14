import { useEffect,useRef,useState,type FormEvent,type KeyboardEvent } from 'react';
import type { Catalogue,CurriculumSnapshot,CurriculumSubject,Dependency,LinkKind,SemesterType } from '../../../../api/src/modules/p001-sprint2/contracts';
import { errorMessage } from '../profile/client';
import type { Sprint2Client } from './client';
import '../../app/typography.css';
import './sprint2.css';
const blankSubject={existingSubjectId:'',code:'',name:'',credits:'',category:'',compulsory:false,semesterTypes:[] as SemesterType[],confirmSharedChanges:false};
const blankLink={from:'',required:'',kind:'MANDATORY' as LinkKind};
const labels:Record<LinkKind,string>={MANDATORY:'Mandatory prerequisite',COREQUISITE:'Co-requisite / concurrent study',RECOMMENDED:'Recommended prior knowledge (advisory)'};
const ACTIONS=[{id:'subjects',label:'Subject List'},{id:'create',label:'Create Subject'},{id:'relationships',label:'Prerequisite List'},{id:'prerequisites',label:'Manage Prerequisites'}] as const;
type Action=typeof ACTIONS[number]['id'];
export function CurriculumPage({api,initialCurriculumId=''}:{api:Sprint2Client;initialCurriculumId?:string}) {
  const [catalogue,setCatalogue]=useState<Catalogue>(),[id,setId]=useState(''),[snapshot,setSnapshot]=useState<CurriculumSnapshot>();
  const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [draft,setDraft]=useState({...blankSubject}),[editing,setEditing]=useState<number|null>(null),[link,setLink]=useState({...blankLink}),[linkId,setLinkId]=useState<number|null>(null);
  const [prerequisites,setPrerequisites]=useState<CurriculumSubject[]>([]),[prerequisiteSearch,setPrerequisiteSearch]=useState('');
  const [review,setReview]=useState<{summary:string;run:()=>Promise<CurriculumSnapshot>;done?:string}|null>(null);
  const seeded=useRef(false);
  const [action,setAction]=useState<Action>('subjects');
  const reviewHeading=useRef<HTMLHeadingElement>(null),alert=useRef<HTMLParagraphElement>(null),workspaceHeading=useRef<HTMLHeadingElement>(null),pendingScroll=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(blankSubject)||JSON.stringify(link)!==JSON.stringify(blankLink)||editing!==null||linkId!==null||prerequisites.length>0||prerequisiteSearch!=='';
  useEffect(()=>{const c=new AbortController();api<Catalogue>('/curricula',{signal:c.signal}).then(v=>{if(!c.signal.aborted){setCatalogue(v);if(initialCurriculumId&&!seeded.current&&v.curricula.some(x=>String(x.curriculumId)===initialCurriculumId)){seeded.current=true;setId(initialCurriculumId);}}}).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));});return()=>c.abort();},[api,attempt]);
  useEffect(()=>{
    if(!id){setSnapshot(undefined);return;}
    const c=new AbortController();setLoading(true);setSnapshot(undefined);setError('');
    api<CurriculumSnapshot>('/curricula/'+id,{signal:c.signal}).then(v=>{if(!c.signal.aborted)setSnapshot(v);}).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[api,id,attempt]);
  useEffect(()=>{if(review)reviewHeading.current?.focus();},[review]);
  useEffect(()=>{if(error)alert.current?.focus();},[error]);
  useEffect(()=>{if(!pendingScroll.current)return;pendingScroll.current=false;workspaceHeading.current?.scrollIntoView({block:'start',behavior:'auto'});},[action]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function reset(){setDraft({...blankSubject});setEditing(null);setLink({...blankLink});setLinkId(null);setPrerequisites([]);setPrerequisiteSearch('');setReview(null);}
  function changeCurriculum(value:string){if(dirty&&!window.confirm('Discard unsaved curriculum changes?'))return;reset();setId(value);setAction('subjects');setSuccess('');}
  function selectAction(next:Action){if(next===action||busy||review)return;if(dirty&&!window.confirm('Discard unsaved curriculum changes?'))return;reset();setAction(next);setError('');setSuccess('');pendingScroll.current=true;}
  function focusWorkspace(){const el=workspaceHeading.current;if(!el)return;el.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});el.focus({preventScroll:true});}
  function editSubject(s:CurriculumSubject){if(dirty&&!window.confirm('Replace unsaved changes with this subject?'))return;reset();setDraft({existingSubjectId:'',code:s.code,name:s.name,credits:String(s.credits),category:s.category,compulsory:s.compulsory,semesterTypes:[...s.semesterTypes],confirmSharedChanges:false});setEditing(s.mappingId);setAction('create');setError('');setSuccess('');focusWorkspace();}
  function editLink(l:Dependency){if(dirty&&!window.confirm('Replace unsaved changes with this relationship?'))return;reset();setLink({from:String(l.from),required:String(l.required),kind:l.kind});setLinkId(l.id);setAction('prerequisites');setError('');focusWorkspace();}
  function tabKeys(e:KeyboardEvent){const ids=ACTIONS.map(a=>'s2-tab-'+a.id);const focused=ids.indexOf((e.currentTarget as HTMLElement).id);if(focused<0)return;let next:number|undefined;
    if(e.key==='ArrowRight')next=(focused+1)%ids.length;else if(e.key==='ArrowLeft')next=(focused+ids.length-1)%ids.length;
    else if(e.key==='Home')next=0;else if(e.key==='End')next=ids.length-1;
    if(next===undefined)return;e.preventDefault();document.getElementById(ids[next]!)?.focus();}
  function saveSubject(e:FormEvent){e.preventDefault();if(!snapshot)return;
    const fail=(message:string)=>{setError(message);return;};
    const creating=editing===null;
    const attached=draft.existingSubjectId?catalogue?.subjects.find(s=>String(s.subjectId)===draft.existingSubjectId):null;
    if(draft.existingSubjectId&&!attached)return fail('Choose an existing catalogue subject from the list, or create a new subject.');
    if(creating&&prerequisiteSearch.trim())return fail('Select a listed prerequisite or clear the search before reviewing. Typed search text is never saved as a prerequisite.');
    if(!attached){
      if(!draft.code.trim()||!draft.name.trim())return fail('Subject code and name are required.');
      if(!Number.isInteger(Number(draft.credits))||Number(draft.credits)<0)return fail('Credit hours must be a nonnegative whole number.');
      if(creating&&catalogue?.subjects.some(s=>s.code.toLowerCase()===draft.code.trim().toLowerCase()))return fail('That subject code already exists in the catalogue. Attach it with "Existing catalogue subject" or choose a different code.');
    }
    if(!draft.category.trim())return fail('Classification is required.');
    if(!draft.semesterTypes.length)return fail('Select at least one permitted semester type.');
    if(creating&&prerequisites.some(p=>!snapshot.data.subjects.some(s=>s.mappingId===p.mappingId&&s.code===p.code)))return fail('A selected prerequisite is no longer in this curriculum. Remove it and select it again.');
    const body={...draft,existingSubjectId:draft.existingSubjectId?Number(draft.existingSubjectId):null,credits:attached?0:Number(draft.credits),revision:snapshot.revision,
      ...(creating?{prerequisites:prerequisites.map(s=>({mappingId:s.mappingId,code:s.code}))}:{})};
    const nameLabel=(attached?attached.name:draft.name.trim())||'—';
    const prerequisiteText=creating?(prerequisites.length?' Initial mandatory prerequisites: '+prerequisites.map(s=>s.name+' ('+s.code+')').join(', ')+'.':' No initial prerequisites.'):'';
    setReview({summary:`${creating?'Create':'Update'} ${nameLabel} (${attached?attached.code:draft.code.trim()}): ${attached?attached.credits:draft.credits} credit hours, ${draft.category}, ${draft.compulsory?'compulsory':'optional / elective'}, permitted in ${draft.semesterTypes.join(' and ')}, in ${snapshot.data.programme} · ${snapshot.data.version}. Subject code, name and credits are shared across curriculum versions.${prerequisiteText}`,
      done:creating?'Subject created and saved.'+(prerequisites.length?' Initial prerequisites: '+prerequisites.map(s=>s.name+' ('+s.code+')').join(', ')+'.':''):undefined,
      run:()=>api('/curricula/'+id+'/subjects'+(editing===null?'':'/'+editing),{method:creating?'POST':'PUT',body})});setError('');setSuccess('');
  }
  function saveLink(e:FormEvent){e.preventDefault();if(!snapshot)return;
    setReview({summary:`Save ${labels[link.kind]}: ${name(Number(link.from))} requires ${name(Number(link.required))}.`,run:()=>api('/curricula/'+id+'/dependencies'+(linkId===null?'':'/'+linkId),{method:linkId===null?'POST':'PUT',body:{revision:snapshot.revision,from:Number(link.from),required:Number(link.required),kind:link.kind}})});setError('');setSuccess('');
  }
  function remove(l:Dependency){if(!snapshot)return;if(dirty&&!window.confirm('Discard form changes before removing this relationship?'))return;reset();
    setReview({summary:`Remove ${labels[l.kind]}: ${name(l.from)} requires ${name(l.required)}.`,run:()=>api('/curricula/'+id+'/dependencies/'+l.id,{method:'DELETE',body:{revision:snapshot.revision}})});setError('');setSuccess('');
  }
  async function confirm(){if(!review||busy)return;setBusy(true);setError('');
    try{const done=review.done;setSnapshot(await review.run());reset();setSuccess(done??'Curriculum change saved.');
      const fresh=await api<Catalogue>('/curricula').catch(()=>null);if(fresh)setCatalogue(fresh);
    }catch(e){setError(errorMessage(e));setReview(null);}finally{setBusy(false);}
  }
  function name(mappingId:number){const s=snapshot?.data.subjects.find(s=>s.mappingId===mappingId);return s?s.name+' ('+s.code+')':String(mappingId);}
  const prerequisiteQuery=prerequisiteSearch.trim().toLowerCase();
  const prerequisiteMatches=snapshot&&prerequisiteQuery?snapshot.data.subjects.filter(s=>!prerequisites.some(p=>p.mappingId===s.mappingId)&&(s.name.toLowerCase().includes(prerequisiteQuery)||s.code.toLowerCase().includes(prerequisiteQuery))):[];
  const disabled=busy||review!==null;
  return <section className="s2" aria-label="Curriculum management"><header><p className="s2-eyebrow">Curriculum management</p><h1>Subjects and prerequisites</h1><p>Maintain the selected curriculum’s subjects, relationships and permitted semester types.</p></header>
    <p className="s2-note">Use verified programme rules. Mandatory prerequisites, concurrent study and advisory prior knowledge are separate relationship types.</p>
    {error&&<p ref={alert} tabIndex={-1} role="alert" className="s2-error">{error}</p>}{success&&<p role="status" className="s2-success">{success}</p>}
    <div className="s2-actions"><label>Curriculum<select aria-label="Curriculum" value={id} disabled={disabled} onChange={e=>changeCurriculum(e.target.value)}><option value="">Select an existing curriculum</option>{catalogue?.curricula.map(c=><option key={c.curriculumId} value={c.curriculumId}>{c.programme} · {c.version}</option>)}</select></label>
      <button disabled={disabled} onClick={()=>{if(dirty&&!window.confirm('Discard unsaved changes and reload?'))return;reset();setAttempt(n=>n+1);setSuccess('');}}>Reload saved data</button></div>
    {!catalogue&&!error&&<p role="status">Loading curricula…</p>}{catalogue&&!catalogue.curricula.length&&<p>No curricula are configured. The programme/curriculum foundation must be supplied before managing subjects.</p>}{loading&&<p role="status">Loading curriculum…</p>}
    {review&&<section className="s2-review" aria-label="Review change"><h2 ref={reviewHeading} tabIndex={-1}>Review change</h2><p>{review.summary}</p><div className="s2-actions"><button disabled={busy} onClick={()=>void confirm()}>{busy?'Saving…':'Confirm save'}</button><button disabled={busy} onClick={()=>setReview(null)}>Back to editing</button></div></section>}
    {snapshot&&<>
      <h2 ref={workspaceHeading} tabIndex={-1}>{snapshot.data.programme} · {snapshot.data.version}</h2>
      <div className="s2-workspace">
      <div className="s2-nav" role="tablist" aria-label="Curriculum actions" aria-orientation="horizontal">
        {ACTIONS.map(a=><button role="tab" key={a.id} id={'s2-tab-'+a.id} aria-selected={action===a.id} aria-controls={'s2-panel-'+a.id} tabIndex={action===a.id?0:-1} disabled={disabled} onClick={()=>selectAction(a.id)} onKeyDown={tabKeys}>{a.label}</button>)}
      </div>
      <div className="s2-panes">
      <div role="tabpanel" id="s2-panel-subjects" aria-labelledby="s2-tab-subjects" hidden={action!=='subjects'}>
      <section><h2>Curriculum subjects</h2><ul className="s2-list">{snapshot.data.subjects.map(s=><li key={s.mappingId}><div><strong>{s.name}</strong><p className="s2-code">{s.code}</p><p>{s.credits} credits · {s.category} · {s.compulsory?'Compulsory':'Optional / elective'}</p><p>Permitted semesters: {s.semesterTypes.join(', ')||'Not configured'}</p></div><button disabled={disabled} onClick={()=>editSubject(s)} aria-label={'Edit subject '+s.code}>Edit</button></li>)}</ul>{!snapshot.data.subjects.length&&<p>No subjects are mapped to this curriculum yet.</p>}</section>
      </div>
      <div role="tabpanel" id="s2-panel-create" aria-labelledby="s2-tab-create" hidden={action!=='create'}>
      <form onSubmit={saveSubject} className="s2-form"><h2>{editing===null?'Create subject (UC24)':'Edit existing subject (UC06)'}</h2><fieldset disabled={disabled}><legend>Subject and classification</legend>
        <div className="s2-grid">{editing===null&&<label>Existing catalogue subject (optional)<select aria-label="Existing catalogue subject (optional)" value={draft.existingSubjectId} onChange={e=>setDraft(d=>({...d,existingSubjectId:e.target.value}))}><option value="">Create a new subject</option>{catalogue?.subjects.map(s=><option key={s.subjectId} value={s.subjectId}>{s.name} — {s.code} ({s.credits} credits)</option>)}</select></label>}
          {!draft.existingSubjectId&&<><label>Subject code<input required maxLength={20} value={draft.code} onChange={e=>setDraft(d=>({...d,code:e.target.value}))}/></label><label>Subject name<input required maxLength={255} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></label><label>Credit hours<input type="number" min={0} max={2147483647} step={1} required value={draft.credits} onChange={e=>setDraft(d=>({...d,credits:e.target.value}))}/></label></>}
          <label>Classification<input required maxLength={50} list="s2-categories" value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}/><datalist id="s2-categories">{['CORE','ELECTIVE','FYP1','FYP2','INDUSTRIAL_TRAINING'].map(c=><option key={c} value={c}/>)}</datalist></label>
        </div><label className="s2-check"><input type="checkbox" checked={draft.compulsory} onChange={e=>setDraft(d=>({...d,compulsory:e.target.checked}))}/>Compulsory subject in this curriculum</label>
        <fieldset><legend>Permitted semester types</legend>{(['NORMAL','SHORT'] as const).map(type=><label className="s2-check" key={type}><input type="checkbox" checked={draft.semesterTypes.includes(type)} onChange={e=>setDraft(d=>({...d,semesterTypes:e.target.checked?[...d.semesterTypes,type]:d.semesterTypes.filter(t=>t!==type)}))}/>{type==='NORMAL'?'Normal semester (1 or 2)':'Short semester (3)'}</label>)}<p className="s2-note">Configure the verified subject rule explicitly. Two-credit subjects normally use the short semester; Final Year Project 1 may have a normal-semester exception. Credit value alone does not establish availability.</p></fieldset>
        {editing===null&&<fieldset><legend>Initial prerequisites (optional)</legend>
          {snapshot.data.subjects.length?<>
            <label>Search prerequisites<input aria-label="Search prerequisites" value={prerequisiteSearch} onChange={e=>setPrerequisiteSearch(e.target.value)} placeholder="Type a subject name or code"/></label>
            {prerequisiteQuery&&<ul className="s2-picks">{prerequisiteMatches.map(s=><li key={s.mappingId}><div><strong>{s.name}</strong><p className="s2-code">{s.code}</p></div><button type="button" onClick={()=>{setPrerequisites(list=>[...list,s]);setPrerequisiteSearch('');}}>Add prerequisite</button></li>)}
              {!prerequisiteMatches.length&&<li><p>No subjects in this curriculum match the search. Clear the search to continue.</p></li>}</ul>}
            {prerequisites.length?<ul className="s2-picks" aria-label="Selected prerequisites">{prerequisites.map(s=><li key={s.mappingId}><div><strong>{s.name}</strong><p className="s2-code">{s.code}</p></div><button type="button" onClick={()=>setPrerequisites(list=>list.filter(item=>item.mappingId!==s.mappingId))} aria-label={'Remove prerequisite '+s.code}>Remove</button></li>)}</ul>
              :<p className="s2-note">No prerequisites selected. The subject can be created without prerequisites.</p>}
            <p className="s2-note">Prerequisites must already be subjects of this curriculum and are saved as mandatory links. Typed search text alone is never saved; resolve or clear the search before reviewing.</p>
          </>:<p className="s2-note">This curriculum has no existing subjects, so no initial prerequisites can be selected.</p>}
        </fieldset>}
        {editing!==null&&<label className="s2-check"><input required type="checkbox" checked={draft.confirmSharedChanges} onChange={e=>setDraft(d=>({...d,confirmSharedChanges:e.target.checked}))}/>I understand that code, name and credit changes affect every curriculum using this subject.</label>}
      </fieldset><div className="s2-actions"><button disabled={disabled} type="submit">Review subject change</button><button disabled={busy} type="button" onClick={reset}>Cancel changes</button></div></form>
      </div>
      <div role="tabpanel" id="s2-panel-relationships" aria-labelledby="s2-tab-relationships" hidden={action!=='relationships'}>
      <section><h2>Saved relationships</h2><ul className="s2-list">{snapshot.data.links.map(l=><li key={l.id}><div><strong>{name(l.from)} requires {name(l.required)}</strong><p>{labels[l.kind]}</p></div><div className="s2-actions"><button disabled={disabled} onClick={()=>editLink(l)} aria-label={'Edit relationship '+l.id}>Edit</button><button disabled={disabled} onClick={()=>remove(l)} aria-label={'Remove relationship '+l.id}>Remove</button></div></li>)}</ul>{!snapshot.data.links.length&&<p>No prerequisite relationships are configured.</p>}</section>
      </div>
      <div role="tabpanel" id="s2-panel-prerequisites" aria-labelledby="s2-tab-prerequisites" hidden={action!=='prerequisites'}>
      <form className="s2-form" onSubmit={saveLink}><h2>{linkId===null?'Add relationship':'Edit relationship'}</h2><fieldset disabled={disabled}><legend>Dependency rules</legend><div className="s2-grid">
        <label>Dependent subject<select aria-label="Dependent subject" required value={link.from} onChange={e=>setLink(d=>({...d,from:e.target.value}))}><option value="">Select a subject</option>{snapshot.data.subjects.map(s=><option key={s.mappingId} value={s.mappingId}>{s.name} — {s.code}</option>)}</select></label>
        <label>Required or related subject<select aria-label="Required or related subject" required value={link.required} onChange={e=>setLink(d=>({...d,required:e.target.value}))}><option value="">Select a subject</option>{snapshot.data.subjects.map(s=><option key={s.mappingId} value={s.mappingId}>{s.name} — {s.code}</option>)}</select></label>
        <label>Relationship type<select aria-label="Relationship type" value={link.kind} onChange={e=>setLink(d=>({...d,kind:e.target.value as LinkKind}))}>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      </div><p className="s2-note">Mandatory prerequisites cannot form cycles. Co-requisites describe concurrent study; advisory links are not hard eligibility restrictions. Configure verified English 1 → English 2 → English 3 as two mandatory links.</p></fieldset><div className="s2-actions"><button type="submit" disabled={disabled||snapshot.data.subjects.length<2}>Review relationship change</button><button type="button" disabled={busy} onClick={reset}>Cancel changes</button></div></form>
      </div>
      </div>
      </div>
    </>}
  </section>;
}
