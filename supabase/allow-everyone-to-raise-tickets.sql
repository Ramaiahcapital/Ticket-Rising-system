-- Allow every user (branch, cluster, transfer, admin) to raise tickets by default.
-- Super admins can disable individual users from the Ticket Access page.

ALTER TABLE profiles ALTER COLUMN "canRaiseTicket" SET DEFAULT TRUE;

-- Backfill: enable ticket raising for all existing users.
UPDATE profiles SET "canRaiseTicket" = TRUE WHERE "canRaiseTicket" IS NOT TRUE;
