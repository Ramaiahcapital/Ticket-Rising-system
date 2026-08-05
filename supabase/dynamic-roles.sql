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
alter publication supabase_realtime add table public.branch_roles;

-- 4. Drop the hardcoded role check constraints so any role name is allowed
alter table public.profiles drop constraint if exists profiles_branchRole_check;
alter table public.tickets drop constraint if exists tickets_branchRole_check;
alter table public.ticket_form_config drop constraint if exists ticket_form_config_role_check;
