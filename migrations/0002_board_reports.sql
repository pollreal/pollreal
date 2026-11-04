-- Versus free board + reports. Design: the design notes §2·§4 (board = step 6).
-- Temporary measures follow 정보통신망법 제44조의2 (임시조치 up to 30 days, shown publicly as such);
-- illegal-filming reports hide the target at once (전기통신사업법 제22조의5①).

CREATE TABLE posts (
  id            TEXT PRIMARY KEY,
  member_id     TEXT REFERENCES members (id),           -- NULL after the author withdraws
  nickname      TEXT NOT NULL,                          -- anonymous nickname at write time
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'temp_hidden', 'deleted', 'removed')),
  hidden_until  INTEGER,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX posts_list ON posts (created_at);
CREATE INDEX posts_member ON posts (member_id, created_at);

CREATE TABLE comments (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts (id),
  member_id    TEXT REFERENCES members (id),
  nickname     TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'temp_hidden', 'deleted', 'removed')),
  hidden_until INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX comments_post ON comments (post_id, created_at);
CREATE INDEX comments_member ON comments (member_id, created_at);

CREATE TABLE reports (
  id                 TEXT PRIMARY KEY,
  target_type        TEXT NOT NULL CHECK (target_type IN ('poll', 'post', 'comment')),
  target_id          TEXT NOT NULL,
  reason             TEXT NOT NULL CHECK (reason IN ('illegal_filming', 'rights', 'illegal', 'manipulation', 'spam', 'abuse', 'other')),
  detail             TEXT,
  reporter_member_id TEXT REFERENCES members (id),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  action             TEXT,
  created_at         INTEGER NOT NULL,
  handled_at         INTEGER
);
CREATE INDEX reports_target ON reports (target_type, target_id);
CREATE INDEX reports_open ON reports (status, created_at);
CREATE UNIQUE INDEX reports_once ON reports (target_type, target_id, reporter_member_id) WHERE reporter_member_id IS NOT NULL;
