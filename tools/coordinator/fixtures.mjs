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
  centreNote: 'Interim: student profiles do not record a learning centre yet, so every student in the system counts under Kuala Lumpur (KL) until they do.' };
const systemCounts = { studentRows: 52, uniqueStudents: 52, validAttempts: 301, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 3 };
const SYSTEM_FINGERPRINT = 's'.repeat(64);
const reportOf = (extra) => ({ validationId: '6f1c9d2e-0000-4000-8000-000000000001', validationRevision: 'sha256:rev1', status: 'VALID', counts, issues: [], completenessChanges: [], subsetAcknowledgementRequired: false, acceptedSnapshot: null, ...extra });
const errorIssues = [
  { severity: 'ERROR', code: 'UNKNOWN_SUBJECT_CODE', row: 14, field: 'subject_code', message: 'Subject code SECJ9999 is not in the curriculum.', correctiveAction: 'Use a subject code from the curriculum, or remove the row.' },
  { severity: 'ERROR', code: 'SEMESTER_ID_INVALID', row: 31, field: 'record_semester_id', message: 'Semester id must be a whole number.', correctiveAction: 'Enter the numeric semester id or leave it blank.' },
  { severity: 'WARNING', code: 'HISTORY_PARTIAL', row: null, field: null, message: '2 students have incomplete history after the rejected rows.', correctiveAction: 'Review those students if you need a precise forecast.' },
];

export function createState(options = {}) {
  const state = { seed: options.seed ?? 'empty', imports: [], runs: new Map(), nextImport: 1, nextRun: 1, pendingValidation: null, newer: {}, confirmation: null, newerConf: null, nextConfAudit: 1, requests: [], bodies: [], failNext: null, staleNext: false, roles: ['COORDINATOR'], ...options };
  if (state.seed !== 'empty' && state.seed !== 'system') addImport(state, 'September cohort');
  if (state.seed === 'system') { addSystemImport(state); addRun(state, 1); }
  if (state.seed === 'run' || state.seed === 'review') { const run = addRun(state, 1); if (state.seed === 'review') startReview(state, run, 'user_test'); }
  if (state.seed === 'finalized' || state.seed === 'confirmed') finalizeRun(state, addRun(state, 1));
  if (state.secondFinalized) { addImport(state, 'October cohort'); finalizeRun(state, addRun(state, 2)); }
  if (state.seed === 'confirmed') seedConfirmation(state);
  return state;
}
function finalizeRun(state, run) {
  startReview(state, run, 'user_test');
  for (const s of run.subjects) for (const section of s.sections) section.reviewStatus = 'APPROVED';
  run.status = 'FINALIZED'; run.finalizedBy = 'user_test'; run.finalizedAt = '2026-11-01T09:00:00.000Z';
  run.audit.unshift(auditEntry(state, run, 'FINALIZE', null, 'Finalized for planning.'));
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
const roster = () => Array.from({ length: 55 }, (_, index) => ({
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
    qualityStatus: uncertain > 0 ? 'PRELIMINARY' : 'SUPPORTED', configurationStatus: 'CONFIGURED', configurationIssue: null, configurationMessage: null, breakdown: null, decisionStatus: 'PENDING', allocatedStudents: supported, sections, ...extra,
  };
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
    audit: [], nextSection: 7, nextAudit: 1,
  };
  if (state.seed === 'review' || state.bulkAudit) for (let i = 0; i < 24; i++) run.audit.push(auditEntry(state, run, 'REVIEW', 102, `Earlier note ${24 - i}`));
  state.runs.set(id, run);
  return run;
}
function auditEntry(state, run, action, subjectId, reason, before = { status: 'DRAFT' }, after = { status: 'UNDER_REVIEW' }) {
  return { decisionAuditId: run.nextAudit++, forecastRunId: run.forecastRunId, scope: scopeOf, subjectId, proposedSectionId: null, actionType: action, recordedBy: 'user_test', recordedAt: new Date(Date.parse(generatedAt) + run.nextAudit * 60000).toISOString(), reason, before, after };
}
function startReview(state, run, actor) { run.status = 'UNDER_REVIEW'; run.audit.unshift(auditEntry(state, run, 'START_REVIEW', null, 'Review started.')); void actor; }

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
  const summary = { subjects: run.subjects.length, excludedSubjects: run.subjects.filter(s => s.excluded).length, notOfferedInSemesterTypeSubjects: run.subjects.filter(s => s.semesterTypeExcluded).length, configurationRequiredSubjects: run.subjects.filter(s => s.configurationStatus === 'CONFIGURATION_REQUIRED').length, totalSupportedDemand: forecast.reduce((sum, s) => sum + s.supportedEligibleCount, 0), totalUncertain: forecast.reduce((sum, s) => sum + s.uncertainStudentCount, 0), totalSections: sections.length, pendingSections: sections.filter(x => x.reviewStatus === 'PENDING').length, sectionsBelowMinimum: sections.filter(x => x.flags.includes('BELOW_MINIMUM')).length, sectionsBelowOptimal: sections.filter(x => x.flags.includes('BELOW_OPTIMAL')).length };
  const { audit, nextSection, nextAudit, ...header } = run; void audit; void nextSection; void nextAudit;
  return { ...header, revision: revisionOf(run), summary, newerForecastAvailable: state.newer[run.forecastRunId] ?? null, auditTruncated: false, audit: [], ruleSnapshot: {}, originalRecommendations: [] };
}
const summaryOf = (state, run) => { const { subjects, ruleSnapshot, originalRecommendations, audit, auditTruncated, assumptionNote, ...rest } = view(state, run); void [subjects, ruleSnapshot, originalRecommendations, audit, auditTruncated, assumptionNote]; return rest; };
const receipt = (run, status = 200) => ok({ resourceId: run.forecastRunId, ...scopeOf, acceptedAt: new Date().toISOString(), revision: revisionOf(run) }, status, { ETag: `"${revisionOf(run)}"` });
const unquote = (value) => value ? value.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1') : null;

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
  if (route === 'forecast-context') return ok({ programmes, learningCentres, targetSemesters: [target], assignedScopes, currentSemesterId: 1, targetSemesterId: 2, curricula: [], subjects: [] });
  if (route === 'forecast-import-template') return { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="uc20-import-template.csv"' }, text: 'external_reference,curriculum_version,cohort_status,history_completeness,subject_code,subject_status,record_semester_id,recognized_credits,is_synthetic,student_name\n' };
  if (route === 'forecast-imports/system-snapshots' && method === 'POST') return systemSnapshot(state, headers, safeJson(body));
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
    if (importMatch[2]) return ok(paginate(roster(), url));
    if (item.source === 'SYSTEM') return ok({ ...item, validationReport: systemReport(item) });
    return ok({ ...item, validationReport: reportOf({ status: 'VALID', acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint } }) });
  }
  const confirmationResult = handleConfirmation(state, route, method, url, headers, body);
  if (confirmationResult) return confirmationResult;
  const runMatch = /^forecast-runs(?:\/(\d+)(?:\/(audit|reviews|decisions|finalizations))?)?$/.exec(route);
  if (!runMatch) return null;
  if (!runMatch[1]) return method === 'POST' ? generate(state, safeJson(body)) : listRuns(state, url);
  const run = state.runs.get(Number(runMatch[1]));
  if (!run) return failure(404, 'RUN_NOT_FOUND', 'The forecast was not found.');
  if (!runMatch[2]) return ok(view(state, run), 200, { ETag: `"${revisionOf(run)}"` });
  if (runMatch[2] === 'audit') return ok(paginate(run.audit, url));
  return mutate(state, run, runMatch[2], headers, safeJson(body));
}
function safeJson(text) { try { return text ? JSON.parse(text) : {}; } catch { return {}; } }

function upload(state, headers, body) {
  if (state.pendingValidation) state.pendingValidation = null;
  const label = /name="sourceLabel"\r?\n\r?\n([^\r\n]*)/.exec(body)?.[1] ?? 'Upload';
  if (body.includes('REJECTME')) return { status: 422, payload: { error: { code: 'IMPORT_FILE_REJECTED', message: 'The file could not be read. Correct it and upload again.', report: reportOf({ status: 'FILE_REJECTED', counts: { ...counts, uniqueStudents: 0, rejectedRows: 0 }, issues: [{ severity: 'ERROR', code: 'CSV_HEADER_INVALID', row: 1, field: null, message: 'The header row does not match the template.', correctiveAction: 'Download the template and copy your data into it.' }] }) } } };
  if (body.includes('BADROWS')) {
    state.pendingValidation = { label };
    return { status: 422, headers: { ETag: '"sha256:rev1"' }, payload: { error: { code: 'IMPORT_CORRECTION_REQUIRED', message: 'Correct the rejected rows, or explicitly acknowledge them to accept the remaining valid rows.', report: reportOf({ status: 'CORRECTION_REQUIRED', counts: { ...counts, rejectedRows: 2 }, issues: errorIssues, subsetAcknowledgementRequired: true }) } } };
  }
  const item = addImport(state, label);
  return ok({ ...item, validationReport: reportOf({ acceptedSnapshot: { importBatchId: item.importBatchId, acceptedAt: item.acceptedAt, sourceFingerprint: item.sourceFingerprint } }) }, 201);
}
function acceptSubset(state, headers, body) {
  if (!state.pendingValidation) return failure(404, 'IMPORT_NOT_FOUND', 'The import was not found.');
  if (unquote(headers['if-match']) !== 'sha256:rev1' || body.validationRevision !== 'sha256:rev1') return failure(412, 'IMPORT_REVISION_MISMATCH', 'The validation changed or does not match the revision you acknowledged. Review the report again.');
  if (body.acknowledgeRejectedRows !== true) return failure(400, 'INVALID_REQUEST', 'acknowledgeRejectedRows must be true.');
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
function listRuns(state, url) {
  const scope = scopeFromQuery(url);
  if (!inScope(scope)) return failure(403, 'SCOPE_NOT_ASSIGNED', 'You are not assigned to this programme and learning centre.');
  const runs = [...state.runs.values()].filter(run => run.programmeId === scope.programmeId && run.learningCentreId === scope.learningCentreId).sort((a, b) => b.forecastRunId - a.forecastRunId);
  return ok(paginate(runs.map(run => summaryOf(state, run)), url));
}
function mutate(state, run, kind, headers, body) {
  if (!headers['if-match']) return failure(400, 'IF_MATCH_REQUIRED', 'Send the current revision in the If-Match header.');
  if (!headers['idempotency-key']) return failure(400, 'INVALID_REQUEST', 'Idempotency-Key is required by this fixture.');
  if (state.staleNext) { state.staleNext = false; run.audit.unshift(auditEntry(state, run, 'REVIEW', 102, 'Changed by another session.')); }
  if (run.status === 'FINALIZED') return failure(409, 'RUN_FINALIZED', 'This forecast is finalized and read-only.');
  if (unquote(headers['if-match']) !== revisionOf(run)) return failure(412, 'RUN_REVISION_MISMATCH', 'The forecast changed since you loaded it. Reload and review the current state.');
  if (kind === 'reviews') {
    if (run.status !== 'DRAFT') return failure(409, 'RUN_STATE_CONFLICT', 'This step is not allowed in the forecast current state.');
    startReview(state, run, 'user_test');
    return receipt(run);
  }
  if (kind === 'decisions') {
    for (const decision of body.decisions ?? []) {
      const subjectRow = run.subjects.find(s => s.subjectId === decision.subjectId);
      if (!subjectRow) return failure(422, 'DECISION_SUBJECT_NOT_FOUND', 'A decision refers to a subject that is not in this forecast.');
      if (!decision.reason) return failure(422, 'DECISION_REASON_REQUIRED', 'Every decision needs a reason of 1-500 characters.');
      if (decision.action === 'REPLACE_ALLOCATION') {
        const sizes = decision.replacementSections.map(x => x.expectedStudents);
        const rule = capacity[subjectRow.classType];
        if (state.forceAllocationError) { const e = state.forceAllocationError; state.forceAllocationError = null; return failure(422, e.code, e.message); }
        if (sizes.reduce((a, b) => a + b, 0) !== subjectRow.forecastCount) return failure(422, 'ALLOCATION_TOTAL_MISMATCH', 'The replacement sections must add up to the forecast demand for the subject.');
        if (sizes.some(size => size > rule.normal)) return failure(422, 'ALLOCATION_EXCEEDS_CAPACITY', 'A section is larger than the maximum allowed by its capacity rule.');
        const previous = subjectRow.sections;
        subjectRow.sections = decision.replacementSections.map((entry, index) => ({ ...(previous.find(p => p.proposedSectionId === entry.proposedSectionId) ?? section(run.nextSection++, index + 1, entry.expectedStudents, rule)), sectionNumber: entry.sectionNumber, expectedStudents: entry.expectedStudents, reviewStatus: 'REVIEWED', justification: entry.justification ?? null }));
      } else {
        const status = { REVIEW: 'REVIEWED', APPROVE: 'APPROVED', DEFER: 'DEFERRED' }[decision.action];
        subjectRow.sections.forEach(x => { x.reviewStatus = status; });
      }
      run.audit.unshift(auditEntry(state, run, decision.action, decision.subjectId, decision.reason, { sections: 'before' }, { sections: 'after' }));
    }
    return receipt(run);
  }
  if (run.status !== 'UNDER_REVIEW') return failure(409, 'RUN_STATE_CONFLICT', 'This step is not allowed in the forecast current state.');
  const pending = run.subjects.filter(s => s.sections.some(x => x.reviewStatus === 'PENDING')).map(s => s.subjectId);
  if (pending.length) return failure(422, 'REVIEWS_INCOMPLETE', 'Every proposed section must be reviewed, approved or deferred before finalizing.', { pendingSubjectIds: pending });
  run.audit.unshift(auditEntry(state, run, 'FINALIZE', null, body.reason ?? 'Forecast finalized.'));
  run.status = 'FINALIZED'; run.finalizedBy = 'user_test'; run.finalizedAt = new Date().toISOString();
  return receipt(run);
}

// ---- Offering confirmation (MT6): mirrors apps/api/src/modules/forecasting/offerings-routes.ts ----
const dayMs = 24 * 60 * 60 * 1000;
const confRevision = (c) => `oc1.${c.revision}`;
function seedConfirmation(state) {
  const deadline = new Date(Date.now() + (state.closedWindow ? -2 : 10) * dayMs).toISOString();
  state.confirmation = { revision: 1, forecastRunId: 1, pickDeadline: deadline, createdAt: generatedAt, updatedAt: generatedAt, offerings: [], audit: [] };
  recordDeadline(state, null, deadline, 'Offered for the September intake.');
  if (state.bulkConfAudit) for (let i = 0; i < 24; i++) recordAudit(state, 'CONFIRM', 102, null, 'CONFIRMED', `Earlier note ${24 - i}`);
  for (const id of [101, 103]) addOffering(state, id, 'Demand is clear.');
}
function recordAudit(state, action, subjectId, beforeStatus, afterStatus, reason, extra = {}) {
  const c = state.confirmation;
  c.audit.unshift({ auditId: state.nextConfAudit++, scope: scopeOf, subjectId, action, beforeStatus, afterStatus, beforeDeadline: null, afterDeadline: null, recordedBy: 'user_test', recordedAt: new Date(Date.parse(generatedAt) + state.nextConfAudit * 60000).toISOString(), reason, forecastRunId: c.forecastRunId, ...extra });
}
function recordDeadline(state, before, after, reason) { recordAudit(state, 'SET_DEADLINE', null, null, null, reason, { beforeDeadline: before, afterDeadline: after }); }
function addOffering(state, subjectId, reason) {
  const c = state.confirmation, now = new Date().toISOString();
  c.offerings.push({ confirmedOfferingId: c.offerings.length + 1, subjectId, status: 'CONFIRMED', reason, confirmedBy: 'user_test', confirmedAt: now, withdrawnBy: null, withdrawnAt: null, forecastRunId: c.forecastRunId });
  recordAudit(state, 'CONFIRM', subjectId, null, 'CONFIRMED', reason); c.revision += 1; c.updatedAt = now;
}
function confirmationView(state) {
  const c = state.confirmation;
  const empty = { scope: scopeOf, pickDeadline: null, revision: null, forecastRunId: null, pickWindow: null, createdBy: null, createdAt: null, updatedBy: null, updatedAt: null, newerForecastAvailable: null, offerings: [] };
  if (!c) return empty;
  const run = state.runs.get(c.forecastRunId);
  return {
    ...empty, pickDeadline: c.pickDeadline, revision: confRevision(c), forecastRunId: c.forecastRunId, pickWindow: Date.parse(c.pickDeadline) > Date.now() ? 'OPEN' : 'CLOSED',
    createdBy: 'user_test', createdAt: c.createdAt, updatedBy: 'user_test', updatedAt: c.updatedAt, newerForecastAvailable: state.newerConf,
    offerings: c.offerings.map(o => { const row = run.subjects.find(x => x.subjectId === o.subjectId); return { confirmedOfferingId: o.confirmedOfferingId, ...scopeOf, subjectId: o.subjectId, subjectCode: row.subjectCode, subjectName: row.subjectName, creditHours: row.creditHours, classType: row.classType, status: o.status, forecastRunId: o.forecastRunId, confirmedBy: o.confirmedBy, confirmedAt: o.confirmedAt, withdrawnBy: o.withdrawnBy, withdrawnAt: o.withdrawnAt, reason: o.reason }; }).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode)),
  };
}
const confReceipt = (state, status = 200) => ok({ resourceId: 1, ...scopeOf, acceptedAt: new Date().toISOString(), revision: confRevision(state.confirmation) }, status, { ETag: `"${confRevision(state.confirmation)}"` });

function handleConfirmation(state, route, method, url, headers, text) {
  const match = /^(confirmed-offerings(?:\/(withdrawals|pick-deadline|audit))?|offering-pick-counts)$/.exec(route);
  if (!match) return null;
  if (method === 'GET') {
    const scope = scopeFromQuery(url);
    if (!inScope(scope)) return failure(403, 'SCOPE_NOT_ASSIGNED', 'You are not assigned to this programme and learning centre.');
    const c = state.confirmation;
    if (match[2] === 'audit') return ok(paginate(c ? c.audit : [], url));
    if (route === 'offering-pick-counts') {
      const view = confirmationView(state);
      return ok({ scope: scopeOf, asOf: new Date().toISOString(), pickDeadline: view.pickDeadline, picksAvailable: false, counts: view.offerings.filter(o => o.status === 'CONFIRMED').map(o => ({ subjectId: o.subjectId, subjectCode: o.subjectCode, subjectName: o.subjectName, pickCount: 0, classType: o.classType, implied: { maxPerClass: 45, classesAtMaximum: 0, classesAtOptimal: 0, averageSizeAtMaximum: 0 }, pickers: [] })) });
    }
    return ok(confirmationView(state), 200, c ? { ETag: `"${confRevision(c)}"` } : undefined);
  }
  const body = safeJson(text);
  if (!headers['idempotency-key']) return failure(400, 'INVALID_REQUEST', 'Idempotency-Key is required by this fixture.');
  const c0 = state.confirmation;
  if (c0 && state.staleConf) {
    state.staleConf = false; c0.revision += 1; recordAudit(state, 'CONFIRM', 102, null, 'CONFIRMED', 'Changed by another session.');
    c0.offerings.push({ confirmedOfferingId: 99, subjectId: 102, status: 'CONFIRMED', reason: 'Changed by another session.', confirmedBy: 'user_other', confirmedAt: generatedAt, withdrawnBy: null, withdrawnAt: null, forecastRunId: c0.forecastRunId });
  }
  const c = state.confirmation;
  if (!body.reason || !String(body.reason).trim()) return failure(422, 'CONFIRMATION_REASON_REQUIRED', 'A reason of 1-500 characters is required and is recorded in the audit trail.');
  const stale = () => unquote(headers['if-match']) !== confRevision(c) || body.baseRevision !== confRevision(c);
  const mismatch = () => failure(412, 'CONFIRMATION_REVISION_MISMATCH', 'The confirmation changed since you loaded it. Reload and review the current state.');
  if (route === 'confirmed-offerings') {
    const run = state.runs.get(body.forecastRunId);
    if (!run) return failure(404, 'RUN_NOT_FOUND', 'The forecast was not found.');
    if (run.status !== 'FINALIZED') return failure(409, 'RUN_NOT_FINALIZED', 'Offerings can only be confirmed from a FINALIZED forecast for the same programme, learning centre and semester.');
    if (c) {
      if (!headers['if-match']) return failure(400, 'IF_MATCH_REQUIRED', 'Send the current revision in the If-Match header.');
      if (stale()) return mismatch();
      if (c.forecastRunId !== run.forecastRunId) return failure(422, 'CONFIRMATION_RUN_MISMATCH', 'Later confirmations use the forecast the confirmation is based on.');
    } else {
      if (body.baseRevision !== null) return mismatch();
      if (!(Date.parse(body.pickDeadline) > Date.now())) return failure(422, 'PICK_DEADLINE_INVALID', 'The pick deadline must be a future date and time.');
    }
    const notOffered = body.subjectIds.filter(id => run.subjects.find(x => x.subjectId === id)?.semesterTypeExcluded);
    if (notOffered.length) return failure(422, 'SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE', 'A subject that does not run in this semester type (Normal/Short offering rule) cannot be confirmed for the semester.', { subjectIds: notOffered });
    const excluded = body.subjectIds.filter(id => run.subjects.find(x => x.subjectId === id)?.excluded);
    if (excluded.length) return failure(422, 'SUBJECT_EXCLUDED', 'Subjects excluded from the offering forecast cannot be confirmed.', { subjectIds: excluded });
    if (state.forceConfirmError) { const e = state.forceConfirmError; state.forceConfirmError = null; return failure(e.status ?? 422, e.code, e.message); }
    if (!c) {
      state.confirmation = { revision: 1, forecastRunId: run.forecastRunId, pickDeadline: new Date(body.pickDeadline).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), offerings: [], audit: [] };
      recordDeadline(state, null, state.confirmation.pickDeadline, body.reason);
    }
    for (const id of body.subjectIds) {
      const existing = state.confirmation.offerings.find(o => o.subjectId === id);
      if (!existing) addOffering(state, id, body.reason);
      else if (existing.status === 'WITHDRAWN') {
        Object.assign(existing, { status: 'CONFIRMED', reason: body.reason, withdrawnAt: null, withdrawnBy: null, confirmedAt: new Date().toISOString() });
        recordAudit(state, 'CONFIRM', id, 'WITHDRAWN', 'CONFIRMED', body.reason); state.confirmation.revision += 1;
      }
    }
    return confReceipt(state, c ? 200 : 201);
  }
  if (!c) return failure(404, 'CONFIRMATION_NOT_FOUND', 'No offerings have been confirmed for this programme, learning centre and semester yet.');
  if (!headers['if-match']) return failure(400, 'IF_MATCH_REQUIRED', 'Send the current revision in the If-Match header.');
  if (stale()) return mismatch();
  if (match[2] === 'withdrawals') {
    const notConfirmed = body.subjectIds.filter(id => c.offerings.find(o => o.subjectId === id)?.status !== 'CONFIRMED');
    if (notConfirmed.length) return failure(422, 'OFFERING_NOT_CONFIRMED', 'Only currently confirmed subjects can be withdrawn.', { subjectIds: notConfirmed });
    for (const id of body.subjectIds) {
      Object.assign(c.offerings.find(o => o.subjectId === id), { status: 'WITHDRAWN', reason: body.reason, withdrawnBy: 'user_test', withdrawnAt: new Date().toISOString() });
      recordAudit(state, 'WITHDRAW', id, 'CONFIRMED', 'WITHDRAWN', body.reason); c.revision += 1;
    }
    return confReceipt(state);
  }
  if (!(Date.parse(body.pickDeadline) > Date.now())) return failure(422, 'PICK_DEADLINE_INVALID', 'The pick deadline must be a future date and time.');
  const runId = body.forecastRunId ?? c.forecastRunId;
  if (runId !== c.forecastRunId && state.runs.get(runId)?.status !== 'FINALIZED') return failure(409, 'RUN_NOT_FINALIZED', 'Offerings can only be confirmed from a FINALIZED forecast for the same programme, learning centre and semester.');
  const deadline = new Date(body.pickDeadline).toISOString();
  if (deadline === c.pickDeadline && runId === c.forecastRunId) return failure(422, 'CONFIRMATION_UNCHANGED', 'Nothing would change: the deadline and forecast are the same as the current ones.');
  const before = c.pickDeadline;
  c.pickDeadline = deadline; c.forecastRunId = runId; c.revision += 1; c.updatedAt = new Date().toISOString();
  recordDeadline(state, before, deadline, body.reason);
  return confReceipt(state);
}
