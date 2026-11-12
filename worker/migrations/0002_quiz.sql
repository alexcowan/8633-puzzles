-- The mid-quarter check-in quiz: one row per submission. Unlike the grading record, these are named,
-- because the quiz counts toward participation. Attempts named "Just Checking" are kept but flagged.
CREATE TABLE quiz_attempts (
  at            TEXT NOT NULL,
  quiz          TEXT NOT NULL,
  first         TEXT NOT NULL,
  last          TEXT NOT NULL,
  just_checking INTEGER NOT NULL,   -- 1 if named "Just Checking": left out of the results
  score         REAL NOT NULL,      -- sum of item credit (0 to 1 each)
  of            INTEGER NOT NULL,
  grid          TEXT NOT NULL,      -- JSON: [{part, level, got, of}]
  items         TEXT NOT NULL       -- JSON: [{id, credit, answer}]
);
CREATE INDEX quiz_by_time ON quiz_attempts (quiz, at);
