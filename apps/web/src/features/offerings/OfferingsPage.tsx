import { useEffect, useRef, useState } from 'react';
import type { OfferingPageData, OfferingSubject, OfferingsClient } from '../../../../../packages/shared/src/offerings/offerings';
import { OfferingApiError } from './client';
import { offeringHistoryState } from './academic-history';
import { matchesOfferingSemesterDisplay, offeringCategoryLabel } from './display-filter';
import { offeringCategoryGroup, offeringCategoryPillLabel, sortOfferingSubjectsByCategory, summarizeOfferingCategories } from './category-history-summary';
import { PrerequisiteDisplay } from './PrerequisiteDisplay';
import { ToastStack } from '../../components/feedback/ToastStack';
import { useToastNotifications } from '../../components/feedback/useToastNotifications';
import { registerUnsavedChanges } from '../../app/navigation';
import './offerings.css';

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every(id => right.includes(id));
}
function errorMessage(error: unknown): string {
  return error instanceof OfferingApiError ? error.message : 'We could not reach offerings services. Please retry. Your changes have not been confirmed as saved.';
}
function historyLabel(subject: OfferingSubject, data: OfferingPageData): string {
  const state = offeringHistoryState(subject, data.academicHistory);
  return state === 'taken' ? 'Taken' : state === 'exempted' ? 'Exempted' : state === 'ambiguous' ? 'History ambiguous' : state === 'unknown' ? 'History unknown' : 'Remaining';
}

/** UC08 only. FOUNDATION mounts at /student/offerings with P004 AuthGate. */
export function OfferingsPage({ client, demonstration = false }: { client: OfferingsClient; demonstration?: boolean }) {
  const [data, setData] = useState<OfferingPageData | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [hasSavedList, setHasSavedList] = useState(false);
  const [mode, setMode] = useState<'select' | 'review' | 'saved'>('select');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const { toasts, notify, dismissToast, onToastAnimationEnd } = useToastNotifications();
  const heading = useRef<HTMLHeadingElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setLoadError(null); setSaveError('');
    client.load(undefined, controller.signal).then(result => {
      if (!active) return;
      setData(result);
      const persistedIds = result.selection?.curriculumSubjectIds ?? [];
      setDraft(persistedIds);
      setHasSavedList(persistedIds.length > 0);
      setMode(persistedIds.length > 0 ? 'saved' : 'select'); setConfirmed(false); setLoading(false);
    }, error => {
      if (active) { setLoadError(error); setLoading(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [client, attempt]);

  const saved = data?.selection?.curriculumSubjectIds ?? [];
  const dirty = !sameSet(draft, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const release = registerUnsavedChanges(() => dirty);
    window.addEventListener('beforeunload', warn);
    return () => { release(); window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  useEffect(() => { if (mode !== 'select') heading.current?.focus(); }, [mode]);
  useEffect(() => { if (saveError || loadError) errorPanel.current?.focus(); }, [saveError, loadError]);

  function cancel() {
    setDraft([...saved]); setMode(hasSavedList ? 'saved' : 'select'); setConfirmed(false); setSaveError('');
  }
  function toggle(id: string) {
    setDraft(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    setSaveError(''); setConfirmed(false);
  }
  async function save() {
    if (!confirmed || saving) return;
    setSaving(true); setSaveError('');
    try {
      const selection = await client.save({ semesterId: data?.currentSemesterId ?? '', curriculumSubjectIds: draft });
      setData(previous => previous ? { ...previous, selection } : previous);
      setDraft(selection.curriculumSubjectIds); setHasSavedList(true); setMode('saved'); setConfirmed(false);
      notify('Offerings saved.', 'success');
    } catch (error) { setSaveError(errorMessage(error)); notify('Save was not confirmed. Your draft is still available.', 'danger'); }
    finally { setSaving(false); }
  }

  const semester = data?.semesters.find(item => item.semesterId === data?.currentSemesterId);
  const categorySummary = data && semester ? summarizeOfferingCategories(data.subjects, data.academicHistory, semester.semesterNo) : null;
  const selected = data?.subjects.filter(subject => draft.includes(subject.curriculumSubjectId)) ?? [];
  const totalCredits = selected.reduce((total, subject) => total + subject.creditHours, 0);
  const blocked = loadError instanceof OfferingApiError && [401, 403].includes(loadError.status);
  const searched = (data?.subjects ?? []).filter(subject => `${subject.code} ${subject.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const displayEligible = searched.filter(subject => {
    const semesterNo = semester?.semesterNo ?? 1;
    if (subject.subjectCategory?.trim()) return matchesOfferingSemesterDisplay(subject, semesterNo);
    if (subject.code.trim().toUpperCase() === 'SECJ3032' || subject.creditHours === 2) return matchesOfferingSemesterDisplay(subject, semesterNo);
    return true;
  });
  const remaining = sortOfferingSubjectsByCategory(displayEligible.filter(subject => {
    const state = offeringHistoryState(subject, data?.academicHistory);
    return state !== 'taken' && state !== 'exempted';
  }));
  const hiddenSelected = selected.filter(subject => !remaining.some(visibleSubject => visibleSubject.curriculumSubjectId === subject.curriculumSubjectId));

  return <div className="offerings" aria-busy={loading || saving}>
    <ToastStack toasts={toasts} onDismiss={dismissToast} onExitAnimationEnd={onToastAnimationEnd} />

    {loading && <div className="offerings-card offerings-loading" role="status">Loading your curriculum and semester offerings…</div>}
    {!loading && loadError !== null && <div className="offerings-card offerings-error" role="alert" ref={errorPanel} tabIndex={-1}>
      <h2>{blocked ? 'Account access required' : 'Offerings are unavailable'}</h2><p>{errorMessage(loadError)}</p>
      {loadError instanceof OfferingApiError && loadError.status === 401 && <a href="/sign-in">Sign in</a>}
      {loadError instanceof OfferingApiError && loadError.code === 'PROFILE_SETUP_REQUIRED' && <a href="/student/setup">Complete academic profile</a>}
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
    </div>}
    {!loading && !loadError && data && <>
      {!semester ? <section className="offerings-card"><h2>No semesters configured</h2><p>Semester setup is needed before you can report offerings. No subject availability has been assumed.</p></section> : <>
        <p className="offerings-current-semester"><a href="/student/profile">Edit academic profile</a></p>
        <ol className="offerings-steps" aria-label="Save offerings steps">
          {['Select subjects', 'Review & confirm', 'Saved'].map((label, index) => {
            const current = mode === 'select' ? 0 : mode === 'review' ? 1 : 2;
            return <li key={label} aria-current={current === index ? 'step' : undefined} className={current >= index ? 'is-active' : ''}>
              <span aria-hidden="true">{current > index ? '✓' : index + 1}</span>{label}</li>;
          })}
        </ol>

        <div className="offerings-grid">
          <section className="offerings-card offerings-catalogue" aria-label={mode === 'select' ? 'Curriculum subjects' : 'Review offerings'}>
            <div className="offerings-section-heading">
              <div className="offerings-category-summary" aria-label="Recorded subjects by category">
                <p className="offerings-eyebrow">Recorded subjects by category</p>
                <div className="offerings-category-summary-groups">
                  {categorySummary?.groups.map(group => <span className={`offerings-category-count offerings-category-${group.group.toLowerCase()}`} key={group.group}>
                    <strong>{group.label}</strong>
                    <span>{group.recognizedCount === null ? 'History unavailable' : `${group.recognizedCount} / ${group.subjectCount}${group.unresolvedCount ? ` · ${group.unresolvedCount} unclear` : ''}`}</span>
                  </span>)}
                  {!categorySummary?.groups.length && <span className="offerings-category-summary-empty">No configured categories for this semester.</span>}
                </div>
                {categorySummary && categorySummary.unclassifiedCount > 0 && <small className="offerings-category-summary-note">{categorySummary.unclassifiedCount} subject(s) have no recognized category label.</small>}
                {categorySummary && categorySummary.groups.some(group => group.unresolvedCount > 0) && <small className="offerings-category-summary-note">Some history is ambiguous and is not included in the recorded counts.</small>}
              </div>
           </div>
            {mode === 'saved' && <div className="offerings-success" role="status"><strong>{demonstration ? 'Saved in this browser for demonstration.' : 'Your student-reported offerings were saved.'}</strong>
              <p>You can return to edit this semester’s list whenever you need.</p></div>}
            {mode === 'select' ? <>
              <div className="offerings-filters">
                <div className="offerings-search"><label htmlFor="offerings-search">Find a subject</label>
                  <input type="search" id="offerings-search" placeholder="Search by subject code or name" value={query} onChange={event => setQuery(event.target.value)} />
                  <div className="offerings-search-count"><span>{remaining.length} matching subjects shown</span>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div></div>
                {/* <div className="offerings-field"><label htmlFor="offerings-category">Category</label>
                  <select id="offerings-category" value={category} onChange={event => setCategory(event.target.value)}>
                    <option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div> */}
              </div>
              {data.subjects.some(subject => !subject.subjectCategory?.trim()) && <p className="offerings-data-note">Unrecorded categories are shown as Other / unknown. Display rules use code or credit-hour facts where conclusive; other rows remain visible without a category-based classification.</p>}

              {data.academicHistory?.status !== 'available' && <p className="offerings-data-note">Academic history is unavailable. Subjects with a recorded completed or exempted status cannot be identified.</p>}
              {!data.subjects.length && <div className="offerings-empty"><h3>No curriculum subjects available</h3><p>Your curriculum catalogue needs to be configured before you can add offerings.</p></div>}
              {data.subjects.length > 0 && !remaining.length && <div className="offerings-empty"><h3>No matching subjects</h3><p>Adjust your search. Selected subjects remain available in the summary when search hides them.</p></div>}
              <p className="offerings-table-hint">Scroll the subject table to see category and credits.</p>
              <div className="offerings-table-scroll" role="region" aria-label="Subject catalogue table; scroll horizontally" tabIndex={0}>
              <table className="offerings-subject-table"><thead><tr><th scope="col">Select</th><th scope="col">Subject</th><th className="offerings-prerequisites-column" scope="col">Prerequisites</th><th scope="col">Category</th><th scope="col">Credits</th></tr></thead><tbody>{remaining.map(subject => {
                const checked = draft.includes(subject.curriculumSubjectId);
                const state = offeringHistoryState(subject, data.academicHistory);
                return <tr key={subject.curriculumSubjectId} className={(checked ? 'is-selected ' : '') + (state === 'ambiguous' ? 'is-ambiguous' : '')}>
                  <td><input type="checkbox" checked={checked} disabled={saving} onChange={() => toggle(subject.curriculumSubjectId)} aria-label={`${subject.code} ${subject.name}`} /></td>
                  <td><div className="offerings-subject-copy"><strong>{subject.code}</strong><span>{subject.name}</span>
                    {state === 'ambiguous' && <small>History ambiguous</small>}
                    <div className="offerings-prerequisite-inline"><PrerequisiteDisplay subject={subject} catalogue={data.subjects} /></div>
                  </div></td>
                  <td className="offerings-prerequisites-column"><PrerequisiteDisplay subject={subject} catalogue={data.subjects} /></td>
                  <td><span className={`offerings-category-pill offerings-category-pill-${offeringCategoryGroup(subject).toLowerCase()}`}>{offeringCategoryPillLabel(subject)}</span>{!subject.subjectCategory?.trim() && <small>Not recorded</small>}</td>
                  <td>{subject.creditHours}</td>
                </tr>;
              })}</tbody></table>
              </div>
            </> : <>
              {mode === 'review' && hiddenSelected.length > 0 && <div className="offerings-hidden-selection" role="status">{hiddenSelected.length} selected {hiddenSelected.length === 1 ? 'subject is' : 'subjects are'} hidden by the current search or semester/history display rule. They remain in this review and will be included in the save.</div>}
              <ul className="offerings-review-list">{selected.map(subject => <li key={subject.curriculumSubjectId}>
                <div><strong>{subject.code}</strong><span>{subject.name}</span><small>{offeringCategoryLabel(subject)} · {historyLabel(subject, data)}</small><PrerequisiteDisplay subject={subject} catalogue={data.subjects} /></div><span>{subject.creditHours} credits</span></li>)}</ul>
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
              <h2>Semester {semester.semesterNo} <span className="offerings-summary-year">{semester.academicYear}</span></h2>
              <div className="offerings-metrics"><div><strong>{selected.length}</strong><span>subjects selected</span></div><div><strong>{totalCredits}</strong><span>credits represented</span></div></div>
              {mode === 'select' && hiddenSelected.length > 0 && <div className="offerings-hidden-selection" role="status">{hiddenSelected.length} selected subject(s) hidden by filters; retained here and in review.</div>}
              {!selected.length ? <div className="offerings-empty"><strong>No subjects selected yet</strong><p>Report the subjects available this semester. Future recommendations will need this information.</p></div> :
                <ul className="offerings-selected-list">{selected.map(subject => <li key={subject.curriculumSubjectId}><span>{subject.code}</span>
                  {mode === 'select' ? <button type="button" aria-label={`Remove ${subject.code}`} onClick={() => toggle(subject.curriculumSubjectId)}>Remove</button> : <span>{subject.creditHours} credits.</span>}</li>)}</ul>}
              <div className="offerings-summary-actions">
                {mode === 'select' && <><button className="offerings-primary" type="button" disabled={!data.subjects.length && !saved.length}
                  onClick={() => { setMode('review'); setConfirmed(false); }}>Review offerings <span aria-hidden="true">→</span></button>
                  {dirty && <button className="offerings-cancel" type="button" onClick={cancel}>Cancel changes</button>}
                {draft.length > 0 && <button className="offerings-text-button" type="button" disabled={saving} onClick={() => { setDraft([]); }}>Clear selection</button>}</>}
                {mode === 'review' && <><button className="offerings-primary" type="button" disabled={!confirmed || saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : saveError ? 'Retry save' : 'Confirm and save'}</button>
                  {!confirmed && <p className="offerings-caption">Tick the confirmation before saving.</p>}
                  <button type="button" disabled={saving} onClick={() => { setMode('select'); setConfirmed(false); }}>Back to selection</button>
                  <button className="offerings-cancel" type="button" disabled={saving} onClick={cancel}>Cancel changes</button></>}
                {mode === 'saved' && <button className="offerings-primary" type="button" onClick={() => { setMode('select'); heading.current?.focus(); }}>Edit offerings</button>}
              </div>
              <p className="offerings-save-state">{mode === 'saved' ? '✓ Saved' : dirty ? '● Unsaved changes' : saved.length ? 'Previously saved list' : 'No saved offerings for this semester'}</p>
            </section>

         </aside>
        </div>
      </>}
    </>}
  </div>;
}
