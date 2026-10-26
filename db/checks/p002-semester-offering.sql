-- Read-only metadata check for the existing canonical INTEGER offering schema.
SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.is_identity
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('programme','curriculum','subject','curriculum_subject','academic_semester','student_profile','semester_offering')
ORDER BY c.table_name, c.ordinal_position;

SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'semester_offering'
ORDER BY c.conname;
