import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile, ProfileOptions } from '../../../../api/src/modules/profile/contracts';
import { AcademicApiError, type AcademicClient, errorMessage } from './client';
import { resolveProgrammeCurriculum } from './programme-resolution';
import { navigateApp, registerUnsavedChanges } from '../../app/navigation';
import '../../app/typography.css';
import './profile.css';
const empty = { studentName: '', matricNo: '', curriculumId: '', weeklyWorkingHours: '', availableStudyHours: '' };
type Draft = typeof empty;
function draftOf(p: Profile | null): Draft {
  return p ? { studentName: p.studentName, matricNo: p.matricNo ?? '', curriculumId: String(p.curriculumId),
    weeklyWorkingHours: p.weeklyWorkingHours === null ? '' : String(p.weeklyWorkingHours),
    availableStudyHours: p.availableStudyHours === null ? '' : String(p.availableStudyHours) } : { ...empty };
}
export function ProfilePage({ api, setup = false, onSetupComplete = () => { navigateApp('/student'); } }: {
  api: AcademicClient; setup?: boolean; onSetupComplete?: () => void;
}) {
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<ProfileOptions>({ curricula: [], subjects: [], semesters: [], currentSemester: null, currentAcademicYear: null });
  const [draft, setDraft] = useState<Draft>({ ...empty }), [initial, setInitial] = useState<Draft>({ ...empty });
  const [programme, setProgramme] = useState(''), [initialProgramme, setInitialProgramme] = useState(''), [saving, setSaving] = useState(false);
  const [refreshingPeriod, setRefreshingPeriod] = useState(false), [refreshFailed, setRefreshFailed] = useState(false);
  const [savedSemesterId, setSavedSemesterId] = useState<number | null>(null), [staleSavedSemester, setStaleSavedSemester] = useState(false);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [periodNotice, setPeriodNotice] = useState('');
  const alert = useRef<HTMLParagraphElement>(null), unsaved = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(false); setError('');
    Promise.all([api<Profile | null>('/api/profile', { signal: controller.signal }), api<ProfileOptions>('/api/profile/options', { signal: controller.signal, bypassCache: true })])
      .then(([profile, choices]) => {
        if (controller.signal.aborted) return;
        const value = draftOf(profile); setDraft(value); setInitial(value); setOptions(choices);
        const savedPeriodId = profile?.currentSemesterId ?? null;
        setSavedSemesterId(savedPeriodId);
        setStaleSavedSemester(Boolean(savedPeriodId !== null && savedPeriodId !== choices.currentSemester?.semesterId));
        const savedProgramme = String(choices.curricula.find(c => c.curriculumId === profile?.curriculumId)?.programmeId ?? '');
        setProgramme(savedProgramme); setInitialProgramme(savedProgramme); setLoaded(true);
      }).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, attempt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || programme !== initialProgramme;
  unsaved.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (unsaved.current) { event.preventDefault(); event.returnValue = ''; } };
    const release = registerUnsavedChanges(()=>unsaved.current);
    window.addEventListener('beforeunload', warn); return () => { release(); window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  function field(key: keyof Draft, value: string) { setDraft(old => ({ ...old, [key]: value })); setSuccess(''); setPeriodNotice(''); }
  async function refreshCurrentSemester(notice: string) {
    setRefreshingPeriod(true); setRefreshFailed(false); setError(''); setSuccess(''); setPeriodNotice('');
    try {
      const choices = await api<ProfileOptions>('/api/profile/options', { bypassCache: true });
      setOptions(choices);
      // The period is metadata, not draft state; Cancel cannot restore an older administrator selection.
      setStaleSavedSemester(Boolean(savedSemesterId !== null && savedSemesterId !== choices.currentSemester?.semesterId));
      setPeriodNotice(notice);
    } catch (reason) {
      setRefreshFailed(true); setError(errorMessage(reason));
    } finally { setRefreshingPeriod(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || refreshingPeriod || !options.currentSemester || !resolvedCurriculumId) return; setSaving(true); setError(''); setSuccess(''); setPeriodNotice('');
    try {
      const profile = await api<Profile>('/api/profile', { method: 'PUT', body: {
        studentName: draft.studentName.trim(), matricNo: draft.matricNo.trim() || null, curriculumId: resolvedCurriculumId,
        currentSemesterId: options.currentSemester.semesterId,
        weeklyWorkingHours: Number(draft.weeklyWorkingHours), availableStudyHours: Number(draft.availableStudyHours),
      } });
      const value = draftOf(profile);
      const savedProgramme = String(options.curricula.find(c => c.curriculumId === profile.curriculumId)?.programmeId ?? '');
      unsaved.current = false; setDraft(value); setInitial(value); setProgramme(savedProgramme); setInitialProgramme(savedProgramme);
      setSavedSemesterId(profile.currentSemesterId); setStaleSavedSemester(false); setSuccess('Profile saved.');
      if (setup) onSetupComplete();
    } catch (reason) {
      if (reason instanceof AcademicApiError && (reason.code === 'ACADEMIC_SEMESTER_MISMATCH' || reason.code === 'ACADEMIC_SEMESTER_UNAVAILABLE')) {
        await refreshCurrentSemester(reason.code === 'ACADEMIC_SEMESTER_MISMATCH'
          ? 'The administrator changed the current semester. Review the updated period and save again.'
          : 'The administrator must configure a current semester before you can save.');
      } else setError(errorMessage(reason));
    } finally { setSaving(false); }
  }
  const programmes = [...new Map(options.curricula.map(c => [c.programmeId, c])).values()];
  const savedCurriculumId = programme === initialProgramme && initialProgramme && initial.curriculumId ? Number(initial.curriculumId) : undefined;
  const resolvedCurriculumId = resolveProgrammeCurriculum(options.curricula, programme, savedCurriculumId);
  function selectProgramme(value: string) {
    setProgramme(value);
    const preferred = value === initialProgramme && initialProgramme && initial.curriculumId ? Number(initial.curriculumId) : undefined;
    const curriculumId = resolveProgrammeCurriculum(options.curricula, value, preferred);
    field('curriculumId', curriculumId === null ? '' : String(curriculumId));
  }
  return <section className="p001" aria-label="Academic profile">
    <header><p className="p001-eyebrow">Academic records</p><h1>{setup ? 'Complete your academic profile' : 'Your academic profile'}</h1>
      <p>Choose your programme and tell us about your weekly work and study availability.</p></header>
    {error && <p className="p001-alert" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    {!loaded && (error ? <button className="p001-action" type="button" onClick={() => setAttempt(n => n + 1)}>Retry loading profile</button> : <p role="status">Loading your profile…</p>)}
    {loaded && !options.curricula.length && <div className="p001-card" role="status"><h2>No programme is configured</h2>
      <p>The maintainer needs to configure approved programme data before you can complete setup. Your account remains available.</p>
      <button className="p001-action" type="button" onClick={() => setAttempt(n => n + 1)}>Refresh available programmes</button></div>}
    {loaded && options.curricula.length > 0 && <form className="p001-card" onSubmit={event => { void save(event); }} aria-busy={saving || refreshingPeriod}>
      <fieldset disabled={saving || refreshingPeriod}><legend>Programme and identity</legend><div className="p001-grid">
        <label>Student name<input name="studentName" required maxLength={255} value={draft.studentName} onChange={e => field('studentName', e.target.value)} autoComplete="name" /></label>
        <label>Matric number (optional)<input name="matricNo" maxLength={30} value={draft.matricNo} onChange={e => field('matricNo', e.target.value)} /></label>
        <label>Programme<select aria-label="Programme" required value={programme} onChange={e => selectProgramme(e.target.value)}>
          <option value="">Select a programme</option>{programmes.map(c => <option key={c.programmeId} value={c.programmeId}>{c.programmeCode} — {c.programmeName}</option>)}
        </select></label>
        </div>
        {programme && !resolvedCurriculumId && <p className="p001-help" role="status">This programme has multiple active configurations. Ask the maintainer to resolve the programme setup before saving.</p>}
        <p className="p001-help">Your institutional email is managed through your account. Changing programmes while academic data is saved may require maintainer assistance.</p>
      </fieldset>
      <fieldset disabled={saving || refreshingPeriod}><legend>Current academic period</legend><div className="p001-grid">
        <label className="p001-current-period-field">Academic year<span className="p001-readonly-control"><input aria-label="Academic year" aria-describedby="p001-current-period-help" value={options.currentSemester?.academicYear ?? ''} placeholder="Not configured" readOnly /><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M6.5 9V6a3.5 3.5 0 0 1 7 0v3"/></svg></span></label>
        <label className="p001-current-period-field">Semester<span className="p001-readonly-control"><input aria-label="Semester" aria-describedby="p001-current-period-help" value={options.currentSemester
          ? `Semester ${options.currentSemester.semesterNo} (${options.currentSemester.semesterType === 'SHORT' ? 'Short' : 'Normal'})` : ''} placeholder="Not configured" readOnly /><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M6.5 9V6a3.5 3.5 0 0 1 7 0v3"/></svg></span></label>
      </div>
      {!options.currentSemester && <p className="p001-help" role="alert">The administrator must configure the current academic semester before you can save your profile.</p>}
      <p className="p001-help" id="p001-current-period-help">The administrator controls both your academic year and semester. The profile uses exactly the semester marked current.</p>
      {staleSavedSemester && <p className="p001-help" role="status">Your saved profile uses a different semester. The administrator’s current period is shown above; save explicitly to update your profile. Your saved profile has not been changed.</p>}
      {periodNotice && <p className="p001-help" role="status">{periodNotice}</p>}
      {refreshFailed && <button className="p001-action" type="button" onClick={() => { void refreshCurrentSemester('The current semester was refreshed. Review it and save again.'); }}>Refresh current semester</button>}
      <p className="p001-help">Saving your profile uses this current academic period. Your historical records are retained.</p></fieldset>
      <fieldset disabled={saving || refreshingPeriod}><legend>Work and study availability</legend><div className="p001-grid">
        <label>Weekly working hours<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.weeklyWorkingHours} onChange={e => field('weeklyWorkingHours', e.target.value)} /></label>
        <label>Available study hours per week<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.availableStudyHours} onChange={e => field('availableStudyHours', e.target.value)} /></label>
      </div><p className="p001-help">Enter whole hours. Use zero when you have no work or study hours available.</p></fieldset>
      <div className="p001-actions"><button className="p001-primary" type="submit" disabled={saving || refreshingPeriod || !options.currentSemester || !resolvedCurriculumId}>{saving ? 'Saving…' : 'Save profile'}</button>
        <button className="p001-cancel" type="button" disabled={saving || refreshingPeriod || !dirty} onClick={() => { setDraft({ ...initial }); setProgramme(initialProgramme); setError(''); setSuccess('Unsaved changes cancelled.'); }}>Cancel changes</button>
        {dirty && <span className="p001-help">Unsaved changes</span>}</div>
      {success && <p role="status" className="p001-success">{success}</p>}
    </form>}
    <p className="p001-help">Student-reported information. Saving does not verify your university records.</p>
  </section>;
}
