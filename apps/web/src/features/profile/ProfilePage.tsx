import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile, ProfileOptions } from '../../../../api/src/modules/profile/contracts';
import { AcademicApiError, type AcademicClient, errorMessage } from './client';
import { curriculumOptionText, intakeYears, resolveIntakeCurriculum, savedIntakeSummary } from './programme-resolution';
import { navigateApp, registerUnsavedChanges } from '../../app/navigation';
import { readMatric } from '../../../../../packages/shared/src/profile/matric';
import '../../app/typography.css';
import './profile.css';
const empty = { studentName: '', matricNo: '', learningCentreId: '', curriculumId: '', intakeYear: '', weeklyWorkingHours: '', availableStudyHours: '' };
type Draft = typeof empty;
function draftOf(p: Profile | null): Draft {
  return p ? { studentName: p.studentName, matricNo: p.matricNo ?? '', learningCentreId: p.learningCentreId === null ? '' : String(p.learningCentreId), curriculumId: String(p.curriculumId),
    intakeYear: p.intakeYear === null ? '' : String(p.intakeYear),
    weeklyWorkingHours: p.weeklyWorkingHours === null ? '' : String(p.weeklyWorkingHours),
    availableStudyHours: p.availableStudyHours === null ? '' : String(p.availableStudyHours) } : { ...empty };
}
const programmeText = (p: Profile) => `${p.programmeCode} — ${p.programmeName}`;
/** The intake year read from the matric number (S3-P004-039), as a select value, when it is one of the offered years. */
function intakeFromMatric(matricNo: string, now: Date): string {
  const read = readMatric(matricNo);
  return read && intakeYears(now).some(year => Number(year) === read.intakeYear) ? String(read.intakeYear) : '';
}
export function ProfilePage({ api, setup = false, onSetupComplete = () => { navigateApp('/student'); } }: {
  api: AcademicClient; setup?: boolean; onSetupComplete?: () => void;
}) {
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<ProfileOptions>({ curricula: [], subjects: [], semesters: [], currentSemester: null, currentAcademicYear: null, learningCentres: [] });
  const [draft, setDraft] = useState<Draft>({ ...empty }), [initial, setInitial] = useState<Draft>({ ...empty });
  const [programme, setProgramme] = useState(''), [initialProgramme, setInitialProgramme] = useState(''), [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [refreshingPeriod, setRefreshingPeriod] = useState(false), [refreshFailed, setRefreshFailed] = useState(false);
  const [savedSemesterId, setSavedSemesterId] = useState<number | null>(null), [staleSavedSemester, setStaleSavedSemester] = useState(false);
  // Once a profile exists the programme is fixed; only the admin changes it (S2-P004-026). Holds the saved programme text, null before setup.
  const [savedProgramme, setSavedProgramme] = useState<string | null>(null);
  // The saved profile behind the read-only intake and curriculum line (S3-P004-037); null before setup.
  const [saved, setSaved] = useState<Profile | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [periodNotice, setPeriodNotice] = useState('');
  const alert = useRef<HTMLParagraphElement>(null), unsaved = useRef(false);
  // The intake year follows the matric number until the student picks a year by hand (S3-P004-039).
  const intakeTouched = useRef(false), [intakeFilled, setIntakeFilled] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(false); setError('');
    Promise.all([api<Profile | null>('/api/profile', { signal: controller.signal, fresh: true }), api<ProfileOptions>('/api/profile/options', { signal: controller.signal, fresh: true })])
      .then(([profile, choices]) => {
        if (controller.signal.aborted) return;
        const value = draftOf(profile); setInitial(value); setOptions(choices);
        // A saved number with no intake year never gets typed again, so it fills the intake when the page opens.
        const filled = profile && profile.intakeYear === null && value.matricNo ? intakeFromMatric(value.matricNo, new Date()) : '';
        intakeTouched.current = false; setIntakeFilled(Boolean(filled)); setDraft(filled ? { ...value, intakeYear: filled } : value);
        const savedPeriodId = profile?.currentSemesterId ?? null;
        setSavedSemesterId(savedPeriodId); setStaleSavedSemester(Boolean(savedPeriodId !== null && savedPeriodId !== choices.currentSemester?.semesterId));
        setLocked(profile?.learningCentreLocked === true); setSavedProgramme(profile ? programmeText(profile) : null); setSaved(profile);
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
      const choices = await api<ProfileOptions>('/api/profile/options', { fresh: true });
      setOptions(choices);
      // The period is metadata, not draft state; Cancel cannot restore an older administrator selection.
      setStaleSavedSemester(Boolean(savedSemesterId !== null && savedSemesterId !== choices.currentSemester?.semesterId));
      setPeriodNotice(notice);
    } catch (reason) {
      setRefreshFailed(true); setError(errorMessage(reason));
    } finally { setRefreshingPeriod(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || refreshingPeriod || !options.currentSemester || !resolvedCurriculumId || !draft.intakeYear) return; setSaving(true); setError(''); setSuccess(''); setPeriodNotice('');
    try {
      const profile = await api<Profile>('/api/profile', { method: 'PUT', body: {
        studentName: draft.studentName.trim(), matricNo: draft.matricNo.replace(/\s+/g, '').toUpperCase(), learningCentreId: Number(draft.learningCentreId), curriculumId: resolvedCurriculumId, intakeYear: Number(draft.intakeYear),
        currentSemesterId: options.currentSemester.semesterId,
        weeklyWorkingHours: Number(draft.weeklyWorkingHours), availableStudyHours: Number(draft.availableStudyHours),
      } });
      const value = draftOf(profile);
      const savedProgramme = String(options.curricula.find(c => c.curriculumId === profile.curriculumId)?.programmeId ?? '');
      unsaved.current = false; setIntakeFilled(false); setLocked(profile.learningCentreLocked); setSavedProgramme(programmeText(profile)); setSaved(profile); setDraft(value); setInitial(value); setProgramme(savedProgramme); setInitialProgramme(savedProgramme);
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
  // New profile: the intake year picks the curriculum; a tie asks the student (S3-P004-037).
  const resolution = savedProgramme === null ? resolveIntakeCurriculum(options.curricula, programme, draft.intakeYear, draft.curriculumId) : null;
  // A saved profile keeps its own curriculum, even if that configuration is no longer offered to new students.
  const resolvedCurriculumId = savedProgramme !== null ? (initial.curriculumId ? Number(initial.curriculumId) : null)
    : resolution?.kind === 'single' ? resolution.curriculum.curriculumId : resolution?.kind === 'choose' ? resolution.selected?.curriculumId ?? null : null;
  // The intake year is chosen at setup, or once on a saved profile that has none; after that only the admin changes it.
  const intakeEditable = savedProgramme === null || !initial.intakeYear;
  const years = intakeYears(new Date());
  // Changing programme or intake year clears a manual curriculum choice.
  function selectProgramme(value: string) { setProgramme(value); field('curriculumId', ''); }
  function typeMatric(value: string) {
    const filled = intakeEditable && !intakeTouched.current ? intakeFromMatric(value, new Date()) : '';
    setDraft(old => ({ ...old, matricNo: value, ...(filled ? { intakeYear: filled, curriculumId: savedProgramme === null ? '' : old.curriculumId } : {}) }));
    if (filled) setIntakeFilled(true);
    setSuccess(''); setPeriodNotice('');
  }
  const matricLocked = Boolean(initial.matricNo) && savedProgramme !== null;
  function selectIntake(value: string) { intakeTouched.current = true; setIntakeFilled(false); setDraft(old => ({ ...old, intakeYear: value, curriculumId: savedProgramme === null ? '' : old.curriculumId })); setSuccess(''); setPeriodNotice(''); }
  return <section className="p001" aria-label="Academic profile">
    <header><p className="p001-eyebrow">Academic records</p><h1>{setup ? 'Complete your academic profile' : 'Your academic profile'}</h1>
      <p>{savedProgramme === null ? 'Choose your programme and tell us' : 'Tell us'} about your weekly work and study availability.</p></header>
    {error && <p className="p001-alert" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    {loaded && initial.studentName && !initial.matricNo && <p className="p001-alert" role="status">Add your matric number to continue using the student pages.</p>}
    {loaded && initial.studentName && !initial.learningCentreId && <p className="p001-alert" role="status">Add your learning centre to continue using the student pages.</p>}
    {!loaded && (error ? <button className="p001-action" type="button" onClick={() => setAttempt(n => n + 1)}>Retry loading profile</button> : <p role="status">Loading your profile…</p>)}
    {loaded && !options.curricula.length && <div className="p001-card" role="status"><h2>No programme is configured</h2>
      <p>The maintainer needs to configure approved programme data before you can complete setup. Your account remains available.</p>
      <button className="p001-action" type="button" onClick={() => setAttempt(n => n + 1)}>Refresh available programmes</button></div>}
    {loaded && options.curricula.length > 0 && <form className="p001-card" onSubmit={event => { void save(event); }} aria-busy={saving || refreshingPeriod}>
      <fieldset disabled={saving || refreshingPeriod}><legend>Programme and identity</legend><div className="p001-grid">
        <label>Student name<input name="studentName" required maxLength={255} value={draft.studentName} onChange={e => field('studentName', e.target.value)} autoComplete="name" /></label>
        {matricLocked
          ? <label>Matric number<input name="matricNo" readOnly value={initial.matricNo} aria-describedby="profile-matric-help" /></label>
          : <label>Matric number<input name="matricNo" required maxLength={30} pattern="\s*([A-Za-z0-9]\s*){4,30}" title="4 to 30 letters or digits, for example SX232315ECJHF04" autoCapitalize="characters" spellCheck={false} aria-describedby="profile-matric-help" value={draft.matricNo} onChange={e => typeMatric(e.target.value)} /></label>}
        {savedProgramme === null
          ? <label>Programme<select aria-label="Programme" required value={programme} onChange={e => selectProgramme(e.target.value)}>
            <option value="">Select a programme</option>{programmes.map(c => <option key={c.programmeId} value={c.programmeId}>{c.programmeCode} — {c.programmeName}</option>)}
          </select></label>
          : <label>Programme<input name="programme" readOnly value={savedProgramme} aria-describedby="profile-programme-help" /></label>}
        {saved && savedProgramme !== null && <label>Intake and curriculum<input name="intakeCurriculum" readOnly value={savedIntakeSummary(saved, options.curricula)} aria-describedby="profile-programme-help" /></label>}
        {intakeEditable && <label>Intake year<select aria-label="Intake year" required value={draft.intakeYear} aria-describedby={[savedProgramme === null ? '' : 'profile-intake-help', intakeFilled ? 'profile-intake-filled' : ''].filter(Boolean).join(' ') || undefined} onChange={e => selectIntake(e.target.value)}>
          <option value="">Select your intake year</option>{years.map(year => <option key={year} value={year}>{year}</option>)}
        </select></label>}
        {resolution?.kind === 'choose' && <label>Curriculum<select aria-label="Curriculum" required aria-describedby="profile-curriculum-help" value={resolution.selected ? String(resolution.selected.curriculumId) : ''} onChange={e => field('curriculumId', e.target.value)}>
          <option value="">Select a curriculum</option>{resolution.options.map(c => <option key={c.curriculumId} value={c.curriculumId}>{curriculumOptionText(c)}</option>)}
        </select></label>}
        <label>Learning centre<select aria-label="Learning centre" required disabled={locked} aria-describedby={locked ? 'profile-centre-help' : undefined} value={draft.learningCentreId} onChange={e => field('learningCentreId', e.target.value)}>
          <option value="">Select a learning centre</option>{options.learningCentres.map(c => <option key={c.learningCentreId} value={c.learningCentreId}>{c.centreName}</option>)}
        </select></label>
        </div>
        {intakeEditable && intakeFilled && <p className="p001-help" id="profile-intake-filled">Filled in from your matric number. Change it if it is wrong.</p>}
        {savedProgramme !== null && intakeEditable && <p className="p001-help" id="profile-intake-help">Your intake year is not set. Choose it once; only the admin can change it after you save.</p>}
        {resolution?.kind === 'single' && <p className="p001-curriculum" role="status">Curriculum: {curriculumOptionText(resolution.curriculum)}</p>}
        {resolution?.kind === 'choose' && <p className="p001-help" id="profile-curriculum-help">Choose the curriculum you were admitted under. Only the admin can change it after you save.</p>}
        {locked && <p className="p001-help" id="profile-centre-help">Locked while subject selection for the next semester is open. It unlocks when the next semester starts.</p>}
        <p className="p001-help" id="profile-matric-help">{matricLocked ? 'Your matric number is set. Contact the admin to change it.' : 'Your university matric number, for example SX232315ECJHF04. Coordinators use it to identify you when they plan class offerings.'}</p>
        {savedProgramme !== null && <p className="p001-help" id="profile-programme-help">Your programme is set. Contact the admin to change it.</p>}
        <p className="p001-help">Your institutional email is managed through your account. You choose your programme and intake year once, when you set up your profile.</p>
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
      <p className="p001-help">Your current semester, set by the administrator. Offerings always show the next semester.</p></fieldset>
      <fieldset disabled={saving || refreshingPeriod}><legend>Work and study availability</legend><div className="p001-grid">
        <label>Weekly working hours<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.weeklyWorkingHours} onChange={e => field('weeklyWorkingHours', e.target.value)} /></label>
        <label>Available study hours per week<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.availableStudyHours} onChange={e => field('availableStudyHours', e.target.value)} /></label>
      </div><p className="p001-help">Enter whole hours. Use zero when you have no work or study hours available.</p></fieldset>
      <div className="p001-actions"><button className="p001-primary" type="submit" disabled={saving || refreshingPeriod || !options.currentSemester || !resolvedCurriculumId || !draft.intakeYear || !draft.learningCentreId}>{saving ? 'Saving…' : 'Save profile'}</button>
        <button className="p001-cancel" type="button" disabled={saving || refreshingPeriod || !dirty} onClick={() => { setDraft({ ...initial }); setProgramme(initialProgramme); setError(''); setSuccess('Unsaved changes cancelled.'); }}>Cancel changes</button>
        {dirty && <span className="p001-help">Unsaved changes</span>}</div>
      {success && <p role="status" className="p001-success">{success}</p>}
    </form>}
    <p className="p001-help">Student-reported information. Saving does not verify your university records.</p>
  </section>;
}
