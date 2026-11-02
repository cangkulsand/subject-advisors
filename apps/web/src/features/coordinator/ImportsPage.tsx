import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AppLink, navigateApp } from '../../app/navigation';
import { CoordinatorApiError, type CoordinatorClient, type UploadOutcome } from './client';
import {
  ActionDialog, LoadMore, PageHeading, Panel, RadioGroup, ScopeFields, StatusRegion, chooseScope, errorText, readScope, scopeHref, usePagedList, useRead, when,
  type ChosenScope, type Notice,
} from './coordinator-ui';
import { IMPORT_LIMITS, type AcceptedImport, type ForecastContext, type CombinedSnapshotCoverage, type ImportSource, type ImportSummary, type ImportValidationReport, type SystemSnapshotCoverage, type ValidationIssue } from '../../../../../packages/shared/src/forecasting/contracts';

const today = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const countLabels: Array<[keyof ImportValidationReport['counts'], string]> = [
  ['studentRows', 'Student rows'], ['uniqueStudents', 'Unique students'], ['validAttempts', 'Valid attempts'], ['rejectedRows', 'Rejected rows'],
  ['partialStudents', 'Partial history'], ['unknownHistoryStudents', 'Unknown history'],
];

function Counts({ counts, label }: { counts: ImportValidationReport['counts']; label: string }) {
  return <dl className="coordinator-counts" aria-label={label}>{countLabels.map(([key, text]) => <div key={key}><dt>{text}</dt><dd>{counts[key]}</dd></div>)}</dl>;
}

const SOURCE_LABELS: Record<ImportSource, string> = { SYSTEM: 'System students', CSV: 'CSV upload', COMBINED: 'Combined' };
function SourceBadge({ source }: { source: ImportSource }) {
  return <span className={'admin-pill ' + (source === 'CSV' ? 'coordinator-pill-neutral' : 'admin-status-active')}>{SOURCE_LABELS[source]}</span>;
}

function CoverageSummary({ coverage }: { coverage: SystemSnapshotCoverage }) {
  const rows: Array<[string, number]> = [
    ['Students found', coverage.studentsFound], ['With academic records', coverage.studentsWithRecords], ['No records (unknown history)', coverage.studentsWithoutRecords],
    ['Records used', coverage.recordsMapped], ['Records skipped', coverage.recordsUnmapped], ['Withdrawn, counted as failed', coverage.withdrawnStoredAsFailed],
  ];
  const { excluded } = coverage;
  return <>
    <dl className="coordinator-counts" aria-label="Snapshot coverage">{rows.map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value}</dd></div>)}</dl>
    <p className="admin-muted">Not included: {excluded.otherProgramme} in other programmes, {excluded.otherCentre} at other learning centres, {excluded.inactiveAccess} without active student access.</p>
    {coverage.studentsWithoutRecords > 0 && <p className="admin-muted">Students without any academic record have unknown history, so they count as uncertain in the forecast.</p>}
    <p className="admin-muted">{coverage.centreNote}</p>
  </>;
}

export type DataMode = 'system' | 'csv' | 'both';
const MODES: Array<{ value: DataMode; label: string; hint: string }> = [
  { value: 'system', label: 'Students in the system', hint: 'Student-entered records' },
  { value: 'csv', label: 'CSV import', hint: 'Upload a file' },
  { value: 'both', label: 'Both', hint: 'System + CSV, one snapshot' },
];
const modeExtra = (mode: DataMode): Record<string, string> => mode === 'system' ? {} : { source: mode };
export const readMode = (value: string | null): DataMode => value === 'csv' || value === 'both' ? value : 'system';

/** Per-forecast data source choice; kept in the URL next to the scope. A real radio group, so arrow keys and labels work natively. */
function DataSourceToggle({ mode, scope }: { mode: DataMode; scope: ChosenScope }) {
  return <RadioGroup legend="Data source for this forecast" value={mode} options={MODES} help="Choose where the students for this forecast come from. You choose per forecast; each option is saved as its own frozen snapshot."
    onChange={next => navigateApp(scopeHref('/coordinator/imports', scope, next === 'system' ? {} : { source: next }), { replace: true, skipUnsaved: true })}/>;
}

function CombinedCoverageSummary({ combined }: { combined: CombinedSnapshotCoverage }) {
  const rows: Array<[string, number]> = [
    ['Students in the snapshot', combined.students], ['CSV rows', combined.csv.rows], ['CSV students', combined.csv.students], ['Rejected CSV rows', combined.csv.rejectedRows],
    ['CSV skipped, already in system', combined.csvSkippedAlreadyInSystem.length], ['Possible duplicates', combined.possibleDuplicates.length],
  ];
  return <section className="coordinator-combined" aria-label="Combined coverage">
    <h3 className="coordinator-subheading">Combined coverage</h3>
    <dl className="coordinator-counts" aria-label="Combined coverage counts">{rows.map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value}</dd></div>)}</dl>
    {combined.csvSkippedAlreadyInSystem.length > 0 && <p className="admin-muted">Skipped because the student is already in the system (the system record is used): <span className="admin-wrap">{combined.csvSkippedAlreadyInSystem.join(', ')}</span>.</p>}
    {combined.possibleDuplicates.length > 0 && <p className="admin-muted">Possible duplicates by name (different references, both included): {combined.possibleDuplicates.map(item => `${item.csvReference} ~ ${item.systemReferences.join(', ')}`).join('; ')}.</p>}
  </section>;
}

type SnapshotResultData = { replay: boolean; data: AcceptedImport };
function SystemCard({ client, scope, onCreated }: { client: CoordinatorClient; scope: ChosenScope; onCreated: (result: SnapshotResultData) => void }) {
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  async function create() {
    if (busy) return;
    setBusy(true); setFailure('');
    try { onCreated(await client.createSystemSnapshot({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId })); }
    catch (error) { setFailure(errorText(error, 'The snapshot could not be created. Please retry.')); }
    finally { setBusy(false); }
  }
  return <section className="coordinator-setup-section" aria-labelledby="coordinator-system-heading">
    <h3 id="coordinator-system-heading" tabIndex={-1}>Students in the system</h3>
    <p className="admin-muted">Build the forecast from the students currently in the system. Their own academic records count as complete history (student-entered). Students with no records have unknown history and stay uncertain.</p>
    <p className="admin-muted">Only students with active student access are included. The snapshot is frozen, and student profiles and records are never changed.</p>
    {failure && <p className="admin-form-error" role="alert">{failure}</p>}
    <div className="coordinator-upload-submit"><button type="button" className="admin-primary" disabled={busy} aria-busy={busy} onClick={() => void create()}>{busy ? 'Creating snapshot…' : 'Create snapshot'}</button></div>
  </section>;
}

function SnapshotResult({ result, scope, mode, onGenerate, onDismiss }: { result: SnapshotResultData; scope: ChosenScope; mode: DataMode; onGenerate: (item: ImportSummary) => void; onDismiss: () => void }) {
  const { data } = result, coverage = data.validationReport.coverage, heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [data.importBatchId]);
  return <section className="admin-card" aria-labelledby="coordinator-snapshot-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-snapshot-heading" tabIndex={-1} ref={heading}>Snapshot created</h2>
      <p className="admin-muted">{result.replay ? (data.source === 'COMBINED' ? 'The system students and the CSV have not changed since this snapshot, so it is shown again.' : 'The students and records have not changed since this snapshot, so it is shown again.') : (data.source === 'COMBINED' ? 'A new frozen combined snapshot (students in the system + CSV) was saved.' : 'A new frozen snapshot of the students in the system was saved.')} Import #{data.importBatchId} · {when(data.acceptedAt)}</p></div>
      <SourceBadge source={data.source}/></div>
    {coverage ? <CoverageSummary coverage={coverage}/> : <Counts counts={data.counts} label="Snapshot summary"/>}
    {data.validationReport.combined && <CombinedCoverageSummary combined={data.validationReport.combined}/>}
    <div className="admin-dialog-actions coordinator-report-actions">
      <button type="button" onClick={onDismiss}>Dismiss</button>
      <AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope, { ...modeExtra(mode), import: data.importBatchId })}>View roster</AppLink>
      <button type="button" className="admin-primary" onClick={() => onGenerate(data)}>Generate forecast</button></div>
  </section>;
}

function Findings({ issues, severity }: { issues: ValidationIssue[]; severity: ValidationIssue['severity'] }) {
  const rows = issues.filter(issue => issue.severity === severity), id = useId();
  if (!rows.length) return null;
  const title = severity === 'ERROR' ? 'Errors' : 'Warnings';
  return <section aria-labelledby={id} className="coordinator-findings">
    <h3 id={id}><span className={'admin-pill ' + (severity === 'ERROR' ? 'coordinator-pill-danger' : 'coordinator-pill-warning')}>{title}</span> {rows.length} {rows.length === 1 ? 'finding' : 'findings'}</h3>
    <div className="admin-table-scroll coordinator-table" role="region" aria-label={title + ' table'} tabIndex={0}>
      <table><thead><tr><th scope="col">Row</th><th scope="col">Field</th><th scope="col">Message</th><th scope="col">Corrective action</th></tr></thead>
        <tbody>{rows.map((issue, index) => <tr key={index}><td>{issue.row ?? '—'}</td><td>{issue.field ?? '—'}</td>
          <td className="admin-wrap">{issue.message}<span className="admin-audit-id">{issue.code}</span></td><td className="admin-wrap">{issue.correctiveAction}</td></tr>)}</tbody></table>
    </div>
  </section>;
}

function ReportCard({ outcome, onAccept, onDismiss }: { outcome: Exclude<UploadOutcome, { kind: 'ACCEPTED' }>; onAccept: () => void; onDismiss: () => void }) {
  const { report } = outcome, heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const rejected = outcome.kind === 'FILE_REJECTED';
  return <section className="admin-card" aria-labelledby="coordinator-report-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-report-heading" tabIndex={-1} ref={heading}>Validation report</h2>
      <p className="admin-muted">{rejected ? 'The file was rejected and nothing was stored. Correct the file and upload it again.' : 'Some rows need correction. Nothing is used for forecasting until you correct the file or accept the valid subset.'}</p></div>
      <span className={'admin-pill ' + (rejected ? 'coordinator-pill-danger' : 'coordinator-pill-warning')}>{rejected ? 'File rejected' : 'Correction required'}</span></div>
    <Counts counts={report.counts} label="Validation summary"/>
    {report.combined && <CombinedCoverageSummary combined={report.combined}/>}
    {report.completenessChanges.length > 0 && <p className="admin-muted">{report.completenessChanges.length} {report.completenessChanges.length === 1 ? 'student has' : 'students have'} incomplete history because of rejected rows.</p>}
    <Findings issues={report.issues} severity="ERROR"/>
    <Findings issues={report.issues} severity="WARNING"/>
    <div className="admin-dialog-actions coordinator-report-actions">
      <button type="button" onClick={onDismiss}>Dismiss report</button>
      {!rejected && report.subsetAcknowledgementRequired && <button type="button" className="admin-primary" onClick={onAccept}>Accept valid subset</button>}
    </div>
  </section>;
}

function UploadCard({ client, scope, combined, onOutcome, onTemplateError }: { client: CoordinatorClient; scope: ChosenScope; combined: boolean; onOutcome: (outcome: UploadOutcome) => void; onTemplateError: (text: string) => void }) {
  const [date, setDate] = useState(today), [label, setLabel] = useState(''), [file, setFile] = useState<File | null>(null), [fileKey, setFileKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const ids = { date: useId(), label: useId(), file: useId(), help: useId() };
  const first = useRef<Record<string, HTMLElement | null>>({});
  function pick(candidate: File | undefined) {
    setFailure(''); setErrors(current => ({ ...current, file: '' }));
    if (!candidate) { setFile(null); return; }
    if (!candidate.name.toLocaleLowerCase().endsWith('.csv')) { setFile(null); setFileKey(key => key + 1); setErrors(current => ({ ...current, file: 'Choose a file with a .csv extension.' })); }
    else if (candidate.size > IMPORT_LIMITS.maxBytes) { setFile(null); setFileKey(key => key + 1); setErrors(current => ({ ...current, file: 'Choose a CSV file no larger than 5 MiB.' })); }
    else setFile(candidate);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = 'Enter the date the data was extracted.'; else if (date > today()) next.date = 'The source date cannot be in the future.';
    if (!label.trim()) next.label = 'Enter a short label for this data source.'; else if (label.trim().length > IMPORT_LIMITS.maxSourceLabelLength) next.label = 'Use at most 255 characters.';
    if (!file) next.file = errors.file || 'Choose a CSV file to upload.';
    setErrors(next);
    const firstKey = (['date', 'label', 'file'] as const).find(key => next[key]);
    if (firstKey) { first.current[firstKey]?.focus(); return; }
    setBusy(true); setFailure('');
    try {
      const outcome = await (combined ? client.uploadCombined : client.uploadImport)({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, sourceDate: date, sourceLabel: label.trim(), file: file! });
      setFile(null); setFileKey(key => key + 1);
      onOutcome(outcome);
    } catch (error) { setFailure(errorText(error, 'The upload failed. Please retry.')); }
    finally { setBusy(false); }
  }
  async function template() {
    try {
      const { filename, text } = await client.template();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { onTemplateError(errorText(error, 'The template could not be downloaded.')); }
  }
  const message = (key: string) => errors[key] ? <small id={ids[key as 'date'] + '-error'} className="coordinator-field-error">{errors[key]}</small> : null;
  return <section className="coordinator-setup-section" aria-labelledby="coordinator-upload-heading">
    <div className="admin-card-title"><div><h3 id="coordinator-upload-heading" tabIndex={-1}>{combined ? 'Students in the system + CSV import' : 'CSV import'}</h3>
      {combined
        ? <p className="admin-muted">One snapshot made of the students in the system for {scope.programmeLabel} at {scope.centreLabel}, plus the students in your CSV who are not already in the system. The CSV is validated exactly like a normal CSV import.</p>
        : <p className="admin-muted">Upload one CSV of your students' academic history for {scope.programmeLabel} at {scope.centreLabel}. The optional student_name column lets you recognise students later.</p>}
      {combined && <p className="admin-muted">If a student is in both, the system record is used and the CSV student is skipped. A CSV external_reference that equals a system student's matric number counts as the same student. Same name with a different reference is kept and flagged as a possible duplicate.</p>}</div>
      <button type="button" onClick={template}>Download CSV template</button></div>
    <form className="coordinator-upload-grid" onSubmit={submit} noValidate>
      <div className="admin-field"><label htmlFor={ids.date}>Source date</label>
        <input id={ids.date} ref={element => { first.current.date = element; }} type="date" value={date} max={today()} aria-invalid={!!errors.date || undefined} aria-describedby={errors.date ? ids.date + '-error' : undefined} onChange={event => setDate(event.target.value)}/>{message('date')}</div>
      <div className="admin-field"><label htmlFor={ids.label}>Source label</label>
        <input id={ids.label} ref={element => { first.current.label = element; }} type="text" value={label} maxLength={IMPORT_LIMITS.maxSourceLabelLength} placeholder="Example: September cohort export" aria-invalid={!!errors.label || undefined} aria-describedby={errors.label ? ids.label + '-error' : undefined} onChange={event => setLabel(event.target.value)}/>{message('label')}</div>
      <div className="admin-field coordinator-upload-file"><label htmlFor={ids.file}>CSV file</label>
        <input key={fileKey} id={ids.file} ref={element => { first.current.file = element; }} type="file" accept=".csv,text/csv" aria-invalid={!!errors.file || undefined} aria-describedby={ids.help + (errors.file ? ' ' + ids.file + '-error' : '')} onChange={event => pick(event.currentTarget.files?.[0])}/>
        <small id={ids.help} className="admin-counter">.csv up to 5 MiB, at most {IMPORT_LIMITS.maxDataRows.toLocaleString()} data rows.</small>{message('file')}</div>
      {failure && <p className="admin-form-error coordinator-upload-error" role="alert">{failure}</p>}
      <div className="coordinator-upload-submit"><button type="submit" className="admin-primary" disabled={busy} aria-busy={busy}>{busy ? 'Validating…' : combined ? 'Create combined snapshot' : 'Upload and validate'}</button></div>
    </form>
  </section>;
}

function importRow(item: ImportSummary, scope: ChosenScope, mode: DataMode, onGenerate: (item: ImportSummary) => void) {
  return <tr key={item.importBatchId}>
    <td><strong>{item.sourceLabel}</strong><span className="admin-audit-id">Import #{item.importBatchId}</span></td><td><SourceBadge source={item.source}/></td>
    <td>{item.sourceDate}</td><td>{when(item.acceptedAt)}</td><td>{item.counts.uniqueStudents}</td><td>{item.counts.rejectedRows}</td>
    <td><div className="coordinator-row-actions">
      <AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope, { ...modeExtra(mode), import: item.importBatchId })} aria-label={`View roster for ${item.sourceLabel}`}>View roster</AppLink>
      <button type="button" className="admin-row-action" onClick={() => onGenerate(item)} aria-label={`Generate forecast from ${item.sourceLabel}`}>Generate forecast</button></div></td>
  </tr>;
}

function ImportList({ client, scope, mode, version, onGenerate }: { client: CoordinatorClient; scope: ChosenScope; mode: DataMode; version: number; onGenerate: (item: ImportSummary) => void }) {
  const list = usePagedList(signal => client.listImports(scope, { limit: 20 }, signal), cursor => client.listImports(scope, { limit: 20, cursor }), [scope.programmeId, scope.learningCentreId, version].join('|'));
  return <section className="admin-card" aria-labelledby="coordinator-imports-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-imports-heading">Accepted imports</h2><p className="admin-muted">Each accepted import is a frozen snapshot, either of the students in the system or from a CSV. Generate a forecast from one of them.</p></div></div>
    <Panel error={list.error} retry={list.retry} label="imports">{list.data && (list.items.length === 0
      ? <div className="admin-empty"><h3>No accepted imports yet</h3><p>Create a snapshot of the students in the system above, or upload a CSV. Valid data is accepted straight away.</p></div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Accepted imports table" tabIndex={0}>
        <table><thead><tr><th scope="col">Import</th><th scope="col">Source</th><th scope="col">Source date</th><th scope="col">Accepted</th><th scope="col">Students</th><th scope="col">Rejected rows</th><th scope="col">Actions</th></tr></thead>
          <tbody>{list.items.map(item => importRow(item, scope, mode, onGenerate))}</tbody></table></div>
        {list.loadMoreError && <p className="admin-form-error" role="alert">{list.loadMoreError}</p>}
        <LoadMore cursor={list.cursor} busy={list.loadingMore} onMore={() => void list.more()} label="Load more imports"/></>)}
    </Panel>
  </section>;
}

function ImportDetail({ client, scope, mode, importId, onGenerate }: { client: CoordinatorClient; scope: ChosenScope; mode: DataMode; importId: number; onGenerate: (item: ImportSummary) => void }) {
  const detail = useRead(signal => client.getImport(importId, signal), 'import|' + importId);
  const roster = usePagedList(signal => client.listStudents(importId, { limit: 50 }, signal), cursor => client.listStudents(importId, { limit: 50, cursor }), 'roster|' + importId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (detail.data) heading.current?.focus(); }, [detail.data?.importBatchId]);
  const item: AcceptedImport | undefined = detail.data;
  return <section className="admin-card" aria-labelledby="coordinator-import-heading">
    <AppLink className="admin-back" href={scopeHref('/coordinator/imports', scope, modeExtra(mode))}>← Back to imports</AppLink>
    <Panel error={detail.error} retry={detail.retry} label="import">{item && <>
      <div className="admin-card-title"><div><h2 id="coordinator-import-heading" tabIndex={-1} ref={heading}>{item.sourceLabel}</h2>
        <p className="admin-muted">Import #{item.importBatchId} · source date {item.sourceDate} · accepted {when(item.acceptedAt)} · frozen snapshot</p>
        <p><SourceBadge source={item.source}/>{item.source === 'SYSTEM' && <span className="admin-muted"> Based on student-entered records.</span>}{item.source === 'COMBINED' && <span className="admin-muted"> Combined: student-entered records + CSV import.</span>}</p></div>
        <button type="button" className="admin-primary" onClick={() => onGenerate(item)}>Generate forecast</button></div>
      {item.validationReport.coverage ? <CoverageSummary coverage={item.validationReport.coverage}/> : <Counts counts={item.counts} label="Import summary"/>}
      {item.validationReport.combined && <CombinedCoverageSummary combined={item.validationReport.combined}/>}
      <h3 className="coordinator-subheading">Student roster</h3>
      <p className="admin-muted">Student names are personal data. They are shown only to the coordinators assigned to this scope.</p>
      <Panel error={roster.error} retry={roster.retry} label="roster">{roster.data && (roster.items.length === 0 ? <p className="admin-empty">No students were retained in this import.</p> :
        <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Student roster table" tabIndex={0}>
          <table><thead><tr><th scope="col">Name</th><th scope="col">Reference</th><th scope="col">Curriculum</th><th scope="col">Cohort status</th><th scope="col">History</th><th scope="col">Source</th></tr></thead>
            <tbody>{roster.items.map(student => <tr key={student.importedStudentId}>
              <td className="admin-wrap">{student.studentName ?? <span className="admin-muted">Not provided</span>}</td><td className="admin-wrap">{student.externalReference}</td>
              <td>{student.curriculumVersion}</td><td>{student.cohortStatus}</td><td><span className={'admin-pill ' + (student.historyCompleteness === 'COMPLETE' ? 'admin-status-active' : 'admin-status-suspended')}>{student.historyCompleteness[0] + student.historyCompleteness.slice(1).toLowerCase()}</span></td>
              <td><SourceBadge source={student.source}/></td></tr>)}</tbody></table></div>
          {roster.loadMoreError && <p className="admin-form-error" role="alert">{roster.loadMoreError}</p>}
          <LoadMore cursor={roster.cursor} busy={roster.loadingMore} onMore={() => void roster.more()} label="Load more students"/></>)}
      </Panel></>}</Panel>
  </section>;
}

/** One setup card (scope, data source, action for the chosen source); results, accepted imports and detail stay as cards below. Not keyed by scope, so radio focus survives a scope change. */
function ImportWorkspace({ client, context, scope, programmeId, learningCentreId, importId, mode }: { client: CoordinatorClient; context: ForecastContext; scope: ChosenScope | null; programmeId: number | null; learningCentreId: number | null; importId: number | null; mode: DataMode }) {
  const [notice, setNotice] = useState<Notice>(null), [outcome, setOutcome] = useState<Exclude<UploadOutcome, { kind: 'ACCEPTED' }> | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotResultData | null>(null);
  const [version, setVersion] = useState(0), [subset, setSubset] = useState(false), [generate, setGenerate] = useState<{ importBatchId: number; label: string } | null>(null);
  // Reports and results belong to the scope and mode that produced them.
  const resetKey = `${scope?.programmeId}-${scope?.learningCentreId}-${mode}`, [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) { setSeenKey(resetKey); setOutcome(null); setSnapshot(null); setSubset(false); setNotice(null); setGenerate(null); }
  function accepted(text: string) { setOutcome(null); setNotice({ kind: 'success', text }); setVersion(value => value + 1); }
  function onOutcome(result: UploadOutcome) {
    if (result.kind === 'ACCEPTED' && result.data.source === 'COMBINED') {
      setOutcome(null); setNotice(null); setSnapshot({ replay: result.replay, data: result.data }); setVersion(value => value + 1);
      return;
    }
    if (result.kind === 'ACCEPTED') {
      accepted(result.replay ? `This file was already imported. The existing snapshot "${result.data.sourceLabel}" is shown below.` : `Import accepted: ${result.data.counts.uniqueStudents} students from "${result.data.sourceLabel}".`);
      return;
    }
    setNotice(null); setOutcome(result);
  }
  async function generateRun(importBatchId: number) {
    if (!scope) return;
    const result = await client.generateRun({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
    setGenerate(null);
    navigateApp(scopeHref('/coordinator/forecasts', scope, { run: result.receipt.resourceId }));
  }
  return <>
    <StatusRegion notice={notice}/>
    <section className="admin-card coordinator-setup" aria-labelledby="coordinator-setup-heading">
      <div className="admin-card-title"><div><h2 id="coordinator-setup-heading">Forecast data setup</h2><p className="admin-muted">Choose a programme and a learning centre, then where the students for the next semester come from. Imports and forecasts are kept separately for each scope.</p></div></div>
      <div className="coordinator-setup-section"><ScopeFields context={context} path="/coordinator/imports" programmeId={programmeId} learningCentreId={learningCentreId} keep={mode === 'system' ? undefined : { source: mode }}/></div>
      {scope && importId === null && <>
        <div className="coordinator-setup-section"><DataSourceToggle mode={mode} scope={scope}/></div>
        {mode === 'system'
          ? <SystemCard key={resetKey} client={client} scope={scope} onCreated={result => { setSnapshot(result); setOutcome(null); setNotice(null); setVersion(value => value + 1); }}/>
          : <UploadCard key={resetKey} client={client} scope={scope} combined={mode === 'both'} onOutcome={onOutcome} onTemplateError={text => setNotice({ kind: 'warning', text })}/>}</>}
    </section>
    {scope === null && <section className="admin-card admin-empty"><h2>Choose a scope</h2><p>Select a programme and a learning centre to upload data and see accepted imports.</p></section>}
    {scope && importId === null && snapshot && (snapshot.data.source === 'COMBINED' ? mode === 'both' : mode === 'system') && <SnapshotResult result={snapshot} scope={scope} mode={mode} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })} onDismiss={() => { setSnapshot(null); document.getElementById(snapshot.data.source === 'COMBINED' ? 'coordinator-upload-heading' : 'coordinator-system-heading')?.focus(); }}/>}
    {scope && importId === null && outcome && <ReportCard outcome={outcome} onAccept={() => setSubset(true)} onDismiss={() => { setOutcome(null); document.getElementById('coordinator-upload-heading')?.focus(); }}/>}
    {scope && (importId === null
      ? <ImportList client={client} scope={scope} mode={mode} version={version} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })}/>
      : <ImportDetail key={importId} client={client} scope={scope} mode={mode} importId={importId} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })}/>)}
    {scope && subset && outcome?.kind === 'CORRECTION_REQUIRED' && <ActionDialog title="Accept the valid subset" confirmLabel="Accept valid subset" reasonLabel={null}
      acknowledgement={`I understand that ${outcome.report.counts.rejectedRows} rejected ${outcome.report.counts.rejectedRows === 1 ? 'row is' : 'rows are'} left out and only the valid rows are used for the forecast.`}
      description={<>{outcome.report.combined ? <>The system students and the valid CSV rows ({outcome.report.counts.uniqueStudents} students in total) are stored as one frozen snapshot.</> : <>Only the rows that passed validation ({outcome.report.counts.uniqueStudents} students) are stored as a frozen snapshot.</>} Rejected rows are not stored, and students affected by them are treated as having incomplete history.</>}
      onCancel={() => setSubset(false)}
      onSubmit={async () => {
        try {
          const data = await client.acceptSubset(scope, outcome.report, outcome.revision); setSubset(false);
          if (data.source === 'COMBINED') { setOutcome(null); setNotice({ kind: 'success', text: `Valid subset accepted: ${data.counts.uniqueStudents} students in the combined snapshot "${data.sourceLabel}".` }); setSnapshot({ replay: false, data }); setVersion(value => value + 1); }
          else accepted(`Valid subset accepted: ${data.counts.uniqueStudents} students from "${data.sourceLabel}".`);
        }
        catch (error) { if (error instanceof CoordinatorApiError && error.code === 'IMPORT_REVISION_MISMATCH') { setSubset(false); setOutcome(null); setNotice({ kind: 'warning', text: error.message }); return; } throw error; }
      }}/>}
    {scope && generate && <ActionDialog title="Generate forecast" confirmLabel="Generate forecast" reasonLabel={null}
      description={<>Create a draft forecast from "{generate.label}" for {scope.programmeLabel} at {scope.centreLabel}. The result is potential demand for planning, not student registration. You can review and change it before finalizing.</>}
      onCancel={() => setGenerate(null)} onSubmit={() => generateRun(generate.importBatchId)}/>}
  </>;
}

export function ImportsPage({ client, search }: { client: CoordinatorClient; search: string }) {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  const { programmeId, learningCentreId, extra } = readScope(search);
  const mode = readMode(extra.get('source')), importParam = extra.get('import'), importId = importParam && /^[1-9]\d*$/.test(importParam) ? Number(importParam) : null;
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  return <>
    <PageHeading title="Data Imports" text="Choose where the forecast data for the next semester comes from: the students in the system, a CSV import, or both. Accepted snapshots are kept for forecasting."/>
    <Panel error={context.error} retry={context.retry} label="forecast scope">{context.data && <>
      <ImportWorkspace client={client} context={context.data} scope={scope} programmeId={programmeId} learningCentreId={learningCentreId} importId={importId} mode={mode}/>
    </>}</Panel>
  </>;
}
