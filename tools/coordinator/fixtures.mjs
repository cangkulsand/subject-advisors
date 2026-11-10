// TEST-ONLY fictional coordinator forecasting API. Stateful, mirrors the documented routes, headers and error codes of
// apps/api/src/modules/forecasting. No credentials, no database, no network.
import { fixtureResponse } from '../admin/fixtures.mjs';

const generatedAt = '2026-11-01T08:00:00.000Z';
const programmes = [
  { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Bachelor of Computer Science (Software Engineering)' },
  { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Bachelor of Computer Science (Computer Networks and Security)' },
];
const learningCentres = [
  { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur' },
  { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' },
  { learningCentreId: 3, centreCode: 'PENANG', centreName: 'UTMSPACE Penang' },
];
const assignedScopes = [{ programmeId: 5, learningCentreId: 1 }, { programmeId: 5, learningCentreId: 2 }, { programmeId: 7, learningCentreId: 1 }];
const target = { semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 };
const capacity = { LAB: { min: 15, optimal: 25, normal: 35 }, LECTURE: { min: 15, optimal: 25, normal: 45 } };
export const scopeOf = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };

const failure = (status, code, message, details, headers) => ({ status, headers, payload: { error: { code, message, ...(details ? { details } : {}) } } });
const ok = (data, status = 200, headers) => ({ status, headers, payload: { data } });
const counts = { studentRows: 120, uniqueStudents: 55, validAttempts: 118, rejectedRows: 0, partialStudents: 3, unknownHistoryStudents: 1 };
const coverage = { studentsFound: 52, studentsWithRecords: 49, studentsWithoutRecords: 3, recordsMapped: 301, recordsUnmapped: 2, withdrawnStoredAsFailed: 4, excluded: { otherProgramme: 118, otherCentre: 0, inactiveAccess: 6 },
  centreNote: 'Students are counted under the learning centre saved in their profile. Students without a learning centre are excluded (counted under other centre).' };
const systemCounts = { studentRows: 52, uniqueStudents: 52, validAttempts: 301, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 3 };
const SYSTEM_FINGERPRINT = 's'.repeat(64);
const reportOf = (extra) => ({ validationId: '6f1c9d2e-0000-4000-8000-000000000001', validationRevision: 'sha256:rev1', status: 'VALID', counts, issues: [], completenessChanges: [], subsetAcknowledgementRequired: false, acceptedSnapshot: null, ...extra });
const errorIssues = [
  { severity: 'ERROR', code: 'UNKNOWN_SUBJECT_CODE', row: 14, field: 'subject_code', message: 'Subject code SECJ9999 is not in the curriculum.', correctiveAction: 'Use a subject code from the curriculum, or remove the row.' },
  { severity: 'ERROR', code: 'SEMESTER_ID_INVALID', row: 31, field: 'record_semester_id', message: 'Semester id must be a whole number.', correctiveAction: 'Enter the numeric semester id or leave it blank.' },
  { severity: 'WARNING', code: 'HISTORY_PARTIAL', row: null, field: null, message: '2 students have incomplete history after the rejected rows.', correctiveAction: 'Review those students if you need a precise forecast.' },
];

export function createState(options = {}) {
  const state = { seed: options.seed ?? 'empty', imports: [], runs: new Map(), nextImport: 1, nextRun: 1, pendingValidation: null, requests: [], bodies: [], failNext: null, staleNext: false, roles: ['COORDINATOR'], phase: 'planning', decisions: new Map(), decisionAudit: [], nextDecisionAudit: 1, picks: new Map(), ...options };
  if (state.seed !== 'empty' && state.seed !== 'system') addImport(state, 'September cohort');
  if (state.seed === 'system') { addSystemImport(state); addRun(state, 1); }
  if (state.seed === 'run') addRun(state, 1);
  if (state.seed === 'decided') {
    addRun(state, 1);
    if (state.secondImport) addImport(state, 'October cohort');
    decideSubject(state, 101, 'APPROVED'); decideSubject(state, 102, 'REMOVED'); decideSubject(state, 107, 'APPROVED');
  }
  return state;
}
function addImport(state, label) {
  const id = state.nextImport++;
  const item = { importBatchId: id, ...scopeOf, sourceDate: '2026-10-30', sourceLabel: label, acceptedAt: generatedAt, sourceFingerprint: 'f'.repeat(64), source: 'CSV', counts, snapshotStatus: 'ACCEPTED_IMMUTABLE' };
  state.imports.unshift(item);
  return item;
}
function addSystemImport(state, label = 'System students') {
  const id = state.nextImport++;
  const item = { importBatchId: id, ...scopeOf, sourceDate: '2026-11-02', sourceLabel: label, acceptedAt: generatedAt, sourceFingerprint: SYSTEM_FINGERPRINT, source: 'SYSTEM', counts: systemCounts, snapshotStatus: 'ACCEPTED_IMMUTABLE' };
  state.imports.unshift(item);
  return item;
}
function systemSnapshot(state, headers, body) {
  if (!headers['idempotency-key']) return failure(400, 'INVALID_REQUEST', 'Idempotency-Key is required by this fixture.');
  if (state.systemEmpty) return failure(422, 'SYSTEM_SNAPSHOT_EMPTY', 'No students in the system match this programme and learning centre, so there is nothing to snapshot. Upload a CSV instead.');
  const existing = state.imports.find(item => item.sourceFingerprint === SYSTEM_FINGERPRINT);
  const item = existing ?? addSystemImport(state, body.sourceLabel);
  return ok({ ...item, validationReport: systemReport(item) }, existing ? 200 : 201);
}
const systemReport = (item) => reportOf({ counts: systemCounts, source: 'SYSTEM', coverage, issues: [{ severity: 'WARNING', code: 'HISTORY_UNKNOWN', row: null, field: null, message: '3 students have no academic records in the system, so their history is unknown.', correctiveAction: 'Eligibility for these students stays uncertain until they enter their academic records.' }], acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint } });
const roster = (item) => Array.from({ length: 55 }, (_, index) => ({
  source: item?.source === 'SYSTEM' || (item?.source === 'COMBINED' && index < 40) ? 'SYSTEM' : 'CSV',
  importedStudentId: index + 1, externalReference: `ST${String(index + 1).padStart(4, '0')}`,
  studentName: index === 0 ? 'Aisyah <b>binti</b> Ahmad' : index === 2 ? null : `Fictional Student ${index + 1}`,
  curriculumVersion: '2023', cohortStatus: index % 11 === 0 ? 'DEFERRED' : 'ACTIVE', historyCompleteness: index % 9 === 0 ? 'PARTIAL' : 'COMPLETE',
}));

function section(id, number, students, rule, status = 'PENDING') {
  return { proposedSectionId: id, sectionNumber: number, expectedStudents: students, capacityRuleId: 1, minimumEnrollment: rule.min, breakEvenTarget: rule.optimal, normalMaximum: rule.normal, exceptionMaximum: null, reviewStatus: status, justification: null, reviewedBy: null, reviewedAt: null, flags: [] };
}
function subject(id, code, name, classType, supported, uncertain, reasons, near, sections, extra = {}) {
  return {
    subjectId: id, subjectCode: code, subjectName: name, creditHours: 3, classType, excluded: false, exclusionReason: null, semesterTypeExcluded: false, semesterTypeExclusionReason: null, supportedEligibleCount: supported, forecastCount: supported,
    uncertainStudentCount: uncertain, uncertaintyReasons: reasons.map(r => r[0]), uncertaintyReasonCounts: reasons.map(([reason, count]) => ({ reason, count })), nearGraduationCount: near,
    qualityStatus: uncertain > 0 ? 'PRELIMINARY' : 'SUPPORTED', configurationStatus: 'CONFIGURED', configurationIssue: null, configurationMessage: null, breakdown: supported > 0 || sections.length > 0 ? { inCurriculum: supported + uncertain + 5, alreadyPassed: 3, notOfferedInSemesterType: 1, prerequisiteNotMet: 1, supported, uncertain, retakeResolvedAsPassed: 1 } : null, decisionStatus: 'PENDING', allocatedStudents: supported, sections, ...extra,
  };
}
/** Roster behind a subject, consistent with its counts: supported (first `nearGraduationCount` of them near graduation), uncertain (reasons spread over the reason counts) and a few not counted. */
function subjectStudents(state, run, subjectRow) {
  const students = [];
  // Students 001-050 come from a CSV (matric reference); later ones entered their records in the portal (PORTAL-<id>): 051 has a matric number, 052-053 only a sign-in email, 054 neither.
  const make = (index, patch) => { const k = students.length + 1, n = String(k).padStart(3, '0'), portal = k > 50; students.push({ externalReference: portal ? `PORTAL-${k}` : `A22EC${n}`, matricNo: portal && k === 51 ? `A22EC9${n}` : null, email: portal && k !== 54 ? `student${n}@graduate.utm.my` : null, studentName: `${subjectRow.subjectCode} Student ${n}`, outcome: 'SUPPORTED', uncertaintyReasons: [], nearGraduation: false, remainingCredits: 60, passedByRetake: false, ...patch }); void index; };
  for (let i = 0; i < subjectRow.supportedEligibleCount; i++) make(i, i < subjectRow.nearGraduationCount ? { nearGraduation: true, remainingCredits: 12 + i } : {});
  const reasonList = subjectRow.uncertaintyReasonCounts;
  const reasons = Array.from({ length: subjectRow.uncertainStudentCount }, () => []);
  let cursor = 0;
  for (const { reason, count } of reasonList) for (let k = 0; k < count; k++) { reasons[cursor % reasons.length].push(reason); cursor++; }
  reasons.forEach(list => make(0, { outcome: 'UNCERTAIN', uncertaintyReasons: [...new Set(list)].sort(), remainingCredits: null }));
  if (subjectRow.sections.length > 0 || subjectRow.supportedEligibleCount > 0) {
    for (let i = 0; i < 3; i++) make(i, { outcome: 'PASSED', remainingCredits: 40, passedByRetake: i === 0 });
    make(0, { outcome: 'PREREQUISITE_NOT_MET', remainingCredits: 90 });
    make(0, { outcome: 'NOT_OFFERED', remainingCredits: 90 });
  }
  const count = (kind) => students.filter(student => student.outcome === kind).length;
  const breakdown = { inCurriculum: students.length, alreadyPassed: count('PASSED'), notOfferedInSemesterType: count('NOT_OFFERED'), prerequisiteNotMet: count('PREREQUISITE_NOT_MET'), supported: count('SUPPORTED'), uncertain: count('UNCERTAIN'), retakeResolvedAsPassed: students.filter(student => student.passedByRetake).length };
  return ok({
    forecastRunId: run.forecastRunId, subjectId: subjectRow.subjectId, subjectCode: subjectRow.subjectCode, subjectName: subjectRow.subjectName, catalogueMatchesRun: !state.catalogueChanged, emailsAvailable: !state.emailsUnavailable,
    summary: { inCurriculum: students.length, counted: breakdown.supported, uncertain: breakdown.uncertain, nearGraduation: subjectRow.nearGraduationCount, notCounted: breakdown.alreadyPassed + breakdown.prerequisiteNotMet + breakdown.notOfferedInSemesterType, breakdown, uncertaintyReasonCounts: reasonList },
    students: state.emailsUnavailable ? students.map(student => ({ ...student, email: null })) : students,
  });
}
function addRun(state, importBatchId) {
  const id = state.nextRun++;
  const lab = capacity.LAB, lec = capacity.LECTURE;
  const run = {
    forecastRunId: id, importBatchId, dataSource: state.imports.find(item => item.importBatchId === importBatchId)?.source ?? 'CSV', ...scopeOf, versionNumber: id, parentForecastRunId: null, status: 'DRAFT', demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', engineVersion: 'uc20-engine-1.1.0',
    generatedBy: 'user_test', generatedAt, finalizedBy: null, finalizedAt: null, assumptionNote: 'Potential demand is the supported eligible pool; it is not student registration.',
    subjects: [
      subject(101, 'SECJ1013', 'Programming Technique I', 'LAB', 46, 3, [['HISTORY_PARTIAL', 2], ['PREREQUISITE_EVIDENCE_MISSING', 1]], 4, [section(1, 1, 23, lab), section(2, 2, 23, lab)]),
      subject(102, 'SECJ1023', 'Programming Technique II', 'LAB', 14, 0, [], 0, [section(3, 1, 14, lab)]),
      subject(103, 'SCSJ1013', 'Discrete Structure', 'LECTURE', 71, 5, [['COHORT_STATUS_UNMAPPED', 5]], 12, [section(4, 1, 24, lec), section(5, 2, 24, lec), section(6, 3, 23, lec)]),
      subject(104, 'SECD2523', 'Database', null, 30, 0, [], 2, [], { configurationStatus: 'CONFIGURATION_REQUIRED', configurationIssue: 'CLASS_TYPE_MISSING', configurationMessage: 'The subject has no class type.', decisionStatus: 'NONE', forecastCount: 30, qualityStatus: 'SUPPORTED' }),
      { ...subject(105, 'SECJ4118', 'Final Year Project I', null, 0, 0, [], 0, []), excluded: true, exclusionReason: 'Final year project is not offered through the forecast.', configurationStatus: 'EXCLUDED', forecastCount: null, decisionStatus: 'NONE' },
      { ...subject(106, 'SECD3761', 'Seminar Keusahawanan Teknologi Maklumat', null, 0, 0, [], 0, [], { creditHours: 1 }), semesterTypeExcluded: true, semesterTypeExclusionReason: 'Runs only in Short semesters', configurationStatus: 'EXCLUDED', forecastCount: null, decisionStatus: 'NONE' },
    ],
    audit: [], nextSection: 7,
  };
  // `manySubjects`: 21 reviewed filler subjects listed before the real ones, so the subjects table has two pages and the pending subjects sit on page 2.
  if (state.manySubjects) { run.subjects.unshift(...Array.from({ length: 21 }, (_, i) => subject(200 + i, `FILL${String(1001 + i)}`, `Advanced filler ${String(i + 1).padStart(2, '0')}`, 'LECTURE', 20, 0, [], 0, [section(100 + i, 1, 20, lec, 'APPROVED')]))); run.nextSection = 300; }
  state.runs.set(id, run);
  return run;
}
const revisionOf = (run) => `fr${run.forecastRunId}.${run.status}.${run.audit.length}`;
function view(state, run) {
  for (const s of run.subjects) {
    s.sections.forEach(section => {
      section.flags = [];
      if (section.expectedStudents < section.minimumEnrollment) section.flags.push('BELOW_MINIMUM');
      if (section.expectedStudents < section.breakEvenTarget) section.flags.push('BELOW_OPTIMAL');
      if (section.expectedStudents > section.normalMaximum) section.flags.push('ABOVE_NORMAL_MAXIMUM');
    });
    const statuses = s.sections.map(x => x.reviewStatus);
    s.decisionStatus = !statuses.length ? 'NONE' : statuses.includes('PENDING') ? 'PENDING' : statuses.every(x => x === statuses[0]) ? statuses[0] : 'MIXED';
    s.allocatedStudents = s.sections.reduce((sum, x) => sum + x.expectedStudents, 0);
  }
  const forecast = run.subjects.filter(s => !s.excluded && !s.semesterTypeExcluded), sections = run.subjects.flatMap(s => s.sections);
  const summary = { subjects: run.subjects.length, excludedSubjects: run.subjects.filter(s => s.excluded).length, notOfferedInSemesterTypeSubjects: run.subjects.filter(s => s.semesterTypeExcluded).length, configurationRequiredSubjects: run.subjects.filter(s => s.configurationStatus === 'CONFIGURATION_REQUIRED').length, totalSupportedDemand: forecast.reduce((sum, s) => sum + s.supportedEligibleCount, 0), totalUncertain: forecast.reduce((sum, s) => sum + s.uncertainStudentCount, 0), totalSections: sections.length, pendingSections: sections.filter(x => x.reviewStatus === 'PENDING').length, sectionsBelowMinimum: sections.filter(x => x.flags.includes('BELOW_MINIMUM')).length, sectionsBelowOptimal: sections.filter(x => x.flags.includes('BELOW_OPTIMAL')).length, pendingSubjects: run.subjects.filter(s => s.sections.some(x => x.reviewStatus === 'PENDING')).length, subjectsBelowMinimum: run.subjects.filter(s => s.sections.some(x => x.flags.includes('BELOW_MINIMUM'))).length };
  const { audit, nextSection, ...header } = run; void audit; void nextSection;
  return { ...header, revision: revisionOf(run), summary, newerForecastAvailable: null, auditTruncated: false, audit: [], ruleSnapshot: {}, originalRecommendations: [] };
}
const unquote = (value) => value ? value.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1') : null;
const receipt = (run, status = 200) => ok({ resourceId: run.forecastRunId, ...scopeOf, acceptedAt: new Date().toISOString(), revision: revisionOf(run) }, status, { ETag: `"${revisionOf(run)}"` });

function scopeFromQuery(url) {
  const get = (key) => Number(url.searchParams.get(key));
  return { programmeId: get('programmeId'), learningCentreId: get('learningCentreId'), targetSemesterId: get('targetSemesterId') };
}
const inScope = (scope) => assignedScopes.some(pair => pair.programmeId === scope.programmeId && pair.learningCentreId === scope.learningCentreId);
const paginate = (items, url) => {
  const limit = Number(url.searchParams.get('limit') ?? 50), start = Number(url.searchParams.get('cursor') ?? 0);
  const slice = items.slice(start, start + limit);
  return { items: slice, ...(start + limit < items.length ? { nextCursor: String(start + limit) } : {}) };
};

/** `request` = { method, url (URL), headers (lowercase), body (text) }. Returns { status, headers?, payload?, text? } or null for unknown routes. */
export function handle(state, request) {
  const { method, url, headers, body } = request;
  state.requests.push({ path: url.pathname, search: url.search, method });
  if (url.pathname === '/api/me') return ok(fixtureResponse(url, state));
  if (state.failNext && url.pathname.startsWith('/api/coordinator')) { const next = state.failNext; state.failNext = null; return failure(next.status, next.code, next.message, next.details); }
  const route = url.pathname.replace('/api/coordinator/', '');
  if (!url.pathname.startsWith('/api/coordinator/')) return null;
  if (method !== 'GET') state.bodies.push({ method, path: url.pathname, headers, body: headers['content-type']?.startsWith('multipart') ? '[multipart]' : safeJson(body) });
  if (route === 'forecast-context') {
    // `noAssignments` / `noCurrentSemester` mirror the live DB-backed context (S2-P004-011): no scopes, and no semesters when none is marked current.
    if (state.noAssignments) return ok({ programmes: [], learningCentres: [], targetSemesters: state.noCurrentSemester ? [] : [target], assignedScopes: [], currentSemesterId: state.noCurrentSemester ? null : 1, targetSemesterId: state.noCurrentSemester ? null : 2, curricula: [], subjects: [] });
    if (state.noCurrentSemester) return ok({ programmes, learningCentres, targetSemesters: [], assignedScopes, currentSemesterId: null, targetSemesterId: null, curricula: [], subjects: [] });
    return ok({ programmes, learningCentres, targetSemesters: [target], semesters: [{ semesterId: 1, academicYear: '2026/2027', semesterNumber: 1 }, { ...target, ...selectionWindow(state) }, { semesterId: 3, academicYear: '2026/2027', semesterNumber: 3 }], assignedScopes, currentSemesterId: 1, targetSemesterId: 2, curricula: [], subjects: [] });
  }
  if (route === 'forecast-import-template' && url.searchParams.get('format') === 'coordinator') return { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="uc20-import-template-coordinator.csv"' }, text: ['courseCode,subjCode,centerName,stuname,stuMetricNo,eMail,SemesterMohon,grade,status', 'SECJH,SECJ1013,KUALA LUMPUR,ALI BIN ABU,SX230001ECJHF04,ali@example.com,2023/2024 1,B+,A', 'SECJH,SECJ1013,KUALA LUMPUR,ALI BIN ABU,SX230001ECJHF04,,,EX,A', ''].join('\n') };
  if (route === 'forecast-import-template') return { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="uc20-import-template.csv"' }, text: 'external_reference,curriculum_version,cohort_status,history_completeness,subject_code,subject_status,record_semester_id,recognized_credits,is_synthetic,student_name\n' };
  if (route === 'forecast-imports/system-snapshots' && method === 'POST') return systemSnapshot(state, headers, safeJson(body));
  if (route === 'forecast-imports/combined-snapshots' && method === 'POST') return upload(state, headers, body, true);
  if (route === 'forecast-imports' && method === 'POST') return upload(state, headers, body);
  const subset = /^forecast-imports\/([^/]+)\/subset-acceptances$/.exec(route);
  if (subset && method === 'POST') return acceptSubset(state, headers, safeJson(body));
  if (route === 'forecast-imports') {
    const scope = scopeFromQuery(url);
    if (!inScope(scope)) return failure(403, 'SCOPE_NOT_ASSIGNED', 'You are not assigned to this programme and learning centre.');
    return ok(paginate(state.imports.filter(item => item.programmeId === scope.programmeId && item.learningCentreId === scope.learningCentreId), url));
  }
  const importMatch = /^forecast-imports\/(\d+)(\/students)?$/.exec(route);
  if (importMatch) {
    const item = state.imports.find(entry => entry.importBatchId === Number(importMatch[1]));
    if (!item) return failure(404, 'IMPORT_NOT_FOUND', 'The import was not found.');
    if (importMatch[2]) return ok(paginate(roster(item), url));
    if (item.source === 'SYSTEM') return ok({ ...item, validationReport: systemReport(item) });
    if (item.source === 'COMBINED') return ok({ ...item, validationReport: combinedReport(item) });
    return ok({ ...item, validationReport: reportOf({ status: 'VALID', acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint } }) });
  }
  const decisionResult = handleDecisions(state, route, method, url, headers, body);
  if (decisionResult) return decisionResult;
  const runMatch = /^forecast-runs(?:\/(\d+)(?:\/subjects\/(\d+)\/students)?)?$/.exec(route);
  if (!runMatch) return null;
  if (!runMatch[1]) return method === 'POST' ? generate(state, safeJson(body)) : null;
  const run = state.runs.get(Number(runMatch[1]));
  if (!run) return failure(404, 'RUN_NOT_FOUND', 'The forecast was not found.');
  if (runMatch[2]) {
    const row = run.subjects.find(item => item.subjectId === Number(runMatch[2]));
    return row ? subjectStudents(state, run, row) : failure(404, 'RUN_SUBJECT_NOT_FOUND', 'The subject is not part of this forecast.');
  }
  return ok(view(state, run), 200, { ETag: `"${revisionOf(run)}"` });
}
function safeJson(text) { try { return text ? JSON.parse(text) : {}; } catch { return {}; } }

const coordinatorExport = { rowsRead: 11204, skippedOtherProgramme: 8120, skippedOtherCentre: 2450, skippedInactive: 31, skippedInactiveStudents: 12, unknownStatusRows: 0, unknownStatusValues: [], skippedInProgress: 212, olderAttemptsDropped: 164, skippedSubjectNotInCurriculum: 187, subjectsNotInCurriculum: [{ code: 'ULRS1022', count: 120 }, { code: 'ULRF2XX2', count: 67 }] };
const coordinatorWarning = { severity: 'WARNING', code: 'COORDINATOR_SUBJECTS_SKIPPED', row: null, field: 'subjCode', message: '187 row(s) were skipped because the subject is not in the curriculum: ULRS1022 (120), ULRF2XX2 (67).', correctiveAction: 'No action needed unless a listed subject should be in the curriculum; those rows were not used.' };
const COMBINED_FINGERPRINT = 'c'.repeat(64);
const combinedCoverage = { csv: { rows: 12, students: 9, rejectedRows: 0 }, students: 59, csvSkippedAlreadyInSystem: ['A100234', 'A100777'], possibleDuplicates: [{ csvReference: 'EXT-0042', systemReferences: ['PORTAL-17'] }] };
const combinedCounts = { studentRows: 64, uniqueStudents: 59, validAttempts: 312, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 3 };
const combinedIssues = [
  { severity: 'WARNING', code: 'CSV_STUDENTS_ALREADY_IN_SYSTEM', row: null, field: 'external_reference', message: '2 CSV students were skipped because the student is already in the system (the system record is used): A100234, A100777.', correctiveAction: 'No action needed; the system record is used for these students.' },
  { severity: 'WARNING', code: 'POSSIBLE_DUPLICATE_STUDENT', row: null, field: 'student_name', message: 'CSV student EXT-0042 has the same name as PORTAL-17 in the system but a different reference. Both are included.', correctiveAction: 'Check whether this is the same person as the system student; if so, remove the CSV row and create the snapshot again.' },
];
const combinedReport = (item, extra = {}) => reportOf({ counts: combinedCounts, source: 'COMBINED', coverage, combined: combinedCoverage, issues: combinedIssues, acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint }, ...extra });
function addCombinedImport(state, label) {
  const item = { importBatchId: state.nextImport++, ...scopeOf, sourceDate: '2026-10-30', sourceLabel: label, acceptedAt: generatedAt, sourceFingerprint: COMBINED_FINGERPRINT, source: 'COMBINED', counts: combinedCounts, snapshotStatus: 'ACCEPTED_IMMUTABLE' };
  state.imports.unshift(item);
  return item;
}
function upload(state, headers, body, combined = false) {
  if (state.pendingValidation) state.pendingValidation = null;
  const label = /name="sourceLabel"\r?\n\r?\n([^\r\n]*)/.exec(body)?.[1] ?? 'Upload';
  if (body.includes('REJECTME')) return { status: 422, payload: { error: { code: 'IMPORT_FILE_REJECTED', message: 'The file could not be read. Correct it and upload again.', report: reportOf({ status: 'FILE_REJECTED', counts: { ...counts, uniqueStudents: 0, rejectedRows: 0 }, issues: [{ severity: 'ERROR', code: 'CSV_HEADER_INVALID', row: 1, field: null, message: 'The header row does not match the template.', correctiveAction: 'Download the template and copy your data into it.' }] }) } } };
  if (body.includes('COORDEXPORT')) {
    state.pendingValidation = { label, combined };
    const extra = combined ? { source: 'COMBINED', coverage, combined: { ...combinedCoverage, csv: { rows: 12, students: 9, rejectedRows: 2 } } } : {};
    return { status: 422, headers: { ETag: '"sha256:rev1"' }, payload: { error: { code: 'IMPORT_CORRECTION_REQUIRED', message: 'Correct the rejected rows, or explicitly acknowledge them to accept the remaining valid rows.', report: reportOf({ status: 'CORRECTION_REQUIRED', counts: { ...(combined ? combinedCounts : counts), rejectedRows: 2 }, issues: [...errorIssues, coordinatorWarning], subsetAcknowledgementRequired: true, format: 'COORDINATOR', coordinatorExport, ...extra }) } } };
  }
  if (body.includes('BADROWS')) {
    state.pendingValidation = { label, combined };
    const extra = combined ? { source: 'COMBINED', coverage, combined: { ...combinedCoverage, csv: { rows: 12, students: 9, rejectedRows: 2 } } } : {};
    return { status: 422, headers: { ETag: '"sha256:rev1"' }, payload: { error: { code: 'IMPORT_CORRECTION_REQUIRED', message: 'Correct the rejected rows, or explicitly acknowledge them to accept the remaining valid rows.', report: reportOf({ status: 'CORRECTION_REQUIRED', counts: { ...(combined ? combinedCounts : counts), rejectedRows: 2 }, issues: combined ? [...errorIssues, ...combinedIssues] : errorIssues, subsetAcknowledgementRequired: true, ...extra }) } } };
  }
  if (combined) {
    const existing = state.imports.find(entry => entry.sourceFingerprint === COMBINED_FINGERPRINT);
    const made = existing ?? addCombinedImport(state, label);
    return ok({ ...made, validationReport: combinedReport(made) }, existing ? 200 : 201);
  }
  const item = addImport(state, label);
  return ok({ ...item, validationReport: reportOf({ acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint } }) }, 201);
}
function acceptSubset(state, headers, body) {
  if (!state.pendingValidation) return failure(404, 'IMPORT_NOT_FOUND', 'The import was not found.');
  if (unquote(headers['if-match']) !== 'sha256:rev1' || body.validationRevision !== 'sha256:rev1') return failure(412, 'IMPORT_REVISION_MISMATCH', 'The validation changed or does not match the revision you acknowledged. Review the report again.');
  if (body.acknowledgeRejectedRows !== true) return failure(400, 'INVALID_REQUEST', 'acknowledgeRejectedRows must be true.');
  if (state.pendingValidation.combined) {
    const made = addCombinedImport(state, state.pendingValidation.label);
    state.pendingValidation = null;
    return ok({ ...made, counts: { ...combinedCounts, rejectedRows: 2 }, validationReport: combinedReport(made, { status: 'CORRECTION_REQUIRED' }) }, 201);
  }
  const item = addImport(state, state.pendingValidation.label);
  state.pendingValidation = null;
  return ok({ ...item, counts: { ...counts, rejectedRows: 2 }, validationReport: reportOf({ status: 'CORRECTION_REQUIRED' }) }, 201);
}
function generate(state, body) {
  const existing = [...state.runs.values()].find(run => run.importBatchId === body.importBatchId);
  if (existing) return receipt(existing, 200);
  if (!state.imports.some(item => item.importBatchId === body.importBatchId)) return failure(404, 'IMPORT_NOT_FOUND', 'The import was not found.');
  return receipt(addRun(state, body.importBatchId), 201);
}
const dayMs = 24 * 60 * 60 * 1000;

// ---- Offering decisions (simplified flow): mirrors apps/api/src/modules/forecasting/decisions-routes.ts ----
const decisionCatalogue = new Map([
  [101, ['SECJ1013', 'Programming Technique I', 3, 'LAB']], [102, ['SECJ1023', 'Programming Technique II', 3, 'LAB']], [103, ['SCSJ1013', 'Discrete Structure', 3, 'LECTURE']],
  [104, ['SECD2523', 'Database', 3, null]], [105, ['SECJ4118', 'Final Year Project I', 3, null]], [106, ['SECD3761', 'Seminar Keusahawanan Teknologi Maklumat', 1, null]],
  [107, ['SECJ2203', 'Software Engineering', 3, 'LECTURE']],
]);
/** Selection window of the next semester for the fixture phase: planning (not scheduled, or `scheduled` opens in 10 days), open, or closed. */
function selectionWindow(state) {
  const at = (days) => new Date(Date.now() + days * dayMs).toISOString();
  if (state.phase === 'open') return { selectionOpensAt: at(-2), selectionClosesAt: at(10) };
  if (state.phase === 'closed') return { selectionOpensAt: at(-12), selectionClosesAt: at(-2) };
  return { selectionOpensAt: state.scheduled ? at(10) : null, selectionClosesAt: null };
}
function decisionRow(state, subjectId) {
  const stored = state.decisions.get(subjectId), [subjectCode, subjectName, creditHours, classType] = decisionCatalogue.get(subjectId);
  return { subjectId, subjectCode, subjectName, creditHours, classType, status: stored.status, decidedBy: 'user_test', decidedAt: stored.decidedAt };
}
function decideSubject(state, subjectId, status, importBatchId = 1) {
  const before = state.decisions.get(subjectId)?.status ?? 'PENDING';
  if (before === status) return { before, after: status, affectedPicks: 0 };
  let affectedPicks = 0;
  if (before === 'APPROVED') { affectedPicks = (state.picks.get(subjectId) ?? []).length; state.picks.delete(subjectId); }
  const stamp = new Date(Date.parse(generatedAt) + state.nextDecisionAudit * 60000).toISOString();
  if (status === 'PENDING') state.decisions.delete(subjectId); else state.decisions.set(subjectId, { status, decidedAt: stamp });
  const [subjectCode, subjectName] = decisionCatalogue.get(subjectId);
  state.decisionAudit.unshift({ auditId: state.nextDecisionAudit++, scope: scopeOf, subjectId, subjectCode, subjectName, beforeStatus: before, afterStatus: status, importBatchId, affectedPicks, recordedBy: 'user_test', recordedAt: stamp });
  return { before, after: status, affectedPicks };
}
function handleDecisions(state, route, method, url, headers, text) {
  const match = /^offering-decisions(?:\/(audit)|\/(\d+)\/pickers)?$/.exec(route);
  if (!match) return null;
  const phase = state.phase.toUpperCase();
  if (method === 'GET') {
    const scope = scopeFromQuery(url);
    if (!inScope(scope)) return failure(403, 'SCOPE_NOT_ASSIGNED', 'You are not assigned to this programme and learning centre.');
    if (match[1]) return ok(paginate(state.decisionAudit, url));
    if (match[2]) {
      const subjectId = Number(match[2]);
      if (!state.decisions.has(subjectId)) return failure(404, 'OFFERING_DECISION_NOT_FOUND', 'This subject has no decision in the scope.');
      const pickers = (state.picks.get(subjectId) ?? []).map(item => ({ studentId: item.studentId, studentName: item.studentName, matricNo: item.matricNo, email: state.emailsUnavailable ? null : item.email }));
      const row = decisionRow(state, subjectId);
      return ok({ scope: scopeOf, subjectId, subjectCode: row.subjectCode, subjectName: row.subjectName, pickCount: pickers.length, emailsAvailable: !state.emailsUnavailable, pickers });
    }
    const decisions = [...state.decisions.keys()].map(id => decisionRow(state, id)).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    return ok({
      scope: scopeOf, semester: { ...target, ...selectionWindow(state) }, phase, asOf: new Date().toISOString(), editable: scope.targetSemesterId === 2 && phase !== 'CLOSED', decisions,
      pickCounts: [...state.picks.entries()].filter(([id, list]) => state.decisions.get(id)?.status === 'APPROVED' && list.length > 0).map(([subjectId, list]) => ({ subjectId, pickCount: list.length })),
    });
  }
  if (method !== 'POST' || match[1] || match[2]) return failure(405, 'METHOD_NOT_ALLOWED', 'This method is not allowed.');
  if (!headers['idempotency-key']) return failure(400, 'INVALID_REQUEST', 'Idempotency-Key is required by this fixture.');
  const body = safeJson(text);
  if (!inScope(body.scope ?? {})) return failure(403, 'SCOPE_NOT_ASSIGNED', 'You are not assigned to this programme and learning centre.');
  if (body.scope.targetSemesterId !== 2) return failure(409, 'SEMESTER_READ_ONLY', 'Only the next semester can be planned.');
  if (phase === 'CLOSED') return failure(409, 'SELECTION_CLOSED', 'Selection for this semester has closed; decisions are locked.');
  if (!decisionCatalogue.has(body.subjectId)) return failure(422, 'DECISION_SUBJECT_NOT_FOUND', 'The subject is not in the programme catalogue.');
  if (body.subjectId === 105 && body.status === 'APPROVED') return failure(422, 'SUBJECT_EXCLUDED', 'Subjects excluded from the offering forecast cannot be approved.');
  if (state.staleDecision) { state.staleDecision = false; decideSubject(state, body.subjectId, state.decisions.has(body.subjectId) ? 'PENDING' : 'REMOVED'); }
  const current = state.decisions.get(body.subjectId)?.status ?? 'PENDING';
  if (body.status === body.expectedStatus) return ok({ subjectId: body.subjectId, beforeStatus: current, afterStatus: current, affectedPicks: 0, phase });
  if (current !== body.expectedStatus) return failure(409, 'DECISION_STALE', 'This subject was changed by someone else. Reload to see the current decision.');
  const result = decideSubject(state, body.subjectId, body.status, body.importBatchId ?? null);
  return ok({ subjectId: body.subjectId, beforeStatus: result.before, afterStatus: result.after, affectedPicks: result.affectedPicks, phase });
}
