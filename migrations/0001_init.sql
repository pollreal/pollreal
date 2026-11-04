-- Versus initial schema. Design: the design notes §5.
-- Personal data minimum (house rule): DI is stored only as an HMAC hash; birth year and gender only.
-- No name, phone number or CI anywhere. Times are epoch milliseconds.

CREATE TABLE members (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,                       -- kakao | naver | google | dev
  provider_uid_hash TEXT,                                -- HMAC of the provider's member id; NULL after withdrawal
  di_hash           TEXT,                                -- HMAC of the identity DI; kept 30 days after withdrawal, then NULL
  birth_year        INTEGER,
  gender            TEXT CHECK (gender IN ('M', 'F')),
  nickname          TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  created_at        INTEGER NOT NULL,
  withdrawn_at      INTEGER
);
CREATE UNIQUE INDEX members_provider_uid ON members (provider, provider_uid_hash) WHERE provider_uid_hash IS NOT NULL;
CREATE UNIQUE INDEX members_di ON members (di_hash) WHERE di_hash IS NOT NULL;

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                           -- SHA-256 of the cookie token; the raw token lives only in the cookie
  member_id  TEXT NOT NULL REFERENCES members (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_member ON sessions (member_id);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE polls (
  id          TEXT PRIMARY KEY,
  member_id   TEXT REFERENCES members (id),              -- NULL after the author withdraws (the poll and its result stay public)
  category    TEXT NOT NULL,
  question    TEXT,
  slug        TEXT NOT NULL,
  is_seed     INTEGER NOT NULL DEFAULT 0,                -- operator seed poll (shown with a label)
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'hidden')),
  review_note TEXT,                                      -- banner set by anomaly review
  created_at  INTEGER NOT NULL,
  closes_at   INTEGER NOT NULL,
  closed_at   INTEGER
);
CREATE INDEX polls_status_closes ON polls (status, closes_at);
CREATE INDEX polls_category ON polls (category, created_at);
CREATE INDEX polls_member ON polls (member_id, created_at);

CREATE TABLE cards (
  id              TEXT PRIMARY KEY,
  norm_key        TEXT NOT NULL UNIQUE,                  -- normalized maker|product, shared across polls (cache)
  maker           TEXT NOT NULL,
  product         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  summary_json    TEXT,
  sources_json    TEXT,
  official_source INTEGER NOT NULL DEFAULT 0,
  model           TEXT,
  cost_usd        REAL,
  checked_at      INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE candidates (
  id            TEXT PRIMARY KEY,
  poll_id       TEXT NOT NULL REFERENCES polls (id),
  position      INTEGER NOT NULL,
  maker         TEXT NOT NULL,
  product       TEXT NOT NULL,
  norm_key      TEXT NOT NULL,
  card_id       TEXT REFERENCES cards (id),
  interest_note TEXT,                                    -- Dr.Seoul interest disclosure (house rule); never affects counting
  UNIQUE (poll_id, position)
);
CREATE INDEX candidates_poll ON candidates (poll_id);
CREATE INDEX candidates_norm ON candidates (norm_key);

CREATE TABLE votes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id      TEXT NOT NULL REFERENCES polls (id),
  member_id    TEXT REFERENCES members (id),             -- NULL after the voter withdraws; the vote stays as an anonymous count
  candidate_id TEXT NOT NULL REFERENCES candidates (id),
  age_band     TEXT NOT NULL,                            -- 10 | 20 | 30 | 40 | 50 | 60 (birth-year based, at vote time)
  gender       TEXT NOT NULL CHECK (gender IN ('M', 'F')),
  device_hash  TEXT,                                     -- anomaly detection (step 7)
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX votes_one_per_member ON votes (poll_id, member_id) WHERE member_id IS NOT NULL;
CREATE INDEX votes_poll ON votes (poll_id);
CREATE INDEX votes_created ON votes (created_at);
