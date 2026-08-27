-- Add monitorRole to transfer users in profiles.
-- When set, the transfer user is promoted to a "Middle Admin" (view-only):
--   - gains a "Monitor" nav item to VIEW (read-only) all tickets in that department
--   - receives new-ticket email notifications for that department
--   - cannot reply / notify / change status / transfer on monitored tickets
-- Value is a branch_roles.name (department), or NULL for no monitor access.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "monitorRole" TEXT;
