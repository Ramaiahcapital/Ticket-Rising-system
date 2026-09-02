-- ============================================================
--  FIX: allow multiple branch users to share the same branchCode
--  (one physical branch = many IT / Branch Admin / Manager users)
--  Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1) Drop the unique constraint on branchCode (root cause of the 500 "{}").
--    branches.code is the authoritative unique key; profiles.branchCode
--    is just denormalized display data and must NOT be unique.
alter table public.profiles drop constraint if exists profiles_branchCode_key;

-- 2) Make the auto-profile trigger resilient: it must never fail when a
--    second user is created for an existing branch, and it must copy
--    branchId so the router's backfill is not required.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, username, name, role,
    "branchRole", "branchName", "branchCode", "branchId",
    "contactPerson", mobile, address, "createdAt", "updatedAt"
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'contactPerson'),
    coalesce(new.raw_user_meta_data ->> 'role', 'branch'),
    new.raw_user_meta_data ->> 'branchRole',
    new.raw_user_meta_data ->> 'branchName',
    new.raw_user_meta_data ->> 'branchCode',
    nullif(new.raw_user_meta_data ->> 'branchId', '')::uuid,
    new.raw_user_meta_data ->> 'contactPerson',
    new.raw_user_meta_data ->> 'mobile',
    new.raw_user_meta_data ->> 'address',
    now(),
    now()
  )
  on conflict (id) do update set
    email          = excluded.email,
    username       = coalesce(excluded.username, profiles.username),
    name           = coalesce(excluded.name, profiles.name),
    role           = coalesce(excluded.role, profiles.role),
    "branchRole"   = coalesce(excluded."branchRole", profiles."branchRole"),
    "branchName"   = coalesce(excluded."branchName", profiles."branchName"),
    "branchCode"   = coalesce(excluded."branchCode", profiles."branchCode"),
    "branchId"     = coalesce(excluded."branchId", profiles."branchId"),
    "contactPerson"= coalesce(excluded."contactPerson", profiles."contactPerson"),
    mobile         = coalesce(excluded.mobile, profiles.mobile),
    address        = coalesce(excluded.address, profiles.address),
    "updatedAt"    = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY: this SECURITY DEFINER trigger must not be callable directly via
-- /rest/v1/rpc/handle_new_user (triggers run regardless of EXECUTE grants).
revoke execute on function public.handle_new_user() from public;

-- 3) Make sure the router's backfill (branches.sql) also can't trip on it.
--    (idempotent no-op if already applied)
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
