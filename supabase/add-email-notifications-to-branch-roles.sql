ALTER TABLE branch_roles ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true;
