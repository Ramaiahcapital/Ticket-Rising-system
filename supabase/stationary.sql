-- ============================================================
-- Stationary module
-- ============================================================

-- Items that branches can order
create table if not exists public.stationary_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit text,
  price numeric(12,2) default 0,
  -- max quantity a SINGLE branch may order per active order window
  "threshold" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Single global portal configuration row (id is fixed so there is exactly one)
create table if not exists public.stationary_portal_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000000',
  "enabled" boolean not null default false,
  "windowOpenAt" timestamptz,
  "windowCloseAt" timestamptz,
  -- json array of allowed branch roles, e.g. ["IT","Branch Admin"]
  "allowedRoles" jsonb not null default '[]'::jsonb,
  "updatedAt" timestamptz not null default now(),
  "updatedBy" uuid
);

-- Seed the single settings row
insert into public.stationary_portal_settings (id)
values ('00000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- Branch orders (header)
create table if not exists public.stationary_orders (
  id uuid primary key default gen_random_uuid(),
  "branchId" uuid not null references public.profiles(id) on delete cascade,
  "createdBy" uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','dispatched','received','fulfilled','cancelled')),
  "orderDate" date,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Order line items
create table if not exists public.stationary_order_items (
  id uuid primary key default gen_random_uuid(),
  "orderId" uuid not null references public.stationary_orders(id) on delete cascade,
  "itemId" uuid not null references public.stationary_items(id) on delete restrict,
  quantity integer not null default 0,
  "unitPrice" numeric(12,2) default 0,
  "lineTotal" numeric(12,2) default 0,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_stationary_orders_branch on public.stationary_orders("branchId");
create index if not exists idx_stationary_orders_created on public.stationary_orders("createdAt");
create index if not exists idx_stationary_order_items_order on public.stationary_order_items("orderId");

-- Trigger: keep updatedAt fresh
create or replace function public.set_stationary_updated_at()
returns trigger language plpgsql as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists trg_stationary_items_updated on public.stationary_items;
create trigger trg_stationary_items_updated before update on public.stationary_items
  for each row execute function public.set_stationary_updated_at();

drop trigger if exists trg_stationary_orders_updated on public.stationary_orders;
create trigger trg_stationary_orders_updated before update on public.stationary_orders
  for each row execute function public.set_stationary_updated_at();

-- Trigger: keep lineTotal synced
create or replace function public.set_stationary_line_total()
returns trigger language plpgsql as $$
begin
  new."lineTotal" = coalesce(new."unitPrice", 0) * new.quantity;
  return new;
end;
$$;

drop trigger if exists trg_stationary_line_total on public.stationary_order_items;
create trigger trg_stationary_line_total before insert or update on public.stationary_order_items
  for each row execute function public.set_stationary_line_total();

-- RLS: disable row level security (server uses service-role key which bypasses RLS).
-- If you later want browser access, enable RLS + write policies here.
alter table public.stationary_items disable row level security;
alter table public.stationary_portal_settings disable row level security;
alter table public.stationary_orders disable row level security;
alter table public.stationary_order_items disable row level security;
