-- ============================================================
--  Add 'transfer' role for transfer users (real accounts)
--  Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add 'transfer' to profiles.role CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'branch', 'cluster', 'transfer'));

-- 2. Add 'transfer' to ticket_comments.authorType CHECK
ALTER TABLE public.ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_authorType_check;
ALTER TABLE public.ticket_comments ADD CONSTRAINT ticket_comments_authorType_check
  CHECK ("authorType" IN ('admin', 'branch', 'cluster', 'transfer'));

-- 3. Add 'transfer' to ticket_timeline.actorType CHECK
ALTER TABLE public.ticket_timeline DROP CONSTRAINT IF EXISTS ticket_timeline_actorType_check;
ALTER TABLE public.ticket_timeline ADD CONSTRAINT ticket_timeline_actorType_check
  CHECK ("actorType" IN ('admin', 'branch', 'cluster', 'transfer'));

-- 4. Add 'transfer' to notifications.recipientType CHECK
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_recipientType_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipientType_check
  CHECK ("recipientType" IN ('admin', 'branch', 'cluster', 'transfer'));

-- 5. Add 'transfer' to ticket_attachments.uploadedByType CHECK
ALTER TABLE public.ticket_attachments DROP CONSTRAINT IF EXISTS ticket_attachments_uploadedByType_check;
ALTER TABLE public.ticket_attachments ADD CONSTRAINT ticket_attachments_uploadedByType_check
  CHECK ("uploadedByType" IN ('admin', 'branch', 'cluster', 'transfer'));

-- 6. Add 'transfer' to audit_logs.userType CHECK
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_userType_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_userType_check
  CHECK ("userType" IN ('admin', 'branch', 'system', 'transfer'));
