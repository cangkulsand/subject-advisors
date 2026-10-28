ALTER TABLE public.student_profile
  ADD COLUMN current_semester_id integer NULL;

ALTER TABLE public.student_profile
  ADD CONSTRAINT student_profile_current_semester_id_fkey
  FOREIGN KEY (current_semester_id)
  REFERENCES public.academic_semester (semester_id)
  ON DELETE RESTRICT;
