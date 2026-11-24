-- Follow-up questions a team asks about one item in an Auditor report ("Ask about this").
CREATE TABLE audit_asks (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL,
  run_id    TEXT NOT NULL,
  item      INTEGER NOT NULL,   -- index in that run's Top 10
  at        TEXT NOT NULL,
  question  TEXT NOT NULL,
  answer    TEXT,
  error     TEXT
);
CREATE INDEX audit_asks_team ON audit_asks (team_id, at);
