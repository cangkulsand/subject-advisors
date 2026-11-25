-- S3-P004-037: the student's intake year, recorded separately from the curriculum effective year.
-- Additive: one nullable smallint column; NULL means the intake year is not known yet (the student may set it once).
-- Backfill: every existing profile takes its curriculum's effective year (each programme had one active curriculum
-- when this was written). Idempotent: only rows still NULL are written, and curriculum_id is never touched, so the
-- preserve_student_curriculum guard is not involved. Effective years outside the allowed range are left NULL.
-- Rollback: ALTER TABLE public.student_profile DROP COLUMN intake_year;
ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS intake_year smallint
  CONSTRAINT student_profile_intake_year_range CHECK (intake_year IS NULL OR intake_year BETWEEN 1990 AND 2200);
UPDATE public.student_profile p SET intake_year=c.effective_year FROM public.curriculum c
  WHERE c.curriculum_id=p.curriculum_id AND p.intake_year IS NULL AND c.effective_year IS NOT NULL
    AND c.effective_year BETWEEN 1990 AND 2200;
