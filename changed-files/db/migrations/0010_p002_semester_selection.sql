CREATE TABLE public.p002_semester_selection (
  student_id integer NOT NULL REFERENCES public.student_profile(student_id) ON DELETE RESTRICT,
  semester_id integer NOT NULL REFERENCES public.academic_semester(semester_id) ON DELETE RESTRICT,
  plan_id integer NOT NULL UNIQUE REFERENCES public.academic_plan(plan_id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  confirmation_id integer REFERENCES public.offering_confirmation(confirmation_id) ON DELETE RESTRICT,
  source_revision varchar(80) NOT NULL CHECK (length(btrim(source_revision)) > 0),
  PRIMARY KEY (student_id, semester_id)
);

REVOKE ALL ON public.p002_semester_selection FROM PUBLIC;
