import { useState } from 'react';
import type { AcademicSetupClient } from './academic-client';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { checked, SetupCard, SetupForm, SetupTable, useSetupRead } from './academic-ui';

/** Faculty -> Department -> Programme: departments belong to one faculty; programmes are assigned by department. */
export function DepartmentsPage({ client }: { client: AcademicSetupClient }) {
  const state = useSetupRead(async signal => ({ faculties: await client.faculties(signal), departments: await client.departments(signal) }), 'departments');
  const [edit, setEdit] = useState<C.Department | 'new' | null>(null), [toggle, setToggle] = useState<C.Department | null>(null), [success, setSuccess] = useState('');
  const done = () => { setEdit(null); setToggle(null); setSuccess('Academic setup saved.'); state.refresh(); };
  const facultyName = (id: number) => state.data?.faculties.find(f => f.facultyId === id)?.facultyName ?? String(id);
  return <SetupCard title="Departments" {...state} success={success} action={<button className="admin-primary" disabled={!state.data} onClick={() => setEdit('new')}>Add department</button>}>
    {!state.data?.departments.length ? <p>No departments configured.</p> : <SetupTable label="Departments" headings={['Code', 'Name', 'Faculty', 'Status', 'Actions']}>{state.data.departments.map(row => <tr key={row.departmentId}><td>{row.departmentCode}</td><td>{row.departmentName}</td><td>{facultyName(row.facultyId)}</td><td>{row.isActive ? 'Active' : 'Inactive'}</td><td><button onClick={() => setEdit(row)}>Edit {row.departmentCode}</button> <button onClick={() => setToggle(row)}>{row.isActive ? 'Deactivate' : 'Reactivate'} {row.departmentCode}</button></td></tr>)}</SetupTable>}
    {edit && <SetupForm title={edit === 'new' ? 'Add department' : 'Edit department'} fields={[{ key: 'code', label: 'Department code', maxLength: 20 }, { key: 'name', label: 'Department name', maxLength: 255 }, { key: 'faculty', label: 'Faculty', options: state.data!.faculties.filter(f => f.isActive || (edit !== 'new' && f.facultyId === edit.facultyId)).map(f => ({ value: String(f.facultyId), label: f.facultyName + (f.isActive ? '' : ' (inactive)') })) }]} initial={edit === 'new' ? {} : { code: edit.departmentCode, name: edit.departmentName, faculty: String(edit.facultyId) }} onClose={() => setEdit(null)} onSave={async (v, reason) => {
      const input = checked(C.validateCreateDepartmentRequest({ departmentCode: v.code, departmentName: v.name, facultyId: Number(v.faculty), reason }));
      if (edit === 'new') await client.createDepartment(input); else await client.updateDepartment(edit.departmentId, input);
      done();
    }}/>}
    {toggle && <ReasonDialog title={(toggle.isActive ? 'Deactivate ' : 'Reactivate ') + 'department'} description={toggle.departmentName} confirmLabel={toggle.isActive ? 'Deactivate' : 'Reactivate'} onCancel={() => setToggle(null)} onSubmit={async reason => { await client.updateDepartment(toggle.departmentId, { isActive: !toggle.isActive, reason }); done(); }}/>}
  </SetupCard>;
}
