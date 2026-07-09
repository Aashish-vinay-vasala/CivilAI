-- change_pct was numeric(6,2) (max ±9999.99%), which overflows when a price is
-- compared against a prior entry on a wildly different scale for the same material
-- (e.g. a live FRED index-point value vs. an old manual $/unit quote). Application
-- code now also clamps computed change_pct to a sane bound, but the column itself
-- should never be able to 500 a request regardless of what gets computed.
ALTER TABLE material_prices
  ALTER COLUMN change_pct TYPE numeric(12,2);
