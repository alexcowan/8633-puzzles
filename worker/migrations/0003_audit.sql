-- The Vibe Code Audit (final assignment). One team per row; teammates resume with a private link
-- whose token is stored only as a hash. Names and emails come from the class roster, which is loaded
-- from the dashboard (never committed: this repo is public).
CREATE TABLE roster (
  email     TEXT PRIMARY KEY,     -- Darden email, lower case
  first     TEXT NOT NULL,
  last      TEXT NOT NULL,
  preferred TEXT
);

CREATE TABLE audit_teams (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  project_type  TEXT,             -- sponsored | de novo
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,    -- Darden email of the submitter
  members       TEXT NOT NULL,    -- JSON: [{email, name, google}]
  repo_url      TEXT,
  repo_access   TEXT,             -- public | collaborator | zip
  deployed_url  TEXT,
  doc_url       TEXT,
  doc_source    TEXT,             -- gdoc | pdf
  updated_at    TEXT NOT NULL
);

-- What the Auditor reads: the audit doc and a slice of the repo. Kept apart from the team row
-- because it's large and only the run needs it.
CREATE TABLE audit_material (
  team_id     TEXT PRIMARY KEY,
  doc_text    TEXT,               -- from a public Google Doc
  doc_pdf     TEXT,               -- base64 PDF, when the doc isn't public
  repo_slice  TEXT,               -- JSON {tree, files, note}
  git_log     TEXT,               -- commit history (from GitHub, or pasted with a ZIP)
  updated_at  TEXT NOT NULL
);

-- Every Auditor run. round 1 may ask follow-up questions; round 2 answers them and is the final opinion.
CREATE TABLE audit_runs (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL,
  at        TEXT NOT NULL,
  stage     TEXT NOT NULL,        -- checkin | final
  round     INTEGER NOT NULL,
  answers   TEXT,                 -- JSON: the team's answers to round 1's requests
  result    TEXT,                 -- JSON report
  error     TEXT
);
CREATE INDEX audit_runs_by_team ON audit_runs (team_id, at);
