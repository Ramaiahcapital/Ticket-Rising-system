-- Per-user feature permissions.
--
-- Existing role columns (profiles.role / adminRole / branchRole / monitorRole /
-- canRaiseTicket / stationaryAccess) keep working exactly as before. This table
-- only stores *overrides* on top of the role defaults, so the Super Admin can
-- grant or revoke a feature for one specific user without touching code.
--
-- Effective permission = explicit row here (granted true/false)
--                        OR default derived from the user's role.
--
-- Feature keys currently understood by the app:
--   raise_ticket, view_department_tickets,
--   stationary_order, stationary_admin,
--   reports, audit_log,
--   manage_users, manage_departments, manage_settings,
--   email_notifications

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid,
  UNIQUE ("userId", permission)
);

CREATE INDEX IF NOT EXISTS user_permissions_user_idx
  ON public.user_permissions ("userId");

CREATE INDEX IF NOT EXISTS user_permissions_permission_idx
  ON public.user_permissions (permission);

-- Keep RLS enabled. The server uses the service-role key, which bypasses RLS;
-- this policy only lets a signed-in user read their own rows if the browser
-- ever queries the table directly.
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permissions_select_own" ON public.user_permissions;
CREATE POLICY "user_permissions_select_own"
  ON public.user_permissions
  FOR SELECT
  USING (auth.uid() = "userId");

-- Default new-ticket email routing. mode:
--   department = department admins + monitors (current behaviour)
--   all        = every active user with "email_notifications" enabled
--   custom     = only the addresses in customRecipients
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'ticket_notification_settings',
  '{"enabled":true,"mode":"department","customRecipients":[]}',
  'Who receives an email when a new ticket is created'
)
ON CONFLICT (key) DO NOTHING;
