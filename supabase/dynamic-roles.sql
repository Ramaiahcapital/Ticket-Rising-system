-- Migration: dynamic branch roles (admin-managed).
-- Run this in the Supabase SQL editor against your EXISTING database.
-- Creates a branch_roles table seeded with the original roles and removes the
-- hardcoded role check constraints so any role name is allowed.

-- 1. Roles table
create table if not exists public.branch_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#6B7280',
  "sortOrder" int not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- 2. Seed the original roles (kept in original order/colors)
insert into public.branch_roles (name, color, "sortOrder", "isActive") values
  ('IT', '#3B82F6', 1, true),
  ('Branch Admin', '#8B5CF6', 2, true),
  ('Manager', '#F59E0B', 3, true)
on conflict (name) do nothing;

-- 3. RLS + realtime
alter table public.branch_roles enable row level security;
drop policy if exists "branch_roles_admin_all" on public.branch_roles;
create policy "branch_roles_admin_all" on public.branch_roles
  for all using (true) with check (true);
drop policy if exists "branch_roles_branch_read" on public.branch_roles;
create policy "branch_roles_branch_read" on public.branch_roles
  for select using (true);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'branch_roles'
  ) then
    alter publication supabase_realtime add table public.branch_roles;
  end if;
end $$;

-- 4. Drop the hardcoded role check constraints so any role name is allowed.
--    Constraint names are case-sensitive (e.g. profiles_branchRole_check,
--    ticket_form_config_role_check), so match by pattern and drop with quoted
--    identifiers.
alter table public.profiles drop constraint if exists "profiles_branchRole_check";
alter table public.ticket_form_config drop constraint if exists "ticket_form_config_role_check";
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.connamespace = 'public'::regnamespace
      and c.contype = 'c'
      and (c.conname ilike '%branchrole%' or c.conname ilike '%_role_check%')
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
    raise notice 'dropped constraint % on %', r.conname, r.tbl;
  end loop;
end $$;
