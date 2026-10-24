-- P004 only. No dependency on StudentProfile or reference catalogue tables.
CREATE TABLE user_access_assignment (
  access_assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE CHECK (length(trim(clerk_user_id)) > 0),
  app_role text NOT NULL CHECK (app_role IN ('STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN')),
  access_status text NOT NULL CHECK (access_status IN ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
