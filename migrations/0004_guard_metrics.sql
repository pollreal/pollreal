-- Step 7 (bot check · anomaly review) and step 8 (daily metrics). Design: the design notes §9 and the business plan §6.2, §7.5.
-- votes.device_hash (0001) is now filled: HMAC(pepper, KST day + IP + User-Agent) — it changes every day, so it can only
-- link votes cast on the same day, and it is erased 30 days after the vote (DEVICE_HASH_KEEP_DAYS, config.ts).

-- Anomaly review: a row = one pattern found on one poll. The poll gets a banner; nothing is deleted or recounted.
-- The operator decides (cleared / confirmed) with a command-line update (no admin screen — design §2).
CREATE TABLE anomalies (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL REFERENCES polls (id),
  kind       TEXT NOT NULL CHECK (kind IN ('same_device', 'new_member_surge')),
  detail     TEXT NOT NULL,                                  -- JSON counts only (no member ids, no device hashes)
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'confirmed')),
  note       TEXT,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE UNIQUE INDEX anomalies_once ON anomalies (poll_id, kind);
CREATE INDEX anomalies_status ON anomalies (status, created_at);

-- Every completed identity check costs money (NICE per-check fee) even when the sign-up is refused afterwards.
-- No member link, no identity values — outcome and time only.
CREATE TABLE idv_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome    TEXT NOT NULL CHECK (outcome IN ('joined', 'duplicate', 'rejoin_blocked', 'underage', 'bad_result')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idv_checks_created ON idv_checks (created_at);

-- One row per AI card attempt with what it cost (cards.cost_usd only keeps the running total per product).
-- Feeds the 24-hour spend guard and the daily LLM cost in the metrics ledger.
CREATE TABLE ai_spend (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  cost_usd   REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_spend_created ON ai_spend (created_at);

-- Daily snapshot for the metrics ledger (business plan §6.2). Written once per completed KST day by the cron and
-- never recomputed, so later withdrawals do not rewrite history. scripts/metrics-export.mjs turns it into
-- ops/metrics_daily.csv (header fixed in scripts/p1_digest.py).
CREATE TABLE metrics_daily (
  day             TEXT PRIMARY KEY,                       -- KST date YYYY-MM-DD
  signups_total   INTEGER NOT NULL,                       -- members ever created up to the end of the day (gross)
  signups_new     INTEGER NOT NULL,
  withdrawals_new INTEGER NOT NULL,
  votes_new       INTEGER NOT NULL,
  polls_new       INTEGER NOT NULL,                       -- polls by members (operator seed polls counted apart)
  seed_polls_new  INTEGER NOT NULL,
  weekly_prev     INTEGER NOT NULL,                       -- members active in days -13..-7
  weekly_returned INTEGER NOT NULL,                       -- ... of whom active again in days -6..0
  posts_new       INTEGER NOT NULL,
  comments_new    INTEGER NOT NULL,
  reports_new     INTEGER NOT NULL,
  anomalies_new   INTEGER NOT NULL,
  idv_checks      INTEGER NOT NULL,
  idv_cost_krw    INTEGER NOT NULL,                       -- estimate: checks x unit fee (VAT excluded); invoices override
  llm_cost_usd    REAL NOT NULL,                          -- estimate from ai_spend; the Console figure overrides
  computed_at     INTEGER NOT NULL
);
