import { useEffect, useId, useMemo, useState } from 'react';
import { AdminApiError, type AdminClient } from './client';
import { ReasonDialog, errorText } from './AdminUserManagement';
import { PageHeading } from './AdminPages';
import { ADMIN_INTAKE_YEAR_MAX, ADMIN_INTAKE_YEAR_MIN, type AdminCurriculumOption } from '../../../../../packages/shared/src/admin/admin';
import { BATCH_PROBLEM_TEXT, batchSummary, planBatch, programmeWarning, type BatchIntake, type BatchPreview, type BatchResult } from '../../../../../packages/shared/src/admin/batch';
import { MATRIC_BATCH_MAX, splitMatricList } from '../../../../../packages/shared/src/profile/matric';
import { intakeYearLabel } from './intake-labels';

type IntakeChoice = 'keep' | 'set' | 'matric';
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** "Corrected 324 students: 290 intake years, 0 programmes; 12 subject picks removed." */
export function batchResultText(result: BatchResult): string {
  return `Corrected ${plural(result.corrected, 'student', 'students')}: ${plural(result.intakeChanges, 'intake year', 'intake years')}, `
    + `${plural(result.programmeChanges, 'programme', 'programmes')}; ${plural(result.removedPicks, 'subject pick', 'subject picks')} removed.`;
}

/** Batch correction of programme and intake year by matric number (S3-P004-039). System Administrator only; all students change together or none do. */
export function BatchCorrectionPage({ client }: { client: AdminClient }) {
  const [text, setText] = useState(''), [preview, setPreview] = useState<BatchPreview | null>(null), [checked, setChecked] = useState<string[]>([]);
  const [checking, setChecking] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false), [result, setResult] = useState<BatchResult | null>(null);
  const [options, setOptions] = useState<AdminCurriculumOption[]>([]), [curriculum, setCurriculum] = useState('');
  const [intake, setIntake] = useState<IntakeChoice>('keep'), [year, setYear] = useState(''), [confirming, setConfirming] = useState(false);
  const textId = useId(), countId = useId(), intakeName = useId(), yearId = useId(), programmeId = useId();
  const list = useMemo(() => splitMatricList(text), [text]);
  const tooMany = list.matricNos.length > MATRIC_BATCH_MAX;
  useEffect(() => {
    const controller = new AbortController();
    client.curriculumOptions(controller.signal).then(items => { if (!controller.signal.aborted) setOptions(items); }, () => { /* the programme select stays on Keep */ });
    return () => controller.abort();
  }, [client]);

  async function check(numbers = list.matricNos) {
    setChecking(true); setError(''); setStale(false); setResult(null);
    try { const value = await client.batchPreview(numbers); setPreview(value); setChecked(numbers); }
    catch (failure) { setPreview(null); setError(errorText(failure)); }
    finally { setChecking(false); }
  }
  function removeProblems() {
    if (!preview) return;
    const bad = new Set(preview.problems.map(problem => problem.matricNo));
    const kept = checked.filter(no => !bad.has(no) && !unreadable.has(no));
    setText(kept.join('\n')); void check(kept);
  }
  const yearValue = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : NaN;
  const yearValid = Number.isInteger(yearValue) && yearValue >= ADMIN_INTAKE_YEAR_MIN && yearValue <= ADMIN_INTAKE_YEAR_MAX;
  const intakeChoice: BatchIntake = intake === 'set' ? { mode: 'set', year: yearValid ? yearValue : 0 } : { mode: intake };
  const curriculumId = curriculum ? Number(curriculum) : null;
  const plan = preview ? planBatch(preview.matches, curriculumId, intake === 'set' && !yearValid ? { mode: 'keep' } : intakeChoice) : null;
  const unreadable = new Set(plan?.rows.filter(row => row.problem).map(row => row.match.matricNo) ?? []);
  const problemCount = (preview?.problems.length ?? 0) + unreadable.size;
  const noChange = curriculumId === null && intake === 'keep';
  const changes = plan ? plan.intakeChanges + plan.programmeChanges : 0;
  const canApply = Boolean(plan) && !problemCount && !noChange && changes > 0 && !(intake === 'set' && !yearValid);
  const optionLabel = (id: number) => { const option = options.find(item => item.curriculumId === id); return option ? `${option.programmeCode} (${option.curriculumVersion})` : ''; };
  const programmeCodeOf = (id: number, fallback: string) => options.find(item => item.curriculumId === id)?.programmeCode ?? fallback;

  async function apply(reason: string) {
    if (!preview) return;
    try {
      const done = await client.applyBatch({ matricNos: checked, curriculumId, intake: intakeChoice, reason,
        expected: preview.matches.map(match => ({ matricNo: match.matricNo, studentId: match.studentId, curriculumId: match.curriculumId, intakeYear: match.intakeYear })) });
      setConfirming(false); setResult(done); setPreview(null);
    } catch (failure) {
      if (failure instanceof AdminApiError && ['BATCH_STALE', 'BATCH_HAS_PROBLEMS', 'CURRICULUM_UNAVAILABLE'].includes(failure.code)) {
        setConfirming(false); setError(failure.message); setStale(true); return;
      }
      throw failure;
    }
  }
  function startAgain() { setText(''); setPreview(null); setChecked([]); setResult(null); setCurriculum(''); setIntake('keep'); setYear(''); setError(''); setStale(false); }

  return <>
    <PageHeading title="Batch correction" text="Correct the programme or intake year of many students at once, by matric number. Every student is recorded in the audit log with your reason."/>
    <div id="admin-action-status" tabIndex={-1} className="admin-status-region">{result && <p className="admin-success" role="status">{batchResultText(result)}</p>}</div>
    {error && <div className="admin-card"><p className="admin-form-error" role="alert">{error}</p>{stale && <button type="button" onClick={() => { void check(checked); }}>Check again</button>}</div>}
    {result ? <section className="admin-card"><button type="button" className="admin-primary" onClick={startAgain}>Start another batch</button></section> : <>
    <section className="admin-card admin-batch" aria-label="Matric numbers to check">
      <h2>1. Matric numbers</h2>
      <div className="admin-field"><label htmlFor={textId}>Matric numbers</label>
        <textarea id={textId} rows={6} spellCheck={false} autoCapitalize="characters" aria-describedby={countId} value={text} onChange={event => { setText(event.target.value); setPreview(null); }}/>
        <span id={countId} className={tooMany ? 'admin-form-error' : 'admin-muted'}>{tooMany ? `Paste at most ${MATRIC_BATCH_MAX} matric numbers.`
          : `${plural(list.matricNos.length, 'number', 'numbers')}${list.repeated ? ` · ${plural(list.repeated, 'repeated number', 'repeated numbers')} ignored` : ''}`}</span></div>
      <p className="admin-muted">Paste one per line, or a column copied from Excel. Commas, semicolons and spaces also separate numbers.</p>
      <button type="button" className="admin-primary" disabled={checking || !list.matricNos.length || tooMany} onClick={() => { void check(); }}>{checking ? 'Checking…' : 'Check'}</button>
    </section>
    {preview && plan && <section className="admin-card admin-batch" aria-label="Preview">
      <h2>2. Preview</h2>
      {problemCount > 0 && <div className="admin-batch-problems"><p className="admin-form-error">{plural(problemCount, 'number has a problem', 'numbers have a problem')}. Remove them to continue.</p>
        <button type="button" onClick={removeProblems}>Remove problem numbers</button></div>}
      <div className="admin-table-scroll" role="region" aria-label="Students to correct table" tabIndex={0}>
        <table aria-label="Students to correct"><thead><tr><th>Matric number</th><th>Student</th><th>Programme</th><th>Intake year</th><th>After</th></tr></thead>
          <tbody>
            {preview.problems.map(problem => <tr key={'p' + problem.matricNo} className="admin-batch-problem"><td data-label="Matric number">{problem.matricNo}</td><td data-label="Student" colSpan={4}>{BATCH_PROBLEM_TEXT[problem.kind]}</td></tr>)}
            {[...plan.rows].sort((a, b) => Number(Boolean(b.problem)) - Number(Boolean(a.problem))).map(row => {
              const warning = programmeWarning(row.match.matricNo, programmeCodeOf(row.after.curriculumId, row.match.programmeCode));
              const notes = [warning, row.match.accountStatus === 'SUSPENDED' ? 'Suspended' : null, row.match.isStudent ? null : 'Not a student account'].filter(Boolean);
              return <tr key={row.match.matricNo} className={row.problem ? 'admin-batch-problem' : undefined}>
                <td data-label="Matric number">{row.match.matricNo}</td>
                <td data-label="Student">{row.match.studentName}{notes.map(note => <span key={note} className="admin-batch-note">{note}</span>)}</td>
                <td data-label="Programme">{row.match.programmeCode} ({row.match.curriculumVersion})</td>
                <td data-label="Intake year">{intakeYearLabel(row.match.intakeYear)}</td>
                <td data-label="After">{row.problem ? BATCH_PROBLEM_TEXT[row.problem] : !row.changes ? 'No change'
                  : [row.after.curriculumId !== row.match.curriculumId ? optionLabel(row.after.curriculumId) : '', row.after.intakeYear !== row.match.intakeYear ? intakeYearLabel(row.after.intakeYear) : ''].filter(Boolean).join(' · ')}</td>
              </tr>;
            })}
          </tbody></table></div>
    </section>}
    {preview && plan && <section className="admin-card admin-batch" aria-label="What to change">
      <h2>3. What to change</h2>
      <div className="admin-field"><label htmlFor={programmeId}>Programme</label>
        <select id={programmeId} value={curriculum} onChange={event => setCurriculum(event.target.value)}>
          <option value="">Keep each student's programme</option>
          {options.map(option => <option key={option.curriculumId} value={option.curriculumId}>{option.programmeCode} — {option.programmeName} (version {option.curriculumVersion})</option>)}
        </select></div>
      <fieldset className="admin-batch-intake"><legend>Intake year</legend>
        <label className="admin-check"><input type="radio" name={intakeName} checked={intake === 'keep'} onChange={() => setIntake('keep')}/>Keep each student's intake year</label>
        <label className="admin-check"><input type="radio" name={intakeName} checked={intake === 'set'} onChange={() => setIntake('set')}/>Set all to</label>
        {intake === 'set' && <div className="admin-field"><label htmlFor={yearId}>Intake year for all</label>
          <input id={yearId} type="number" inputMode="numeric" min={ADMIN_INTAKE_YEAR_MIN} max={ADMIN_INTAKE_YEAR_MAX} step={1} value={year} onChange={event => setYear(event.target.value)}/></div>}
        <label className="admin-check"><input type="radio" name={intakeName} checked={intake === 'matric'} onChange={() => setIntake('matric')}/>From each student's matric number</label>
      </fieldset>
      {!noChange && <p role="status">{batchSummary(plan)}</p>}
      {curriculumId !== null && <p className="admin-muted">Saved subject picks for semesters whose selection has not closed are removed.</p>}
      <button type="button" className="admin-primary" aria-haspopup="dialog" disabled={!canApply} onClick={() => setConfirming(true)}>Apply correction</button>
    </section>}
    </>}
    {confirming && plan && <ReasonDialog title="Apply batch correction" description={<p>{batchSummary(plan)} All of them are saved together, or none are.</p>}
      confirmLabel="Apply correction" onCancel={() => setConfirming(false)} onSubmit={apply}/>}
  </>;
}
