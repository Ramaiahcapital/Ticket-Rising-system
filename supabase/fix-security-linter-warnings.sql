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
--    calls does not break profile auto-creation. The anon/authenticated roles can
--    no longer invoke it via /rest/v1/rpc/handle_new_user (they'd get a
--    permission-denied error).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 3) rls_auto_enable() is a Supabase-generated SECURITY DEFINER helper not used
--    by this app. Same treatment.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- Note on auth_leaked_password_protection: it is a project setting, not SQL.
-- Enable it in Dashboard -> Authentication -> Settings -> Leaked password
-- protection to finish clearing that warning.