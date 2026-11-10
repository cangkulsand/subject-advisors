import { SearchField, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import { useEffect, useRef, useState } from 'react';
import type { OfferingPageData, OfferingSubject, OfferingsClient, OfferingWindow, OfferingWindowStatus } from '../../../../../packages/shared/src/offerings/offerings';
import { pickLimitMessage } from '../../../../../packages/shared/src/offerings/offerings';
import { selectionPhase } from '../../../../../packages/shared/src/forecasting/selection-window';
import { OfferingApiError } from './client';
import { offeringHistoryState } from './academic-history';
import { matchesOfferingSemesterDisplay, offeringCategoryLabel } from './display-filter';
import { offeringCategoryGroup, offeringCategoryPillLabel, sortOfferingSubjectsByCategory, summarizeOfferingCategories } from './category-history-summary';
import { PrerequisiteDisplay } from './PrerequisiteDisplay';
import { ToastStack } from '../../components/feedback/ToastStack';
import { useToastNotifications } from '../../components/feedback/useToastNotifications';
import { registerUnsavedChanges } from '../../app/navigation';
import '../../app/typography.css';
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

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
/** The server answer ages while a snapshot is cached; move OPEN/CLOSED locally from the window dates. */
function liveStatus(window: OfferingWindow | undefined, now: Date): OfferingWindowStatus {
  if (!window) return 'OPEN';
  const ages = window.status === 'NOT_OPEN' || window.status === 'OPEN' || window.status === 'CLOSED';
  if (!ages || window.selectionOpensAt === null) return window.status;
  const phase = selectionPhase(window, now);
  return phase === 'OPEN' ? 'OPEN' : phase === 'CLOSED' ? 'CLOSED' : 'NOT_OPEN';
}
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, []);
  return now;
}
const REFRESH_CODES = ['PICKS_CLOSED', 'PICKS_NOT_OPEN', 'OFFERING_NOT_APPROVED', 'SEMESTER_NOT_TARGET'];

/** Student picks for the next semester. FOUNDATION mounts at /student/offerings with P004 AuthGate. */
export function OfferingsPage({ client, demonstration = false }: { client: OfferingsClient; demonstration?: boolean }) {
  const [data, setData] = useState<OfferingPageData | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [hasSavedList, setHasSavedList] = useState(false);
  const [modeState, setMode] = useState<'select' | 'review' | 'saved'>('select');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');
  const now = useNow();
  const reloadedOpening = useRef<string | null>(null);
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

  const status = liveStatus(data?.window, now);
  const closed = status === 'CLOSED';
  const mode = closed ? 'saved' : modeState;
  const limits = data?.limits;
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
  // The opening time passed while a NOT_OPEN snapshot was cached: fetch the approved subjects once.
  useEffect(() => {
    const opensAt = data?.window?.selectionOpensAt ?? null;
    if (data?.window?.status === 'NOT_OPEN' && status === 'OPEN' && opensAt && reloadedOpening.current !== opensAt) {
      reloadedOpening.current = opensAt; client.refresh?.(); setAttempt(value => value + 1);
    }
  }, [client, data, status]);
  useEffect(() => { if (saveError || loadError) errorPanel.current?.focus(); }, [saveError, loadError]);

  function cancel() {
    setDraft([...saved]); setMode(hasSavedList ? 'saved' : 'select'); setConfirmed(false); setSaveError(''); setLimitMessage('');
  }
  function toggle(id: string) {
    const adding = !draft.includes(id);
    if (adding && limits && data) {
      const subject = data.subjects.find(item => item.curriculumSubjectId === id);
      const credits = data.subjects.filter(item => draft.includes(item.curriculumSubjectId)).reduce((total, item) => total + item.creditHours, 0);
      if (draft.length + 1 > limits.maxSubjects || credits + (subject?.creditHours ?? 0) > limits.maxCredits) {
        setLimitMessage(pickLimitMessage(limits)); return;
      }
    }
    setLimitMessage('');
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
      notify('Your picks were saved.', 'success');
    } catch (error) {
      if (error instanceof OfferingApiError && REFRESH_CODES.includes(error.code)) {
        // The server answer wins: drop the cached snapshot and show what is offered now.
        client.refresh?.(); setAttempt(value => value + 1); notify(error.message, 'danger');
      } else { setSaveError(errorMessage(error)); notify('Save was not confirmed. Your draft is still available.', 'danger'); }
    }
    finally { setSaving(false); }
  }

  const catalogue = data?.prerequisiteCatalogue ?? data?.subjects ?? [];
  const semester = data?.semesters.find(item => item.semesterId === data?.currentSemesterId);
  const categorySummary = data && semester ? summarizeOfferingCategories(data.subjects, data.academicHistory, semester.semesterNo) : null;
  const selected = data?.subjects.filter(subject => draft.includes(subject.curriculumSubjectId)) ?? [];
  const totalCredits = selected.reduce((total, subject) => total + subject.creditHours, 0);
  const blocked = loadError instanceof OfferingApiError && [401, 403].includes(loadError.status);
  const selectionWindow = data?.window;
  const stateCard: { title: string; text: string; profileLink?: boolean } | null =
    status === 'NO_NEXT_SEMESTER' ? { title: 'No next semester', text: 'No next semester is configured yet.' } :
    status === 'NO_LEARNING_CENTRE' ? { title: 'Choose your learning centre', text: 'Choose your learning centre in your academic profile to see the subjects offered to you.', profileLink: true } :
    status === 'NOT_SCHEDULED' ? { title: 'Offerings are not open', text: 'Offerings are not open yet. The selection date has not been scheduled.' } :
    status === 'NOT_OPEN' ? { title: 'Offerings are not open', text: `Offerings open on ${selectionWindow?.selectionOpensAt ? formatWhen(selectionWindow.selectionOpensAt) : 'a date to be announced'}.` } : null;
  const closesLabel = selectionWindow?.selectionClosesAt ? formatWhen(selectionWindow.selectionClosesAt) : null;
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
    {!loading && !loadError && data && (data.withdrawnSubjects?.length ?? 0) > 0 && <div className="offerings-withdrawn" role="status">
      <strong>Withdrawn by the coordinator</strong>
      <ul>{data.withdrawnSubjects!.map(item => <li key={item.subjectId}>{item.code} was withdrawn by the coordinator</li>)}</ul>
    </div>}
    {!loading && !loadError && data && stateCard && <section className="offerings-card offerings-state" aria-label={stateCard.title}>
      <h2>{stateCard.title}</h2><p>{stateCard.text}</p>
      {stateCard.profileLink && <a href="/student/profile">Open academic profile</a>}
    </section>}
    {!loading && !loadError && data && !stateCard && <>
      {!semester ? <section className="offerings-card"><h2>No semesters configured</h2><p>Semester setup is needed before you can report offerings. No subject availability has been assumed.</p></section> : <>
        <p className="offerings-current-semester"><a href="/student/profile">Edit academic profile</a></p>
        {!closed && <ol className="offerings-steps" aria-label="Save offerings steps">
          {['Select subjects', 'Review & confirm', 'Saved'].map((label, index) => {
            const current = mode === 'select' ? 0 : mode === 'review' ? 1 : 2;
            return <li key={label} aria-current={current === index ? 'step' : undefined} className={current >= index ? 'is-active' : ''}>
              <span aria-hidden="true">{current > index ? '✓' : index + 1}</span>{label}</li>;
          })}
        </ol>}

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
            {closed && <div className="offerings-success" role="status"><strong>Selection closed on {closesLabel ?? 'the closing time'}. Your picks are read-only.</strong></div>}
            {!closed && mode === 'saved' && <div className="offerings-success" role="status"><strong>{demonstration ? 'Saved in this browser for demonstration.' : 'Your picks were saved.'}</strong>
              <p>You can return to edit your picks whenever you need.</p></div>}
            {!closed && <p className="offerings-deadline-hint">Picks can be changed until {closesLabel ?? 'selection closes'}</p>}
            {mode === 'select' ? <>
              <div className="offerings-filters">
                <div className="offerings-search"><TableToolbar label="Subject search"><SearchField label="Find a subject" value={query} onChange={setQuery} placeholder="Search by subject code or name"/></TableToolbar>
                  <div className="offerings-search-count"><span>{remaining.length} matching subjects shown</span>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div></div>
                {/* <div className="offerings-field"><label htmlFor="offerings-category">Category</label>
                  <select id="offerings-category" value={category} onChange={event => setCategory(event.target.value)}>
                    <option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div> */}
              </div>
              {limitMessage && <p className="offerings-limit-message" role="alert">{limitMessage}</p>}
              {data.subjects.some(subject => !subject.subjectCategory?.trim()) && <p className="offerings-data-note">Unrecorded categories are shown as Other / unknown. Display rules use code or credit-hour facts where conclusive; other rows remain visible without a category-based classification.</p>}

              {data.academicHistory?.status !== 'available' && <p className="offerings-data-note">Academic history is unavailable. Subjects with a recorded completed or exempted status cannot be identified.</p>}
              {!data.subjects.length && <div className="offerings-empty"><h3>No subjects are offered yet</h3><p>The coordinator has not approved any subject for your programme and learning centre this semester.</p></div>}
              {data.subjects.length > 0 && !remaining.length && <div className="offerings-empty"><h3>No matching subjects</h3><p>Adjust your search. Selected subjects remain available in the summary when search hides them.</p></div>}
              <p className="offerings-table-hint">Scroll the subject table to see category and credits.</p>
              <div className="offerings-table-scroll" role="region" aria-label="Subject catalogue table; scroll horizontally" tabIndex={0}>
              <table className="offerings-subject-table"><thead><tr><th scope="col">Select</th><th scope="col">Subject</th><th className="offerings-prerequisites-column" scope="col">Prerequisites</th><th scope="col">Category</th><th scope="col">Credits</th></tr></thead><tbody>{remaining.map(subject => {
                const checked = draft.includes(subject.curriculumSubjectId);
                const state = offeringHistoryState(subject, data.academicHistory);
                return <tr key={subject.curriculumSubjectId} className={(checked ? 'is-selected ' : '') + (state === 'ambiguous' ? 'is-ambiguous' : '')}>
                  <td><input type="checkbox" checked={checked} disabled={saving} onChange={() => toggle(subject.curriculumSubjectId)} aria-label={`${subject.code} ${subject.name}`} /></td>
                  <td><div className="offerings-subject-copy"><strong>{subject.name}</strong><span className="offerings-subject-code">{subject.code}</span>
                    {state === 'ambiguous' && <small>History ambiguous</small>}
                    <div className="offerings-prerequisite-inline"><PrerequisiteDisplay subject={subject} catalogue={catalogue} /></div>
                  </div></td>
                  <td className="offerings-prerequisites-column"><PrerequisiteDisplay subject={subject} catalogue={catalogue} /></td>
                  <td><span className={`offerings-category-pill offerings-category-pill-${offeringCategoryGroup(subject).toLowerCase()}`}>{offeringCategoryPillLabel(subject)}</span>{!subject.subjectCategory?.trim() && <small>Not recorded</small>}</td>
                  <td>{subject.creditHours}</td>
                </tr>;
              })}</tbody></table>
              </div>
            </> : <>
              {mode === 'review' && hiddenSelected.length > 0 && <div className="offerings-hidden-selection" role="status">{hiddenSelected.length} selected {hiddenSelected.length === 1 ? 'subject is' : 'subjects are'} hidden by the current search or semester/history display rule. They remain in this review and will be included in the save.</div>}
              <ul className="offerings-review-list">{selected.map(subject => <li key={subject.curriculumSubjectId}>
                <div><strong>{subject.code}</strong><span>{subject.name}</span><small>{offeringCategoryLabel(subject)} · {historyLabel(subject, data)}</small><PrerequisiteDisplay subject={subject} catalogue={catalogue} /></div><span>{subject.creditHours} credits</span></li>)}</ul>
              {!selected.length && <p className="offerings-empty">No picks yet.</p>}
              {mode === 'review' && <label className="offerings-confirm"><input type="checkbox" checked={confirmed} disabled={saving}
                onChange={event => setConfirmed(event.target.checked)} />
                <span>I confirm these are my picks for {semester.academicYear}, Semester {semester.semesterNo}. A pick is not a registration.</span></label>}
              {saveError && <div role="alert" tabIndex={-1} ref={errorPanel} className="offerings-error"><strong>Save was not confirmed</strong><p>{saveError}</p>
                <p>Your draft is still here. Retry, or return to edit it.</p></div>}
            </>}
          </section>
          <aside className="offerings-summary">
            <section className="offerings-card">
              <h2>Semester {semester.semesterNo} <span className="offerings-summary-year">{semester.academicYear}</span></h2>
              <div className="offerings-metrics"><div><strong>{selected.length}</strong><span>subjects selected</span></div><div><strong>{totalCredits}</strong><span>credits represented</span></div></div>
              {limits && !closed && <p className="offerings-limit-counter">{selected.length} of {limits.maxSubjects} subjects · {totalCredits} of {limits.maxCredits} credits</p>}
              {mode === 'select' && hiddenSelected.length > 0 && <div className="offerings-hidden-selection" role="status">{hiddenSelected.length} selected subject(s) hidden by filters; retained here and in review.</div>}
              {!selected.length ? <div className="offerings-empty"><strong>No subjects selected yet</strong><p>Pick the subjects you plan to take this semester. A pick is not a registration.</p></div> :
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
                {mode === 'saved' && !closed && <button className="offerings-primary" type="button" onClick={() => { setMode('select'); heading.current?.focus(); }}>Edit offerings</button>}
              </div>
              <p className="offerings-save-state">{closed ? (saved.length ? 'Read-only · picks as saved' : 'No picks were saved for this semester') : mode === 'saved' ? '✓ Saved' : dirty ? '● Unsaved changes' : saved.length ? 'Previously saved list' : 'No saved offerings for this semester'}</p>
            </section>

         </aside>
        </div>
      </>}
    </>}
  </div>;
}
