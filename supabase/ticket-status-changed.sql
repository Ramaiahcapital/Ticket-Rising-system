-- Add the status-change timestamp used by the Tickets page and Excel export.
--
-- Important: the app reads/writes the camelCase column "statusChangedAt".
-- An earlier version of this migration created status_changed_at (snake_case),
-- which Postgres treats as a different column. This version is idempotent and
-- can safely be re-run: it adds the correct column, copies any data from the
-- old snake_case column, backfills existing tickets, then removes the old one.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tickets'
      AND column_name = 'status_changed_at'
  ) THEN
    EXECUTE 'UPDATE public.tickets
             SET "statusChangedAt" = status_changed_at
             WHERE "statusChangedAt" IS NULL
               AND status_changed_at IS NOT NULL';
  END IF;
END $$;

-- Backfill from the last ticket update for older rows that have no timeline
-- status event yet (the export also falls back to the timeline in the app).
UPDATE public.tickets
SET "statusChangedAt" = "updatedAt"
WHERE "statusChangedAt" IS NULL
  AND "updatedAt" IS NOT NULL;

ALTER TABLE public.tickets
  DROP COLUMN IF EXISTS status_changed_at;
