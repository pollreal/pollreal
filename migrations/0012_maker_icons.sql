-- Maker site icons (operator 2026-11-04, choice a): the small icon each maker's official site already publishes, fetched once
-- and served from pollreal.com so visitors never call a third party. Shown next to the maker name for identification only;
-- removed on request through the rights-report path. status 'none' = no usable icon (retried the next day); 'removed' = taken down on the maker's request (never refetched).
CREATE TABLE maker_icons (
  domain     TEXT PRIMARY KEY,                 -- official site host without "www."
  status     TEXT NOT NULL CHECK (status IN ('ok', 'none', 'removed')),
  mime       TEXT,
  data       BLOB,
  source_url TEXT,
  fetched_at INTEGER NOT NULL
);
