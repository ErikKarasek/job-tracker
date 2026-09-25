-- Follow-up drafts the scout writes for applications gone quiet (server/followup/).
-- `applied`: no word 8+ days after applying. `interview`: 3+ days past the interview date.
-- One per card and kind, ever: a card that was followed up and went quiet again is Erik's call.
CREATE TABLE followups (
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('applied','interview')),
  draft           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','sent','dismissed')),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (application_id, kind)
);
