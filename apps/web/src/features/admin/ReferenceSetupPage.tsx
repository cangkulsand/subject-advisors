import { useState } from 'react';
import type { AcademicSetupClient } from './academic-client';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { checked, SetupCard, SetupForm, SetupTable, StatusPill, useSetupRead } from './academic-ui';

type Reference = { id: number; code: string; name: string; active: boolean };
/** Learning centres. Faculties moved to the Academic Structure page (S3-P004-038). */
export function ReferenceSetupPage({ client }: { client: AcademicSetupClient }) {
  const noun = 'learning centre';
  const state = useSetupRead(async signal => ({ rows: (await client.centres(signal)).map(c => ({ id: c.learningCentreId, code: c.centreCode, name: c.centreName, active: c.isActive })) }), 'centre');
  const [edit, setEdit] = useState<Reference | 'new' | null>(null), [toggle, setToggle] = useState<Reference | null>(null), [success, setSuccess] = useState('');
  const done = () => { setEdit(null); setToggle(null); setSuccess('Academic setup saved.'); state.refresh(); };
  return <SetupCard title="Learning Centres" description="Learning centres where programmes are taught." {...state} success={success} action={<button className="admin-primary" disabled={!state.data} onClick={() => setEdit('new')}>Add {noun}</button>}>
    {!state.data?.rows.length ? <p>No learning centres configured.</p> : <SetupTable label="Learning centres" headings={['Code', 'Name', 'Status', 'Actions']}>{state.data.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td><StatusPill active={row.active}/></td><td><div className="admin-setup-actions"><button aria-label={'Edit ' + row.code} onClick={() => setEdit(row)}>Edit</button><button aria-label={(row.active ? 'Deactivate ' : 'Reactivate ') + row.code} onClick={() => setToggle(row)}>{row.active ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}</SetupTable>}
    {edit && <SetupForm title={(edit === 'new' ? 'Add ' : 'Edit ') + noun} fields={[{ key: 'code', label: 'Centre code', maxLength: 10 }, { key: 'name', label: 'Centre name', maxLength: 100 }]} initial={edit === 'new' ? {} : { code: edit.code, name: edit.name }} onClose={() => setEdit(null)} onSave={async (v, reason) => {
      const input = checked(C.validateCreateLearningCentreRequest({ centreCode: v.code, centreName: v.name, reason }));
      if (edit === 'new') await client.createCentre(input); else await client.updateCentre(edit.id, input);
      done();
    }}/>}
    {toggle && <ReasonDialog title={(toggle.active ? 'Deactivate ' : 'Reactivate ') + noun} description={toggle.name} confirmLabel={toggle.active ? 'Deactivate' : 'Reactivate'} onCancel={() => setToggle(null)} onSubmit={async reason => { await client.updateCentre(toggle.id, { isActive: !toggle.active, reason }); done(); }}/>}
  </SetupCard>;
}
