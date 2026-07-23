-- Google OAuth tokens for email sending
create table if not exists public.google_auth (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null unique references public.profiles(id) on delete cascade,
  "accessToken" text not null,
  "refreshToken" text not null,
  "tokenExpiry" timestamptz not null,
  "googleEmail" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table public.google_auth enable row level security;

drop policy if exists "google_auth_admin_all" on public.google_auth;
create policy "google_auth_admin_all" on public.google_auth
  for all using (true) with check (true);

create index if not exists idx_google_auth_user on public.google_auth("userId");
