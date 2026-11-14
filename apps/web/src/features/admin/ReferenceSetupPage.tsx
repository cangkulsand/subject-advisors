import { useState } from 'react';
import type { AcademicSetupClient } from './academic-client';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { checked, SetupCard, SetupForm, SetupTable, useSetupRead } from './academic-ui';

type Reference = { id: number; code: string; name: string; active: boolean };
export function ReferenceSetupPage({ client, kind }: { client: AcademicSetupClient; kind: 'centre' | 'faculty' }) {
  const faculty = kind === 'faculty', noun = faculty ? 'faculty' : 'learning centre';
  const state = useSetupRead(async signal => ({ rows: faculty ? (await client.faculties(signal)).map(f => ({ id: f.facultyId, code: f.facultyCode, name: f.facultyName, active: f.isActive })) : (await client.centres(signal)).map(c => ({ id: c.learningCentreId, code: c.centreCode, name: c.centreName, active: c.isActive })) }), kind);
  const [edit, setEdit] = useState<Reference | 'new' | null>(null), [toggle, setToggle] = useState<Reference | null>(null), [success, setSuccess] = useState('');
  const done = () => { setEdit(null); setToggle(null); setSuccess('Academic setup saved.'); state.refresh(); };
  return <SetupCard title={faculty ? 'Faculties' : 'Learning Centres'} {...state} success={success} action={<button className="admin-primary" disabled={!state.data} onClick={() => setEdit('new')}>Add {noun}</button>}>
    {!state.data?.rows.length ? <p>No {faculty ? 'faculties' : 'learning centres'} configured.</p> : <SetupTable label={faculty ? 'Faculties' : 'Learning centres'} headings={['Code', 'Name', 'Status', 'Actions']}>{state.data.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.active ? 'Active' : 'Inactive'}</td><td><button onClick={() => setEdit(row)}>Edit {row.code}</button> <button onClick={() => setToggle(row)}>{row.active ? 'Deactivate' : 'Reactivate'} {row.code}</button></td></tr>)}</SetupTable>}
    {edit && <SetupForm title={(edit === 'new' ? 'Add ' : 'Edit ') + noun} fields={[{ key: 'code', label: faculty ? 'Faculty code' : 'Centre code', maxLength: faculty ? 20 : 10 }, { key: 'name', label: faculty ? 'Faculty name' : 'Centre name', maxLength: faculty ? 255 : 100 }]} initial={edit === 'new' ? {} : { code: edit.code, name: edit.name }} onClose={() => setEdit(null)} onSave={async (v, reason) => {
      if (faculty) { const input = checked(C.validateCreateFacultyRequest({ facultyCode: v.code, facultyName: v.name, reason })); if (edit === 'new') await client.createFaculty(input); else await client.updateFaculty(edit.id, input); }
      else { const input = checked(C.validateCreateLearningCentreRequest({ centreCode: v.code, centreName: v.name, reason })); if (edit === 'new') await client.createCentre(input); else await client.updateCentre(edit.id, input); }
      done();
    }}/>} 
    {toggle && <ReasonDialog title={(toggle.active ? 'Deactivate ' : 'Reactivate ') + noun} description={toggle.name} confirmLabel={toggle.active ? 'Deactivate' : 'Reactivate'} onCancel={() => setToggle(null)} onSubmit={async reason => { if (faculty) await client.updateFaculty(toggle.id, { isActive: !toggle.active, reason }); else await client.updateCentre(toggle.id, { isActive: !toggle.active, reason }); done(); }}/>} 
  </SetupCard>;
}