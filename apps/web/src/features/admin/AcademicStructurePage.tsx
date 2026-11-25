import { useState, type ReactNode } from 'react';
import type { AcademicSetupClient } from './academic-client';
import type * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { AppLink, navigateApp } from '../../app/navigation';
import { SetupCard, SetupTable, StatusPill, useSetupRead } from './academic-ui';
import { curriculumIntakeLines } from './intake-labels';
import {
  countLabel, curriculumCount, departmentCount, orphanProgrammes, parseStructurePath, programmeCount, resolveStructure, structurePath,
  type ResolvedStructure, type StructureAddress, type StructureData,
} from './academic-structure';
import { StructureDialogs, type StructureDialog } from './StructureDialogs';

const ROOT: StructureAddress = { level: 'faculties' };
type Crumb = { label: string; href: string };

function crumbsFor(resolved: ResolvedStructure): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Faculties', href: structurePath(ROOT) }];
  if (resolved.level === 'faculties' || resolved.level === 'missing') return crumbs;
  const { faculty } = resolved;
  crumbs.push({ label: faculty.facultyCode, href: structurePath({ level: 'faculty', facultyId: faculty.facultyId }) });
  if (resolved.level === 'faculty') return crumbs;
  const { department } = resolved;
  crumbs.push({ label: department.departmentCode, href: structurePath({ level: 'department', facultyId: faculty.facultyId, departmentId: department.departmentId }) });
  if (resolved.level === 'department') return crumbs;
  crumbs.push({ label: resolved.programme.programmeCode, href: structurePath({ level: 'programme', facultyId: faculty.facultyId, departmentId: department.departmentId, programmeId: resolved.programme.programmeId }) });
  return crumbs;
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return <nav className="admin-breadcrumb" aria-label="Academic structure path"><ol>{crumbs.map((crumb, index) => <li key={crumb.href}>
    {index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <AppLink href={crumb.href}>{crumb.label}</AppLink>}
  </li>)}</ol></nav>;
}

/** The open record: code, name and status with its own Edit and Deactivate/Reactivate. */
function Summary({ code, name, active, onEdit, onToggle, children }: { code: string; name: string; active: boolean; onEdit: () => void; onToggle: () => void; children?: ReactNode }) {
  return <div className="admin-structure-summary-row"><dl className="admin-structure-summary"><div><dt>Code</dt><dd>{code}</dd></div><div><dt>Name</dt><dd>{name}</dd></div><div><dt>Status</dt><dd><StatusPill active={active}/></dd></div></dl>
    <RowActions code={code} active={active} onEdit={onEdit} onToggle={onToggle}>{children}</RowActions></div>;
}

function RowActions({ code, active, onEdit, onToggle, children }: { code: string; active: boolean; onEdit: () => void; onToggle: () => void; children?: ReactNode }) {
  return <div className="admin-setup-actions"><button aria-label={'Edit ' + code} onClick={onEdit}>Edit</button>{children}<button aria-label={(active ? 'Deactivate ' : 'Reactivate ') + code} onClick={onToggle}>{active ? 'Deactivate' : 'Reactivate'}</button></div>;
}

const descriptions = {
  faculties: () => 'Faculties own departments; departments own programmes; programmes own curricula.',
  faculty: (r: Extract<ResolvedStructure, { level: 'faculty' }>) => 'Departments in ' + r.faculty.facultyName + '.',
  department: (r: Extract<ResolvedStructure, { level: 'department' }>) => 'Programmes in ' + r.department.departmentName + '.',
  programme: (r: Extract<ResolvedStructure, { level: 'programme' }>) => 'Curricula of ' + r.programme.programmeName + '.',
};

/** Academic Structure (S3-P004-038): Faculty → Department → Programme → Curriculum; each level lists only the open parent's children. */
export function AcademicStructurePage({ client, pathname }: { client: AcademicSetupClient; pathname: string }) {
  const address = parseStructurePath(pathname) ?? ROOT;
  const state = useSetupRead<StructureData>(async signal => {
    const [faculties, departments, programmes, curricula] = await Promise.all([client.faculties(signal), client.departments(signal), client.programmes(signal), client.curricula(signal)]);
    return { faculties, departments, programmes, curricula };
  }, 'academic-structure');
  const [dialog, setDialog] = useState<StructureDialog | null>(null), [success, setSuccess] = useState('');
  const data = state.data, resolved = data ? resolveStructure(address, data) : null;
  const onSaved = ({ message, next }: { message?: string; next?: string }) => {
    setDialog(null);
    if (next) { navigateApp(next, { replace: true }); return; }
    setSuccess(message ?? 'Academic setup saved.'); state.refresh();
  };

  let description = descriptions.faculties(), action: ReactNode = null, body: ReactNode = null;
  if (data && resolved) {
    const link = (target: StructureAddress, label: string) => <AppLink href={structurePath(target)}>{label}</AppLink>;
    const addButton = (label: string, open: StructureDialog, parentActive = true) => <button className="admin-primary" disabled={!parentActive} onClick={() => setDialog(open)}>{label}</button>;
    const inactiveNote = (parent: string, children: string, active: boolean) => active ? null : <p role="note" className="admin-muted">Reactivate this {parent} to add {children}.</p>;
    switch (resolved.level) {
      case 'missing':
        description = 'Academic setup by faculty.';
        body = <div><p role="alert" className="admin-form-error">This record is not here any more.</p><AppLink href={structurePath(ROOT)}>Back to Faculties</AppLink></div>;
        break;
      case 'faculties':
        action = addButton('Add faculty', { kind: 'add-faculty' });
        body = <><Orphans programmes={orphanProgrammes(data)} open={setDialog}/>{!data.faculties.length ? <p>No faculties configured.</p> : <SetupTable label="Faculties" headings={['Code', 'Name', 'Departments', 'Status', 'Actions']}>{data.faculties.map(row => <tr key={row.facultyId}>
          <td>{link({ level: 'faculty', facultyId: row.facultyId }, row.facultyCode)}</td><td>{row.facultyName}</td><td>{countLabel(departmentCount(row.facultyId, data), 'department', 'departments')}</td><td><StatusPill active={row.isActive}/></td>
          <td><RowActions code={row.facultyCode} active={row.isActive} onEdit={() => setDialog({ kind: 'edit-faculty', row })} onToggle={() => setDialog({ kind: 'toggle-faculty', row })}/></td></tr>)}</SetupTable>}</>;
        break;
      case 'faculty': {
        const { faculty, departments } = resolved;
        description = descriptions.faculty(resolved);
        action = addButton('Add department', { kind: 'add-department', facultyId: faculty.facultyId }, faculty.isActive);
        body = <>
          <Summary code={faculty.facultyCode} name={faculty.facultyName} active={faculty.isActive} onEdit={() => setDialog({ kind: 'edit-faculty', row: faculty })} onToggle={() => setDialog({ kind: 'toggle-faculty', row: faculty })}/>
          {inactiveNote('faculty', 'departments', faculty.isActive)}
          {!departments.length ? <p>No departments in this faculty yet.</p> : <SetupTable label="Departments" headings={['Code', 'Name', 'Programmes', 'Status', 'Actions']}>{departments.map(row => <tr key={row.departmentId}>
            <td>{link({ level: 'department', facultyId: faculty.facultyId, departmentId: row.departmentId }, row.departmentCode)}</td><td>{row.departmentName}</td><td>{countLabel(programmeCount(row.departmentId, data), 'programme', 'programmes')}</td><td><StatusPill active={row.isActive}/></td>
            <td><RowActions code={row.departmentCode} active={row.isActive} onEdit={() => setDialog({ kind: 'edit-department', row })} onToggle={() => setDialog({ kind: 'toggle-department', row })}/></td></tr>)}</SetupTable>}
        </>;
        break;
      }
      case 'department': {
        const { faculty, department, programmes } = resolved;
        description = descriptions.department(resolved);
        // The database refuses a programme whose faculty is inactive, so both parents must be active.
        action = addButton('Add programme', { kind: 'add-programme', departmentId: department.departmentId }, department.isActive && faculty.isActive);
        body = <>
          <Summary code={department.departmentCode} name={department.departmentName} active={department.isActive} onEdit={() => setDialog({ kind: 'edit-department', row: department })} onToggle={() => setDialog({ kind: 'toggle-department', row: department })}/>
          {inactiveNote('department', 'programmes', department.isActive)}
          {department.isActive && !faculty.isActive && <p role="note" className="admin-muted">Reactivate faculty {faculty.facultyCode} to add programmes.</p>}
          {!programmes.length ? <p>No programmes in this department yet.</p> : <SetupTable label="Programmes" headings={['Code', 'Name', 'Curricula', 'Status', 'Actions']}>{programmes.map(row => <tr key={row.programmeId}>
            <td>{link({ level: 'programme', facultyId: faculty.facultyId, departmentId: department.departmentId, programmeId: row.programmeId }, row.programmeCode)}</td><td>{row.programmeName}</td><td>{countLabel(curriculumCount(row.programmeId, data), 'curriculum', 'curricula')}</td><td><StatusPill active={row.isActive}/></td>
            <td><RowActions code={row.programmeCode} active={row.isActive} onEdit={() => setDialog({ kind: 'edit-programme', row })} onToggle={() => setDialog({ kind: 'toggle-programme', row })}><MoveButton code={row.programmeCode} onClick={() => setDialog({ kind: 'move-programme', row })}/></RowActions></td></tr>)}</SetupTable>}
        </>;
        break;
      }
      case 'programme': {
        const { programme, curricula } = resolved;
        description = descriptions.programme(resolved);
        action = addButton('Add curriculum', { kind: 'add-curriculum', programmeId: programme.programmeId }, programme.isActive);
        body = <>
          <Summary code={programme.programmeCode} name={programme.programmeName} active={programme.isActive} onEdit={() => setDialog({ kind: 'edit-programme', row: programme })} onToggle={() => setDialog({ kind: 'toggle-programme', row: programme })}><MoveButton code={programme.programmeCode} onClick={() => setDialog({ kind: 'move-programme', row: programme })}/></Summary>
          {inactiveNote('programme', 'curricula', programme.isActive)}
          {!curricula.length ? <p>No curricula for this programme yet.</p> : <CurriculaTable code={programme.programmeCode} curricula={curricula} open={setDialog}/>}
        </>;
        break;
      }
    }
  } else action = <button className="admin-primary" disabled>{address.level === 'faculties' ? 'Add faculty' : address.level === 'faculty' ? 'Add department' : address.level === 'department' ? 'Add programme' : 'Add curriculum'}</button>;

  return <SetupCard title="Academic Structure" description={description} data={data} error={state.error} refresh={state.refresh} success={success} action={action}>
    {resolved && <Breadcrumb crumbs={crumbsFor(resolved)}/>}
    {body}
    {dialog && data && <StructureDialogs dialog={dialog} client={client} data={data} address={address} onClose={() => setDialog(null)} onSaved={onSaved}/>}
  </SetupCard>;
}

function MoveButton({ code, onClick }: { code: string; onClick: () => void }) { return <button aria-label={'Move ' + code} onClick={onClick}>Move</button>; }

/** Programmes with no department cannot be reached through the structure, so the Faculties page lists them with a Move action. */
function Orphans({ programmes, open }: { programmes: C.ProgrammeFaculty[]; open: (dialog: StructureDialog) => void }) {
  if (!programmes.length) return null;
  const text = programmes.length === 1 ? '1 programme has no department. Move it into a department so it appears in the structure.'
    : programmes.length + ' programmes have no department. Move each one into a department so it appears in the structure.';
  return <section className="admin-orphans" aria-label="Programmes with no department"><p>{text}</p><ul>{programmes.map(row => <li key={row.programmeId}>
    <span>{row.programmeCode} · {row.programmeName}</span><MoveButton code={row.programmeCode} onClick={() => open({ kind: 'move-programme', row })}/></li>)}</ul></section>;
}

function CurriculaTable({ code, curricula, open }: { code: string; curricula: C.Curriculum[]; open: (dialog: StructureDialog) => void }) {
  return <SetupTable label="Curriculums" headings={['Version', 'Total credits', 'Effective year', 'Status', 'Subjects', 'Students by intake', 'Actions']}>{curricula.map(row => <tr key={row.curriculumId}>
    <td>{row.curriculumVersion}</td><td>{row.totalCreditRequired}</td><td>{row.effectiveYear ?? ''}</td><td><StatusPill active={row.isActive}/></td>
    <td><a href={'/admin/curriculum?curriculum=' + row.curriculumId}>{row.subjectCount} subjects</a></td>
    <td><ul className="admin-intakes">{curriculumIntakeLines(row.intakes).map(line => <li key={line.label}><span>{line.students === null ? line.label : line.label + ':'}</span>{line.students !== null && <> {line.students}</>}</li>)}</ul></td>
    <td><RowActions code={code + ' ' + row.curriculumVersion} active={row.isActive} onEdit={() => open({ kind: 'edit-curriculum', row })} onToggle={() => open({ kind: 'toggle-curriculum', row })}/></td></tr>)}</SetupTable>;
}
