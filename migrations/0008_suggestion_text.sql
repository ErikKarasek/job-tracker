-- Postings the scout already holds as text (the Labour Office's open data has no page worth
-- fetching); scored from this column instead of the URL. Null for Jobs.cz postings.
ALTER TABLE suggestions ADD COLUMN posting_text TEXT;
