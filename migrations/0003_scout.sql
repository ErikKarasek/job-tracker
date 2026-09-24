-- The job scout (server/scout/): postings it found on its own, and what it has done today.

-- One row per posting URL, ever, so nothing is found twice. `queued` waits for the agent;
-- `new` is scored and waiting for Erik; `accepted` became a card; `dismissed` he turned down;
-- `skipped` was filtered out before spending anything on it.
CREATE TABLE suggestions (
  id            TEXT PRIMARY KEY,
  job_url       TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  company       TEXT,
  location      TEXT,
  remote        INTEGER NOT NULL DEFAULT 0,
  query         TEXT NOT NULL,
  -- 2 when the title names the work outright ("tester", "helpdesk"), 1 otherwise: scored first.
  priority      INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','new','accepted','dismissed','skipped')),
  fit_score     INTEGER CHECK (fit_score BETWEEN 0 AND 100),
  fit_summary   TEXT,
  cover_letter  TEXT,
  salary_min    INTEGER,
  salary_max    INTEGER,
  found_at      TEXT NOT NULL,
  scored_at     TEXT,
  decided_at    TEXT
);
CREATE INDEX idx_suggestions_status ON suggestions(status, priority, found_at);

-- Marks for "this step is done today": a search that ran, the digest that went out.
CREATE TABLE scout_log (
  day   TEXT NOT NULL,
  step  TEXT NOT NULL,
  at    TEXT NOT NULL,
  PRIMARY KEY (day, step)
);
