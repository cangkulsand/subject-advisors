// Fictional browser fixtures only. These exercise UI behavior, not PostgreSQL enforcement.
const prefix = '/api/admin/academic-setup/';
export function academicStore(state) {
  return state.academic ??= {
    centres: state.empty ? [] : [{ learningCentreId: 1, centreCode: 'TEST', centreName: 'Fictional learning centre', isActive: true }],
    faculties: state.empty ? [] : [{ facultyId: 1, facultyCode: 'TEST', facultyName: 'Fictional faculty', isActive: true }, { facultyId: 2, facultyCode: 'OTHER', facultyName: 'Fictional other faculty', isActive: true }],
    departments: state.empty ? [] : [{ departmentId: 1, departmentCode: 'DEPT', departmentName: 'Fictional department', facultyId: 1, isActive: true }, { departmentId: 2, departmentCode: 'DOTHER', departmentName: 'Fictional other department', facultyId: 2, isActive: true }],
    programmes: state.empty ? [] : [{ programmeId: 1, programmeCode: 'TEST', programmeName: 'Fictional programme', level: 'Degree', isActive: true, facultyId: 1, departmentId: 1 }, { programmeId: 2, programmeCode: 'LEGACY', programmeName: 'Fictional legacy programme', level: null, isActive: true, facultyId: null, departmentId: null }],
    curricula: state.empty ? [] : [{ curriculumId: 1, programmeId: 1, curriculumVersion: '2026', totalCreditRequired: 120, effectiveYear: 2026, isActive: true, subjectCount: 3 }],
    semesters: state.empty ? [] : [1, 2, 3].map(n => ({ semesterId: n, academicYear: '2026/2027', semesterNo: n, semesterType: n === 3 ? 'SHORT' : 'NORMAL', maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, isCurrent: false, selectionOpensAt: null, selectionClosesAt: null })),
    assignments: state.empty ? [] : [{ assignmentId: 1, accountId: 2, facultyId: 1, programmeId: 1, learningCentreId: 1, startedAt: '2026-11-01T00:00:00Z', endedAt: null }],
  };
}
function programme(row, data) { return { ...row, faculty: data.faculties.find(f => f.facultyId === row.facultyId) ?? null, department: data.departments.find(d => d.departmentId === row.departmentId) ?? null }; }
export function academicResponse(url, state) {
  if (!url.pathname.startsWith(prefix)) return undefined;
  const data = academicStore(state), path = url.pathname.slice(prefix.length);
  if (path === 'learning-centres') return data.centres.filter(c => url.searchParams.get('includeInactive') === 'true' || c.isActive);
  if (path === 'faculties') return data.faculties.filter(f => url.searchParams.get('includeInactive') === 'true' || f.isActive);
  if (path === 'departments') return data.departments.filter(d => url.searchParams.get('includeInactive') === 'true' || d.isActive);
  if (path === 'programmes') return data.programmes.map(p => programme(p, data));
  if (path === 'curricula') return data.curricula;
  if (path === 'semesters') return data.semesters;
  if (path === 'current-semester') return data.semesters.find(s => s.isCurrent) ?? null;
  if (path === 'coordinator-assignments') return data.assignments;
  return undefined;
}
// Mirrors the real API catalogue message for CONFLICT (academic-errors.ts).
const conflictMessage = 'The change conflicts with the current state. Reload and retry.';
const failure = (status, code, message) => ({ status, payload: { error: { code, message } } });
export function academicMutation(method, url, body, state, accounts) {
  if (!url.pathname.startsWith(prefix)) return undefined;
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500) return failure(400, 'INVALID_REQUEST', 'A reason is required.');
  const data = academicStore(state), [path, rawId, action] = url.pathname.slice(prefix.length).split('/'), id = Number(rawId);
  const success = (row, status = 200) => ({ status, payload: { data: row } });
  if (path === 'learning-centres' || path === 'faculties') {
    const isCentre = path === 'learning-centres', rows = isCentre ? data.centres : data.faculties, key = isCentre ? 'learningCentreId' : 'facultyId', code = isCentre ? 'centreCode' : 'facultyCode', name = isCentre ? 'centreName' : 'facultyName';
    if (rows.some(r => r[code] === body[code] && r[key] !== id)) return failure(409, 'CONFLICT', 'Code already exists.');
    if (method === 'POST' && !rawId) { const row = { [key]: Math.max(0, ...rows.map(r => r[key])) + 1, [code]: body[code], [name]: body[name], isActive: true }; rows.push(row); return success(row, 201); }
    const row = rows.find(r => r[key] === id); if (!row) return failure(404, 'NOT_FOUND', 'Record not found.');
    if (method === 'PATCH') { for (const k of [code, name, 'isActive']) if (k in body) row[k] = body[k]; return success(row); }
  }
  if (path === 'departments') {
    if (method === 'POST' && !rawId) {
      if (data.departments.some(d => d.departmentCode === body.departmentCode)) return failure(409, 'CONFLICT', 'Code already exists.');
      if (!data.faculties.some(x => x.facultyId === body.facultyId && x.isActive)) return failure(409, 'REFERENCE_INACTIVE', 'Faculty is inactive.');
      const row = { departmentId: Math.max(0, ...data.departments.map(d => d.departmentId)) + 1, departmentCode: body.departmentCode, departmentName: body.departmentName, facultyId: body.facultyId, isActive: true }; data.departments.push(row); return success(row, 201);
    }
    const row = data.departments.find(d => d.departmentId === id); if (!row) return failure(404, 'NOT_FOUND', 'Department not found.');
    if (method === 'PATCH') {
      if (data.departments.some(d => d.departmentCode === body.departmentCode && d.departmentId !== id)) return failure(409, 'CONFLICT', 'Code already exists.');
      if ('facultyId' in body && body.facultyId !== row.facultyId && data.programmes.some(p => p.departmentId === id)) return failure(409, 'DEPARTMENT_HAS_PROGRAMMES', 'A department with programmes cannot move to another faculty. Reassign its programmes first.');
      for (const k of ['departmentCode', 'departmentName', 'facultyId', 'isActive']) if (k in body) row[k] = body[k]; return success(row);
    }
  }
  if (path === 'programmes' && !action) {
    const duplicate = code => data.programmes.some(p => p.programmeCode === code && p.programmeId !== id);
    if (method === 'POST' && !rawId) {
      if (duplicate(body.programmeCode)) return failure(409, 'CONFLICT', conflictMessage);
      const dept = data.departments.find(d => d.departmentId === body.departmentId); if (!dept) return failure(404, 'NOT_FOUND', 'The requested academic setup record was not found.');
      if (!dept.isActive) return failure(409, 'REFERENCE_INACTIVE', 'The selected reference must be active.');
      const row = { programmeId: Math.max(0, ...data.programmes.map(p => p.programmeId)) + 1, programmeCode: body.programmeCode, programmeName: body.programmeName, level: body.level ?? null, isActive: true, facultyId: dept.facultyId, departmentId: dept.departmentId }; data.programmes.push(row); return success(programme(row, data), 201);
    }
    const row = data.programmes.find(p => p.programmeId === id); if (!row) return failure(404, 'NOT_FOUND', 'The requested academic setup record was not found.');
    if (method === 'PATCH') {
      if ('programmeCode' in body && duplicate(body.programmeCode)) return failure(409, 'CONFLICT', conflictMessage);
      for (const k of ['programmeCode', 'programmeName', 'level', 'isActive']) if (k in body) row[k] = body[k]; return success(programme(row, data));
    }
  }
  if (path === 'curricula') {
    if (method === 'POST' && !rawId) {
      const owner = data.programmes.find(p => p.programmeId === body.programmeId); if (!owner) return failure(404, 'NOT_FOUND', 'The requested academic setup record was not found.');
      if (!owner.isActive) return failure(409, 'REFERENCE_INACTIVE', 'The selected reference must be active.');
      if (data.curricula.some(c => c.programmeId === body.programmeId && c.curriculumVersion === body.curriculumVersion)) return failure(409, 'CONFLICT', conflictMessage);
      const row = { curriculumId: Math.max(0, ...data.curricula.map(c => c.curriculumId)) + 1, programmeId: body.programmeId, curriculumVersion: body.curriculumVersion, totalCreditRequired: body.totalCreditRequired, effectiveYear: body.effectiveYear ?? null, isActive: true, subjectCount: 0 }; data.curricula.push(row); return success(row, 201);
    }
    const row = data.curricula.find(c => c.curriculumId === id); if (!row) return failure(404, 'NOT_FOUND', 'The requested academic setup record was not found.');
    if (method === 'PATCH') {
      for (const k of ['curriculumVersion', 'totalCreditRequired', 'effectiveYear', 'isActive']) if (k in body) row[k] = body[k]; return success(row);
    }
  }
  if (path === 'programmes' && method === 'PATCH' && action === 'department') {
    const row = data.programmes.find(p => p.programmeId === id); if (!row) return failure(404, 'NOT_FOUND', 'Programme not found.');
    const target = body.departmentId === null ? null : data.departments.find(d => d.departmentId === body.departmentId);
    if (body.departmentId !== null && !target) return failure(404, 'NOT_FOUND', 'Department not found.');
    if (target && !target.isActive && row.departmentId !== target.departmentId) return failure(409, 'REFERENCE_INACTIVE', 'Department is inactive.');
    const facultyId = target ? target.facultyId : (row.departmentId === null ? row.facultyId : null);
    if (data.assignments.some(a => a.programmeId === id && !a.endedAt && a.facultyId !== facultyId)) return failure(409, 'ASSIGNMENT_ACTIVE', 'End active coordinator assignments before changing this faculty.');
    row.departmentId = target ? target.departmentId : null; row.facultyId = facultyId; return success(programme(row, data));
  }
  if (path === 'semesters') {
    const fields = { ...body }; delete fields.reason;
    if (method === 'POST' && !rawId) { const row = { ...fields, semesterId: Math.max(0, ...data.semesters.map(s => s.semesterId)) + 1, isCurrent: false }; data.semesters.push(row); return success(row, 201); }
    const row = data.semesters.find(s => s.semesterId === id); if (!row) return failure(404, 'NOT_FOUND', 'Semester not found.');
    if (method === 'PATCH') { Object.assign(row, fields); return success(row); }
  }
  if (path === 'current-semester' && method === 'PUT') {
    const row = data.semesters.find(s => s.semesterId === body.semesterId); if (!row) return failure(404, 'NOT_FOUND', 'Semester not found.');
    data.semesters.forEach(s => { s.isCurrent = s === row; }); return success(row);
  }
  if (path === 'coordinator-assignments') {
    if (method === 'POST' && action === 'end') { const row = data.assignments.find(a => a.assignmentId === id); if (!row) return failure(404, 'NOT_FOUND', 'Assignment not found.'); if (row.endedAt) return failure(409, 'ASSIGNMENT_ENDED', 'Assignment already ended.'); row.endedAt = '2026-11-02T00:00:00Z'; return success(row); }
    if (method === 'POST' && !rawId) {
      const account = accounts.find(a => a.accountId === body.accountId); if (!account?.roles.includes('COORDINATOR')) return failure(409, 'COORDINATOR_ROLE_REQUIRED', 'Coordinator role required.');
      if (account.accessStatus !== 'ACTIVE') return failure(409, 'ACCOUNT_INACTIVE', 'Account inactive.');
      if (!data.faculties.some(f => f.facultyId === body.facultyId && f.isActive) || !data.centres.some(c => c.learningCentreId === body.learningCentreId && c.isActive)) return failure(409, 'REFERENCE_INACTIVE', 'Reference inactive.');
      if (!data.programmes.some(p => p.programmeId === body.programmeId && p.facultyId === body.facultyId)) return failure(409, 'PROGRAMME_FACULTY_MISMATCH', 'Programme faculty mismatch.');
      if (data.assignments.some(a => !a.endedAt && a.accountId === body.accountId && a.programmeId === body.programmeId && a.learningCentreId === body.learningCentreId)) return failure(409, 'ASSIGNMENT_ACTIVE', 'An active assignment already exists.');
      const row = { assignmentId: Math.max(0, ...data.assignments.map(a => a.assignmentId)) + 1, accountId: body.accountId, facultyId: body.facultyId, programmeId: body.programmeId, learningCentreId: body.learningCentreId, startedAt: '2026-11-02T00:00:00Z', endedAt: null }; data.assignments.push(row); return success(row, 201);
    }
  }
  return failure(405, 'METHOD_NOT_ALLOWED', 'Method not supported.');
}