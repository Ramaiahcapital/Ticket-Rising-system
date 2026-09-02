-- ============================================================
-- Branch entity (real-world branch) + link profiles & orders to it
-- Each physical branch = ONE branches row. Its IT / Branch Admin /
-- Manager users all point to the same branch via profiles.branchId.
-- Stationary orders are keyed to the BRANCH (one order per branch).
-- ============================================================

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  "contactPerson" text,
  address text,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdBy" uuid
);

create index if not exists idx_branches_code on public.branches(code);

-- branches.code is the authoritative unique key. profiles.branchCode is just
-- denormalized display data, so it must NOT be unique (many users share it).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_branchCode_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_branchCode_key;
  end if;
end $$;

-- Add branchId column to profiles (nullable for admins)
alter table public.profiles add column if not exists "branchId" uuid references public.branches(id) on delete set null;

-- ---- STEP 0: drop ANY existing FK on stationary_orders.branchId FIRST ----
-- (The original inline FK references profiles(id); it must be gone before we
--  rewrite branchId values, otherwise step 3 below violates it and aborts.)
do $$
declare r record;
begin
  for r in
    select con.conname as cname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.contype = 'f'
      and con.conrelid = 'public.stationary_orders'::regclass
      and att.attname = 'branchId'
  loop
    execute format('alter table public.stationary_orders drop constraint %I', r.cname);
  end loop;
end $$;

-- ---- Auto-migrate existing data ----
-- 1) Create one branches row per distinct (branchName, branchCode).
insert into public.branches (name, code, "contactPerson", address, "createdBy")
select
  max(p."branchName") as name,
  p."branchCode" as code,
  max(p."contactPerson") as "contactPerson",
  max(p.address) as address,
  max(p."createdBy"::text)::uuid as "createdBy"
from public.profiles p
where p.role = 'branch' and p."branchCode" is not null and p."branchName" is not null
group by p."branchCode"
on conflict (code) do nothing;

-- 2) Link each branch profile to its branch row.
update public.profiles p
set "branchId" = b.id
from public.branches b
where p.role = 'branch'
  and p."branchCode" = b.code
  and p."branchId" is null;

-- 3) Repoint existing stationary orders to the branch of their creator.
update public.stationary_orders o
set "branchId" = p."branchId"
from public.profiles p
where o."branchId" = p.id and p."branchId" is not null;

-- 4) Safety net: any order still pointing at a value NOT in branches ->
--    assign to a synthetic "Unassigned" branch so the FK can be added.
do $$
declare orphan_count int;
begin
  select count(*) into orphan_count
  from public.stationary_orders o
  left join public.branches b on b.id = o."branchId"
  where b.id is null;

  if orphan_count > 0 then
    insert into public.branches (name, code, "contactPerson", address)
    values ('Unassigned', 'UNASSIGNED', null, null)
    on conflict (code) do nothing;

    update public.stationary_orders o
    set "branchId" = (select id from public.branches where code = 'UNASSIGNED')
    where not exists (select 1 from public.branches b where b.id = o."branchId");
  end if;
end $$;

-- ---- STEP 5: add the new FK to branches (idempotent) ----
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stationary_orders_branchId_fkey'
      and conrelid = 'public.stationary_orders'::regclass
  ) then
    alter table public.stationary_orders
      add constraint stationary_orders_branchId_fkey
      foreign key ("branchId") references public.branches(id) on delete cascade;
  end if;
end $$;

-- Trigger: keep branches.updatedAt fresh
create or replace function public.set_branch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists trg_branches_updated on public.branches;
create trigger trg_branches_updated before update on public.branches
  for each row execute function public.set_branch_updated_at();
