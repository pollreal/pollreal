-- (operator 2026-11-02): rankings per category, recomputed once a day by the cron (src/lib/ranking.ts).
-- One row per product key (normKey with the brand alias table) per category. rank NULL = under the threshold.
CREATE TABLE rankings (
  category    TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  name        TEXT NOT NULL,
  card_id     TEXT,
  score       REAL NOT NULL,
  lo          REAL NOT NULL,
  hi          REAL NOT NULL,
  rank        INTEGER,
  shared      INTEGER NOT NULL DEFAULT 0,
  votes       INTEGER NOT NULL,
  rivals      INTEGER NOT NULL,
  wins        INTEGER NOT NULL,
  losses      INTEGER NOT NULL,
  ties        INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (category, item_key)
);

-- Category totals for the page header and the hub cards.
CREATE TABLE ranking_meta (
  category    TEXT PRIMARY KEY,
  items       INTEGER NOT NULL,
  ranked      INTEGER NOT NULL,
  votes       INTEGER NOT NULL,
  computed_at INTEGER NOT NULL
);
