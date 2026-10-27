import { useEffect, useRef, useState } from 'react';
import { OFFERING_NOTICE, semesterLabel, semesterType } from '../../../../../packages/shared/src/offerings/offerings';
import type { OfferingPageData, OfferingsClient } from '../../../../../packages/shared/src/offerings/offerings';
import { OfferingApiError } from './client';
import './offerings.css';

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every(id => right.includes(id));
}
function errorMessage(error: unknown): string {
  return error instanceof OfferingApiError ? error.message : 'We could not reach offerings services. Please retry. Your changes have not been confirmed as saved.';
}

/** UC08 only. FOUNDATION mounts at /student/offerings with P004 AuthGate. */
export function OfferingsPage({ client, demonstration = false }: { client: OfferingsClient; demonstration?: boolean }) {
  const [data, setData] = useState<OfferingPageData | null>(null);
  const [semesterId, setSemesterId] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const [mode, setMode] = useState<'select' | 'review' | 'saved'>('select');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pendingSemester, setPendingSemester] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setLoadError(null); setSaveError(''); setNotice('');
    client.load(semesterId || undefined, controller.signal).then(result => {
      if (!active) return;
      setData(result);
      if (!semesterId && result.semesters[0]) { setSemesterId(result.semesters[0].semesterId); return; }
      setDraft(result.selection?.curriculumSubjectIds ?? []);
      setMode('select'); setConfirmed(false); setLoading(false);
    }, error => {
      if (active) { setLoadError(error); setLoading(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [client, semesterId, attempt]);

  const saved = data?.selection?.curriculumSubjectIds ?? [];
  const dirty = !sameSet(draft, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (mode !== 'select') heading.current?.focus(); }, [mode]);
  useEffect(() => { if (saveError || loadError) errorPanel.current?.focus(); }, [saveError, loadError]);

  function switchSemester(id: string) {
    if (id === semesterId) return;
    if (dirty) { setPendingSemester(id); return; }
    setSemesterId(id); setQuery(''); setPendingSemester('');
  }
  function cancel() {
    setDraft([...saved]); setMode('select'); setConfirmed(false); setSaveError('');
    setNotice('Changes discarded. Your previously saved offerings are unchanged.');
  }
  function toggle(id: string) {
    setDraft(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    setNotice(''); setSaveError(''); setConfirmed(false);
  }
  async function save() {
    if (!confirmed || saving) return;
    setSaving(true); setSaveError('');
    try {
      const selection = await client.save({ semesterId, curriculumSubjectIds: draft });
      setData(previous => previous ? { ...previous, selection } : previous);
      setDraft(selection.curriculumSubjectIds); setMode('saved'); setConfirmed(false);
    } catch (error) { setSaveError(errorMessage(error)); }
    finally { setSaving(false); }
  }

  const semester = data?.semesters.find(item => item.semesterId === semesterId);
  const selected = data?.subjects.filter(subject => draft.includes(subject.curriculumSubjectId)) ?? [];
  const visible = data?.subjects.filter(subject => `${subject.code} ${subject.name}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const years = [...new Set(data?.semesters.map(item => item.academicYear) ?? [])];
  const totalCredits = selected.reduce((total, subject) => total + subject.creditHours, 0);
  const blocked = loadError instanceof OfferingApiError && [401, 403].includes(loadError.status);

  return <div className="offerings" aria-busy={loading || saving}>
    <header className="offerings-heading">
      <p className="offerings-eyebrow">SEMESTER PLANNER <span>/</span> SUBJECT OFFERINGS</p>
      <h1>What’s offered this semester?</h1>
      <p>Keep a personal record of the subjects you report as available. Review your list before saving.</p>
    </header>
    <div className="offerings-provenance"><span aria-hidden="true">ⓘ</span><div><strong>{OFFERING_NOTICE}</strong>
      <p>Saving this list does not register you for any subject or confirm its availability.</p></div></div>
    {loading && <div className="offerings-card offerings-loading" role="status">Loading your curriculum and semester offerings…</div>}
    {!loading && loadError !== null && <div className="offerings-card offerings-error" role="alert" ref={errorPanel} tabIndex={-1}>
      <h2>{blocked ? 'Account access required' : 'Offerings are unavailable'}</h2><p>{errorMessage(loadError)}</p>
      {loadError instanceof OfferingApiError && loadError.status === 401 && <a href="/sign-in">Sign in</a>}
      {loadError instanceof OfferingApiError && loadError.code === 'PROFILE_SETUP_REQUIRED' && <a href="/student/setup">Complete academic profile</a>}
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </div>}
    {!loading && !loadError && data && <>
      <section className="offerings-card offerings-semester" aria-label="Semester selection">
        <div className="offerings-field"><label htmlFor="offerings-year">Academic year</label>
          <select id="offerings-year" value={semester?.academicYear ?? ''} disabled={saving || !years.length}
            onChange={event => {
              const next = data.semesters.find(item => item.academicYear === event.target.value && item.semesterNo === semester?.semesterNo) ??
                data.semesters.find(item => item.academicYear === event.target.value);
              if (next) switchSemester(next.semesterId);
            }}>
            {!years.length && <option value="">No academic years configured</option>}
            {years.map(year => <option key={year}>{year}</option>)}
          </select></div>
        <div className="offerings-field"><label htmlFor="offerings-semester">Semester</label>
          <select id="offerings-semester" value={semesterId} disabled={saving || !semester}
            onChange={event => switchSemester(event.target.value)}>
            {!semester && <option value="">No semesters configured</option>}
            {data.semesters.filter(item => item.academicYear === semester?.academicYear).map(item =>
              <option key={item.semesterId} value={item.semesterId}>Semester {item.semesterNo} ({semesterType(item.semesterNo)})</option>)}
          </select></div>
        <div className="offerings-semester-note"><span className="offerings-chip">{semester ? `${semesterType(semester.semesterNo)} semester` : 'Setup needed'}</span>
          <span>Only your saved curriculum is shown</span></div>
      </section>
      {pendingSemester && <section className="offerings-warning offerings-switch" role="alert" aria-label="Unsaved changes">
        <strong>Discard your unsaved changes?</strong><p>Your saved offerings will remain unchanged when you switch semesters.</p>
        <div className="offerings-actions"><button type="button" onClick={() => setPendingSemester('')}>Keep editing</button>
          <button type="button" onClick={() => { setDraft([...saved]); setSemesterId(pendingSemester); setPendingSemester(''); setQuery(''); }}>Discard changes and switch</button></div>
      </section>}
      {!semester ? <section className="offerings-card"><h2>No semesters configured</h2><p>Semester setup is needed before you can report offerings. No subject availability has been assumed.</p></section> : <>
        <ol className="offerings-steps" aria-label="Save offerings steps">
          {['Select subjects', 'Review & confirm', 'Saved'].map((label, index) => {
            const current = mode === 'select' ? 0 : mode === 'review' ? 1 : 2;
            return <li key={label} aria-current={current === index ? 'step' : undefined} className={current >= index ? 'is-active' : ''}>
              <span aria-hidden="true">{current > index ? '✓' : index + 1}</span>{label}</li>;
          })}
        </ol>
        {notice && <p className="offerings-notice" role="status">{notice}</p>}
        <div className="offerings-grid">
          <section className="offerings-card offerings-catalogue" aria-label={mode === 'select' ? 'Curriculum subjects' : 'Review offerings'}>
            <div className="offerings-section-heading">
              <div><p className="offerings-eyebrow">{data.curriculum.programmeName}</p>
                <h2 ref={heading} tabIndex={-1}>{mode === 'select' ? 'Choose reported subjects' : mode === 'review' ? 'Review your offerings' : 'Your offerings are saved'}</h2>
                <p>{mode === 'select' ? data.curriculum.name : semesterLabel(semester)}</p></div>
              {mode === 'select' && <span className="offerings-chip">{data.subjects.length} subjects</span>}
            </div>
            {mode === 'saved' && <div className="offerings-success" role="status"><strong>{demonstration ? 'Saved in this browser for demonstration.' : 'Your student-reported offerings were saved.'}</strong>
              <p>You can return to edit this semester’s list whenever you need.</p></div>}
            {mode === 'select' ? <>
              <div className="offerings-search"><label htmlFor="offerings-search">Find a subject</label>
                <input type="search" id="offerings-search" placeholder="Search by subject code or name" value={query} onChange={event => setQuery(event.target.value)} />
                <div><span>{visible.length} of {data.subjects.length} subjects shown</span>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>
              </div>
              {!data.subjects.length && <div className="offerings-empty"><h3>No curriculum subjects available</h3><p>Your curriculum catalogue needs to be configured before you can add offerings.</p></div>}
              {data.subjects.length > 0 && !visible.length && <div className="offerings-empty"><h3>No matching subjects</h3><p>Try a different subject code or name. Your selections are kept when you search.</p></div>}
              <div className="offerings-subjects">{visible.map(subject => {
                const checked = draft.includes(subject.curriculumSubjectId);
                return <label key={subject.curriculumSubjectId} className={'offerings-subject' + (checked ? ' is-selected' : '')}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(subject.curriculumSubjectId)}
                    aria-label={`${subject.code} ${subject.name}`} />
                  <span className="offerings-subject-info"><strong>{subject.code}</strong><span>{subject.name}</span></span>
                  <span className="offerings-subject-meta"><span>{subject.creditHours} credits</span><small>{checked ? 'Selected' : 'Select subject'}</small></span>
                </label>;
              })}</div>
            </> : <>
              <p className="offerings-review-help">{selected.length ? 'These are the subjects you report as offered for this semester.' : 'You are saving an empty offering list for this semester.'}</p>
              <ul className="offerings-review-list">{selected.map(subject => <li key={subject.curriculumSubjectId}>
                <div><strong>{subject.code}</strong><span>{subject.name}</span></div><span>{subject.creditHours} credits</span></li>)}</ul>
              {!selected.length && <p className="offerings-empty">No reported offerings. Future recommendations need subject offerings to work from.</p>}
              {mode === 'review' && <label className="offerings-confirm"><input type="checkbox" checked={confirmed} disabled={saving}
                onChange={event => setConfirmed(event.target.checked)} />
                <span>I confirm this is my student-reported list for {semester.academicYear}, Semester {semester.semesterNo}. It is not verified by UTMSPACE.</span></label>}
              {saveError && <div role="alert" tabIndex={-1} ref={errorPanel} className="offerings-error"><strong>Save was not confirmed</strong><p>{saveError}</p>
                <p>Your draft is still here. Retry, or return to edit it.</p></div>}
            </>}
          </section>
          <aside className="offerings-summary">
            <section className="offerings-card">
              <p className="offerings-eyebrow">YOUR REPORTED LIST</p><h2>Semester {semester.semesterNo} <span className="offerings-summary-year">{semester.academicYear}</span></h2>
              <div className="offerings-metrics"><div><strong>{selected.length}</strong><span>subjects selected</span></div><div><strong>{totalCredits}</strong><span>credits represented</span></div></div>
              <p className="offerings-caption">This is a record of availability, not a validated study load.</p>
              {!selected.length ? <div className="offerings-empty"><strong>No subjects selected yet</strong><p>Report the subjects available this semester. Future recommendations will need this information.</p></div> :
                <ul className="offerings-selected-list">{selected.map(subject => <li key={subject.curriculumSubjectId}><span>{subject.code}</span>
                  {mode === 'select' ? <button type="button" aria-label={`Remove ${subject.code}`} onClick={() => toggle(subject.curriculumSubjectId)}>Remove</button> : <span>{subject.creditHours} cr.</span>}</li>)}</ul>}
              <div className="offerings-summary-actions">
                {mode === 'select' && <><button className="offerings-primary" type="button" disabled={!data.subjects.length && !saved.length}
                  onClick={() => { setMode('review'); setConfirmed(false); setNotice(''); }}>Review offerings <span aria-hidden="true">→</span></button>
                  {dirty && <button type="button" onClick={cancel}>Cancel changes</button>}
                  {draft.length > 0 && <button className="offerings-text-button" type="button" onClick={() => { setDraft([]); setNotice(''); }}>Clear selection</button>}</>}
                {mode === 'review' && <><button className="offerings-primary" type="button" disabled={!confirmed || saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : saveError ? 'Retry save' : 'Confirm and save'}</button>
                  {!confirmed && <p className="offerings-caption">Tick the confirmation before saving.</p>}
                  <button type="button" disabled={saving} onClick={() => { setMode('select'); setConfirmed(false); }}>Back to selection</button>
                  <button className="offerings-text-button" type="button" disabled={saving} onClick={cancel}>Cancel changes</button></>}
                {mode === 'saved' && <button className="offerings-primary" type="button" onClick={() => { setMode('select'); heading.current?.focus(); }}>Edit offerings</button>}
              </div>
              <p className="offerings-save-state">{mode === 'saved' ? '✓ Saved' : dirty ? '● Unsaved changes' : saved.length ? 'Previously saved list' : 'No saved offerings for this semester'}</p>
            </section>
            <div className="offerings-next"><strong>One step towards your next semester</strong><p>Keep this list up to date as the registration period changes. Eligibility and recommendations are planned for a later sprint.</p></div>
          </aside>
        </div>
      </>}
    </>}
  </div>;
}
