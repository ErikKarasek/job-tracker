CREATE TABLE applications (
  id                TEXT PRIMARY KEY,
  company           TEXT NOT NULL,
  role              TEXT NOT NULL,
  job_url           TEXT,
  location          TEXT,
  salary_min        INTEGER,
  salary_max        INTEGER,
  source            TEXT,
  notes             TEXT,
  stage             TEXT NOT NULL DEFAULT 'wishlist'
                      CHECK (stage IN ('wishlist','applied','interview','offer','rejected')),
  applied_date      TEXT,
  last_activity_at  TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE status_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage      TEXT,
  to_stage        TEXT NOT NULL,
  occurred_at     TEXT NOT NULL
);

CREATE INDEX idx_status_events_app ON status_events(application_id);
CREATE INDEX idx_status_events_time ON status_events(occurred_at);
CREATE INDEX idx_applications_stage ON applications(stage);
