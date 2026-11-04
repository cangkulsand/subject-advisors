import type {
  ClassType, ForecastAuditEntry, ForecastConfigurationStatus, ForecastQualityStatus, JsonObject, UncertaintyReason,
} from '../../../../../packages/shared/src/forecasting/contracts';
import type { ForecastSubjectOption } from '../../../../../packages/shared/src/forecasting/contracts';
import { readCurriculumPrerequisiteDetails, summarizeCurriculumPrerequisiteDetails } from '../../../../../packages/shared/src/curriculum-reference';
import { fingerprint } from '../../../../../packages/shared/src/forecasting/engine/hash';
import type { EngineCapacityRule, EngineCurriculum, EngineRecord, EngineRuleSnapshot, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { ForecastRunStatus, SectionReviewStatus } from '../../../../../packages/shared/src/forecasting/runs';
import { ForecastingError, mapForecastingDatabaseError, RUN_GUARD_EXISTS, RUN_GUARD_REVISION } from './errors';
import type {
  EngineInputRows, ForecastRunsRepository, NewRunInput, RunDetailRows, RunExpectation, RunListRow, RunRecord, RunSectionRow, RunSubjectRow,
} from './runs-contracts';
import type { ForecastingQuery, ForecastingStatement, ForecastingTransaction } from './repository';

const integer = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unexpected numeric database value');
  return number;
};
const text = (value: unknown): string => String(value ?? '');
const nullableText = (value: unknown): string | null => (value == null ? null : String(value));
const nullableInteger = (value: unknown): number | null => (value == null ? null : integer(value));
const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;
const isoSql = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Identity value of the run inserted earlier in the same transaction (one connection, so currval is exact). */
const CURRENT_RUN = "currval(pg_get_serial_sequence('public.forecast_run','forecast_run_id'))";
const RUN_COLUMNS = `r.forecast_run_id, r.programme_id, r.learning_centre_id, r.target_semester_id, r.import_batch_id, r.version_number, r.parent_forecast_run_id,
  r.status, r.engine_version, r.generated_by, ${isoSql('r.generated_at')} AS generated_at, r.finalized_by, ${isoSql('r.finalized_at')} AS finalized_at,
  (SELECT count(*) FROM public.forecast_adjustment_audit a WHERE a.forecast_run_id = r.forecast_run_id) AS audit_count`;

function runFrom(row: Record<string, unknown>): RunRecord {
  return {
    forecastRunId: integer(row.forecast_run_id), programmeId: integer(row.programme_id), learningCentreId: integer(row.learning_centre_id),
    targetSemesterId: integer(row.target_semester_id), importBatchId: integer(row.import_batch_id), versionNumber: integer(row.version_number),
    parentForecastRunId: nullableInteger(row.parent_forecast_run_id), status: text(row.status) as ForecastRunStatus, engineVersion: text(row.engine_version),
    generatedBy: text(row.generated_by), generatedAt: text(row.generated_at), finalizedBy: nullableText(row.finalized_by), finalizedAt: nullableText(row.finalized_at),
    auditCount: integer(row.audit_count),
  };
}

/**
 * Two statements that serialise concurrent mutations of a run and then abort the whole transaction when the run no
 * longer matches the state the request was validated against. The check is its own statement so it runs on a fresh
 * snapshot after the row lock was granted (READ COMMITTED). The failing cast is non-constant so it is only evaluated on mismatch.
 */
function guardRun(forecastRunId: number, expected: RunExpectation): ForecastingStatement[] {
  return [
    { text: 'SELECT 1 AS locked FROM public.forecast_run r WHERE r.forecast_run_id = $1::integer FOR UPDATE OF r', values: [forecastRunId] },
    {
      text: `SELECT CASE WHEN r.status = $2::text AND (SELECT count(*) FROM public.forecast_adjustment_audit a WHERE a.forecast_run_id = r.forecast_run_id) = $3::bigint
          THEN 0 ELSE ('${RUN_GUARD_REVISION}' || r.status)::integer END AS ok
        FROM public.forecast_run r WHERE r.forecast_run_id = $1::integer`,
      values: [forecastRunId, expected.status, expected.auditCount],
    },
  ];
}
const selectRun = (forecastRunId: number): ForecastingStatement => ({ text: `SELECT ${RUN_COLUMNS} FROM public.forecast_run r WHERE r.forecast_run_id = $1::integer`, values: [forecastRunId] });

/** Exact state of a subject's sections, read back inside the transaction for the audit after-state. */
const SECTIONS_AFTER = `(SELECT COALESCE(jsonb_agg(jsonb_build_object('proposedSectionId', s.proposed_section_id, 'sectionNumber', s.section_number,
    'expectedStudents', s.expected_students, 'reviewStatus', s.review_status, 'justification', s.justification) ORDER BY s.section_number), '[]'::jsonb)
  FROM public.proposed_class_section s WHERE s.demand_id = $1::integer)`;

export function createForecastRunsRepository(query: ForecastingQuery, transaction: ForecastingTransaction): ForecastRunsRepository {
  const read = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { throw mapForecastingDatabaseError(error, 'run'); }
  };
  const run = async (statements: ForecastingStatement[]): Promise<RunRecord> => read(async () => {
    const results = await transaction(statements);
    const row = results[results.length - 1]?.[0];
    if (!row) throw new Error('Forecast run was not returned');
    return runFrom(row);
  });

  return {
    engineInputs: (scope, importBatchId) => read(async (): Promise<EngineInputRows> => {
      const [studentRows, recordRows, curriculumRows, subjectRows, linkRows, ruleRows, requirementRows, semesterRows, capacityRows] = await Promise.all([
        query(`SELECT external_reference, student_name, curriculum_id, cohort_status, history_completeness FROM public.imported_student
          WHERE import_batch_id = $1 ORDER BY imported_student_id`, [importBatchId]),
        query(`SELECT st.external_reference, r.subject_id, r.subject_status, r.semester_id, r.recognized_credits FROM public.imported_subject_record r
          JOIN public.imported_student st ON st.imported_student_id = r.imported_student_id WHERE st.import_batch_id = $1 ORDER BY r.import_record_id`, [importBatchId]),
        query(`SELECT c.curriculum_id, c.curriculum_version, c.total_credit_required FROM public.curriculum c
          WHERE c.programme_id = $1 AND c.curriculum_id IN (SELECT DISTINCT curriculum_id FROM public.imported_student WHERE import_batch_id = $2) ORDER BY c.curriculum_id`,
        [scope.programmeId, importBatchId]),
        query(`SELECT cs.curriculum_subject_id, cs.curriculum_id, s.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, s.include_in_offering_forecast,
            to_jsonb(cs)->'prerequisite_details' AS prerequisite_details
          FROM public.curriculum_subject cs JOIN public.subject s ON s.subject_id = cs.subject_id
          WHERE cs.curriculum_id IN (SELECT DISTINCT curriculum_id FROM public.imported_student WHERE import_batch_id = $1) ORDER BY cs.curriculum_id, s.subject_code`, [importBatchId]),
        query(`SELECT p.prerequisite_id, p.curriculum_subject_id, p.required_curriculum_subject_id, p.requirement_type FROM public.subject_prerequisite p
          JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = p.curriculum_subject_id
          WHERE cs.curriculum_id IN (SELECT DISTINCT curriculum_id FROM public.imported_student WHERE import_batch_id = $1) ORDER BY p.prerequisite_id`, [importBatchId]),
        query(`SELECT r.rule_id, r.curriculum_subject_id, r.semester_type, cs.curriculum_id FROM public.subject_semester_rule r
          JOIN public.curriculum_subject cs ON cs.curriculum_subject_id = r.curriculum_subject_id
          WHERE cs.curriculum_id IN (SELECT DISTINCT curriculum_id FROM public.imported_student WHERE import_batch_id = $1) ORDER BY r.rule_id`, [importBatchId]),
        query(`SELECT requirement_id, curriculum_id, requirement_type, required_credits, required_subjects FROM public.curriculum_requirement
          WHERE curriculum_id IN (SELECT DISTINCT curriculum_id FROM public.imported_student WHERE import_batch_id = $1) ORDER BY requirement_id`, [importBatchId]),
        query('SELECT semester_id, semester_type, max_subjects, max_credits FROM public.academic_semester WHERE semester_id = $1', [scope.targetSemesterId]),
        query(`SELECT capacity_rule_id, class_type, minimum_enrollment, break_even_target, normal_maximum, exception_maximum, is_active FROM public.class_capacity_rule
          WHERE is_active = true ORDER BY capacity_rule_id`, []),
      ]);
      const semester = semesterRows[0];
      if (!semester) throw new ForecastingError('SCOPE_NOT_FOUND');

      const recordsByStudent = new Map<string, EngineRecord[]>();
      for (const row of recordRows) {
        const list = recordsByStudent.get(text(row.external_reference)) ?? [];
        list.push({ subjectId: integer(row.subject_id), status: text(row.subject_status) as EngineRecord['status'], semesterId: nullableInteger(row.semester_id), recognizedCredits: nullableInteger(row.recognized_credits) });
        recordsByStudent.set(text(row.external_reference), list);
      }
      const students: EngineStudent[] = studentRows.map((row) => ({
        externalReference: text(row.external_reference), studentName: nullableText(row.student_name), curriculumId: integer(row.curriculum_id),
        cohortStatus: text(row.cohort_status), historyCompleteness: text(row.history_completeness) as EngineStudent['historyCompleteness'],
        records: recordsByStudent.get(text(row.external_reference)) ?? [],
      }));

      const links = linkRows.map((row) => ({
        prerequisiteId: integer(row.prerequisite_id), curriculumSubjectId: integer(row.curriculum_subject_id),
        requiredCurriculumSubjectId: integer(row.required_curriculum_subject_id), requirementType: text(row.requirement_type) as 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE',
      }));
      const curricula: EngineCurriculum[] = curriculumRows.map((row) => {
        const curriculumId = integer(row.curriculum_id);
        const own = subjectRows.filter((subject) => integer(subject.curriculum_id) === curriculumId);
        const codes = new Set(own.map((subject) => text(subject.subject_code)));
        const subjects = own.map((subject): ForecastSubjectOption => {
          const curriculumSubjectId = integer(subject.curriculum_subject_id);
          const included = subject.include_in_offering_forecast === true;
          let conditionalPrerequisites: ForecastSubjectOption['conditionalPrerequisites'] = { status: 'UNAVAILABLE', reason: 'No conditional prerequisite details are configured.' };
          if (subject.prerequisite_details !== undefined && subject.prerequisite_details !== null) {
            const details = readCurriculumPrerequisiteDetails(json(subject.prerequisite_details), codes, text(subject.subject_code));
            // Silently ignoring invalid configuration would understate prerequisites and so overstate demand.
            if (!details) throw new ForecastingError('CATALOGUE_INVALID');
            conditionalPrerequisites = { status: 'AVAILABLE', details: summarizeCurriculumPrerequisiteDetails(details) };
          }
          return {
            curriculumSubjectId, curriculumId, subjectId: integer(subject.subject_id), subjectCode: text(subject.subject_code), subjectName: text(subject.subject_name),
            creditHours: integer(subject.credit_hours), classType: (subject.class_type == null ? null : text(subject.class_type)) as ClassType, includeInOfferingForecast: included,
            exclusionReason: included ? null : 'Excluded from the offering forecast in the subject catalogue.',
            prerequisiteLinks: links.filter((link) => link.curriculumSubjectId === curriculumSubjectId), conditionalPrerequisites,
          };
        });
        const subjectSemesterRules = ruleRows.filter((rule) => integer(rule.curriculum_id) === curriculumId)
          .map((rule) => ({ ruleId: integer(rule.rule_id), curriculumSubjectId: integer(rule.curriculum_subject_id), semesterType: text(rule.semester_type) as 'NORMAL' | 'SHORT' }));
        const requirements = requirementRows.filter((requirement) => integer(requirement.curriculum_id) === curriculumId).map((requirement) => ({
          requirementId: integer(requirement.requirement_id), curriculumId, requirementType: text(requirement.requirement_type),
          requiredCredits: nullableInteger(requirement.required_credits), requiredSubjects: nullableInteger(requirement.required_subjects),
        }));
        return {
          curriculumId, curriculumVersion: text(row.curriculum_version), totalCreditsRequired: nullableInteger(row.total_credit_required),
          catalogueFingerprint: fingerprint({ subjects, subjectSemesterRules, requirements }), requirements, subjectSemesterRules, subjects,
        };
      });
      const capacityRules: EngineCapacityRule[] = capacityRows.map((row) => ({
        capacityRuleId: integer(row.capacity_rule_id), scopeKind: 'GLOBAL', classType: text(row.class_type) as 'LECTURE' | 'LAB',
        minimumEnrollment: integer(row.minimum_enrollment), breakEvenTarget: integer(row.break_even_target), normalMaximum: integer(row.normal_maximum),
        exceptionMaximum: nullableInteger(row.exception_maximum), isActive: row.is_active === true,
      }));
      return {
        target: { semesterId: integer(semester.semester_id), semesterType: text(semester.semester_type) as 'NORMAL' | 'SHORT', maxSubjects: integer(semester.max_subjects), maxCredits: integer(semester.max_credits) },
        snapshot: { students, rejectedRowsByStudent: {} }, curricula, capacityRules,
      };
    }),

    findByImportBatch: (importBatchId) => read(async () => {
      const rows = await query(`SELECT ${RUN_COLUMNS} FROM public.forecast_run r WHERE r.import_batch_id = $1 ORDER BY r.version_number DESC LIMIT 1`, [importBatchId]);
      return rows[0] ? runFrom(rows[0]) : null;
    }),

    latestVersion: (scope) => read(async () => {
      const rows = await query(`SELECT forecast_run_id, version_number, status FROM public.forecast_run
        WHERE programme_id = $1 AND learning_centre_id = $2 AND target_semester_id = $3 ORDER BY version_number DESC LIMIT 1`,
      [scope.programmeId, scope.learningCentreId, scope.targetSemesterId]);
      return rows[0] ? { forecastRunId: integer(rows[0].forecast_run_id), versionNumber: integer(rows[0].version_number), status: text(rows[0].status) as ForecastRunStatus } : null;
    }),

    createRun: (input: NewRunInput) => run([
      { text: 'SELECT 1 AS locked FROM public.academic_import_batch b WHERE b.import_batch_id = $1::integer FOR UPDATE OF b', values: [input.importBatchId] },
      {
        text: `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.forecast_run x WHERE x.import_batch_id = b.import_batch_id)
            THEN 0 ELSE ('${RUN_GUARD_EXISTS}' || b.import_status)::integer END AS ok
          FROM public.academic_import_batch b WHERE b.import_batch_id = $1::integer`,
        values: [input.importBatchId],
      },
      {
        text: `INSERT INTO public.forecast_run(import_batch_id, target_semester_id, scenario_assumptions, generated_by, status, learning_centre_id, version_number,
            parent_forecast_run_id, programme_id, rule_snapshot, engine_version, original_recommendations)
          SELECT $1::integer, $2::integer, $3::jsonb, $4::text, 'DRAFT', $5::integer, COALESCE(max(p.version_number), 0) + 1,
            (array_agg(p.forecast_run_id ORDER BY p.version_number DESC))[1], $6::integer, $7::jsonb, $8::text, $9::jsonb
          FROM public.forecast_run p WHERE p.programme_id = $6::integer AND p.learning_centre_id = $5::integer AND p.target_semester_id = $2::integer`,
        values: [
          input.importBatchId, input.scope.targetSemesterId, JSON.stringify(input.scenarioAssumptions), input.actor, input.scope.learningCentreId,
          input.scope.programmeId, JSON.stringify(input.ruleSnapshot), input.engineVersion, JSON.stringify(input.originalRecommendations),
        ],
      },
      {
        text: `INSERT INTO public.forecast_subject_demand(forecast_run_id, subject_id, eligible_count, forecast_count, graduation_critical_count, data_quality_status,
            uncertain_count, uncertainty_reasons, configuration_status)
          SELECT ${CURRENT_RUN}, d.subject_id, d.eligible_count, d.forecast_count, NULL, d.data_quality_status, d.uncertain_count, d.uncertainty_reasons, d.configuration_status
          FROM jsonb_to_recordset($1::jsonb) AS d(subject_id integer, eligible_count integer, forecast_count integer, data_quality_status text,
            uncertain_count integer, uncertainty_reasons jsonb, configuration_status text)`,
        values: [JSON.stringify(input.demands.map((d) => ({
          subject_id: d.subjectId, eligible_count: d.eligibleCount, forecast_count: d.forecastCount, data_quality_status: d.dataQualityStatus,
          uncertain_count: d.uncertainCount, uncertainty_reasons: d.uncertaintyReasons, configuration_status: d.configurationStatus,
        })))],
      },
      ...(input.sections.length ? [{
        text: `INSERT INTO public.proposed_class_section(demand_id, capacity_rule_id, section_number, expected_students, review_status)
          SELECT d.demand_id, s.capacity_rule_id, s.section_number, s.expected_students, 'PENDING'
          FROM jsonb_to_recordset($1::jsonb) AS s(subject_id integer, section_number integer, expected_students integer, capacity_rule_id integer)
          JOIN public.forecast_subject_demand d ON d.forecast_run_id = ${CURRENT_RUN} AND d.subject_id = s.subject_id`,
        values: [JSON.stringify(input.sections.map((s) => ({ subject_id: s.subjectId, section_number: s.sectionNumber, expected_students: s.expectedStudents, capacity_rule_id: s.capacityRuleId })))],
      }] : []),
      { text: `SELECT ${RUN_COLUMNS} FROM public.forecast_run r WHERE r.forecast_run_id = ${CURRENT_RUN}`, values: [] },
    ]),

    getRun: (forecastRunId) => read(async () => {
      const rows = await query(`SELECT ${RUN_COLUMNS} FROM public.forecast_run r WHERE r.forecast_run_id = $1`, [forecastRunId]);
      return rows[0] ? runFrom(rows[0]) : null;
    }),

    getDetail: (forecastRunId) => read(async (): Promise<RunDetailRows | null> => {
      const [runRows, subjectRows, sectionRows] = await Promise.all([
        query(`SELECT ${RUN_COLUMNS}, r.scenario_assumptions, r.rule_snapshot, r.original_recommendations FROM public.forecast_run r WHERE r.forecast_run_id = $1`, [forecastRunId]),
        query(`SELECT d.demand_id, d.subject_id, s.subject_code, s.subject_name, s.credit_hours, s.class_type, d.eligible_count, d.forecast_count, d.uncertain_count,
            d.uncertainty_reasons, d.data_quality_status, d.configuration_status
          FROM public.forecast_subject_demand d JOIN public.subject s ON s.subject_id = d.subject_id WHERE d.forecast_run_id = $1 ORDER BY s.subject_code`, [forecastRunId]),
        query(`SELECT ps.proposed_section_id, ps.demand_id, ps.capacity_rule_id, ps.section_number, ps.expected_students, ps.review_status, ps.justification, ps.reviewed_by,
            ${isoSql('ps.reviewed_at')} AS reviewed_at, cr.minimum_enrollment, cr.break_even_target, cr.normal_maximum, cr.exception_maximum
          FROM public.proposed_class_section ps JOIN public.forecast_subject_demand d ON d.demand_id = ps.demand_id
          JOIN public.class_capacity_rule cr ON cr.capacity_rule_id = ps.capacity_rule_id WHERE d.forecast_run_id = $1 ORDER BY ps.demand_id, ps.section_number`, [forecastRunId]),
      ]);
      const head = runRows[0];
      if (!head) return null;
      return {
        run: runFrom(head),
        scenarioAssumptions: json<Record<string, unknown>>(head.scenario_assumptions) ?? {},
        ruleSnapshot: json<EngineRuleSnapshot>(head.rule_snapshot),
        originalRecommendations: json(head.original_recommendations) ?? [],
        subjects: subjectRows.map((row): RunSubjectRow => ({
          demandId: integer(row.demand_id), subjectId: integer(row.subject_id), subjectCode: text(row.subject_code), subjectName: text(row.subject_name),
          creditHours: integer(row.credit_hours), classType: (row.class_type == null ? null : text(row.class_type)) as ClassType,
          eligibleCount: nullableInteger(row.eligible_count), forecastCount: nullableInteger(row.forecast_count), uncertainCount: integer(row.uncertain_count ?? 0),
          uncertaintyReasons: json<UncertaintyReason[]>(row.uncertainty_reasons) ?? [], dataQualityStatus: text(row.data_quality_status) as ForecastQualityStatus,
          configurationStatus: text(row.configuration_status) as ForecastConfigurationStatus,
        })),
        sections: sectionRows.map((row): RunSectionRow => ({
          proposedSectionId: integer(row.proposed_section_id), demandId: integer(row.demand_id), capacityRuleId: integer(row.capacity_rule_id),
          sectionNumber: integer(row.section_number), expectedStudents: integer(row.expected_students), reviewStatus: text(row.review_status) as SectionReviewStatus,
          justification: nullableText(row.justification), reviewedBy: nullableText(row.reviewed_by), reviewedAt: nullableText(row.reviewed_at),
          minimumEnrollment: integer(row.minimum_enrollment), breakEvenTarget: integer(row.break_even_target), normalMaximum: integer(row.normal_maximum),
          exceptionMaximum: nullableInteger(row.exception_maximum),
        })),
      };
    }),

    listRuns: (scope, limit, beforeRunId) => read(async () => (await query(`SELECT ${RUN_COLUMNS},
        dm.subjects, dm.excluded, dm.not_offered, dm.config_required, dm.total_supported, dm.total_uncertain,
        sc.total_sections, sc.pending_sections, sc.below_minimum, sc.below_optimal
      FROM public.forecast_run r
      CROSS JOIN LATERAL (SELECT count(*) AS subjects,
          count(*) FILTER (WHERE d.configuration_status = 'EXCLUDED' AND COALESCE(r.scenario_assumptions->'subjects'->(d.subject_id::text)->>'semesterTypeExcluded', 'false') <> 'true') AS excluded,
          count(*) FILTER (WHERE d.configuration_status = 'EXCLUDED' AND r.scenario_assumptions->'subjects'->(d.subject_id::text)->>'semesterTypeExcluded' = 'true') AS not_offered,
          count(*) FILTER (WHERE d.configuration_status = 'CONFIGURATION_REQUIRED') AS config_required,
          COALESCE(sum(d.eligible_count) FILTER (WHERE d.configuration_status IS DISTINCT FROM 'EXCLUDED'), 0) AS total_supported,
          COALESCE(sum(d.uncertain_count) FILTER (WHERE d.configuration_status IS DISTINCT FROM 'EXCLUDED'), 0) AS total_uncertain
        FROM public.forecast_subject_demand d WHERE d.forecast_run_id = r.forecast_run_id) dm
      CROSS JOIN LATERAL (SELECT count(*) AS total_sections,
          count(*) FILTER (WHERE ps.review_status = 'PENDING') AS pending_sections,
          count(*) FILTER (WHERE ps.expected_students < cr.minimum_enrollment) AS below_minimum,
          count(*) FILTER (WHERE ps.expected_students < cr.break_even_target) AS below_optimal
        FROM public.proposed_class_section ps JOIN public.forecast_subject_demand d ON d.demand_id = ps.demand_id
        JOIN public.class_capacity_rule cr ON cr.capacity_rule_id = ps.capacity_rule_id WHERE d.forecast_run_id = r.forecast_run_id) sc
      WHERE r.programme_id = $1 AND r.learning_centre_id = $2 AND r.target_semester_id = $3 AND ($5::integer IS NULL OR r.forecast_run_id < $5::integer)
      ORDER BY r.forecast_run_id DESC LIMIT $4`, [scope.programmeId, scope.learningCentreId, scope.targetSemesterId, limit, beforeRunId]))
      .map((row): RunListRow => ({
        ...runFrom(row),
        summary: {
          subjects: integer(row.subjects), excludedSubjects: integer(row.excluded), notOfferedInSemesterTypeSubjects: integer(row.not_offered), configurationRequiredSubjects: integer(row.config_required),
          totalSupportedDemand: integer(row.total_supported), totalUncertain: integer(row.total_uncertain), totalSections: integer(row.total_sections),
          pendingSections: integer(row.pending_sections), sectionsBelowMinimum: integer(row.below_minimum), sectionsBelowOptimal: integer(row.below_optimal),
        },
      }))),

    listAudit: (forecastRunId, scope, limit, beforeAuditId) => read(async () => (await query(`SELECT a.adjustment_audit_id, a.forecast_run_id, d.subject_id, a.action,
        a.before_state, a.after_state, a.reason, a.recorded_by, ${isoSql('a.recorded_at')} AS recorded_at
      FROM public.forecast_adjustment_audit a LEFT JOIN public.forecast_subject_demand d ON d.demand_id = a.demand_id
      WHERE a.forecast_run_id = $1 AND ($3::bigint IS NULL OR a.adjustment_audit_id < $3::bigint) ORDER BY a.adjustment_audit_id DESC LIMIT $2`,
    [forecastRunId, limit, beforeAuditId])).map((row): ForecastAuditEntry => {
      const after = json<JsonObject>(row.after_state);
      const approvalReference = typeof after.approvalReference === 'string' ? after.approvalReference : undefined;
      return {
        decisionAuditId: integer(row.adjustment_audit_id), forecastRunId: integer(row.forecast_run_id), scope, subjectId: nullableInteger(row.subject_id),
        proposedSectionId: null, actionType: text(row.action), recordedBy: text(row.recorded_by), recordedAt: text(row.recorded_at), reason: text(row.reason),
        ...(approvalReference ? { approvalReference } : {}), before: json<JsonObject>(row.before_state), after,
      };
    })),

    startReview: (forecastRunId, expected, actor, reason) => run([
      ...guardRun(forecastRunId, expected),
      {
        text: `INSERT INTO public.forecast_adjustment_audit(forecast_run_id, demand_id, action, before_state, after_state, reason, recorded_by)
          VALUES ($1::integer, NULL, 'START_REVIEW', jsonb_build_object('status', $2::text), jsonb_build_object('status', 'UNDER_REVIEW'), $3::text, $4::text)`,
        values: [forecastRunId, expected.status, reason, actor],
      },
      { text: "UPDATE public.forecast_run SET status = 'UNDER_REVIEW' WHERE forecast_run_id = $1::integer AND status = 'DRAFT'", values: [forecastRunId] },
      selectRun(forecastRunId),
    ]),

    applyDecisions: (forecastRunId, expected, actor, plans) => {
      const statements: ForecastingStatement[] = [...guardRun(forecastRunId, expected)];
      for (const plan of plans) {
        if (plan.replace) {
          const { deleteSectionIds, keep, insert } = plan.replace;
          if (deleteSectionIds.length) {
            statements.push({ text: 'DELETE FROM public.proposed_class_section WHERE demand_id = $1::integer AND proposed_section_id = ANY($2::integer[])', values: [plan.demandId, deleteSectionIds] });
          }
          if (keep.length) {
            // Park kept sections on temporary numbers so renumbering can never collide with the (demand, section) unique key.
            statements.push({
              text: 'UPDATE public.proposed_class_section SET section_number = section_number + 1000 WHERE demand_id = $1::integer AND proposed_section_id = ANY($2::integer[])',
              values: [plan.demandId, keep.map((k) => k.proposedSectionId)],
            });
            statements.push({
              text: `UPDATE public.proposed_class_section ps SET section_number = k.n, expected_students = k.e, justification = k.j, review_status = $3::text,
                  reviewed_by = $4::text, reviewed_at = now()
                FROM jsonb_to_recordset($2::jsonb) AS k(id integer, n integer, e integer, j text) WHERE ps.proposed_section_id = k.id AND ps.demand_id = $1::integer`,
              values: [plan.demandId, JSON.stringify(keep.map((k) => ({ id: k.proposedSectionId, n: k.sectionNumber, e: k.expectedStudents, j: k.justification }))), plan.sectionStatus, actor],
            });
          }
          if (insert.length) {
            statements.push({
              text: `INSERT INTO public.proposed_class_section(demand_id, capacity_rule_id, section_number, expected_students, review_status, justification, reviewed_by, reviewed_at)
                SELECT $1::integer, i.capacity_rule_id, i.n, i.e, $3::text, i.j, $4::text, now()
                FROM jsonb_to_recordset($2::jsonb) AS i(capacity_rule_id integer, n integer, e integer, j text)`,
              values: [plan.demandId, JSON.stringify(insert.map((i) => ({ capacity_rule_id: i.capacityRuleId, n: i.sectionNumber, e: i.expectedStudents, j: i.justification }))), plan.sectionStatus, actor],
            });
          }
        } else {
          statements.push({
            // A reopened (PENDING) section is no longer reviewed, so it carries no reviewer; the audit row keeps who reopened it.
            text: `UPDATE public.proposed_class_section SET review_status = $2::text,
                reviewed_by = CASE WHEN $2::text = 'PENDING' THEN NULL ELSE $3::text END, reviewed_at = CASE WHEN $2::text = 'PENDING' THEN NULL ELSE now() END
              WHERE demand_id = $1::integer`,
            values: [plan.demandId, plan.sectionStatus, actor],
          });
        }
        statements.push({
          text: `INSERT INTO public.forecast_adjustment_audit(forecast_run_id, demand_id, action, before_state, after_state, reason, recorded_by)
            VALUES ($2::integer, $1::integer, $3::text, jsonb_build_object('sections', $4::jsonb),
              jsonb_build_object('sections', ${SECTIONS_AFTER}, 'approvalReference', $5::text), $6::text, $7::text)`,
          values: [plan.demandId, forecastRunId, plan.action, JSON.stringify(plan.before), plan.approvalReference, plan.reason, actor],
        });
      }
      statements.push(selectRun(forecastRunId));
      return run(statements);
    },

    finalize: (forecastRunId, expected, actor, audit) => run([
      ...guardRun(forecastRunId, expected),
      {
        text: `INSERT INTO public.forecast_adjustment_audit(forecast_run_id, demand_id, action, before_state, after_state, reason, recorded_by)
          VALUES ($1::integer, NULL, 'FINALIZE', jsonb_build_object('status', $2::text), jsonb_build_object('status', 'FINALIZED', 'approvalReference', $3::text), $4::text, $5::text)`,
        values: [forecastRunId, expected.status, audit.approvalReference, audit.reason, actor],
      },
      { text: "UPDATE public.forecast_run SET status = 'FINALIZED', finalized_by = $2::text, finalized_at = now() WHERE forecast_run_id = $1::integer AND status = 'UNDER_REVIEW'", values: [forecastRunId, actor] },
      selectRun(forecastRunId),
    ]),
  };
}

