-- Interview prep (server/interview/): when the interview is, and the brief the agent wrote.
ALTER TABLE applications ADD COLUMN interview_at TEXT;

-- One brief per card, replaced when it is written again. `status` lets the UI tell "still being
-- written in the background" from "failed" and "ready".
CREATE TABLE interview_briefs (
  application_id  TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('writing','ready','failed')),
  data            TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL
);
