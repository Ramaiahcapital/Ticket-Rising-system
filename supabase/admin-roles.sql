-- ============================================================
--  Sub-admin migration (revised)
--  Run this in the Supabase SQL editor.
--  Sub-admins are scoped to an existing branch role (department).
--  profiles."adminRole" stores the branch_roles.name that the
--  sub-admin handles. NULL = main admin (sees everything).
--  No separate admin_roles table is needed.
-- ============================================================

-- Cleanup: drop the admin_roles table from an earlier approach,
-- if it was ever created. No-op otherwise.
drop table if exists public.admin_roles;

-- Sub-admin department bucket = a branch_roles.name; NULL = main admin.
alter table public.profiles
  add column if not exists "adminRole" text;
