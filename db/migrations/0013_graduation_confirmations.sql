-- S3-P004-001 (UC13 graduation check): student-confirmed fees-cleared and MUET timestamps on student_profile.
-- Both columns are nullable with no default; NULL means the student has not confirmed.
-- Rollback: ALTER TABLE public.student_profile DROP COLUMN fees_cleared_confirmed_at, DROP COLUMN muet_confirmed_at;
ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS fees_cleared_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS muet_confirmed_at timestamptz;
