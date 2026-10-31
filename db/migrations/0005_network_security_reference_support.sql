-- Additive curriculum-specific display/prerequisite metadata and private import receipts.
-- No existing public rows are updated, renamed, or deleted by this migration.
ALTER TABLE public.curriculum_subject
  ADD COLUMN display_name varchar(255),
  ADD COLUMN prerequisite_details jsonb,
  ADD CONSTRAINT curriculum_subject_display_name_nonblank
    CHECK (display_name IS NULL OR length(btrim(display_name)) > 0),
  ADD CONSTRAINT curriculum_subject_prerequisite_details_shape
    CHECK (
      prerequisite_details IS NULL OR (
        jsonb_typeof(prerequisite_details) = 'object'
        AND prerequisite_details ?& ARRAY['expression','conditions','fixedCourseEdgesShown','sourcePrerequisiteStatus']
        AND jsonb_typeof(prerequisite_details->'conditions') = 'array'
        AND jsonb_typeof(prerequisite_details->'fixedCourseEdgesShown') = 'boolean'
        AND jsonb_typeof(prerequisite_details->'sourcePrerequisiteStatus') = 'string'
      )
    );

CREATE TABLE migration_meta.reference_data_imports (
  dataset_id text PRIMARY KEY,
  curriculum_id integer NOT NULL UNIQUE
    REFERENCES public.curriculum(curriculum_id) ON DELETE RESTRICT,
  manifest_sha256 char(64) NOT NULL,
  manifest jsonb NOT NULL,
  receipt jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_data_imports_dataset_id_nonblank
    CHECK (length(btrim(dataset_id)) > 0),
  CONSTRAINT reference_data_imports_manifest_sha256_format
    CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT reference_data_imports_manifest_object
    CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT reference_data_imports_receipt_object
    CHECK (jsonb_typeof(receipt) = 'object')
);

REVOKE ALL ON SCHEMA migration_meta FROM PUBLIC;
REVOKE ALL ON migration_meta.reference_data_imports FROM PUBLIC;
