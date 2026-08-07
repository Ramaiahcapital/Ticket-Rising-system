-- ============================================================
--  Ticket Rising — RESET ALL DATA (start fresh)
--  Run this in the Supabase SQL editor.
-- ============================================================

-- 1) Clear all transactional tables (FK order handled by CASCADE)
truncate table public.ticket_attachments,
              public.ticket_comments,
              public.ticket_timeline,
              public.tickets,
              public.notifications,
              public.audit_logs
  restart identity cascade;

-- 2) Clear config tables (form config, portal toggles, seeds)
truncate table public.ticket_form_config restart identity cascade;
truncate table public.ticket_subcategories cascade;
truncate table public.ticket_categories cascade;
truncate table public.ticket_priorities restart identity cascade;
truncate table public.ticket_statuses restart identity cascade;
truncate table public.system_settings restart identity cascade;

-- 3) Reset branch roles to defaults (removes custom/renamed roles,
--    e.g. the "Finflux" rename, and any roles you created)
truncate table public.branch_roles restart identity cascade;
insert into public.branch_roles (name, color, "sortOrder", "isActive") values
  ('IT', '#3B82F6', 1, true),
  ('Branch Admin', '#8B5CF6', 2, true),
  ('Manager', '#F59E0B', 3, true);

-- 4) Remove users.
--    Option A (recommended): keep admin login, delete all branch users.
delete from auth.users u
  using public.profiles p
  where u.id = p.id and p.role = 'branch';
--    (their profiles rows cascade-delete automatically)

--    Option B (full wipe incl. admin): uncomment instead of Option A.
-- delete from auth.users;
--    Then re-create the admin user in Authentication > Users with
--    user_metadata {"role":"admin", ...} so the trigger creates the profile.

-- 5) Re-seed default data
insert into public.system_settings (key, value, description) values
  ('ticket_number_format', 'RC-YYYY-XXXXXX', 'Format for generated ticket numbers'),
  ('ticket_number_counter', '0', 'Counter for generated ticket numbers')
on conflict (key) do update set value = excluded.value;

insert into public.ticket_statuses (name, color, "isOpen", "isDefault", "isEnabled", "sortOrder") values
  ('Open', '#3B82F6', true, true, true, 1),
  ('In Progress', '#F59E0B', true, false, true, 2),
  ('Solved', '#10B981', false, false, true, 3),
  ('Closed', '#6B7280', false, false, true, 4);

insert into public.ticket_priorities (name, color, "isDefault", "sortOrder") values
  ('Low', '#6B7280', false, 1),
  ('Medium', '#3B82F6', true, 2),
  ('High', '#F59E0B', false, 3),
  ('Urgent', '#EF4444', false, 4);

insert into public.ticket_categories (name, description, "isActive")
values ('General', 'General inquiries and issues', true);

-- 6) Also delete uploaded image files from Storage.
--    Direct SQL deletion is blocked by Supabase. Do this in the UI:
--    Storage > ticket-attachments > select all > Delete (or empty the bucket).
