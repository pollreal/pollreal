-- Fixes from the step 7/8 review (2026-10-29).
-- 1. "New member at vote time" is kept on the vote itself, so a voter who withdraws afterwards (member link removed)
--    still counts as new for the surge rule. 0/1 only — no extra personal data.
ALTER TABLE votes ADD COLUMN new_member INTEGER NOT NULL DEFAULT 0;
-- 2. The 30-day device-hash purge reads only the votes that still hold a hash (no growing full-range scan per cron run).
CREATE INDEX votes_device_hash_age ON votes (created_at) WHERE device_hash IS NOT NULL;
