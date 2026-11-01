-- Comments on the Terms page, one row per comment.
CREATE TABLE comments (
  term     TEXT NOT NULL,
  id       TEXT NOT NULL,
  initials TEXT NOT NULL,
  text     TEXT NOT NULL,
  at       TEXT NOT NULL,
  PRIMARY KEY (term, id)
);
CREATE INDEX comments_by_term ON comments (term, at);

-- Terms whose old KV comments have been copied in (see importFromKV in src/index.js).
CREATE TABLE kv_imported (term TEXT PRIMARY KEY);

-- The grading record: one anonymous row per Check click. No class code, IP, or answers.
CREATE TABLE grades (
  at       TEXT NOT NULL,
  puzzle   TEXT NOT NULL,
  items    INTEGER,          -- how many items were graded (NULL on error)
  ok       INTEGER,          -- how many came back ok
  verdicts TEXT,             -- JSON: [{label, verdict}]
  error    TEXT              -- NULL, or what went wrong ("api 529", "network", "unreadable")
);
CREATE INDEX grades_by_time ON grades (at);
