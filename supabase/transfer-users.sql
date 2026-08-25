create table if not exists transfer_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  department text,
  credential text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transfer_users enable row level security;

-- Allow authenticated users to read transfer_users
create policy "transfer_users_select" on transfer_users
  for select using (auth.role() = 'authenticated');

-- Allow admins to manage transfer_users
create policy "transfer_users_insert" on transfer_users
  for insert with check (auth.role() = 'authenticated');

create policy "transfer_users_update" on transfer_users
  for update using (auth.role() = 'authenticated');

create policy "transfer_users_delete" on transfer_users
  for delete using (auth.role() = 'authenticated');
