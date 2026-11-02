import { useState } from 'react';
import type { AcademicSetupClient } from './academic-client';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import { checked, SetupCard, SetupForm, SetupTable, useSetupRead, type Field } from './academic-ui';

const label = (s: Pick<C.AcademicSemester, 'academicYear' | 'semesterNo'>) => s.academicYear + ' · Semester ' + s.semesterNo;
export function SemestersPage({ client }: { client: AcademicSetupClient }) {
  const state = useSetupRead(async signal => ({ semesters: await client.semesters(signal), current: await client.currentSemester(signal) }));
  const [edit, setEdit] = useState<C.AcademicSemester | 'new' | null>(null), [current, setCurrent] = useState<C.AcademicSemester | null>(null), [success, setSuccess] = useState('');
  const done = () => { setEdit(null); setCurrent(null); setSuccess('Semester configuration saved.'); state.refresh(); };
  const next = state.data?.current ? nextSemesterAfter(String(state.data.current.semesterId), state.data.semesters.map(s => ({ ...s, semesterId: String(s.semesterId) }))) : null;
  const fields: Field[] = [{ key: 'academicYear', label: 'Academic year (YYYY/YYYY)', maxLength: 9 }, { key: 'semesterNo', label: 'Semester number', options: [1, 2, 3].map(n => ({ value: String(n), label: String(n) })) }, { key: 'maxSubjects', label: 'Maximum subjects', type: 'number' }, { key: 'maxCredits', label: 'Maximum credits', type: 'number' }, { key: 'startDate', label: 'Start date', type: 'date', optional: true }, { key: 'endDate', label: 'End date', type: 'date', optional: true }];
  return <SetupCard title="Academic Semesters" {...state} success={success} action={<button className="admin-primary" disabled={!state.data} onClick={() => setEdit('new')}>Add semester</button>}>
    <p>System current semester: <strong>{state.data?.current ? label(state.data.current) : 'Not configured'}</strong></p><p>Next semester: {next ? label(next) : 'Not configured'}</p>
    {next && <button onClick={() => setCurrent(state.data!.semesters.find(s => String(s.semesterId) === next.semesterId)!)}>Advance to next semester</button>}
    {!state.data?.semesters.length ? <p>No semesters configured.</p> : <SetupTable label="Academic semesters" headings={['Semester', 'Type', 'Limits', 'Dates', 'Current', 'Actions']}>{state.data.semesters.map(row => <tr key={row.semesterId}><td>{label(row)}</td><td>{row.semesterType}</td><td>{row.maxSubjects} subjects / {row.maxCredits} credits</td><td>{row.startDate ?? '—'} to {row.endDate ?? '—'}</td><td>{row.isCurrent ? 'Current' : '—'}</td><td><button onClick={() => setEdit(row)}>Edit {label(row)}</button> {!row.isCurrent && <button onClick={() => setCurrent(row)}>Set current {label(row)}</button>}</td></tr>)}</SetupTable>}
    {edit && <SetupForm title={edit === 'new' ? 'Add semester' : 'Edit semester'} fields={fields} initial={edit === 'new' ? {} : Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, v === null ? '' : String(v)]))} onClose={() => setEdit(null)} onSave={async (v, reason) => {
      const input = checked(C.validateCreateSemesterRequest({ academicYear: v.academicYear, semesterNo: Number(v.semesterNo), semesterType: v.semesterNo === '3' ? 'SHORT' : 'NORMAL', maxSubjects: Number(v.maxSubjects), maxCredits: Number(v.maxCredits), startDate: v.startDate || null, endDate: v.endDate || null, reason }));
      if (edit === 'new') await client.createSemester(input); else await client.updateSemester(edit.semesterId, input); done();
    }}>{() => <p>Semester 1 and 2 use NORMAL type; semester 3 uses SHORT type.</p>}</SetupForm>}
    {current && <ReasonDialog title="Set current semester" description={<>Set {label(current)} as the system current semester. Offerings will target the next configured semester after it.</>} confirmLabel="Set current" onCancel={() => setCurrent(null)} onSubmit={async reason => { await client.setCurrentSemester({ semesterId: current.semesterId, reason }); done(); }}/>} 
  </SetupCard>;
}