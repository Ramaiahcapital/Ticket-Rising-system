-- Add stationaryAccess flag to transfer users in profiles
-- When true, the transfer user sees a Stationary nav item and can access /stationary

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "stationaryAccess" BOOLEAN DEFAULT FALSE;
