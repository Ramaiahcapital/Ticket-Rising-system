-- Add canRaiseTicket flag to sub-admins in profiles.
-- When true, the sub-admin is allowed to raise tickets like a branch user.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "canRaiseTicket" BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: main admins (adminRole IS NULL) should have it true by default
UPDATE profiles SET "canRaiseTicket" = TRUE WHERE role = 'admin' AND "adminRole" IS NULL;
