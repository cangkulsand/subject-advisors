import type { AcademicSetupClient } from './academic-client';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { checked, SetupForm, type Field } from './academic-ui';
import { AdminApiError } from './client';
import { curriculumVersionTaken, duplicateCodeMessage, findCodeOwner, moveErrorText, structurePath, type StructureAddress, type StructureData } from './academic-structure';

/** One dialog at a time on the Academic Structure page (S3-P004-038); "add" dialogs carry their parent, so they never ask for it. */
export type StructureDialog =
  | { kind: 'add-faculty' } | { kind: 'edit-faculty' | 'toggle-faculty'; row: C.Faculty }
  | { kind: 'add-department'; facultyId: number } | { kind: 'edit-department' | 'toggle-department'; row: C.Department }
  | { kind: 'add-programme'; departmentId: number } | { kind: 'edit-programme' | 'toggle-programme'; row: C.ProgrammeFaculty }
  | { kind: 'add-curriculum'; programmeId: number } | { kind: 'edit-curriculum' | 'toggle-curriculum'; row: C.Curriculum }
  | { kind: 'move-programme'; row: C.ProgrammeFaculty };

const optionalNumber = (value: string | undefined) => (value ?? '').trim() === '' ? null : Number(value);
const requiredNumber = (value: string | undefined) => (value ?? '').trim() === '' ? NaN : Number(value);
/** Stops a save that would reuse a code, naming the record that has it (S3-P004-038); the server message covers a race. */
function refuseTaken(kind: Parameters<typeof findCodeOwner>[0], code: string, data: Parameters<typeof findCodeOwner>[2], exceptId?: number) {
  const owner = findCodeOwner(kind, code, data, exceptId);
  if (owner) throw new AdminApiError(409, 'INVALID_REQUEST', duplicateCodeMessage(code.trim(), owner));
}

/** After a save: a message for the current level, or the address to go to when the open record moved. */
export type Saved = (outcome: { message?: string; next?: string }) => void;

export function StructureDialogs({ dialog, client, data, address, onClose, onSaved }: { dialog: StructureDialog; client: AcademicSetupClient; data: StructureData; address: StructureAddress; onClose: () => void; onSaved: Saved }) {
  const done = () => onSaved({});
  const programmeCode = (id: number) => data.programmes.find(p => p.programmeId === id)?.programmeCode ?? String(id);
  switch (dialog.kind) {
    case 'add-faculty': case 'edit-faculty': {
      const row = dialog.kind === 'edit-faculty' ? dialog.row : null;
      return <SetupForm title={row ? 'Edit faculty' : 'Add faculty'} fields={[{ key: 'code', label: 'Faculty code', maxLength: 20 }, { key: 'name', label: 'Faculty name', maxLength: 255 }]} initial={row ? { code: row.facultyCode, name: row.facultyName } : {}} onClose={onClose} onSave={async (v, reason) => {
        refuseTaken('faculty', v.code ?? '', data, row?.facultyId);
        const input = checked(C.validateCreateFacultyRequest({ facultyCode: v.code, facultyName: v.name, reason }));
        if (row) await client.updateFaculty(row.facultyId, input); else await client.createFaculty(input);
        done();
      }}/>;
    }
    case 'add-department': case 'edit-department': {
      const row = dialog.kind === 'edit-department' ? dialog.row : null;
      const fields: Field[] = [{ key: 'code', label: 'Department code', maxLength: 20 }, { key: 'name', label: 'Department name', maxLength: 255 }];
      // Moving a department to another faculty stays on its Edit form; adding one uses the open faculty.
      if (row) fields.push({ key: 'faculty', label: 'Faculty', options: data.faculties.filter(f => f.isActive || f.facultyId === row.facultyId).map(f => ({ value: String(f.facultyId), label: f.facultyName + (f.isActive ? '' : ' (inactive)') })) });
      return <SetupForm title={row ? 'Edit department' : 'Add department'} fields={fields} initial={row ? { code: row.departmentCode, name: row.departmentName, faculty: String(row.facultyId) } : {}} onClose={onClose} onSave={async (v, reason) => {
        const facultyId = row ? Number(v.faculty) : (dialog as { facultyId: number }).facultyId;
        refuseTaken('department', v.code ?? '', data, row?.departmentId);
        const input = checked(C.validateCreateDepartmentRequest({ departmentCode: v.code, departmentName: v.name, facultyId, reason }));
        if (!row) { await client.createDepartment(input); done(); return; }
        await client.updateDepartment(row.departmentId, input);
        const open = address.level === 'department' || address.level === 'programme' ? address : null;
        if (open && open.departmentId === row.departmentId && facultyId !== row.facultyId) onSaved({ next: structurePath({ ...open, facultyId }) });
        else if (facultyId !== row.facultyId) onSaved({ message: `Moved ${input.departmentCode} to ${data.faculties.find(f => f.facultyId === facultyId)?.facultyName ?? 'its new faculty'}.` });
        else done();
      }}/>;
    }
    case 'add-programme':
      return <SetupForm title="Add programme" fields={[{ key: 'code', label: 'Programme code', maxLength: 20 }, { key: 'name', label: 'Programme name', maxLength: 255 }]} initial={{}} onClose={onClose} onSave={async (v, reason) => {
        refuseTaken('programme', v.code ?? '', data);
        await client.createProgramme(checked(C.validateCreateProgrammeRequest({ programmeCode: v.code, programmeName: v.name, level: null, departmentId: dialog.departmentId, reason }))); done();
      }}/>;
    case 'edit-programme': {
      const row = dialog.row;
      return <SetupForm title="Edit programme" fields={[{ key: 'code', label: 'Programme code', maxLength: 20 }, { key: 'name', label: 'Programme name', maxLength: 255 }]} initial={{ code: row.programmeCode, name: row.programmeName }} onClose={onClose} onSave={async (v, reason) => {
        const body: Record<string, unknown> = { reason };
        if (v.code !== row.programmeCode) { refuseTaken('programme', v.code ?? '', data, row.programmeId); body.programmeCode = v.code; }
        if (v.name !== row.programmeName) body.programmeName = v.name;
        await client.updateProgramme(row.programmeId, checked(C.validateUpdateProgrammeRequest(body))); done();
      }}/>;
    }
    case 'add-curriculum': case 'edit-curriculum': {
      const row = dialog.kind === 'edit-curriculum' ? dialog.row : null;
      return <SetupForm title={row ? 'Edit curriculum' : 'Add curriculum'} fields={[{ key: 'version', label: 'Version', maxLength: 20 }, { key: 'credits', label: 'Total credits', type: 'number' }, { key: 'year', label: 'Effective year', type: 'number', optional: true }]} initial={row ? { version: row.curriculumVersion, credits: String(row.totalCreditRequired), year: row.effectiveYear === null ? '' : String(row.effectiveYear) } : {}} onClose={onClose} onSave={async (v, reason) => {
        const programmeId = row ? row.programmeId : (dialog as { programmeId: number }).programmeId;
        if (curriculumVersionTaken(programmeId, v.version ?? '', data.curricula, row?.curriculumId))
          throw new AdminApiError(409, 'INVALID_REQUEST', `This programme already has curriculum version ${(v.version ?? '').trim()}. Choose a different version.`);
        if (!row) {
          await client.createCurriculum(checked(C.validateCreateCurriculumRequest({ programmeId, curriculumVersion: v.version, totalCreditRequired: requiredNumber(v.credits), effectiveYear: optionalNumber(v.year), reason })));
          done(); return;
        }
        const body: Record<string, unknown> = { reason };
        if (v.version !== row.curriculumVersion) body.curriculumVersion = v.version;
        if (v.credits !== String(row.totalCreditRequired)) body.totalCreditRequired = requiredNumber(v.credits);
        if (optionalNumber(v.year) !== row.effectiveYear) body.effectiveYear = optionalNumber(v.year);
        await client.updateCurriculum(row.curriculumId, checked(C.validateUpdateCurriculumRequest(body))); done();
      }}/>;
    }
    case 'move-programme': return <ProgrammeMoveDialog client={client} programme={dialog.row} data={data} address={address} onClose={onClose} onSaved={onSaved}/>;
    case 'toggle-faculty': case 'toggle-department': case 'toggle-programme': case 'toggle-curriculum': {
      const active = dialog.row.isActive, verb = active ? 'Deactivate' : 'Reactivate', input = (reason: string) => ({ isActive: !active, reason });
      const curriculumToggle = (row: C.Curriculum) => ({ noun: 'curriculum', description: programmeCode(row.programmeId) + ' · ' + row.curriculumVersion, save: (reason: string) => client.updateCurriculum(row.curriculumId, input(reason)) });
      const toggle = dialog.kind === 'toggle-faculty' ? { noun: 'faculty', description: dialog.row.facultyName, save: (reason: string) => client.updateFaculty(dialog.row.facultyId, input(reason)) }
        : dialog.kind === 'toggle-department' ? { noun: 'department', description: dialog.row.departmentName, save: (reason: string) => client.updateDepartment(dialog.row.departmentId, input(reason)) }
        : dialog.kind === 'toggle-programme' ? { noun: 'programme', description: dialog.row.programmeCode + ' · ' + dialog.row.programmeName, save: (reason: string) => client.updateProgramme(dialog.row.programmeId, input(reason)) }
        : curriculumToggle(dialog.row as C.Curriculum);
      return <ReasonDialog title={verb + ' ' + toggle.noun} description={toggle.description} confirmLabel={verb} onCancel={onClose} onSubmit={async reason => { await toggle.save(reason); done(); }}/>;
    }
  }
}

/** Moves a programme to another department (and so possibly another faculty). No "None": a programme without a department drops out of the structure.
 * Only active departments of active faculties are offered; the database refuses the others. */
export function ProgrammeMoveDialog({ client, programme, data, address, onClose, onSaved }: { client: AcademicSetupClient; programme: C.ProgrammeFaculty; data: StructureData; address: StructureAddress; onClose: () => void; onSaved: Saved }) {
  const facultyName = (id: number) => data.faculties.find(f => f.facultyId === id)?.facultyName ?? String(id);
  const choices = data.departments.filter(d => d.isActive && d.departmentId !== programme.departmentId && data.faculties.some(f => f.facultyId === d.facultyId && f.isActive));
  return <SetupForm title={'Move programme · ' + programme.programmeCode} fields={[{ key: 'department', label: 'Department', options: choices.map(d => ({ value: String(d.departmentId), label: d.departmentName + ' · ' + facultyName(d.facultyId) })) }]} initial={{}} onClose={onClose} onSave={async (v, reason) => {
    const target = choices.find(d => String(d.departmentId) === v.department);
    try { await client.setProgrammeDepartment(programme.programmeId, checked(C.validateSetProgrammeDepartmentRequest({ departmentId: target ? target.departmentId : NaN, reason }))); }
    catch (error) { throw new AdminApiError(error instanceof AdminApiError ? error.status : 503, error instanceof AdminApiError ? error.code : 'MOVE_FAILED', moveErrorText(error, programme.programmeCode)); }
    if (target && address.level === 'programme' && address.programmeId === programme.programmeId)
      onSaved({ next: structurePath({ level: 'programme', facultyId: target.facultyId, departmentId: target.departmentId, programmeId: programme.programmeId }) });
    else onSaved({ message: `Moved ${programme.programmeCode} to ${target?.departmentName ?? 'its new department'}.` });
  }}>{v => { const chosen = choices.find(d => String(d.departmentId) === v.department); return chosen ? <p role="note">Faculty will be set to {facultyName(chosen.facultyId)}.</p> : null; }}</SetupForm>;
}
