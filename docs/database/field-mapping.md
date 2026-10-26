# SRS field mapping

Source: SRS/SDD v2.0, chapter 5.2. Source hash: 41a79fc45b37a429d1871bfc739d6edc76ae36188750398fe92f4c26fecd9168.
All 26 domain tables and 171 columns are mapped below. Unspecified nullability is a documented development tightening, not an SRS claim.

## Programme -> programme

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| programme_id | INTEGER; PK; NOT NULL | programme_id integer | NOT NULL |  |
| programme_code | VARCHAR(20); U; NOT NULL | programme_code varchar(20) | NOT NULL |  |
| programme_name | VARCHAR(255); NOT NULL | programme_name varchar(255) | NOT NULL |  |
| level | VARCHAR(50); NULL | level varchar(50) | nullable |  |
| status | VARCHAR(20); NULL | status varchar(20) | nullable |  |

## Curriculum -> curriculum

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| curriculum_id | INTEGER; PK; NOT NULL | curriculum_id integer | NOT NULL |  |
| curriculum_version | VARCHAR(20); NOT NULL | curriculum_version varchar(20) | NOT NULL |  |
| total_credit_required | INTEGER; NOT NULL | total_credit_required integer | NOT NULL |  |
| effective_year | INTEGER; NULL | effective_year integer | nullable |  |
| status | VARCHAR(20); NULL | status varchar(20) | nullable |  |
| programme_id | INTEGER; FK; NOT NULL | programme_id integer | NOT NULL | programme.programme_id |

## Subject -> subject

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| subject_id | INTEGER; PK; NOT NULL | subject_id integer | NOT NULL |  |
| subject_code | VARCHAR(20); U; NOT NULL | subject_code varchar(20) | NOT NULL |  |
| subject_name | VARCHAR(255); NOT NULL | subject_name varchar(255) | NOT NULL |  |
| credit_hours | INTEGER; NOT NULL | credit_hours integer | NOT NULL |  |
| subject_category | VARCHAR(50); NULL | subject_category varchar(50) | nullable |  |
| status | VARCHAR(20); NULL | status varchar(20) | nullable |  |
| include_in_offering_forecast | BOOLEAN; NOT NULL; DEFAULT TRUE | include_in_offering_forecast boolean | NOT NULL |  |
| class_type | VARCHAR(20); NULL | class_type varchar(20) | nullable |  |

## CurriculumSubject -> curriculum_subject

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| curriculum_subject_id | INTEGER; PK; NOT NULL | curriculum_subject_id integer | NOT NULL |  |
| is_compulsory | SMALLINT; NOT NULL | is_compulsory smallint | NOT NULL |  |
| subject_category | VARCHAR(50); NOT NULL | subject_category varchar(50) | NOT NULL |  |
| curriculum_id | INTEGER; FK; NOT NULL | curriculum_id integer | NOT NULL | curriculum.curriculum_id |
| subject_id | INTEGER; FK; NOT NULL | subject_id integer | NOT NULL | subject.subject_id |

## CurriculumRequirement -> curriculum_requirement

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| requirement_id | INTEGER; PK; NOT NULL | requirement_id integer | NOT NULL |  |
| requirement_type | VARCHAR(30); NOT NULL | requirement_type varchar(30) | NOT NULL |  |
| required_credits | INTEGER; NULL | required_credits integer | nullable |  |
| required_subjects | INTEGER; NULL | required_subjects integer | nullable |  |
| Curriculumcurriculum_id | INTEGER; FK; NOT NULL | curriculum_id integer | NOT NULL | curriculum.curriculum_id |

## SubjectPrerequisite -> subject_prerequisite

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| prerequisite_id | INTEGER; PK; NOT NULL | prerequisite_id integer | NOT NULL |  |
| requirement_type | VARCHAR(20); NOT NULL | requirement_type varchar(20) | NOT NULL |  |
| curriculum_subject_id | INTEGER; FK; NOT NULL | curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |
| required_curriculum_subject_id | INTEGER; FK; NOT NULL | required_curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |

## SubjectSemesterRule -> subject_semester_rule

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| rule_id | INTEGER; PK; NOT NULL | rule_id integer | NOT NULL |  |
| semester_type | VARCHAR(10); NOT NULL | semester_type varchar(10) | NOT NULL |  |
| curriculum_subject_id | INTEGER; FK; NOT NULL | curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |

## AcademicSemester -> academic_semester

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| semester_id | INTEGER; PK; NOT NULL | semester_id integer | NOT NULL |  |
| academic_year | VARCHAR(9); NOT NULL | academic_year varchar(9) | NOT NULL |  |
| semester_no | SMALLINT; NOT NULL | semester_no smallint | NOT NULL |  |
| semester_type | VARCHAR(10); NOT NULL | semester_type varchar(10) | NOT NULL |  |
| max_subjects | SMALLINT; NOT NULL | max_subjects smallint | NOT NULL |  |
| max_credits | SMALLINT; NOT NULL | max_credits smallint | NOT NULL |  |
| start_date | DATE; NULL | start_date date | nullable |  |
| end_date | DATE; NULL | end_date date | nullable |  |

## StudentProfile -> student_profile

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| student_id | INTEGER; PK; NOT NULL | student_id integer | NOT NULL |  |
| clerk_user_id | VARCHAR(255); U; NOT NULL | clerk_user_id varchar(255) | NOT NULL |  |
| matric_no | VARCHAR(30); NULL | matric_no varchar(30) | nullable |  |
| student_name | VARCHAR(255); NOT NULL | student_name varchar(255) | NOT NULL |  |
| weekly_working_hours | INTEGER; NULL | weekly_working_hours integer | nullable |  |
| available_study_hours | INTEGER; NULL | available_study_hours integer | nullable |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| updated_at | TIMESTAMP; NOT NULL | updated_at timestamptz | NOT NULL |  |
| curriculum_id | INTEGER; FK; NOT NULL | curriculum_id integer | NOT NULL | curriculum.curriculum_id |

## AcademicRecord -> academic_record

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| record_id | INTEGER; PK; NOT NULL | record_id integer | NOT NULL |  |
| status | VARCHAR(20); NOT NULL | status varchar(20) | NOT NULL |  |
| grade | VARCHAR(5); NULL | grade varchar(5) | nullable |  |
| recognized_credits | INTEGER; NOT NULL | recognized_credits integer | NOT NULL |  |
| remarks | VARCHAR(255); NULL | remarks varchar(255) | nullable |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| student_id | INTEGER; FK; NOT NULL | student_id integer | NOT NULL | student_profile.student_id |
| subject_id | INTEGER; FK; NOT NULL | subject_id integer | NOT NULL | subject.subject_id |
| semester_id | INTEGER; FK, NULL | semester_id integer | nullable | academic_semester.semester_id |

## SemesterOffering -> semester_offering

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| offering_id | INTEGER; PK; NOT NULL | offering_id integer | NOT NULL |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| student_id | INTEGER; FK; NOT NULL | student_id integer | NOT NULL | student_profile.student_id |
| semester_id | INTEGER; FK; NOT NULL | semester_id integer | NOT NULL | academic_semester.semester_id |
| curriculum_subject_id | INTEGER; FK; NOT NULL | curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |

## AcademicPlan -> academic_plan

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| plan_id | INTEGER; PK; NOT NULL | plan_id integer | NOT NULL |  |
| plan_name | VARCHAR(100); NULL | plan_name varchar(100) | nullable |  |
| plan_type | VARCHAR(30); NOT NULL | plan_type varchar(30) | NOT NULL |  |
| status | VARCHAR(20); NOT NULL | status varchar(20) | NOT NULL |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| updated_at | TIMESTAMP; NOT NULL | updated_at timestamptz | NOT NULL |  |
| student_id | INTEGER; FK; NOT NULL | student_id integer | NOT NULL | student_profile.student_id |

## PlanSubject -> plan_subject

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| plan_subject_id | INTEGER; PK; NOT NULL | plan_subject_id integer | NOT NULL |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| plan_id | INTEGER; FK; NOT NULL | plan_id integer | NOT NULL | academic_plan.plan_id |
| curriculum_subject_id | INTEGER; FK; NOT NULL | curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |
| semester_id | INTEGER; FK; NOT NULL | semester_id integer | NOT NULL | academic_semester.semester_id |

## SimulationScenario -> simulation_scenario

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| scenario_id | INTEGER; PK; NOT NULL | scenario_id integer | NOT NULL |  |
| scenario_name | VARCHAR(100); NOT NULL | scenario_name varchar(100) | NOT NULL |  |
| description | VARCHAR(255); NULL | description varchar(255) | nullable |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| student_id | INTEGER; FK; NOT NULL | student_id integer | NOT NULL | student_profile.student_id |
| source_plan_id | INTEGER; FK, NULL | source_plan_id integer | nullable | academic_plan.plan_id |

## SimulationSubject -> simulation_subject

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| simulation_subject_id | INTEGER; PK; NOT NULL | simulation_subject_id integer | NOT NULL |  |
| change_type | VARCHAR(20); NOT NULL | change_type varchar(20) | NOT NULL |  |
| hypothetical_status | VARCHAR(20); NULL | hypothetical_status varchar(20) | nullable |  |
| remarks | VARCHAR(255); NULL | remarks varchar(255) | nullable |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| scenario_id | INTEGER; FK; NOT NULL | scenario_id integer | NOT NULL | simulation_scenario.scenario_id |
| curriculum_subject_id | INTEGER; FK; NOT NULL | curriculum_subject_id integer | NOT NULL | curriculum_subject.curriculum_subject_id |
| proposed_semester_id | INTEGER; FK, NULL | proposed_semester_id integer | nullable | academic_semester.semester_id |

## LearningCentre -> learning_centre

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| learning_centre_id | INTEGER; PK | learning_centre_id integer | NOT NULL |  |
| centre_code | VARCHAR(10); U | centre_code varchar(10) | chosen NOT NULL (source unspecified) |  |
| centre_name | VARCHAR(100) | centre_name varchar(100) | chosen NOT NULL (source unspecified) |  |

## AcademicImportBatch -> academic_import_batch

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| import_batch_id | INTEGER; PK | import_batch_id integer | NOT NULL |  |
| learning_centre_id | INTEGER; FK | learning_centre_id integer | chosen NOT NULL (source unspecified) | learning_centre.learning_centre_id |
| snapshot_date | DATE | snapshot_date date | chosen NOT NULL (source unspecified) |  |
| provided_by | VARCHAR(255) | provided_by varchar(255) | chosen NOT NULL (source unspecified) |  |
| source_label | VARCHAR(255) | source_label varchar(255) | chosen NOT NULL (source unspecified) |  |
| import_status | VARCHAR(20) | import_status varchar(20) | chosen NOT NULL (source unspecified) |  |
| provided_at | TIMESTAMP | provided_at timestamptz | chosen NOT NULL (source unspecified) |  |

## ImportedStudent -> imported_student

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| imported_student_id | INTEGER; PK | imported_student_id integer | NOT NULL |  |
| import_batch_id | INTEGER; FK | import_batch_id integer | chosen NOT NULL (source unspecified) | academic_import_batch.import_batch_id |
| curriculum_id | INTEGER; FK | curriculum_id integer | chosen NOT NULL (source unspecified) | curriculum.curriculum_id |
| external_reference | VARCHAR(100) | external_reference varchar(100) | chosen NOT NULL (source unspecified) |  |
| cohort_status | VARCHAR(20) | cohort_status varchar(20) | chosen NOT NULL (source unspecified) |  |

## ImportedSubjectRecord -> imported_subject_record

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| import_record_id | INTEGER; PK | import_record_id integer | NOT NULL |  |
| imported_student_id | INTEGER; FK | imported_student_id integer | chosen NOT NULL (source unspecified) | imported_student.imported_student_id |
| subject_id | INTEGER; FK | subject_id integer | chosen NOT NULL (source unspecified) | subject.subject_id |
| subject_status | VARCHAR(20) | subject_status varchar(20) | chosen NOT NULL (source unspecified) |  |
| semester_id | INTEGER; FK, NULL | semester_id integer | nullable | academic_semester.semester_id |
| is_synthetic | BOOLEAN | is_synthetic boolean | chosen NOT NULL (source unspecified) |  |

## ClassCapacityRule -> class_capacity_rule

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| capacity_rule_id | INTEGER; PK | capacity_rule_id integer | NOT NULL |  |
| class_type | VARCHAR(20) | class_type varchar(20) | chosen NOT NULL (source unspecified) |  |
| minimum_enrollment | INTEGER | minimum_enrollment integer | chosen NOT NULL (source unspecified) |  |
| break_even_target | INTEGER | break_even_target integer | chosen NOT NULL (source unspecified) |  |
| normal_maximum | INTEGER | normal_maximum integer | chosen NOT NULL (source unspecified) |  |
| exception_maximum | INTEGER; NULL | exception_maximum integer | nullable |  |
| is_active | BOOLEAN | is_active boolean | chosen NOT NULL (source unspecified) |  |

## ForecastRun -> forecast_run

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| forecast_run_id | INTEGER; PK | forecast_run_id integer | NOT NULL |  |
| import_batch_id | INTEGER; FK | import_batch_id integer | chosen NOT NULL (source unspecified) | academic_import_batch.import_batch_id |
| target_semester_id | INTEGER; FK | target_semester_id integer | chosen NOT NULL (source unspecified) | academic_semester.semester_id |
| scenario_assumptions | JSONB | scenario_assumptions jsonb | chosen NOT NULL (source unspecified) |  |
| generated_by | VARCHAR(255) | generated_by varchar(255) | chosen NOT NULL (source unspecified) |  |
| generated_at | TIMESTAMP | generated_at timestamptz | chosen NOT NULL (source unspecified) |  |
| status | VARCHAR(20) | status varchar(20) | chosen NOT NULL (source unspecified) |  |
| learning_centre_id | INTEGER; FK | learning_centre_id integer | chosen NOT NULL (source unspecified) | learning_centre.learning_centre_id |
| version_number | INTEGER; NOT NULL | version_number integer | NOT NULL |  |
| parent_forecast_run_id | INTEGER; FK, NULL | parent_forecast_run_id integer | nullable | forecast_run.forecast_run_id |
| finalized_by | VARCHAR(255); NULL | finalized_by varchar(255) | nullable |  |
| finalized_at | TIMESTAMP; NULL | finalized_at timestamptz | nullable |  |

## ForecastSubjectDemand -> forecast_subject_demand

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| demand_id | INTEGER; PK | demand_id integer | NOT NULL |  |
| forecast_run_id | INTEGER; FK | forecast_run_id integer | chosen NOT NULL (source unspecified) | forecast_run.forecast_run_id |
| subject_id | INTEGER; FK | subject_id integer | chosen NOT NULL (source unspecified) | subject.subject_id |
| eligible_count | INTEGER; NULL | eligible_count integer | nullable |  |
| forecast_count | INTEGER; NULL | forecast_count integer | nullable |  |
| graduation_critical_count | INTEGER; NULL | graduation_critical_count integer | nullable |  |
| data_quality_status | VARCHAR(30) | data_quality_status varchar(30) | chosen NOT NULL (source unspecified) |  |

## ProposedClassSection -> proposed_class_section

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| proposed_section_id | INTEGER; PK | proposed_section_id integer | NOT NULL |  |
| demand_id | INTEGER; FK | demand_id integer | chosen NOT NULL (source unspecified) | forecast_subject_demand.demand_id |
| capacity_rule_id | INTEGER; FK | capacity_rule_id integer | chosen NOT NULL (source unspecified) | class_capacity_rule.capacity_rule_id |
| section_number | SMALLINT | section_number smallint | chosen NOT NULL (source unspecified) |  |
| expected_students | INTEGER | expected_students integer | chosen NOT NULL (source unspecified) |  |
| review_status | VARCHAR(30) | review_status varchar(30) | chosen NOT NULL (source unspecified) |  |
| justification | TEXT; NULL | justification text | nullable |  |
| reviewed_by | VARCHAR(255); NULL | reviewed_by varchar(255) | nullable |  |
| reviewed_at | TIMESTAMP; NULL | reviewed_at timestamptz | nullable |  |

## UserAccessAssignment -> user_access_assignment

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| access_assignment_id | INTEGER; PK | access_assignment_id integer | NOT NULL |  |
| clerk_user_id | VARCHAR(255); U; NOT NULL | clerk_user_id varchar(255) | NOT NULL |  |
| app_role | VARCHAR(30); NOT NULL | app_role varchar(30) | NOT NULL |  |
| access_status | VARCHAR(20); NOT NULL | access_status varchar(20) | NOT NULL |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |
| updated_at | TIMESTAMP; NOT NULL | updated_at timestamptz | NOT NULL |  |

## UserAccessAuditLog -> user_access_audit_log

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| access_audit_id | INTEGER; PK | access_audit_id integer | NOT NULL |  |
| access_assignment_id | INTEGER; FK; NOT NULL | access_assignment_id integer | NOT NULL | user_access_assignment.access_assignment_id |
| performed_by_clerk_user_id | VARCHAR(255); NOT NULL | performed_by_clerk_user_id varchar(255) | NOT NULL |  |
| change_type | VARCHAR(30); NOT NULL | change_type varchar(30) | NOT NULL |  |
| old_value | VARCHAR(50); NULL | old_value varchar(50) | nullable |  |
| new_value | VARCHAR(50); NOT NULL | new_value varchar(50) | NOT NULL |  |
| reason | TEXT; NULL | reason text | nullable |  |
| created_at | TIMESTAMP; NOT NULL | created_at timestamptz | NOT NULL |  |

## ForecastDecisionAuditLog -> forecast_decision_audit_log

| Source field | Source declaration | SQL field/type | Required | Reference |
| --- | --- | --- | --- | --- |
| decision_audit_id | INTEGER; PK | decision_audit_id integer | NOT NULL |  |
| proposed_section_id | INTEGER; FK; NOT NULL | proposed_section_id integer | NOT NULL | proposed_class_section.proposed_section_id |
| action_type | VARCHAR(30); NOT NULL | action_type varchar(30) | NOT NULL |  |
| old_status | VARCHAR(30); NULL | old_status varchar(30) | nullable |  |
| new_status | VARCHAR(30); NOT NULL | new_status varchar(30) | NOT NULL |  |
| reason | TEXT; NULL | reason text | nullable |  |
| recorded_by | VARCHAR(255); NOT NULL | recorded_by varchar(255) | NOT NULL |  |
| recorded_at | TIMESTAMP; NOT NULL | recorded_at timestamptz | NOT NULL |  |
