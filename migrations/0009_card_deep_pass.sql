-- (operator 2026-10-30): a card whose first pass could not get the key facts (page renders only with script, price
-- not written as text, product not found) goes to a deep pass in the cron: the official pages are opened in a real
-- headless browser and the card is rebuilt from that text plus targeted official searches.
-- deep_state: 0 = not needed, 1 = queued, 2 = done, 3 = gave up
ALTER TABLE cards ADD COLUMN deep_state INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN deep_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN missing_json TEXT; -- facts the latest pass could not confirm from official sources
CREATE INDEX idx_cards_deep ON cards (deep_state, deep_attempts);

ALTER TABLE ai_spend ADD COLUMN stage INTEGER NOT NULL DEFAULT 1; -- 1 = first pass, 2 = deep pass
ALTER TABLE ai_spend ADD COLUMN browser_ms INTEGER;              -- headless browser time used by the deep pass
