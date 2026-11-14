import { useEffect, useId, useState } from 'react';
import { AdminApiError, type AdminClient } from './client';
import { ReasonDialog } from './AdminUserManagement';
import type { AdminCurriculumOption, AdminStudentProgramme } from '../../../../../packages/shared/src/admin/admin';

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

/** Student programme of an account that has a student profile, with the admin-only "Change programme" action. Renders nothing for other accounts. */
export function StudentProgrammeCard({ client, accountId, version, onChanged }: { client: AdminClient; accountId: number; version: number; onChanged: (text: string) => void }) {
  const [programme, setProgramme] = useState<AdminStudentProgramme | null>(), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [changing, setChanging] = useState(false);
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
    setProgramme(result.programme); setChanging(false); onChanged(programmeChangeNotice(result.removedPicks));
  }
  return <section className="admin-card" aria-label="Student programme"><h2>Student programme</h2>
    <p className="admin-muted">Students choose their programme once, when they set up their profile. Only a System Administrator changes it afterwards; every change is recorded in the audit log with its reason.</p>
    <dl className="admin-account-facts"><div><dt>Student</dt><dd>{programme.studentName}{programme.matricNo ? ` (${programme.matricNo})` : ''}</dd></div>
      <div><dt>Programme</dt><dd>{programme.programmeCode} — {programme.programmeName}</dd></div>
      <div><dt>Curriculum version</dt><dd>{programme.curriculumVersion}</dd></div></dl>
    <button type="button" className="admin-secondary" onClick={() => setChanging(true)}>Change programme</button>
    {changing && <ChangeProgrammeDialog client={client} current={programme} onCancel={() => setChanging(false)} onSubmit={change}/>}
  </section>;
}
