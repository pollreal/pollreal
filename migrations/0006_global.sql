-- Global edition (design v0.2): phone number + passkey sign-up, one vote per device per poll,
-- network checks, viral attribution, maker claims. Personal data stays minimal: the phone number itself is kept only
-- while its code is being confirmed (phone_flows, ≤10 minutes), then only its HMAC remains.

-- ---- members: the one-account-per-person key is now the phone number hash ----
ALTER TABLE members RENAME COLUMN di_hash TO phone_hash;          -- index members_di follows the rename
ALTER TABLE members ADD COLUMN phone_country TEXT;                -- ISO country of the number (statistics, age gate)
ALTER TABLE members ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
ALTER TABLE members ADD COLUMN invited_by TEXT REFERENCES members (id);
ALTER TABLE members ADD COLUMN invite_code TEXT;
ALTER TABLE members ADD COLUMN user_handle TEXT;                  -- WebAuthn user id (random, not the phone)
CREATE UNIQUE INDEX members_invite_code ON members (invite_code) WHERE invite_code IS NOT NULL;
CREATE UNIQUE INDEX members_user_handle ON members (user_handle) WHERE user_handle IS NOT NULL;
CREATE INDEX members_invited_by ON members (invited_by);

-- ---- passkeys: one row per credential; the biometric never leaves the device ----
CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,                   -- credential id (base64url)
  member_id    TEXT NOT NULL REFERENCES members (id),
  public_key   TEXT NOT NULL,                      -- COSE public key (base64url)
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,                               -- JSON array
  aaguid       TEXT,
  backed_up    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_member ON passkeys (member_id);

-- Single-use WebAuthn challenges (the challenge string is the key; deleted when used).
CREATE TABLE challenges (
  id         TEXT PRIMARY KEY,
  purpose    TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'vote', 'add')),
  subject    TEXT,                                 -- phone flow id / member id
  data       TEXT,                                 -- JSON (vote: poll + candidate)
  expires_at INTEGER NOT NULL
);
CREATE INDEX challenges_expires ON challenges (expires_at);

-- ---- phone verification ----
CREATE TABLE phone_flows (
  id            TEXT PRIMARY KEY,
  phone_e164    TEXT,                              -- cleared as soon as the code is confirmed
  phone_hash    TEXT NOT NULL,
  phone_country TEXT NOT NULL,
  phone_hint    TEXT NOT NULL,                     -- "+82 •••• 5678" (shown in the passkey manager)
  code_hash     TEXT,                              -- development / own-code senders; Twilio Verify keeps its own
  attempts      INTEGER NOT NULL DEFAULT 0,
  verified_at   INTEGER,
  birth_year    INTEGER,
  gender        TEXT CHECK (gender IN ('M', 'F')),
  lang          TEXT NOT NULL,
  next          TEXT NOT NULL,
  invited_by    TEXT,
  user_handle   TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX phone_flows_expires ON phone_flows (expires_at);

-- Every code request (rate limits + cost). Hashes only; erased after 30 days.
CREATE TABLE otp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_hash TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  country    TEXT NOT NULL,
  outcome    TEXT NOT NULL CHECK (outcome IN ('sent', 'blocked_type', 'blocked_limit', 'blocked_network', 'send_failed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX otp_log_phone ON otp_log (phone_hash, created_at);
CREATE INDEX otp_log_ip ON otp_log (ip_hash, created_at);
CREATE INDEX otp_log_created ON otp_log (created_at);

-- ---- votes: one vote per device per poll + where the voter came from (viral attribution) ----
-- All device values are HMACs that include the poll id, so they never link one poll's voters to another's.
ALTER TABLE votes RENAME COLUMN device_hash TO fp_hash;           -- device fingerprint (IP + browser + screen …)
ALTER TABLE votes ADD COLUMN dt_hash TEXT;                        -- device token (cookie)
ALTER TABLE votes ADD COLUMN dt_hash2 TEXT;                       -- device token kept in browser storage, when it differs
ALTER TABLE votes ADD COLUMN net_hash TEXT;                       -- network (IPv4 address / IPv6 /64)
ALTER TABLE votes ADD COLUMN source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'share', 'embed', 'maker', 'invite'));
ALTER TABLE votes ADD COLUMN maker_claim_id TEXT;
CREATE UNIQUE INDEX votes_one_per_device ON votes (poll_id, dt_hash) WHERE dt_hash IS NOT NULL;
CREATE UNIQUE INDEX votes_one_per_fingerprint ON votes (poll_id, fp_hash) WHERE fp_hash IS NOT NULL;
CREATE INDEX votes_device2 ON votes (poll_id, dt_hash2) WHERE dt_hash2 IS NOT NULL;
CREATE INDEX votes_network ON votes (poll_id, net_hash) WHERE net_hash IS NOT NULL;
CREATE INDEX votes_source ON votes (poll_id, source);

-- Attempts stopped at the door (shown on the result as "blocked at the door"). who_hash = HMAC(poll + member):
-- one count per person, poll and reason; no member link is stored.
CREATE TABLE vote_refusals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id    TEXT NOT NULL REFERENCES polls (id),
  reason     TEXT NOT NULL CHECK (reason IN ('device', 'fingerprint', 'network_cap', 'network')),
  who_hash   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX vote_refusals_once ON vote_refusals (poll_id, who_hash, reason);
CREATE INDEX vote_refusals_created ON vote_refusals (created_at);

ALTER TABLE polls ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';

-- ---- viral structures ----
CREATE TABLE maker_claims (
  id           TEXT PRIMARY KEY,
  card_id      TEXT NOT NULL REFERENCES cards (id),
  member_id    TEXT NOT NULL REFERENCES members (id),
  email_domain TEXT NOT NULL,
  email_hash   TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,               -- campaign link code
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'revoked')),
  created_at   INTEGER NOT NULL,
  verified_at  INTEGER
);
CREATE UNIQUE INDEX maker_claims_once ON maker_claims (card_id, member_id);

-- Counters only (no visitor data): share clicks, arrivals by channel, embed loads, result-image renders.
CREATE TABLE share_counts (
  poll_id TEXT NOT NULL,                           -- '' for site-wide (invite arrivals)
  day     TEXT NOT NULL,                           -- KST date
  kind    TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll_id, day, kind)
);

ALTER TABLE metrics_daily ADD COLUMN shares_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN embed_loads_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN invited_signups_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN maker_votes_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN refusals_new INTEGER NOT NULL DEFAULT 0;
