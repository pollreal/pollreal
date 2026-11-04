-- Operator notices and suspensions that end on their own (operator 2026-10-29: warnings and suspensions are told inside
-- the Service; a temporary suspension of 7–30 days ends automatically; there is no permanent ban — termination is the
-- withdrawal path, whose phone hash blocks re-joining for 30 days).
ALTER TABLE members ADD COLUMN suspended_until INTEGER;   -- ms epoch; the cron sets the member back to 'active' at that time

-- One row per message the operator writes to a member (shown on My page; read_at set when the page is viewed).
CREATE TABLE notices (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members (id),
  kind       TEXT NOT NULL CHECK (kind IN ('warning', 'suspension', 'info')),
  body       TEXT NOT NULL,                              -- operator-written text, English or Korean as written
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX notices_member ON notices (member_id, created_at);
CREATE INDEX notices_unread ON notices (member_id) WHERE read_at IS NULL;   -- the "(n)" next to My page
