-- AI card pipeline (step 5). A card is claimed with a short lock so the poll page, the new-poll hook
-- and the cron never generate the same product twice; failed attempts are retried up to CARD_MAX_ATTEMPTS (config.ts).
ALTER TABLE cards ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN locked_until INTEGER;
ALTER TABLE cards ADD COLUMN last_error TEXT;
ALTER TABLE cards ADD COLUMN official_url TEXT;   -- the maker's own product page the card was built from (NULL = none found)
ALTER TABLE cards ADD COLUMN product_title TEXT;  -- the product name as the maker writes it
CREATE INDEX cards_status ON cards (status, created_at);
CREATE INDEX cards_checked ON cards (checked_at);
