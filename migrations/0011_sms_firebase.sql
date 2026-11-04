-- (operator 2026-11-02): Google Identity Platform (Firebase phone auth) as a second SMS sender while Twilio's
-- business profile is pending. Google keeps its own encrypted session for the code; we store it on the flow until the
-- code is checked (the flow and the session expire together, OTP_TTL_MS).
ALTER TABLE phone_flows ADD COLUMN provider_session TEXT;
