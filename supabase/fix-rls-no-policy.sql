-- ============================================================
--  FIX: Supabase Security Advisor warning rls_enabled_no_policy (INFO)
--  Run this ONCE in the Supabase SQL Editor. Idempotent.
--  The app accesses these tables only through the server (service_role key),
--  which BYPASSES RLS. Creating a service-role-only policy satisfies the linter
--  ("a policy exists") while keeping anon/authenticated fully locked out.
-- ============================================================

-- audit_logs
DROP POLICY IF EXISTS "Service role full access on audit_logs" ON public.audit_logs;
CREATE POLICY "Service role full access on audit_logs"
  ON public.audit_logs FOR ALL USING (auth.role() = 'service_role');

-- branches
DROP POLICY IF EXISTS "Service role full access on branches" ON public.branches;
CREATE POLICY "Service role full access on branches"
  ON public.branches FOR ALL USING (auth.role() = 'service_role');

-- email_templates
DROP POLICY IF EXISTS "Service role full access on email_templates" ON public.email_templates;
CREATE POLICY "Service role full access on email_templates"
  ON public.email_templates FOR ALL USING (auth.role() = 'service_role');

-- google_auth (also removes the old open `using(true)` policy if it exists)
DROP POLICY IF EXISTS "google_auth_admin_all" ON public.google_auth;
DROP POLICY IF EXISTS "Service role full access on google_auth" ON public.google_auth;
CREATE POLICY "Service role full access on google_auth"
  ON public.google_auth FOR ALL USING (auth.role() = 'service_role');

-- system_settings
DROP POLICY IF EXISTS "Service role full access on system_settings" ON public.system_settings;
CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings FOR ALL USING (auth.role() = 'service_role');

-- ticket_attachments
DROP POLICY IF EXISTS "Service role full access on ticket_attachments" ON public.ticket_attachments;
CREATE POLICY "Service role full access on ticket_attachments"
  ON public.ticket_attachments FOR ALL USING (auth.role() = 'service_role');

-- ticket_categories
DROP POLICY IF EXISTS "Service role full access on ticket_categories" ON public.ticket_categories;
CREATE POLICY "Service role full access on ticket_categories"
  ON public.ticket_categories FOR ALL USING (auth.role() = 'service_role');

-- ticket_priorities
DROP POLICY IF EXISTS "Service role full access on ticket_priorities" ON public.ticket_priorities;
CREATE POLICY "Service role full access on ticket_priorities"
  ON public.ticket_priorities FOR ALL USING (auth.role() = 'service_role');

-- ticket_subcategories
DROP POLICY IF EXISTS "Service role full access on ticket_subcategories" ON public.ticket_subcategories;
CREATE POLICY "Service role full access on ticket_subcategories"
  ON public.ticket_subcategories FOR ALL USING (auth.role() = 'service_role');