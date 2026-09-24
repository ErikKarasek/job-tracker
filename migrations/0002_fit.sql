-- What the job-posting agent (server/agent/) concluded about a role: how well it fits the
-- profile, 0-100, and a sentence or two on why. Both stay null for cards added by hand.
ALTER TABLE applications ADD COLUMN fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100);
ALTER TABLE applications ADD COLUMN fit_summary TEXT;
