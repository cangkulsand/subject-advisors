import { useEffect, useRef, useState, type AnimationEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { AcademicRecord, RecordStatus } from '../../../../api/src/modules/records/contracts';
import type { ProfileOptions } from '../../../../api/src/modules/profile/contracts';
import { type AcademicClient, errorMessage } from '../profile/client';
import { registerUnsavedChanges } from '../../app/navigation';
import { SubjectRecordsTable, type SubjectRecordSelection } from './SubjectRecordsTable';
import { RecordToastStack, type RecordToast, type RecordToastKind } from './RecordToastStack';
import { groupElectiveSubjects, groupSubjectsByCategory, normalizeSubjectCategory } from './subject-groups';
import '../profile/profile.css';

const labels: Record<RecordStatus, string> = { COMPLETED: 'Completed', EXEMPTED: 'Exempted', FAILED: 'Failed', WITHDRAWN: 'Withdrawn' };
const toastDuration = 5000, toastExitDuration = 300, maxVisibleToasts = 3;
type RecordsTab = 'CORE' | 'CS_ELECTIVE' | 'UMUM' | 'OTHER';
type DetailsDraft = { subjectId: number; recordId: number | null; status: RecordStatus; grade: string; remarks: string };
const emptyDetails = (subjectId: number, record: AcademicRecord | undefined, status: RecordStatus): DetailsDraft => ({
  subjectId, recordId: record?.recordId ?? null, status, grade: record?.grade ?? '', remarks: record?.remarks ?? '',
});
function selectionFor(record: AcademicRecord | undefined): SubjectRecordSelection {
  if (record?.status === 'COMPLETED') return 'TAKEN';
  if (record?.status === 'EXEMPTED') return 'EXEMPTED';
  return null;
}
function selectionMap(subjects: ProfileOptions['subjects'], records: AcademicRecord[]): Record<string, SubjectRecordSelection> {
  const result: Record<string, SubjectRecordSelection> = {};
  for (const subject of subjects) {
    const matches = records.filter(record => record.subjectId === subject.subjectId);
    result[String(subject.subjectId)] = matches.length === 1 ? selectionFor(matches[0]) : null;
  }
  return result;
}
export function RecordsPage({ api }: { api: AcademicClient }) {
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [undoRecords, setUndoRecords] = useState<AcademicRecord[]>([]);
  const [options, setOptions] = useState<ProfileOptions>({ curricula: [], subjects: [], semesters: [] });
  const [selections, setSelections] = useState<Record<string, SubjectRecordSelection>>({});
  const [initialSelections, setInitialSelections] = useState<Record<string, SubjectRecordSelection>>({});
  const [details, setDetails] = useState<DetailsDraft | null>(null), [detailsInitial, setDetailsInitial] = useState<DetailsDraft | null>(null);
  const [activeTab, setActiveTab] = useState<RecordsTab>('CORE');
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [toasts, setToasts] = useState<RecordToast[]>([]);
  const toastsRef = useRef<RecordToast[]>([]), nextToastId = useRef(1);
  const toastTimers = useRef(new Map<number, { auto: number | null; exit: number | null }>());
  const mounted = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null), detailHeading = useRef<HTMLHeadingElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null), detailsOpener = useRef<HTMLElement | null>(null);
  const programmaticClose = useRef(false);

  function updateToasts(updater: (current: RecordToast[]) => RecordToast[]) {
    const next = updater(toastsRef.current);
    toastsRef.current = next;
    setToasts(next);
  }
  function clearToastTimers(id: number) {
    const timers = toastTimers.current.get(id);
    if (timers?.auto !== null && timers?.auto !== undefined) window.clearTimeout(timers.auto);
    if (timers?.exit !== null && timers?.exit !== undefined) window.clearTimeout(timers.exit);
    toastTimers.current.delete(id);
  }
  function removeToast(id: number) {
    if (!mounted.current) return;
    clearToastTimers(id);
    updateToasts(current => current.filter(toast => toast.id !== id));
  }
  function dismissToast(id: number) {
    if (!mounted.current) return;
    const toast = toastsRef.current.find(item => item.id === id);
    if (!toast || toast.closing) return;
    const timers = toastTimers.current.get(id);
    if (timers?.auto !== null && timers?.auto !== undefined) window.clearTimeout(timers.auto);
    const exit = window.setTimeout(() => removeToast(id), toastExitDuration);
    toastTimers.current.set(id, { auto: null, exit });
    updateToasts(current => current.map(item => item.id === id ? { ...item, closing: true } : item));
  }
  function notify(message: string, kind: RecordToastKind = 'success') {
    if (!mounted.current) return;
    const id = nextToastId.current++;
    const item: RecordToast = { id, message, kind, closing: false };
    const current = toastsRef.current;
    const next = [...current, item].slice(-maxVisibleToasts);
    const retained = new Set(next.map(toast => toast.id));
    for (const old of current) if (!retained.has(old.id)) clearToastTimers(old.id);
    updateToasts(() => next);
    const auto = window.setTimeout(() => dismissToast(id), toastDuration - toastExitDuration);
    toastTimers.current.set(id, { auto, exit: null });
  }
  function onToastAnimationEnd(id: number, event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName === 'p001-toast-exit') removeToast(id);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timers of toastTimers.current.values()) {
        if (timers.auto !== null) window.clearTimeout(timers.auto);
        if (timers.exit !== null) window.clearTimeout(timers.exit);
      }
      toastTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController(); setError(''); setLoaded(false);
    Promise.all([api<AcademicRecord[]>('/api/academic-records', { signal: controller.signal }), api<ProfileOptions>('/api/profile/options', { signal: controller.signal })])
      .then(([saved, choices]) => {
        if (controller.signal.aborted) return;
        setRecords(saved); setOptions(choices);
        const initial = selectionMap(choices.subjects, saved); setSelections(initial); setInitialSelections(initial); setLoaded(true);
        const groups = groupSubjectsByCategory(choices.subjects);
        const hasE = groups.elective.some(subject => normalizeSubjectCategory(subject.subjectCategory).startsWith('ELECTIVE E'));
        const hasU = groups.elective.some(subject => normalizeSubjectCategory(subject.subjectCategory).startsWith('ELECTIVE U'));
        setActiveTab(groups.core.length ? 'CORE' : hasE ? 'CS_ELECTIVE' : hasU ? 'UMUM' : groups.other.length || groups.elective.length ? 'OTHER' : 'CORE');
      })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, attempt]);

  const hasSelectionChanges = Object.keys(selections).some(id => (selections[id] ?? null) !== (initialSelections[id] ?? null));
  const detailsDirty = Boolean(details && detailsInitial && JSON.stringify(details) !== JSON.stringify(detailsInitial));
  const dirty = hasSelectionChanges || detailsDirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const release = registerUnsavedChanges(() => dirty);
    window.addEventListener('beforeunload', warn); return () => { release(); window.removeEventListener('beforeunload', warn); };
  }, [dirty]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => {
    const dialog = detailDialog.current;
    if (details && dialog && !dialog.open) dialog.showModal();
    if (!details && dialog?.open) { programmaticClose.current = true; dialog.close(); }
  }, [Boolean(details)]);

  function matchesFor(subjectId: number) { return records.filter(record => record.subjectId === subjectId); }
  function currentFor(subjectId: number) { const matches = matchesFor(subjectId); return matches.length === 1 ? matches[0] : undefined; }
  function closeDetails() {
    const opener = detailsOpener.current;
    setDetails(null); setDetailsInitial(null);
    requestAnimationFrame(() => opener?.focus());
  }
  function requestCloseDetails() {
    if (saving) return;
    if (detailsDirty && !window.confirm('Discard unsaved grade or exemption details?')) return;
    closeDetails();
  }
  function openDetails(subjectId: number, status: RecordStatus, opener?: HTMLElement) {
    if (details?.subjectId === subjectId) {
      requestAnimationFrame(() => detailHeading.current?.focus());
      return;
    }
    if (detailsDirty && !window.confirm('Discard unsaved grade or exemption details?')) return;
    detailsOpener.current = opener ?? document.activeElement as HTMLElement;
    const draft = emptyDetails(subjectId, currentFor(subjectId), status);
    setDetails(draft); setDetailsInitial({ ...draft }); setError('');
    requestAnimationFrame(() => detailHeading.current?.focus());
  }
  function replaceSavedRow(row: AcademicRecord) {
    setRecords(old => [...old.filter(item => item.recordId !== row.recordId), row]);
    const key = String(row.subjectId), savedSelection = selectionFor(row);
    setSelections(old => ({ ...old, [key]: savedSelection }));
    setInitialSelections(old => ({ ...old, [key]: savedSelection }));
  }
  function dispatchSaved() { window.dispatchEvent(new Event('p001:records-changed')); }

  async function writeRecord(subjectId: number, status: RecordStatus, values: Pick<DetailsDraft, 'grade' | 'remarks'>): Promise<AcademicRecord | null> {
    const matches = matchesFor(subjectId);
    if (matches.length > 1) { setError('This subject has multiple saved records and needs reconciliation. No record was changed.'); return null; }
    const existing = matches[0];
    const body = {
      subjectId, semesterId: existing?.semesterId ?? null, status,
      grade: values.grade.trim() || null, remarks: values.remarks.trim() || null,
      recognizedCredits: status === 'COMPLETED' || status === 'EXEMPTED' ? null : 0,
    };
    try {
      const row = await api<AcademicRecord>('/api/academic-records' + (existing ? '/' + existing.recordId : ''), {
        method: existing ? 'PUT' : 'POST', body,
      });
      replaceSavedRow(row); dispatchSaved(); return row;
    } catch (reason) { setError(errorMessage(reason)); return null; }
  }

  async function deleteSavedRecord(record: AcademicRecord) {
    if (record.semesterId !== null) {
      setError('This older semester record cannot be cleared here because an undo cannot restore its semester. Ask the programme administrator for help.');
      setSelections(old => ({ ...old, [String(record.subjectId)]: selectionFor(record) }));
      return;
    }
    setSaving(true); setError('');
    try {
      await api<{ recordId: number; subjectId: number }>(`/api/academic-records/${record.recordId}`, { method: 'DELETE' });
      setRecords(old => old.filter(item => item.recordId !== record.recordId));
      const key = String(record.subjectId);
      setSelections(old => ({ ...old, [key]: null })); setInitialSelections(old => ({ ...old, [key]: null }));
      if (details?.subjectId === record.subjectId) closeDetails();
      setUndoRecords(old => [...old.filter(item => item.recordId !== record.recordId), record]);
      notify(`${record.subjectCode} record cleared`); dispatchSaved();
    } catch (reason) {
      setError(errorMessage(reason));
      setSelections(old => ({ ...old, [String(record.subjectId)]: selectionFor(record) }));
    }
    finally { setSaving(false); }
  }

  async function undoClear(old: AcademicRecord) {
    if (saving) return;
    setSaving(true); setError('');
    try {
      if (matchesFor(old.subjectId).length > 0) throw new Error('A subject record already exists, so the cleared record was not restored.');
      const row = await api<AcademicRecord>('/api/academic-records', { method: 'POST', body: {
        subjectId: old.subjectId, semesterId: null, status: old.status, grade: old.grade,
        recognizedCredits: old.status === 'COMPLETED' || old.status === 'EXEMPTED' ? null : old.recognizedCredits, remarks: old.remarks,
      } });
      replaceSavedRow(row); setUndoRecords(current => current.filter(item => item.recordId !== old.recordId)); notify(`${row.subjectCode} record restored`); dispatchSaved();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  function changeSelection(subjectIdValue: number | string, selection: SubjectRecordSelection) {
    const subjectId = Number(subjectIdValue), key = String(subjectId), matches = matchesFor(subjectId);
    if (saving || matches.length > 1) return;
    const savedSelection = matches.length === 1 ? selectionFor(matches[0]) : null;
    const currentSelection = selections[key] ?? null;
    if (selection === null) {
      if (matches.length === 0) {
        setSelections(old => ({ ...old, [key]: null }));
        if (details?.subjectId === subjectId) closeDetails();
        return;
      }
      if (currentSelection !== savedSelection) {
        setSelections(old => ({ ...old, [key]: savedSelection }));
        return;
      }
      if (matches[0]!.semesterId !== null) {
        setSelections(old => ({ ...old, [key]: savedSelection }));
        setError('This older semester record cannot be cleared here because an undo cannot restore its semester. Ask the programme administrator for help.');
        return;
      }
      if (matches[0]!.status === 'EXEMPTED' && matches[0]!.recognizedCredits !== matches[0]!.creditHours) {
        setSelections(old => ({ ...old, [key]: savedSelection }));
        setError('This older exemption has a partial recognized-credit amount that Undo cannot restore under the current full-subject-credit rule. Ask the programme administrator for help.');
        return;
      }
      setSelections(old => ({ ...old, [key]: null }));
      void deleteSavedRecord(matches[0]!);
      return;
    }
    if (details?.subjectId === subjectId) {
      closeDetails();
    }
    setSelections(old => ({ ...old, [key]: selection })); setError('');
    const existing = matches.length === 1 ? matches[0] : undefined;
    const status: RecordStatus = selection === 'TAKEN' ? 'COMPLETED' : 'EXEMPTED';
    const values = {
      grade: existing?.grade ?? '',
      remarks: existing?.remarks ?? '',
    };
    setSaving(true);
    void writeRecord(subjectId, status, values).then(row => {
      if (row) notify(`${row.subjectCode} marked as ${selection === 'TAKEN' ? 'Taken' : 'Exempted'}`);
      else setSelections(old => ({ ...old, [key]: savedSelection }));
    }).finally(() => setSaving(false));
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!details || saving) return;
    const status = details.status;
    if (!currentFor(details.subjectId)) { setError('This saved record is unavailable. Reload and try again.'); return; }
    const saved = currentFor(details.subjectId);
    if (saved?.status === 'EXEMPTED' && saved.recognizedCredits !== saved.creditHours) {
      setError('This older exemption has partial recognized credits that cannot be changed by the current full-subject-credit rule. Ask the programme administrator for help.');
      return;
    }
    setSaving(true); setError('');
    const row = await writeRecord(details.subjectId, status, details);
    if (row) {
      notify(`${row.subjectCode} details saved`);
      closeDetails();
    }
    setSaving(false);
  }

  const subjectRows = options.subjects.map(subject => {
    const matches = matchesFor(subject.subjectId), record = matches.length === 1 ? matches[0] : undefined;
    const key = String(subject.subjectId), choice = selections[key] ?? null;
    const savedChoice = selectionFor(record), selectionChanged = choice !== savedChoice;
    const duplicate = matches.length > 1;
    const statusList = matches.map(row => labels[row.status]).join(', ');
    const notice = duplicate
      ? `${matches.length} saved records (${statusList}) need reconciliation. They are preserved and controls are read-only.`
      : record && (record.status === 'FAILED' || record.status === 'WITHDRAWN')
        ? `The saved ${labels[record.status]} outcome is retained; neither checkbox is selected.`
        : record?.status === 'EXEMPTED' && record.recognizedCredits !== record.creditHours
          ? `Older exemption: ${record.recognizedCredits} recognized credits. Current exemptions use full subject credits.` : undefined;
    return {
      subjectId: subject.subjectId, subjectCode: subject.subjectCode, subjectName: subject.subjectName, credits: subject.creditHours,
      subjectCategory: subject.subjectCategory,
      isCompulsory: subject.isCompulsory,
      outcomeLabel: duplicate ? 'Multiple saved records' : record ? labels[record.status] : 'Not recorded',
      notice, selectionDisabled: duplicate || Boolean(details && detailsDirty && details.subjectId === subject.subjectId),
      actionDisabled: duplicate || (!record && choice !== 'EXEMPTED') || (selectionChanged && choice !== 'EXEMPTED'),
    };
  });
  const groupedRows = groupSubjectsByCategory(subjectRows);
  const isCodeGroup = (subject: typeof subjectRows[number], initial: 'E' | 'U') => normalizeSubjectCategory(subject.subjectCategory).startsWith(`ELECTIVE ${initial}`);
  const csSubjects = groupedRows.elective.filter(subject => isCodeGroup(subject, 'E'));
  const umumSubjects = groupedRows.elective.filter(subject => isCodeGroup(subject, 'U'));
  const uncodedElectives = groupedRows.elective.filter(subject => !isCodeGroup(subject, 'E') && !isCodeGroup(subject, 'U'));
  const otherRows = [...groupedRows.other, ...uncodedElectives];
  const metadata = options.subjectGroups ?? [];
  const csElectiveGroups = groupElectiveSubjects(csSubjects, metadata.filter(item => normalizeSubjectCategory(item.category).startsWith('ELECTIVE E')));
  const umumElectiveGroups = groupElectiveSubjects(umumSubjects, metadata.filter(item => normalizeSubjectCategory(item.category).startsWith('ELECTIVE U')));
  const tabOrder: RecordsTab[] = otherRows.length ? ['CORE', 'CS_ELECTIVE', 'UMUM', 'OTHER'] : ['CORE', 'CS_ELECTIVE', 'UMUM'];
  const tabName = (value: RecordsTab) => value === 'CORE' ? 'Core' : value === 'CS_ELECTIVE' ? 'Computer Science Electives' : value === 'UMUM' ? 'Elective Umum' : 'Other';
  const tabRows = (value: RecordsTab) => value === 'CORE' ? groupedRows.core : value === 'CS_ELECTIVE' ? csSubjects : value === 'UMUM' ? umumSubjects : otherRows;
  const tabId = (value: RecordsTab) => `p001-subject-tab-${value.toLowerCase()}`;
  const panelId = (value: RecordsTab) => `p001-subject-panel-${value.toLowerCase()}`;
  useEffect(() => {
    if (!loaded) return;
    const activeRows = tabRows(activeTab);
    if (!activeRows.length) {
      const firstPopulated = (['CORE', 'CS_ELECTIVE', 'UMUM', 'OTHER'] as const).find(group => tabRows(group).length > 0);
      if (firstPopulated) setActiveTab(firstPopulated);
    }
  }, [loaded, activeTab, groupedRows.core.length, csSubjects.length, umumSubjects.length, otherRows.length]);
  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let next: RecordsTab | undefined;
    const index = tabOrder.indexOf(activeTab);
    if (event.key === 'ArrowRight') next = tabOrder[(index + 1) % tabOrder.length];
    else if (event.key === 'ArrowLeft') next = tabOrder[(index - 1 + tabOrder.length) % tabOrder.length];
    else if (event.key === 'Home') next = tabOrder[0];
    else if (event.key === 'End') next = tabOrder[tabOrder.length - 1];
    if (next) { event.preventDefault(); setActiveTab(next); requestAnimationFrame(() => document.getElementById(tabId(next!))?.focus()); }
  }
  const subjectIds = new Set(options.subjects.map(subject => subject.subjectId));
  const outsideRecords = records.filter(record => !subjectIds.has(record.subjectId));
  const duplicateGroups = options.subjects.filter(subject => matchesFor(subject.subjectId).length > 1);
  const detailsRecord = details ? currentFor(details.subjectId) : undefined;
  const partialLegacyExemption = detailsRecord?.status === 'EXEMPTED' && detailsRecord.recognizedCredits !== detailsRecord.creditHours;

  return <section className="p001" aria-label="Academic subject records">
    <header><p className="p001-eyebrow">Academic records</p><h1>Your subject records</h1><p>Record one current outcome for each subject in your programme. These records are student-reported and unverified.</p></header>
    {error && !details && <p className="p001-alert" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    <RecordToastStack toasts={toasts} onDismiss={dismissToast} onExitAnimationEnd={onToastAnimationEnd} />
    {!loaded && (error ? <button className="p001-action" type="button" onClick={() => setAttempt(n => n + 1)}>Retry loading records</button> : <p role="status">Loading your records…</p>)}
    {loaded && options.subjects.length === 0 && <div className="p001-card" role="status"><h2>No subjects are configured</h2><p>Ask the maintainer to configure subjects for your selected programme.</p></div>}
    {loaded && options.subjects.length > 0 && <div className="p001-card">
      <p className="p001-help">Taken and Exempted save immediately. Both use the configured subject credits. You can add a grade or remarks later in View details.</p>
      <div className="p001-record-tabs" role="tablist" aria-label="Subject categories" onKeyDown={moveTab}>
        {tabOrder.map(group => <button key={group} type="button" role="tab" id={tabId(group)} aria-controls={panelId(group)} aria-selected={activeTab === group} tabIndex={activeTab === group ? 0 : -1} onClick={() => setActiveTab(group)}>
          {tabName(group)} ({tabRows(group).length})
        </button>)}
      </div>
      {tabOrder.map(group => {
        const rows = tabRows(group);
        const electiveGroups = group === 'CS_ELECTIVE' ? csElectiveGroups : group === 'UMUM' ? umumElectiveGroups : [];
        return <section key={group} className="p001-record-tabpanel" role="tabpanel" id={panelId(group)} aria-labelledby={tabId(group)} tabIndex={0} hidden={activeTab !== group}>
          {!rows.length ? <p role="status">No {tabName(group).toLowerCase()} subjects are configured for this programme.</p> : group === 'CS_ELECTIVE' || group === 'UMUM' ?
            electiveGroups.map(electiveGroup => <section key={electiveGroup.category} className="p001-elective-group" aria-label={electiveGroup.category}>
              <h2>{electiveGroup.requiredSubjects === null
                ? `${electiveGroup.category} — Selection rule not configured (${electiveGroup.availableSubjects} subjects)`
                : `${electiveGroup.category} — Pilih ${electiveGroup.requiredSubjects} daripada ${electiveGroup.availableSubjects}`}</h2>
              {electiveGroup.subjects.length ? <SubjectRecordsTable rows={electiveGroup.subjects} selections={selections} onSelectionChange={changeSelection} pending={saving}
                onDetails={(row, opener) => { const record = currentFor(Number(row.subjectId));
                  if (record) openDetails(record.subjectId, record.status, opener);
                }}
                />
                : <p role="status">No subjects are currently configured in this group.</p>}
            </section>) :
            <SubjectRecordsTable rows={rows} selections={selections} onSelectionChange={changeSelection} pending={saving}
              onDetails={(row, opener) => { const record = currentFor(Number(row.subjectId));
                if (record) openDetails(record.subjectId, record.status, opener);
              }} />}
        </section>;
      })}
      {undoRecords.map(undoRecord => <p key={undoRecord.recordId} className="p001-undo"><span>{undoRecord.subjectCode} was cleared.</span> <button className="p001-action" type="button" disabled={saving} onClick={() => { void undoClear(undoRecord); }}>Undo clear for {undoRecord.subjectCode}</button></p>)}
      {dirty && <div className="p001-actions"><button className="p001-cancel" type="button" disabled={saving} onClick={() => { setSelections({ ...initialSelections }); closeDetails(); setError(''); notify('Unsaved changes cancelled', 'info'); }}>Cancel changes</button><span className="p001-help">Unsaved changes</span></div>}
    </div>}
    {loaded && duplicateGroups.length > 0 && <section className="p001-card" aria-label="Records needing reconciliation"><h2>Records needing reconciliation</h2><p>Multiple older records exist for these subjects. All are preserved and read-only here; no attempt is selected or combined.</p><ul>{duplicateGroups.flatMap(subject => matchesFor(subject.subjectId).map(record => <li key={record.recordId}>{record.subjectCode} — {labels[record.status]}, {record.recognizedCredits} recognized credits{record.grade ? `, grade ${record.grade}` : ''}{record.remarks ? `, ${record.remarks}` : ''}</li>))}</ul></section>}
    {loaded && outsideRecords.length > 0 && <section className="p001-card" aria-label="Saved records outside this programme"><h2>Saved records outside this programme</h2><p>These records remain saved but are not part of the current subject list. Ask the maintainer for help before changing programmes.</p><ul>{outsideRecords.map(record => <li key={record.recordId}>{record.subjectCode} — {labels[record.status]}, {record.recognizedCredits} recognized credits{record.grade ? `, grade ${record.grade}` : ''}{record.remarks ? `, ${record.remarks}` : ''}</li>)}</ul></section>}
    <dialog ref={detailDialog} className="p001-records-dialog" aria-labelledby="p001-record-detail-heading"
      onCancel={event => { event.preventDefault(); requestCloseDetails(); }}
      onClose={() => {
        if (programmaticClose.current) { programmaticClose.current = false; return; }
        if (!details) return;
        if (saving) { requestAnimationFrame(() => { if (detailDialog.current && !detailDialog.current.open) detailDialog.current.showModal(); }); return; }
        if (detailsDirty && !window.confirm('Discard unsaved grade or exemption details?')) {
          requestAnimationFrame(() => { if (detailDialog.current && !detailDialog.current.open) detailDialog.current.showModal(); });
          return;
        }
        const opener = detailsOpener.current; setDetails(null); setDetailsInitial(null);
        requestAnimationFrame(() => opener?.focus());
      }}>
      {details && <form className="p001-records-dialog__content" onSubmit={event => { void saveDetails(event); }} aria-busy={saving} aria-label="Record details editor">
        <div className="p001-records-dialog__header"><h2 id="p001-record-detail-heading" ref={detailHeading} tabIndex={-1}>Edit saved record details</h2>
          <button className="p001-action p001-records-dialog__close" type="button" disabled={saving} aria-label="Close details" title="Close details" onClick={requestCloseDetails}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        {error && <p className="p001-alert" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
        <p className="p001-help">{`Saved outcome: ${labels[details.status]}. Changing details keeps the saved status and subject.`}</p>
        <fieldset disabled={saving || partialLegacyExemption}><legend>{options.subjects.find(subject => subject.subjectId === details.subjectId)?.subjectCode ?? 'Subject'} details</legend><div className="p001-grid">
          <label>Grade (optional)<input aria-label="Grade (optional)" maxLength={5} value={details.grade} onChange={event => setDetails(old => old ? { ...old, grade: event.target.value } : old)} /></label>
          {details.status === 'EXEMPTED' && <p>Subject credits: {options.subjects.find(subject => subject.subjectId === details.subjectId)?.creditHours ?? 'Unavailable'}{detailsRecord && `; saved recognized credits: ${detailsRecord.recognizedCredits}`}</p>}
        </div>
        <label>{details.status === 'EXEMPTED' ? 'Exemption explanation (optional)' : 'Remarks (optional)'}<textarea aria-label={details.status === 'EXEMPTED' ? 'Exemption explanation' : 'Remarks (optional)'} maxLength={255} value={details.remarks} onChange={event => setDetails(old => old ? { ...old, remarks: event.target.value } : old)} /></label>
        {details.status === 'EXEMPTED' && <p className="p001-help">Exempted records award the configured subject credits. Institutional approval is not verified here.</p>}
        {partialLegacyExemption && <p className="p001-help">This older partial-credit exemption is read-only because saving details would change its saved credits under the current rule.</p>}</fieldset>
        <div className="p001-actions"><button className="p001-primary" type="submit" disabled={saving || partialLegacyExemption}>Save details</button></div>
      </form>}
    </dialog>
    <p className="p001-help">Failed and withdrawn outcomes remain distinct and earn zero recognized credits. This page does not calculate graduation totals or officially register subjects.</p>
  </section>;
}
