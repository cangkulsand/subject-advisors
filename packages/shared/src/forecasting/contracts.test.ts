import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AcceptedImport, AcceptSubsetRequest, CapacityRule, ForecastAuditEntry,
  ForecastConfiguration, ForecastConfigurationRequest, ForecastContext, ForecastRun, ForecastScope,
  GenerateForecastRequest, ImportUploadRequest, SubjectExclusion,
} from './contracts';
import { HISTORY_COMPLETENESS, IMPORT_CSV_HEADER, IMPORTED_SUBJECT_STATUSES } from './contracts';

type Schema = { enum?: unknown[]; required?: string[]; properties?: Record<string, unknown>; oneOf?: Schema[]; description?: string };
const spec = JSON.parse(readFileSync('docs/api/forecasting-uc20.openapi.json', 'utf8')) as {
  components: { schemas: Record<string, Schema>; parameters: Record<string, { name?: string }>;
    responses: Record<string, { headers?: Record<string, unknown> }> };
  paths: Record<string, Record<string, { parameters?: Array<{ $ref?: string }>; responses?: Record<string, { $ref?: string }> }>>;
};
const schema = (name: string): Schema => {
  const value = spec.components.schemas[name];
  if (!value) throw new Error(`OpenAPI schema ${name} is missing`);
  return value;
};
const objectSchema = (name: string, value: Record<string, unknown>): Schema => {
  const root = schema(name);
  if (!root.oneOf) return root;
  const selected = root.oneOf.find(variant => {
    const required = variant.required ?? [];
    return required.includes('action') ? variant.properties?.action &&
      (variant.properties.action as { enum?: unknown[] }).enum?.includes(value.action) :
      required.includes('status') ? variant.properties?.status &&
      (variant.properties.status as { enum?: unknown[] }).enum?.some(status => status === value.status) : false;
  });
  if (!selected) throw new Error(`No OpenAPI ${name} variant matches the example`);
  return selected;
};
const expectDeclaredShape = (name: string, value: Record<string, unknown>) => {
  const shape = objectSchema(name, value);
  const properties = shape.properties ?? {};
  for (const required of shape.required ?? []) expect(value).toHaveProperty(required);
  for (const key of Object.keys(value)) expect(properties).toHaveProperty(key);
};
const at = <T>(items: T[], index: number): T => {
  const value = items[index];
  if (value === undefined) throw new Error(`Example item ${index} is missing`);
  return value;
};
const operation = (path: string, method: string) => {
  const value = spec.paths[path]?.[method];
  if (!value) throw new Error(`OpenAPI operation ${method.toUpperCase()} ${path} is missing`);
  return value;
};
const response = (name: string) => {
  const value = spec.components.responses[name];
  if (!value) throw new Error(`OpenAPI response ${name} is missing`);
  return value;
};

const scope = { programmeId: 71, learningCentreId: 12, targetSemesterId: 305 } satisfies ForecastScope;
const subject2024 = {
  curriculumSubjectId: 1001, curriculumId: 801, subjectId: 501, subjectCode: 'DEMO101', subjectName: 'Fictional Systems',
  creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [],
  conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [], conditionNote: null } },
} satisfies ForecastContext['subjects'][number];
const subject2025 = {
  curriculumSubjectId: 1002, curriculumId: 802, subjectId: 502, subjectCode: 'DEMO102', subjectName: 'Fictional Networks',
  creditHours: 4, classType: null, includeInOfferingForecast: true, exclusionReason: null,
  prerequisiteLinks: [{ prerequisiteId: 22, curriculumSubjectId: 1002, requiredCurriculumSubjectId: 1003, requirementType: 'MANDATORY' }],
  conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'Fictional source details not provided.' },
} satisfies ForecastContext['subjects'][number];
const subject2025PrerequisiteRoot = {
  curriculumSubjectId: 1003, curriculumId: 802, subjectId: 501, subjectCode: 'DEMO101', subjectName: 'Fictional Systems',
  creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null,
  prerequisiteLinks: [], conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [], conditionNote: null } },
} satisfies ForecastContext['subjects'][number];
const contextExample = {
  programmes: [{ programmeId: 71, programmeCode: 'DEMO-BS', programmeName: 'Fictional Degree' }],
  learningCentres: [{ learningCentreId: 12, centreCode: 'DEMO-C', centreName: 'Fictional Centre' }],
  targetSemesters: [{ semesterId: 305, academicYear: '2099/2100', semesterNumber: 1 }],
  curricula: [
    { curriculumId: 801, programmeId: 71, curriculumVersion: '2024-DEMO', effectiveYear: 2099 },
    { curriculumId: 802, programmeId: 71, curriculumVersion: '2025-DEMO' },
  ],
  subjects: [subject2024, subject2025, subject2025PrerequisiteRoot],
} satisfies ForecastContext;
const capacityRule = {
  scopeKind: 'CENTRE', learningCentreId: 12, classType: 'LECTURE', minimumEnrollment: 1,
  breakEvenTarget: 10, normalMaximum: 30, exceptionMaximum: null, effectiveFromSemesterId: 300,
  effectiveToSemesterId: null,
} satisfies CapacityRule;
const exclusion = { subjectId: 599, reason: 'Fictional placement exclusion', effectiveFromSemesterId: 300, effectiveToSemesterId: null } satisfies SubjectExclusion;
const configurationExample = {
  revision: 'cfg-rev-fictional-2', configurationVersion: 2, capacityRules: [capacityRule],
  subjectExclusions: [exclusion], staleSourceMaxAgeDays: null,
} satisfies ForecastConfiguration;
const acceptedImportExample = {
  ...scope, importBatchId: 911, sourceDate: '2099-01-15', sourceLabel: 'Fictional demo cohort',
  acceptedAt: '2099-01-16T00:00:00Z', sourceFingerprint: 'sha256:fictional-accepted-source', source: 'CSV',
  counts: { studentRows: 2, uniqueStudents: 2, validAttempts: 1, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 1 },
  snapshotStatus: 'ACCEPTED_IMMUTABLE',
  validationReport: {
    validationId: '00000000-0000-4000-8000-000000000021', validationRevision: 'sha256:fictional-valid-report',
    status: 'VALID', counts: { studentRows: 2, uniqueStudents: 2, validAttempts: 1, rejectedRows: 0, partialStudents: 0, unknownHistoryStudents: 1 },
    issues: [{ severity: 'WARNING', code: 'HISTORY_UNKNOWN', row: 3, field: 'history_completeness', message: 'History is unknown.', correctiveAction: 'Review before interpreting subject eligibility.' }],
    completenessChanges: [], subsetAcknowledgementRequired: false,
    acceptedSnapshot: { importBatchId: 911, acceptedAt: '2099-01-16T00:00:00Z', sourceFingerprint: 'sha256:fictional-accepted-source' },
  },
} satisfies AcceptedImport;
const forecastRunExample = {
  ...scope, forecastRunId: 42, importBatchId: 911, versionNumber: 1, parentForecastRunId: null,
  status: 'DRAFT', finalizedBy: null, finalizedAt: null, revision: 'run-rev-fictional-1',
  demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', engineVersion: 'uc20-contract-example-0', generatedBy: 'verified-coordinator-demo',
  generatedAt: '2099-01-16T00:05:00Z', demands: [{
    subjectId: 502, supportedEligibleCount: 0, uncertainStudentCount: 2, forecastCount: null,
    qualityStatus: 'INSUFFICIENT_DATA', uncertaintyReasons: ['PREREQUISITE_EVIDENCE_MISSING'],
    configurationStatus: 'CONFIGURED', sections: [],
  }], qualityWarnings: [],
  ruleSnapshot: {
    ...scope, importBatchId: 911, acceptedAt: '2099-01-16T00:00:00Z', sourceDate: '2099-01-15',
    sourceLabel: 'Fictional demo cohort', sourceFingerprint: 'sha256:fictional-accepted-source',
    curricula: [
      { curriculumId: 801, curriculumVersion: '2024-DEMO', catalogueFingerprint: 'sha256:curriculum-801', requirements: [{ requirementId: 8, curriculumId: 801, requirementType: 'TOTAL_CREDITS', requiredCredits: 120, requiredSubjects: null }], subjectSemesterRules: [{ ruleId: 14, curriculumSubjectId: 1001, semesterType: 'NORMAL' }], subjects: [subject2024] },
      { curriculumId: 802, curriculumVersion: '2025-DEMO', catalogueFingerprint: 'sha256:curriculum-802', requirements: [], subjectSemesterRules: [], subjects: [subject2025, subject2025PrerequisiteRoot] },
    ], exclusions: [exclusion], capacityRules: [capacityRule], demandAssumption: 'SUPPORTED_ELIGIBLE_POOL',
    cohortStatusMappings: { ACTIVE: 'SUPPORTED_POTENTIAL_DEMAND' }, engineVersion: 'uc20-contract-example-0',
  },
  originalRecommendations: [{ subjectId: 502, sections: [] }],
} satisfies ForecastRun;
const finalizedRunExample = {
  ...forecastRunExample, status: 'FINALIZED', finalizedBy: 'verified-coordinator-demo', finalizedAt: '2099-01-17T00:00:00Z',
} satisfies ForecastRun;
const uploadRequestExample = {
  ...scope, sourceDate: '2099-01-15', sourceLabel: 'Fictional demo upload',
  file: new File([`${IMPORT_CSV_HEADER.join(',')}\nDEMO-VALID-001,2024-DEMO,ACTIVE,COMPLETE,DEMO101,COMPLETED,1001,3,true`], 'uc20-demo.csv', { type: 'text/csv' }),
} satisfies ImportUploadRequest;
const subsetAcceptanceExample = {
  ...scope, validationRevision: 'sha256:fictional-validation', acknowledgeRejectedRows: true,
} satisfies AcceptSubsetRequest;
const generationExample = { ...scope, importBatchId: 911, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' } satisfies GenerateForecastRequest;
const configurationRequestExample = {
  capacityRules: [capacityRule], subjectExclusions: [exclusion], staleSourceMaxAgeDays: null,
  baseRevision: 'cfg-rev-fictional-2',
} satisfies ForecastConfigurationRequest;
const auditEntryExample = {
  decisionAuditId: 72, forecastRunId: 42, scope, subjectId: 502, proposedSectionId: null,
  actionType: 'REVIEW', recordedBy: 'verified-coordinator-demo', recordedAt: '2099-01-16T00:10:00Z',
  reason: 'Fictional review', before: { reviewStatus: 'PENDING' }, after: { reviewStatus: 'REVIEWED' },
} satisfies ForecastAuditEntry;

describe('UC20 transport contracts and example alignment', () => {
  it('aligns required context option names and subject details with OpenAPI', () => {
    expectDeclaredShape('ForecastContext', contextExample);
    expectDeclaredShape('ProgrammeOption', at(contextExample.programmes, 0));
    expectDeclaredShape('CentreOption', at(contextExample.learningCentres, 0));
    expectDeclaredShape('SemesterOption', at(contextExample.targetSemesters, 0));
    expectDeclaredShape('CurriculumOption', at(contextExample.curricula, 0));
    expectDeclaredShape('ForecastSubjectOption', subject2025);
    expectDeclaredShape('ForecastSubjectOption', subject2025PrerequisiteRoot);
    expect(schema('PrerequisiteGroup').properties?.operator).toMatchObject({ enum: ['allOf', 'anyOf'] });
    expect(schema('PrerequisiteCourse').properties?.code).toBeDefined();
    expect(schema('ForecastSubjectOption').properties?.classType).toMatchObject({ enum: ['LECTURE', 'LAB', null] });
    expect(subject2025.classType).toBeNull();
    expect(schema('SubjectPrerequisiteLink').properties?.requiredCurriculumSubjectId).toBeDefined();
    expect(schema('ConditionalPrerequisiteAvailability').oneOf).toHaveLength(2);
    expect((schema('CurriculumPrerequisiteSummary').properties?.expression as Schema).oneOf).toHaveLength(2);
    const contextSubjects = contextExample.subjects;
    for (const option of contextSubjects) for (const link of option.prerequisiteLinks) {
      expect(link.curriculumSubjectId).toBe(option.curriculumSubjectId);
      expect(contextSubjects.find(subject => subject.curriculumSubjectId === link.requiredCurriculumSubjectId)?.curriculumId).toBe(option.curriculumId);
    }
  });

  it('aligns accepted imports, configuration, multi-curriculum run and nullable uncertainty', () => {
    expectDeclaredShape('AcceptedImport', acceptedImportExample);
    expectDeclaredShape('ImportValidationReport', acceptedImportExample.validationReport);
    expectDeclaredShape('ForecastConfiguration', configurationExample);
    expectDeclaredShape('CapacityRule', capacityRule);
    expectDeclaredShape('SubjectExclusion', exclusion);
    expectDeclaredShape('ForecastRun', forecastRunExample);
    expectDeclaredShape('ForecastRun', finalizedRunExample);
    expectDeclaredShape('ForecastAuditEntry', auditEntryExample);
    expectDeclaredShape('ForecastRuleSnapshot', forecastRunExample.ruleSnapshot);
    expectDeclaredShape('SubjectDemand', at(forecastRunExample.demands, 0));
    expectDeclaredShape('SubjectPrerequisiteLink', at(subject2025.prerequisiteLinks, 0));
    expectDeclaredShape('CurriculumRequirementSnapshot', at(at(forecastRunExample.ruleSnapshot.curricula, 0).requirements, 0));
    expectDeclaredShape('SubjectSemesterRuleSnapshot', at(at(forecastRunExample.ruleSnapshot.curricula, 0).subjectSemesterRules, 0));
    expect(forecastRunExample.ruleSnapshot.curricula).toHaveLength(2);
    expect(at(forecastRunExample.demands, 0).forecastCount).toBeNull();
    expect(acceptedImportExample.validationReport.issues[0]?.severity).toBe('WARNING');
    expect(schema('ForecastRun').description).toContain('FINALIZED');
    expect(finalizedRunExample.finalizedBy).not.toBeNull();
    expect(finalizedRunExample.finalizedAt).not.toBeNull();
    expect(schema('ForecastRun').properties?.parentForecastRunId).toMatchObject({ enum: [null] });
    expect(schema('ForecastConfiguration').properties?.staleSourceMaxAgeDays).toMatchObject({ nullable: true });
  });

  it('aligns upload and decision requests and protects their mutation preconditions', () => {
    expectDeclaredShape('ImportUploadRequest', { ...uploadRequestExample, file: 'fake-binary' });
    expectDeclaredShape('AcceptSubsetRequest', subsetAcceptanceExample);
    expectDeclaredShape('GenerateForecastRequest', generationExample);
    expectDeclaredShape('ForecastConfigurationRequest', configurationRequestExample);
    const operations = [
      operation('/api/coordinator/forecast-imports/{validationId}/subset-acceptances', 'post'),
      operation('/api/admin/forecasting/configuration', 'put'),
    ];
    for (const operation of operations) {
      expect(operation.parameters?.some(parameter => parameter.$ref === '#/components/parameters/IfMatch')).toBe(true);
      expect(operation.parameters?.some(parameter => parameter.$ref === '#/components/parameters/IdempotencyKey')).toBe(true);
    }
    expect(operation('/api/coordinator/forecast-runs', 'post').parameters?.some(parameter => parameter.$ref === '#/components/parameters/IdempotencyKey')).toBe(true);
    for (const removed of ['/reviews', '/decisions', '/finalizations', '/audit']) expect(spec.paths).not.toHaveProperty('/api/coordinator/forecast-runs/{forecastRunId}' + removed);
    expect(spec.paths).not.toHaveProperty('/api/coordinator/confirmed-offerings');
    expect(operation('/api/coordinator/forecast-imports', 'post').responses?.['422']?.$ref).toBe('#/components/responses/ImportValidationResponse');
    expect(operation('/api/coordinator/forecast-imports/{importBatchId}', 'get').responses?.['200']?.$ref).toBe('#/components/responses/ImportAcceptedResponse');
    expect(schema('AcceptedImport').required).toContain('validationReport');
    expect(response('ImportValidationResponse').headers).toHaveProperty('ETag');
    expect(response('ForecastOperationResponse').headers).toHaveProperty('ETag');
    expect(response('ForecastConfigurationResponse').headers).toHaveProperty('ETag');
    expect(operation('/api/admin/forecasting/configuration', 'get').responses?.['200']?.$ref).toBe('#/components/responses/ForecastConfigurationResponse');
    expect(operation('/api/admin/forecasting/configuration', 'put').responses?.['200']?.$ref).toBe('#/components/responses/ForecastConfigurationResponse');
    expect(schema('ImportUploadRequest').properties).not.toHaveProperty('actor');
    expect(schema('ImportUploadRequest').properties).not.toHaveProperty('studentId');
  });

  it('aligns CSV examples, row groups and non-upgrading completeness outcomes', () => {
    const template = readFileSync('docs/api/examples/forecasting/uc20-import.template.csv', 'utf8').trim();
    const validRows = readFileSync('docs/api/examples/forecasting/uc20-import.valid.example.csv', 'utf8').trim().split(/\r?\n/);
    const correctionRows = readFileSync('docs/api/examples/forecasting/uc20-import.example.csv', 'utf8').trim().split(/\r?\n/);
    const report = JSON.parse(readFileSync('docs/api/examples/forecasting/expected-validation.json', 'utf8')) as {
      error: { report: { counts: { uniqueStudents: number; validAttempts: number; rejectedRows: number; unknownHistoryStudents: number }; completenessChanges: Array<{ externalReference: string; before: string; after: string }>; subsetAcknowledgementRequired: boolean } };
    };
    expect(template).toBe(IMPORT_CSV_HEADER.join(','));
    expect(at(validRows, 0)).toBe(template);
    expect(at(correctionRows, 0)).toBe(template);
    expect(validRows.slice(1).every(line => line.split(',').length === IMPORT_CSV_HEADER.length)).toBe(true);
    expect(correctionRows.slice(1).every(line => line.split(',').length === IMPORT_CSV_HEADER.length)).toBe(true);
    expect(validRows.join('\n')).not.toContain('WITHDRAWN');
    const duplicateStudentRows = correctionRows.slice(1).filter(line => line.startsWith('DEMO-001,')).map(line => line.split(','));
    expect(duplicateStudentRows).toHaveLength(3);
    expect(duplicateStudentRows.map(row => row.slice(0, 4))).toEqual(Array.from({ length: 3 }, () => ['DEMO-001', '2024-DEMO', 'ACTIVE', 'COMPLETE']));
    expect(at(duplicateStudentRows, 1)[7]).toBe('');
    const noHistory = at(validRows, 2).split(',');
    expect(noHistory.slice(4, 9)).toEqual(['', '', '', '', '']);
    expect(correctionRows.join('\n')).toContain('WITHDRAWN');
    expect(report.error.report.counts).toMatchObject({ uniqueStudents: 3, validAttempts: 2, rejectedRows: 2, unknownHistoryStudents: 2 });
    expect(report.error.report.completenessChanges).toEqual([{ externalReference: 'DEMO-001', before: 'COMPLETE', after: 'PARTIAL', rejectedRows: 1 }]);
    expect(report.error.report.subsetAcknowledgementRequired).toBe(true);
    expect(schema('ImportCsvRow').properties).toHaveProperty('is_synthetic');
    expect(schema('ImportSubjectStatus').enum).toEqual([...IMPORTED_SUBJECT_STATUSES]);
    expect(schema('HistoryCompleteness').enum).toEqual([...HISTORY_COMPLETENESS]);
    expect(schema('CompletenessChange').properties?.after).toMatchObject({ enum: ['PARTIAL', 'UNKNOWN'] });
  });
});
