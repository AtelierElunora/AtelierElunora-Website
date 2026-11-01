-- Additive migration; existing customers remain unattributed. Safe to rerun.
-- No changes to signed agreements, payment records or existing lead status.
SET lock_timeout = '5s';
ALTER TABLE elunora_booking."BookingLead"
  ADD COLUMN IF NOT EXISTS "referralSource" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "referralDetails" TEXT NOT NULL DEFAULT '';
