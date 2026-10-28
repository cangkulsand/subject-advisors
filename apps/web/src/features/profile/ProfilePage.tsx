import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile, ProfileOptions } from '../../../../api/src/modules/profile/contracts';
import { type AcademicClient, errorMessage } from './client';
import { resolveProgrammeCurriculum } from './programme-resolution';
import { navigateApp, registerUnsavedChanges } from '../../app/navigation';
import './profile.css';
const empty = { studentName: '', matricNo: '', curriculumId: '', academicYear: '', currentSemesterId: '', weeklyWorkingHours: '', availableStudyHours: '' };
type Draft = typeof empty;
function draftOf(p: Profile | null, options: ProfileOptions): Draft {
  const semester = p?.currentSemesterId == null ? undefined : options.semesters.find(item => item.semesterId === p.currentSemesterId);
  return p ? { studentName: p.studentName, matricNo: p.matricNo ?? '', curriculumId: String(p.curriculumId),
    academicYear: semester?.academicYear ?? '', currentSemesterId: semester ? String(semester.semesterId) : '',
    weeklyWorkingHours: p.weeklyWorkingHours === null ? '' : String(p.weeklyWorkingHours),
    availableStudyHours: p.availableStudyHours === null ? '' : String(p.availableStudyHours) } : { ...empty };
}
export function ProfilePage({ api, setup = false, onSetupComplete = () => { navigateApp('/student'); } }: {
  api: AcademicClient; setup?: boolean; onSetupComplete?: () => void;
}) {
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<ProfileOptions>({ curricula: [], subjects: [], semesters: [] });
  const [draft, setDraft] = useState<Draft>({ ...empty }), [initial, setInitial] = useState<Draft>({ ...empty });
  const [programme, setProgramme] = useState(''), [initialProgramme, setInitialProgramme] = useState(''), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const alert = useRef<HTMLParagraphElement>(null), unsaved = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(false); setError('');
    Promise.all([api<Profile | null>('/api/profile', { signal: controller.signal }), api<ProfileOptions>('/api/profile/options', { signal: controller.signal })])
      .then(([profile, choices]) => {
        if (controller.signal.aborted) return;
        const value = draftOf(profile, choices); setDraft(value); setInitial(value); setOptions(choices);
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
  function field(key: keyof Draft, value: string) { setDraft(old => ({ ...old, [key]: value })); setSuccess(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !resolvedCurriculumId) return; setSaving(true); setError(''); setSuccess('');
    try {
      const profile = await api<Profile>('/api/profile', { method: 'PUT', body: {
        studentName: draft.studentName.trim(), matricNo: draft.matricNo.trim() || null, curriculumId: resolvedCurriculumId,
        currentSemesterId: Number(draft.currentSemesterId),
        weeklyWorkingHours: Number(draft.weeklyWorkingHours), availableStudyHours: Number(draft.availableStudyHours),
      } });
      const value = draftOf(profile, options);
      const savedProgramme = String(options.curricula.find(c => c.curriculumId === profile.curriculumId)?.programmeId ?? '');
      unsaved.current = false; setDraft(value); setInitial(value); setProgramme(savedProgramme); setInitialProgramme(savedProgramme); setSuccess('Profile saved.');
      if (setup) onSetupComplete();
    } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
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
    {loaded && options.curricula.length > 0 && <form className="p001-card" onSubmit={event => { void save(event); }} aria-busy={saving}>
      <fieldset disabled={saving}><legend>Programme and identity</legend><div className="p001-grid">
        <label>Student name<input name="studentName" required maxLength={255} value={draft.studentName} onChange={e => field('studentName', e.target.value)} autoComplete="name" /></label>
        <label>Matric number (optional)<input name="matricNo" maxLength={30} value={draft.matricNo} onChange={e => field('matricNo', e.target.value)} /></label>
        <label>Programme<select aria-label="Programme" required value={programme} onChange={e => selectProgramme(e.target.value)}>
          <option value="">Select a programme</option>{programmes.map(c => <option key={c.programmeId} value={c.programmeId}>{c.programmeCode} — {c.programmeName}</option>)}
        </select></label>
        </div>
        {programme && !resolvedCurriculumId && <p className="p001-help" role="status">This programme has multiple active configurations. Ask the maintainer to resolve the programme setup before saving.</p>}
        <p className="p001-help">Your institutional email is managed through your account. Changing programmes while academic data is saved may require maintainer assistance.</p>
      </fieldset>
      <fieldset disabled={saving}><legend>Current academic period</legend><div className="p001-grid">
        <label>Academic year<select aria-label="Academic year" required value={draft.academicYear} onChange={event => {
          const academicYear = event.target.value;
          setDraft(old => ({ ...old, academicYear, currentSemesterId: '' })); setSuccess('');
        }}>
          <option value="">Select an academic year</option>
          {[...new Set(options.semesters.map(item => item.academicYear))].sort((a, b) => b.localeCompare(a)).map(year => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <label>Semester<select aria-label="Semester" required value={draft.currentSemesterId} disabled={!draft.academicYear} onChange={event => field('currentSemesterId', event.target.value)}>
          <option value="">Select a semester</option>
          {options.semesters.filter(item => item.academicYear === draft.academicYear).map(item => <option key={item.semesterId} value={item.semesterId}>Semester {item.semesterNo} ({item.semesterType === 'SHORT' || item.semesterNo === 3 ? 'Short' : 'Normal'})</option>)}
        </select></label>
      </div>
      {!options.semesters.length && <p className="p001-help" role="alert">No academic semesters are configured. Ask the maintainer to configure an academic year and semester before saving your profile.</p>}
      <p className="p001-help">This required choice controls the semester shown in Offerings. Changing it keeps other saved semester lists intact.</p></fieldset>
      <fieldset disabled={saving}><legend>Work and study availability</legend><div className="p001-grid">
        <label>Weekly working hours<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.weeklyWorkingHours} onChange={e => field('weeklyWorkingHours', e.target.value)} /></label>
        <label>Available study hours per week<input type="number" inputMode="numeric" min={0} max={2147483647} step={1} required value={draft.availableStudyHours} onChange={e => field('availableStudyHours', e.target.value)} /></label>
      </div><p className="p001-help">Enter whole hours. Use zero when you have no work or study hours available.</p></fieldset>
      <div className="p001-actions"><button className="p001-primary" type="submit" disabled={saving || !resolvedCurriculumId || !draft.currentSemesterId}>{saving ? 'Saving…' : 'Save profile'}</button>
        <button className="p001-cancel" type="button" disabled={saving || !dirty} onClick={() => { setDraft({ ...initial }); setProgramme(initialProgramme); setError(''); setSuccess('Unsaved changes cancelled.'); }}>Cancel changes</button>
        {dirty && <span className="p001-help">Unsaved changes</span>}</div>
      {success && <p role="status" className="p001-success">{success}</p>}
    </form>}
    <p className="p001-help">Student-reported information. Saving does not verify your university records.</p>
  </section>;
}
