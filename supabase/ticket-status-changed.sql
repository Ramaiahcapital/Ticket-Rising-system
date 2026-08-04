-- Add status_changed_at column to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Backfill: set status_changed_at to updatedAt for existing tickets
UPDATE tickets SET status_changed_at = "updatedAt" WHERE status_changed_at IS NULL AND "updatedAt" IS NOT NULL;
