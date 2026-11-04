-- Operator alerts (operator 2026-11-04): one mail per kind per KST day.
CREATE TABLE alerts (
  kind    TEXT NOT NULL,      -- e.g. 'otp_cap_site'
  day     TEXT NOT NULL,      -- KST date YYYY-MM-DD
  sent_at INTEGER NOT NULL,
  detail  TEXT,
  PRIMARY KEY (kind, day)
);
