import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AppLink, navigateApp } from '../../app/navigation';
import { CoordinatorApiError, type CoordinatorClient, type UploadOutcome } from './client';
import {
  ActionDialog, LoadMore, PageHeading, Panel, ScopePicker, StatusRegion, chooseScope, errorText, readScope, scopeHref, usePagedList, useRead, when,
  type ChosenScope, type Notice,
} from './coordinator-ui';
import { IMPORT_LIMITS, type AcceptedImport, type ImportSource, type ImportSummary, type ImportValidationReport, type SystemSnapshotCoverage, type ValidationIssue } from '../../../../../packages/shared/src/forecasting/contracts';

const today = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const countLabels: Array<[keyof ImportValidationReport['counts'], string]> = [
  ['studentRows', 'Student rows'], ['uniqueStudents', 'Unique students'], ['validAttempts', 'Valid attempts'], ['rejectedRows', 'Rejected rows'],
  ['partialStudents', 'Partial history'], ['unknownHistoryStudents', 'Unknown history'],
];

function Counts({ counts, label }: { counts: ImportValidationReport['counts']; label: string }) {
  return <dl className="coordinator-counts" aria-label={label}>{countLabels.map(([key, text]) => <div key={key}><dt>{text}</dt><dd>{counts[key]}</dd></div>)}</dl>;
}

const SOURCE_LABELS: Record<ImportSource, string> = { SYSTEM: 'System students', CSV: 'CSV upload' };
function SourceBadge({ source }: { source: ImportSource }) {
  return <span className={'admin-pill ' + (source === 'SYSTEM' ? 'admin-status-active' : 'coordinator-pill-neutral')}>{SOURCE_LABELS[source]}</span>;
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
  return <section className="admin-card" aria-labelledby="coordinator-system-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-system-heading" tabIndex={-1}>Use students in the system</h2>
      <p className="admin-muted">Build the forecast from the students currently in the system. Their own academic records count as complete history (student-entered). Students with no records have unknown history and stay uncertain.</p></div>
      <span className="admin-pill admin-status-active">Main option</span></div>
    <dl className="coordinator-scope-facts" aria-label="Snapshot scope">
      <div><dt>Programme</dt><dd>{scope.programmeLabel}</dd></div><div><dt>Learning centre</dt><dd>{scope.centreLabel}</dd></div></dl>
    <p className="admin-muted">Only students with active student access are included. The snapshot is frozen, and student profiles and records are never changed.</p>
    {failure && <p className="admin-form-error" role="alert">{failure}</p>}
    <div className="coordinator-upload-submit"><button type="button" className="admin-primary" disabled={busy} aria-busy={busy} onClick={() => void create()}>{busy ? 'Creating snapshot…' : 'Create snapshot'}</button></div>
  </section>;
}

function SnapshotResult({ result, scope, onGenerate, onDismiss }: { result: SnapshotResultData; scope: ChosenScope; onGenerate: (item: ImportSummary) => void; onDismiss: () => void }) {
  const { data } = result, coverage = data.validationReport.coverage, heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [data.importBatchId]);
  return <section className="admin-card" aria-labelledby="coordinator-snapshot-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-snapshot-heading" tabIndex={-1} ref={heading}>Snapshot created</h2>
      <p className="admin-muted">{result.replay ? 'The students and records have not changed since this snapshot, so it is shown again.' : 'A new frozen snapshot of the students in the system was saved.'} Import #{data.importBatchId} · {when(data.acceptedAt)}</p></div>
      <SourceBadge source={data.source}/></div>
    {coverage ? <CoverageSummary coverage={coverage}/> : <Counts counts={data.counts} label="Snapshot summary"/>}
    <div className="admin-dialog-actions coordinator-report-actions">
      <button type="button" onClick={onDismiss}>Dismiss</button>
      <AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope, { import: data.importBatchId })}>View roster</AppLink>
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
    {report.completenessChanges.length > 0 && <p className="admin-muted">{report.completenessChanges.length} {report.completenessChanges.length === 1 ? 'student has' : 'students have'} incomplete history because of rejected rows.</p>}
    <Findings issues={report.issues} severity="ERROR"/>
    <Findings issues={report.issues} severity="WARNING"/>
    <div className="admin-dialog-actions coordinator-report-actions">
      <button type="button" onClick={onDismiss}>Dismiss report</button>
      {!rejected && report.subsetAcknowledgementRequired && <button type="button" className="admin-primary" onClick={onAccept}>Accept valid subset</button>}
    </div>
  </section>;
}

function UploadCard({ client, scope, onOutcome, onTemplateError }: { client: CoordinatorClient; scope: ChosenScope; onOutcome: (outcome: UploadOutcome) => void; onTemplateError: (text: string) => void }) {
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
      const outcome = await client.uploadImport({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, sourceDate: date, sourceLabel: label.trim(), file: file! });
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
  return <section className="admin-card" aria-labelledby="coordinator-upload-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-upload-heading" tabIndex={-1}>Or upload a CSV (fallback)</h2>
      <p className="admin-muted">Use this only when the students in the system are not the right source. Upload one CSV of your students' academic history for {scope.programmeLabel} at {scope.centreLabel}. The optional student_name column lets you recognise students later. A forecast uses one source.</p></div>
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
      <div className="coordinator-upload-submit"><button type="submit" className="admin-primary" disabled={busy} aria-busy={busy}>{busy ? 'Validating…' : 'Upload and validate'}</button></div>
    </form>
  </section>;
}

function importRow(item: ImportSummary, scope: ChosenScope, onGenerate: (item: ImportSummary) => void) {
  return <tr key={item.importBatchId}>
    <td><strong>{item.sourceLabel}</strong><span className="admin-audit-id">Import #{item.importBatchId}</span></td><td><SourceBadge source={item.source}/></td>
    <td>{item.sourceDate}</td><td>{when(item.acceptedAt)}</td><td>{item.counts.uniqueStudents}</td><td>{item.counts.rejectedRows}</td>
    <td><div className="coordinator-row-actions">
      <AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope, { import: item.importBatchId })} aria-label={`View roster for ${item.sourceLabel}`}>View roster</AppLink>
      <button type="button" className="admin-row-action" onClick={() => onGenerate(item)} aria-label={`Generate forecast from ${item.sourceLabel}`}>Generate forecast</button></div></td>
  </tr>;
}

function ImportList({ client, scope, version, onGenerate }: { client: CoordinatorClient; scope: ChosenScope; version: number; onGenerate: (item: ImportSummary) => void }) {
  const list = usePagedList(signal => client.listImports(scope, { limit: 20 }, signal), cursor => client.listImports(scope, { limit: 20, cursor }), [scope.programmeId, scope.learningCentreId, version].join('|'));
  return <section className="admin-card" aria-labelledby="coordinator-imports-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-imports-heading">Accepted imports</h2><p className="admin-muted">Each accepted import is a frozen snapshot, either of the students in the system or from a CSV. Generate a forecast from one of them.</p></div></div>
    <Panel error={list.error} retry={list.retry} label="imports">{list.data && (list.items.length === 0
      ? <div className="admin-empty"><h3>No accepted imports yet</h3><p>Create a snapshot of the students in the system above, or upload a CSV. Valid data is accepted straight away.</p></div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Accepted imports table" tabIndex={0}>
        <table><thead><tr><th scope="col">Import</th><th scope="col">Source</th><th scope="col">Source date</th><th scope="col">Accepted</th><th scope="col">Students</th><th scope="col">Rejected rows</th><th scope="col">Actions</th></tr></thead>
          <tbody>{list.items.map(item => importRow(item, scope, onGenerate))}</tbody></table></div>
        {list.loadMoreError && <p className="admin-form-error" role="alert">{list.loadMoreError}</p>}
        <LoadMore cursor={list.cursor} busy={list.loadingMore} onMore={() => void list.more()} label="Load more imports"/></>)}
    </Panel>
  </section>;
}

function ImportDetail({ client, scope, importId, onGenerate }: { client: CoordinatorClient; scope: ChosenScope; importId: number; onGenerate: (item: ImportSummary) => void }) {
  const detail = useRead(signal => client.getImport(importId, signal), 'import|' + importId);
  const roster = usePagedList(signal => client.listStudents(importId, { limit: 50 }, signal), cursor => client.listStudents(importId, { limit: 50, cursor }), 'roster|' + importId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (detail.data) heading.current?.focus(); }, [detail.data?.importBatchId]);
  const item: AcceptedImport | undefined = detail.data;
  return <section className="admin-card" aria-labelledby="coordinator-import-heading">
    <AppLink className="admin-back" href={scopeHref('/coordinator/imports', scope)}>← Back to imports</AppLink>
    <Panel error={detail.error} retry={detail.retry} label="import">{item && <>
      <div className="admin-card-title"><div><h2 id="coordinator-import-heading" tabIndex={-1} ref={heading}>{item.sourceLabel}</h2>
        <p className="admin-muted">Import #{item.importBatchId} · source date {item.sourceDate} · accepted {when(item.acceptedAt)} · frozen snapshot</p>
        <p><SourceBadge source={item.source}/>{item.source === 'SYSTEM' && <span className="admin-muted"> Based on student-entered records.</span>}</p></div>
        <button type="button" className="admin-primary" onClick={() => onGenerate(item)}>Generate forecast</button></div>
      {item.validationReport.coverage ? <CoverageSummary coverage={item.validationReport.coverage}/> : <Counts counts={item.counts} label="Import summary"/>}
      <h3 className="coordinator-subheading">Student roster</h3>
      <p className="admin-muted">Student names are personal data. They are shown only to the coordinators assigned to this scope.</p>
      <Panel error={roster.error} retry={roster.retry} label="roster">{roster.data && (roster.items.length === 0 ? <p className="admin-empty">No students were retained in this import.</p> :
        <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Student roster table" tabIndex={0}>
          <table><thead><tr><th scope="col">Name</th><th scope="col">Reference</th><th scope="col">Curriculum</th><th scope="col">Cohort status</th><th scope="col">History</th></tr></thead>
            <tbody>{roster.items.map(student => <tr key={student.importedStudentId}>
              <td className="admin-wrap">{student.studentName ?? <span className="admin-muted">Not provided</span>}</td><td className="admin-wrap">{student.externalReference}</td>
              <td>{student.curriculumVersion}</td><td>{student.cohortStatus}</td><td><span className={'admin-pill ' + (student.historyCompleteness === 'COMPLETE' ? 'admin-status-active' : 'admin-status-suspended')}>{student.historyCompleteness[0] + student.historyCompleteness.slice(1).toLowerCase()}</span></td></tr>)}</tbody></table></div>
          {roster.loadMoreError && <p className="admin-form-error" role="alert">{roster.loadMoreError}</p>}
          <LoadMore cursor={roster.cursor} busy={roster.loadingMore} onMore={() => void roster.more()} label="Load more students"/></>)}
      </Panel></>}</Panel>
  </section>;
}

function ImportWorkspace({ client, scope, importId }: { client: CoordinatorClient; scope: ChosenScope; importId: number | null }) {
  const [notice, setNotice] = useState<Notice>(null), [outcome, setOutcome] = useState<Exclude<UploadOutcome, { kind: 'ACCEPTED' }> | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotResultData | null>(null);
  const [version, setVersion] = useState(0), [subset, setSubset] = useState(false), [generate, setGenerate] = useState<{ importBatchId: number; label: string } | null>(null);
  function accepted(text: string) { setOutcome(null); setNotice({ kind: 'success', text }); setVersion(value => value + 1); }
  function onOutcome(result: UploadOutcome) {
    if (result.kind === 'ACCEPTED') {
      accepted(result.replay ? `This file was already imported. The existing snapshot "${result.data.sourceLabel}" is shown below.` : `Import accepted: ${result.data.counts.uniqueStudents} students from "${result.data.sourceLabel}".`);
      return;
    }
    setNotice(null); setOutcome(result);
  }
  async function generateRun(importBatchId: number) {
    const result = await client.generateRun({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
    setGenerate(null);
    navigateApp(scopeHref('/coordinator/forecasts', scope, { run: result.receipt.resourceId }));
  }
  return <>
    <StatusRegion notice={notice}/>
    {importId === null && <SystemCard client={client} scope={scope} onCreated={result => { setSnapshot(result); setOutcome(null); setNotice(null); setVersion(value => value + 1); }}/>}
    {importId === null && snapshot && <SnapshotResult result={snapshot} scope={scope} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })} onDismiss={() => { setSnapshot(null); document.getElementById('coordinator-system-heading')?.focus(); }}/>}
    {importId === null && <UploadCard client={client} scope={scope} onOutcome={onOutcome} onTemplateError={text => setNotice({ kind: 'warning', text })}/>}
    {importId === null && outcome && <ReportCard outcome={outcome} onAccept={() => setSubset(true)} onDismiss={() => { setOutcome(null); document.getElementById('coordinator-upload-heading')?.focus(); }}/>}
    {importId === null
      ? <ImportList client={client} scope={scope} version={version} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })}/>
      : <ImportDetail client={client} scope={scope} importId={importId} onGenerate={item => setGenerate({ importBatchId: item.importBatchId, label: item.sourceLabel })}/>}
    {subset && outcome?.kind === 'CORRECTION_REQUIRED' && <ActionDialog title="Accept the valid subset" confirmLabel="Accept valid subset" reasonLabel={null}
      acknowledgement={`I understand that ${outcome.report.counts.rejectedRows} rejected ${outcome.report.counts.rejectedRows === 1 ? 'row is' : 'rows are'} left out and only the valid rows are used for the forecast.`}
      description={<>Only the rows that passed validation ({outcome.report.counts.uniqueStudents} students) are stored as a frozen snapshot. Rejected rows are not stored, and students affected by them are treated as having incomplete history.</>}
      onCancel={() => setSubset(false)}
      onSubmit={async () => {
        try { const data = await client.acceptSubset(scope, outcome.report, outcome.revision); setSubset(false); accepted(`Valid subset accepted: ${data.counts.uniqueStudents} students from "${data.sourceLabel}".`); }
        catch (error) { if (error instanceof CoordinatorApiError && error.code === 'IMPORT_REVISION_MISMATCH') { setSubset(false); setOutcome(null); setNotice({ kind: 'warning', text: error.message }); return; } throw error; }
      }}/>}
    {generate && <ActionDialog title="Generate forecast" confirmLabel="Generate forecast" reasonLabel={null}
      description={<>Create a draft forecast from "{generate.label}" for {scope.programmeLabel} at {scope.centreLabel}. The result is potential demand for planning, not student registration. You can review and change it before finalizing.</>}
      onCancel={() => setGenerate(null)} onSubmit={() => generateRun(generate.importBatchId)}/>}
  </>;
}

export function ImportsPage({ client, search }: { client: CoordinatorClient; search: string }) {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  const { programmeId, learningCentreId, extra } = readScope(search);
  const importParam = extra.get('import'), importId = importParam && /^[1-9]\d*$/.test(importParam) ? Number(importParam) : null;
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  return <>
    <PageHeading title="Data Imports" text="Build the forecast data for the next semester from the students in the system, or upload a CSV as a fallback. Accepted snapshots are kept for forecasting."/>
    <Panel error={context.error} retry={context.retry} label="forecast scope">{context.data && <>
      <ScopePicker context={context.data} path="/coordinator/imports" programmeId={programmeId} learningCentreId={learningCentreId}/>
      {scope ? <ImportWorkspace key={`${scope.programmeId}-${scope.learningCentreId}-${importId ?? 'list'}`} client={client} scope={scope} importId={importId}/>
        : <section className="admin-card admin-empty"><h2>Choose a scope</h2><p>Select a programme and a learning centre to upload data and see accepted imports.</p></section>}
    </>}</Panel>
  </>;
}
