-- Bind complaint privacy consent to the exact published policy content.
ALTER TABLE complaints
    ADD COLUMN IF NOT EXISTS consent_content_hash TEXT;
