-- Per-user granular ticket access by department.
--
-- Replaces the coarse "view_department_tickets" permission with explicit
-- per-department control:
--   view = can see tickets routed to that department (read-only)
--   edit = can see and act on tickets routed to that department
--
-- Effective access = explicit rows in this table take precedence.
-- If no rows exist for a user, we fall back to role-based defaults.
--
-- Super Admins (main admin, adminRole null) have full access to all
-- departments regardless of rows in this table.

CREATE TABLE IF NOT EXISTS public.user_ticket_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department text NOT NULL,
  level text NOT NULL CHECK (level IN ('none', 'view', 'edit')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid,
  UNIQUE ("userId", department)
);

CREATE INDEX IF NOT EXISTS user_ticket_access_user_idx
  ON public.user_ticket_access ("userId");

CREATE INDEX IF NOT EXISTS user_ticket_access_dept_idx
  ON public.user_ticket_access (department);

-- RLS enabled. Server uses service-role key (bypasses RLS).
ALTER TABLE public.user_ticket_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ticket_access_select_own" ON public.user_ticket_access;
CREATE POLICY "user_ticket_access_select_own"
  ON public.user_ticket_access
  FOR SELECT
  USING (auth.uid() = "userId");

-- Make PostgREST pick up the new table immediately instead of returning
-- "Could not find the table ... in the schema cache" until the next reload.
NOTIFY pgrst, 'reload schema';
