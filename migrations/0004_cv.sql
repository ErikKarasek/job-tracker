-- What the CV tailoring (server/cv/tailor.ts) decided for a card, kept so opening the CV again
-- costs nothing. Deleted with the card; replaced when the tailoring is run again.
CREATE TABLE cv_tailoring (
  application_id  TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  data            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
