-- ============================================================
--  Ticket Rising — Supabase schema (Postgres)
--  Run this in the Supabase SQL editor (or via psql).
--  Column names are quoted camelCase so they match the app's
--  client code exactly (PostgREST preserves quoted identifiers).
-- ============================================================

-- ─── Profiles (replaces users + branch_users) ──────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  avatar text,
  role text not null default 'branch' check (role in ('admin', 'branch')),
  username text,
  "branchName" text,
  "branchCode" text,
  "contactPerson" text,
  "branchRole" text check ("branchRole" in ('IT', 'Branch Admin', 'Manager')),
  mobile text,
  address text,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "lastLoginAt" timestamptz,
  "createdBy" uuid references public.profiles (id)
);

-- Auto-create a profile row whenever a Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, name, role, "branchRole", "branchName", "branchCode", "branchId", "contactPerson", mobile, address, "createdAt", "updatedAt")
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
    email = excluded.email,
    username = coalesce(excluded.username, profiles.username),
    name = coalesce(excluded.name, profiles.name),
    role = coalesce(excluded.role, profiles.role),
    "branchRole" = coalesce(excluded."branchRole", profiles."branchRole"),
    "branchName" = coalesce(excluded."branchName", profiles."branchName"),
    "branchCode" = coalesce(excluded."branchCode", profiles."branchCode"),
    "branchId" = coalesce(excluded."branchId", profiles."branchId"),
    "contactPerson" = coalesce(excluded."contactPerson", profiles."contactPerson"),
    mobile = coalesce(excluded.mobile, profiles.mobile),
    address = coalesce(excluded.address, profiles.address),
    "updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Ticket Statuses ────────────────────────────────────────────
create table if not exists public.ticket_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3B82F6',
  "isOpen" boolean not null default true,
  "isDefault" boolean not null default false,
  "isEnabled" boolean not null default true,
  "sortOrder" int not null default 0,
  description text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ─── Ticket Priorities ──────────────────────────────────────────
create table if not exists public.ticket_priorities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  "isDefault" boolean not null default false,
  "sortOrder" int not null default 0,
  "createdAt" timestamptz not null default now()
);

-- ─── Ticket Categories ──────────────────────────────────────────
create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ─── Ticket Subcategories ───────────────────────────────────────
create table if not exists public.ticket_subcategories (
  id uuid primary key default gen_random_uuid(),
  "categoryId" uuid not null references public.ticket_categories (id) on delete cascade,
  name text not null,
  description text,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now()
);

-- ─── Tickets ────────────────────────────────────────────────────
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  "ticketNumber" text not null unique,
  subject text not null,
  description text not null,
  "categoryId" uuid references public.ticket_categories (id),
  "subcategoryId" uuid references public.ticket_subcategories (id),
  "priorityId" uuid references public.ticket_priorities (id),
  "statusId" uuid references public.ticket_statuses (id),
  department text,
  "branchRole" text check ("branchRole" in ('IT', 'Branch Admin', 'Manager')),
  "branchId" uuid not null references public.profiles (id),
  "createdBy" uuid not null references public.profiles (id),
  "assignedTo" uuid references public.profiles (id),
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "solvedAt" timestamptz,
  "closedAt" timestamptz
);

-- ─── Ticket Timeline ────────────────────────────────────────────
create table if not exists public.ticket_timeline (
  id uuid primary key default gen_random_uuid(),
  "ticketId" uuid not null references public.tickets (id) on delete cascade,
  action text not null,
  "actorId" uuid not null,
  "actorType" text not null check ("actorType" in ('admin', 'branch')),
  "actorName" text not null,
  "previousValue" text,
  "newValue" text,
  description text,
  metadata text,
  "createdAt" timestamptz not null default now()
);

-- ─── Ticket Comments ────────────────────────────────────────────
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  "ticketId" uuid not null references public.tickets (id) on delete cascade,
  content text not null,
  "contentHtml" text,
  "authorId" uuid not null,
  "authorType" text not null check ("authorType" in ('admin', 'branch')),
  "authorName" text not null,
  "isInternal" boolean not null default false,
  "parentId" uuid references public.ticket_comments (id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ─── Ticket Attachments ─────────────────────────────────────────
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  "ticketId" uuid not null references public.tickets (id) on delete cascade,
  "commentId" uuid references public.ticket_comments (id) on delete cascade,
  "fileName" text not null,
  "fileType" text not null,
  "fileSize" int not null,
  "filePath" text not null,
  "uploadedBy" uuid not null,
  "uploadedByType" text not null check ("uploadedByType" in ('admin', 'branch')),
  "createdAt" timestamptz not null default now()
);

-- ─── Notifications ──────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  "recipientId" uuid not null,
  "recipientType" text not null check ("recipientType" in ('admin', 'branch')),
  title text not null,
  message text not null,
  type text not null,
  "ticketId" uuid,
  "isRead" boolean not null default false,
  "createdAt" timestamptz not null default now()
);

-- ─── Audit Logs ─────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid,
  "userType" text not null check ("userType" in ('admin', 'branch', 'system')),
  "userName" text,
  action text not null,
  "entityType" text not null,
  "entityId" uuid,
  details text,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz not null default now()
);

-- ─── System Settings ────────────────────────────────────────────
create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  description text,
  "updatedAt" timestamptz not null default now(),
  "updatedBy" uuid
);

-- ─── Email Templates ────────────────────────────────────────────
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  "isEnabled" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────
create index if not exists idx_tickets_branch on public.tickets ("branchId");
create index if not exists idx_tickets_status on public.tickets ("statusId");
create index if not exists idx_tickets_created on public.tickets ("createdAt");
create index if not exists idx_notifications_recipient on public.notifications ("recipientId", "recipientType");
create index if not exists idx_profiles_role on public.profiles (role);

-- ============================================================
--  Seed default data
-- ============================================================

-- Ticket number settings
insert into public.system_settings (key, value, description)
values ('ticket_number_format', 'RC-YYYY-XXXXXX', 'Format for generated ticket numbers')
on conflict (key) do nothing;
insert into public.system_settings (key, value, description)
values ('ticket_number_counter', '0', 'Counter for generated ticket numbers')
on conflict (key) do nothing;

-- Default statuses
insert into public.ticket_statuses (name, color, "isOpen", "isDefault", "isEnabled", "sortOrder")
values ('Open', '#3B82F6', true, true, true, 1) on conflict do nothing;
insert into public.ticket_statuses (name, color, "isOpen", "isDefault", "isEnabled", "sortOrder")
values ('In Progress', '#F59E0B', true, false, true, 2) on conflict do nothing;
insert into public.ticket_statuses (name, color, "isOpen", "isDefault", "isEnabled", "sortOrder")
values ('Solved', '#10B981', false, false, true, 3) on conflict do nothing;
insert into public.ticket_statuses (name, color, "isOpen", "isDefault", "isEnabled", "sortOrder")
values ('Closed', '#6B7280', false, false, true, 4) on conflict do nothing;

-- Default priorities
insert into public.ticket_priorities (name, color, "isDefault", "sortOrder")
values ('Low', '#6B7280', false, 1) on conflict do nothing;
insert into public.ticket_priorities (name, color, "isDefault", "sortOrder")
values ('Medium', '#3B82F6', true, 2) on conflict do nothing;
insert into public.ticket_priorities (name, color, "isDefault", "sortOrder")
values ('High', '#F59E0B', false, 3) on conflict do nothing;
insert into public.ticket_priorities (name, color, "isDefault", "sortOrder")
values ('Urgent', '#EF4444', false, 4) on conflict do nothing;

-- Default category
insert into public.ticket_categories (name, description, "isActive")
values ('General', 'General inquiries and issues', true) on conflict do nothing;
