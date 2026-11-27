import { useEffect, useId, useState } from 'react';
import { AdminApiError, type AdminClient } from './client';
import { ReasonDialog } from './AdminUserManagement';
import { ADMIN_INTAKE_YEAR_MAX, ADMIN_INTAKE_YEAR_MIN, type AdminCurriculumOption, type AdminStudentProgramme } from '../../../../../packages/shared/src/admin/admin';
import { intakeYearChangeNotice, intakeYearLabel } from './intake-labels';

/** "Programme changed; 3 subject picks removed." (S2-P004-026). */
export function programmeChangeNotice(removedPicks: number) {
  return `Programme changed; ${removedPicks} subject ${removedPicks === 1 ? 'pick' : 'picks'} removed.`;
}
const optionLabel = (option: Pick<AdminCurriculumOption, 'programmeCode' | 'programmeName' | 'curriculumVersion'>) => `${option.programmeCode} — ${option.programmeName} (version ${option.curriculumVersion})`;

function ChangeProgrammeDialog({ client, current, onCancel, onSubmit }: { client: AdminClient; current: AdminStudentProgramme; onCancel: () => void; onSubmit: (curriculumId: number, reason: string) => Promise<void> }) {
  const [options, setOptions] = useState<AdminCurriculumOption[]>(), [failed, setFailed] = useState(''), [choice, setChoice] = useState('');
  const selectId = useId();
  useEffect(() => {
    const controller = new AbortController();
    client.curriculumOptions(controller.signal).then(items => { if (!controller.signal.aborted) setOptions(items.filter(item => item.curriculumId !== current.curriculumId)); },
      error => { if (!controller.signal.aborted) setFailed(error instanceof AdminApiError ? error.message : 'Programmes could not be loaded. Please retry.'); });
    return () => controller.abort();
  }, [client, current.curriculumId]);
  const description = <>
    <p>Choose the programme this student moves to. Academic records are kept. Saved subject picks for semesters whose selection has not closed are removed because they belong to the old programme.</p>
    <div className="admin-field"><label htmlFor={selectId}>New programme</label>
      <select id={selectId} value={choice} onChange={event => setChoice(event.target.value)} disabled={!options}>
        <option value="">{options ? 'Choose a programme' : failed ? 'Programmes unavailable' : 'Loading programmes…'}</option>
        {options?.map(option => <option key={option.curriculumId} value={option.curriculumId}>{optionLabel(option)}</option>)}
      </select></div>
    {failed && <p className="admin-form-error" role="alert">{failed}</p>}
  </>;
  return <ReasonDialog title="Change programme" description={description} confirmLabel="Change programme" disabled={!choice}
    onCancel={onCancel} onSubmit={reason => onSubmit(Number(choice), reason)}/>;
}

/** Admin correction of the intake year (S3-P004-037). The curriculum stays as it is. */
function ChangeIntakeYearDialog({ current, onCancel, onSubmit }: { current: number | null; onCancel: () => void; onSubmit: (intakeYear: number, reason: string) => Promise<void> }) {
  const [year, setYear] = useState(current === null ? '' : String(current));
  const inputId = useId(), helpId = useId();
  const value = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : NaN;
  const inRange = Number.isInteger(value) && value >= ADMIN_INTAKE_YEAR_MIN && value <= ADMIN_INTAKE_YEAR_MAX;
  const description = <>
    <p>Correct the year this student was admitted. The curriculum is not changed; use Change programme for that.</p>
    <div className="admin-field"><label htmlFor={inputId}>New intake year</label>
      <input id={inputId} type="number" inputMode="numeric" min={ADMIN_INTAKE_YEAR_MIN} max={ADMIN_INTAKE_YEAR_MAX} step={1} value={year} aria-describedby={helpId} onChange={event => setYear(event.target.value)}/>
      <span id={helpId} className="admin-muted">Current: {intakeYearLabel(current)}. Enter a year from {ADMIN_INTAKE_YEAR_MIN} to {ADMIN_INTAKE_YEAR_MAX}.</span></div>
  </>;
  return <ReasonDialog title="Change intake year" description={description} confirmLabel="Change intake year" disabled={!inRange || value === current}
    onCancel={onCancel} onSubmit={reason => onSubmit(value, reason)}/>;
}

/** Admin correction of the matric number (S3-P004-039); students cannot change it once saved. */
function ChangeMatricDialog({ current, onCancel, onSubmit }: { current: string | null; onCancel: () => void; onSubmit: (matricNo: string, reason: string) => Promise<void> }) {
  const [value, setValue] = useState(current ?? '');
  const inputId = useId(), helpId = useId();
  const matricNo = value.replace(/\s+/g, '').toUpperCase();
  const valid = /^[A-Z0-9]{4,30}$/.test(matricNo);
  const description = <>
    <p>Correct this student's matric number. The intake year is not changed; use Change intake year for that.</p>
    <div className="admin-field"><label htmlFor={inputId}>New matric number</label>
      <input id={inputId} type="text" maxLength={40} autoCapitalize="characters" spellCheck={false} value={value} aria-describedby={helpId} onChange={event => setValue(event.target.value)}/>
      <span id={helpId} className="admin-muted">Current: {current ?? 'Not set'}. 4 to 30 letters or digits, for example SX232315ECJHF04.</span></div>
  </>;
  return <ReasonDialog title="Change matric number" description={description} confirmLabel="Change matric number" disabled={!valid || matricNo === (current ?? '')}
    onCancel={onCancel} onSubmit={reason => onSubmit(matricNo, reason)}/>;
}

/** Student programme of an account that has a student profile, with the admin-only "Change programme" action. Renders nothing for other accounts. */
export function StudentProgrammeCard({ client, accountId, version, onChanged }: { client: AdminClient; accountId: number; version: number; onChanged: (text: string) => void }) {
  const [programme, setProgramme] = useState<AdminStudentProgramme | null>(), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [changing, setChanging] = useState<'programme' | 'intake' | 'matric' | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(false); setError('');
    client.studentProgramme(accountId, controller.signal).then(value => { if (!controller.signal.aborted) { setProgramme(value); setLoaded(true); } },
      reason => { if (!controller.signal.aborted) setError(reason instanceof AdminApiError ? reason.message : 'The student programme could not be loaded. Please retry.'); });
    return () => controller.abort();
  }, [client, accountId, version, attempt]);
  if (error) return <section className="admin-card"><h2>Student programme</h2><p className="admin-form-error" role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></section>;
  if (!loaded || !programme) return null;
  async function change(curriculumId: number, reason: string) {
    const result = await client.changeProgramme(accountId, { curriculumId, reason });
    setProgramme(result.programme); setChanging(null); onChanged(programmeChangeNotice(result.removedPicks));
  }
  async function changeIntake(intakeYear: number, reason: string) {
    const result = await client.changeIntakeYear(accountId, { intakeYear, reason });
    setProgramme(result); setChanging(null); onChanged(intakeYearChangeNotice(intakeYear));
  }
  async function changeMatric(matricNo: string, reason: string) {
    const result = await client.changeMatric(accountId, { matricNo, reason });
    setProgramme(result); setChanging(null); onChanged(`Matric number changed to ${matricNo}.`);
  }
  return <section className="admin-card" aria-label="Student programme"><h2>Student programme</h2>
    <p className="admin-muted">Students choose their programme, intake year and matric number once, when they set up their profile. Only a System Administrator changes them afterwards; every change is recorded in the audit log with its reason.</p>
    <dl className="admin-account-facts"><div><dt>Student</dt><dd>{programme.studentName}</dd></div>
      <div><dt>Matric number</dt><dd>{programme.matricNo ?? 'Not set'}</dd></div>
      <div><dt>Programme</dt><dd>{programme.programmeCode} — {programme.programmeName}</dd></div>
      <div><dt>Curriculum version</dt><dd>{programme.curriculumVersion}</dd></div>
      <div><dt>Intake year</dt><dd>{intakeYearLabel(programme.intakeYear)}</dd></div></dl>
    <div className="admin-programme-actions">
      <button type="button" className="admin-secondary" onClick={() => setChanging('programme')}>Change programme</button>
      <button type="button" className="admin-secondary" onClick={() => setChanging('intake')}>Change intake year</button>
      <button type="button" className="admin-secondary" onClick={() => setChanging('matric')}>Change matric number</button>
    </div>
    {changing === 'programme' && <ChangeProgrammeDialog client={client} current={programme} onCancel={() => setChanging(null)} onSubmit={change}/>}
    {changing === 'matric' && <ChangeMatricDialog current={programme.matricNo} onCancel={() => setChanging(null)} onSubmit={changeMatric}/>}
    {changing === 'intake' && <ChangeIntakeYearDialog current={programme.intakeYear} onCancel={() => setChanging(null)} onSubmit={changeIntake}/>}
  </section>;
}
