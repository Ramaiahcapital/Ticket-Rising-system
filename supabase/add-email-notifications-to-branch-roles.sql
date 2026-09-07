-- Add per-role email notification toggle to branch_roles.
-- The app reads/writes this column as camelCase `emailNotifications`
-- (branch-role-router.ts, ticket-router.ts), and all other columns on this
-- table use quoted camelCase identifiers. An earlier version of this migration
-- created the column as snake_case `email_notifications`, which PostgREST can't
-- map to the app's queries — so we add the correct column and drop the unused
-- snake_case one (idempotent in both states).

ALTER TABLE branch_roles ADD COLUMN IF NOT EXISTS "emailNotifications" boolean NOT NULL DEFAULT true;
ALTER TABLE branch_roles DROP COLUMN IF EXISTS email_notifications;