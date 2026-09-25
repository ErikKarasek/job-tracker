-- What each AI feature spent per UTC day, in Workers AI neurons (server/ai/budget.ts).
CREATE TABLE ai_spend (
  day      TEXT NOT NULL,
  feature  TEXT NOT NULL,
  neurons  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature)
);
