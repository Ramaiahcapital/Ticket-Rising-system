-- ============================================================
--  FIX: Supabase Security Advisor warnings
--  Run this ONCE in the Supabase SQL Editor. Idempotent.
--  Resolves:
--   - function_search_path_mutable
--       on set_branch_updated_at, set_stationary_updated_at, set_stationary_line_total
--   - anon_security_definer_function_executable
--       on handle_new_user, rls_auto_enable
--   - authenticated_security_definer_function_executable
--       on handle_new_user, rls_auto_enable
-- ============================================================

-- 1) Pin search_path on trigger functions so they never inherit a role-mutable
--    search_path. These functions only touch `new` / `now()` and reference no
--    schemas, so an empty search_path is safe and avoids cache poisoning.
ALTER FUNCTION public.set_branch_updated_at()      SET search_path = '';
ALTER FUNCTION public.set_stationary_updated_at()  SET search_path = '';
ALTER FUNCTION public.set_stationary_line_total()  SET search_path = '';

-- 2) handle_new_user() is a SECURITY DEFINER trigger that fires on auth.users
--    inserts. Triggers execute regardless of EXECUTE grants, so blocking direct
--    calls does not break profile auto-creation. Revoke from BOTH roles and from
--    PUBLIC so the anon/authenticated roles can no longer invoke it via
--    /rest/v1/rpc/handle_new_user.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 3) rls_auto_enable() is a SECURITY DEFINER helper created by the Supabase
--    platform (not used by this app). Same treatment.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;

-- 4) Prevent the platform from auto-granting EXECUTE to anon/authenticated on
--    newly created functions in public (Supabase-recommended default privilege
--    hardening). The app talks to the DB only through the server's service-role
--    client, so no function needs direct anon/authenticated EXECUTE.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;

-- Note on auth_leaked_password_protection: it is a project setting, not SQL.
-- Enable it in Dashboard -> Authentication -> Settings -> Leaked password
-- protection to finish clearing that warning.