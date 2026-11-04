-- operator-supplied official page for a product (seed list only, never from members).
-- When set, the card generator reads this page directly instead of searching for it (~70% cheaper per card).
ALTER TABLE cards ADD COLUMN hint_url TEXT;
