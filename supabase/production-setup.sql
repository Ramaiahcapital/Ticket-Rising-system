-- ============================================================
--  PRODUCTION SETUP / HARDENING
--  Run this LAST, after every migration listed in the go-live
--  checklist. Idempotent: safe to run more than once.
--
--  What it fixes:
--    1. Creates the public storage bucket the app uploads to.
--    2. Closes the `for select using (true)` RLS policies the
--       migration files ship with. Those let ANYONE holding the
--       anon key read tickets/comments/timeline/notifications
--       (and OAuth tokens in google_auth) over the REST API.
--       The app only reads/writes through the server
--       (service_role bypasses RLS), so the browser just needs
--       SELECT for realtime channels -> authenticated-only.
--    3. Adds indexes for sub-admin scoping + hot queries.
-- ============================================================

-- 1) Public storage bucket (the UI serves files via getPublicUrl()).
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', true)
on conflict (id) do update set public = true;

-- 2a) Drop the open policies.
drop policy if exists "Realtime: tickets select"       on public.tickets;
drop policy if exists "Realtime: comments select"      on public.ticket_comments;
drop policy if exists "Realtime: timeline select"      on public.ticket_timeline;
drop policy if exists "Realtime: statuses select"      on public.ticket_statuses;
drop policy if exists "Realtime: notifications select" on public.notifications;
drop policy if exists "branch_roles_admin_all"         on public.branch_roles;
drop policy if exists "branch_roles_branch_read"       on public.branch_roles;
drop policy if exists "clusters_admin_all"             on public.clusters;
drop policy if exists "clusters_cluster_read"          on public.clusters;
drop policy if exists "clusters_branch_read"           on public.clusters;
drop policy if exists "ticket_form_config_admin_all"   on public.ticket_form_config;
drop policy if exists "ticket_form_config_branch_read" on public.ticket_form_config;
drop policy if exists "google_auth_admin_all"          on public.google_auth;

-- 2b) Recreate as authenticated-only so realtime + signed-in users work
--     but the anon key sees nothing. google_auth intentionally gets NO
--     policy: only the server (service_role) may touch OAuth tokens.
create policy "Realtime: tickets select" on public.tickets
  for select using (auth.role() = 'authenticated');
create policy "Realtime: comments select" on public.ticket_comments
  for select using (auth.role() = 'authenticated');
create policy "Realtime: timeline select" on public.ticket_timeline
  for select using (auth.role() = 'authenticated');
create policy "Realtime: statuses select" on public.ticket_statuses
  for select using (auth.role() = 'authenticated');
create policy "Realtime: notifications select" on public.notifications
  for select using (auth.role() = 'authenticated');
create policy "branch_roles_read" on public.branch_roles
  for select using (auth.role() = 'authenticated');
create policy "clusters_read" on public.clusters
  for select using (auth.role() = 'authenticated');
create policy "ticket_form_config_read" on public.ticket_form_config
  for select using (auth.role() = 'authenticated');

-- 3) Indexes for sub-admin scoping (branchRole) and hot queries.
create index if not exists idx_tickets_branch_role     on public.tickets ("branchRole");
create index if not exists idx_tickets_created_by      on public.tickets ("createdBy");
create index if not exists idx_tickets_assigned_to     on public.tickets ("assignedTo");
create index if not exists idx_ticket_comments_ticket  on public.ticket_comments ("ticketId");
create index if not exists idx_ticket_timeline_ticket  on public.ticket_timeline ("ticketId");
create index if not exists idx_notifications_ticket    on public.notifications ("ticketId");
create index if not exists idx_profiles_admin_role     on public.profiles ("adminRole");
create index if not exists idx_profiles_branch_id      on public.profiles ("branchId");
