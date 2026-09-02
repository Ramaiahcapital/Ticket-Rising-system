-- ============================================================
-- Fix: branch details missing on user creation
-- The handle_new_user trigger now carries branchName/branchCode/
-- contactPerson/mobile/address from user_metadata, and the app
-- uses upsert so the profile row is fully populated at creation.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, name, role, "branchRole", "branchName", "branchCode", "contactPerson", mobile, address, "createdAt", "updatedAt")
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'contactPerson'),
    coalesce(new.raw_user_meta_data ->> 'role', 'branch'),
    new.raw_user_meta_data ->> 'branchRole',
    new.raw_user_meta_data ->> 'branchName',
    new.raw_user_meta_data ->> 'branchCode',
    new.raw_user_meta_data ->> 'contactPerson',
    new.raw_user_meta_data ->> 'mobile',
    new.raw_user_meta_data ->> 'address',
    now(),
    now()
  )
  on conflict (id) do nothing;
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

-- Backfill: any existing branch profiles created with blank branch
-- details whose auth metadata still holds the original values.
update public.profiles p
set
  "branchName" = coalesce(p."branchName", u.raw_user_meta_data ->> 'branchName'),
  "branchCode" = coalesce(p."branchCode", u.raw_user_meta_data ->> 'branchCode'),
  "contactPerson" = coalesce(p."contactPerson", u.raw_user_meta_data ->> 'contactPerson'),
  mobile = coalesce(p.mobile, u.raw_user_meta_data ->> 'mobile'),
  address = coalesce(p.address, u.raw_user_meta_data ->> 'address'),
  "updatedAt" = now()
from auth.users u
where u.id = p.id
  and p.role = 'branch'
  and (p."branchName" is null or p."branchCode" is null);
