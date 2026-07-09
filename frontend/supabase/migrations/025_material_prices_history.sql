-- material_prices becomes a real price history log instead of one static row per
-- material/year: every manual entry, document extraction, and live market sync adds
-- its own row so "current price" is just the latest row per material.

ALTER TABLE material_prices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE material_prices
  ADD CONSTRAINT material_prices_source_check
  CHECK (source IN ('manual', 'ai_extracted', 'structured_parse', 'live_sync'));

DROP INDEX IF EXISTS idx_material_prices_material_year;

CREATE INDEX IF NOT EXISTS idx_material_prices_material_fetched
  ON material_prices (material, fetched_at DESC);
