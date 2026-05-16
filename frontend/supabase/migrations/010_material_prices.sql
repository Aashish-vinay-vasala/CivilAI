CREATE TABLE IF NOT EXISTS material_prices (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  material    text          NOT NULL,
  price       numeric(12,4) NOT NULL,
  unit        text          NOT NULL DEFAULT 'unit',
  change_pct  numeric(6,2)  DEFAULT 0,
  year        int           NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  updated_at  timestamptz   DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_prices_material_year
  ON material_prices(material, year);

INSERT INTO material_prices (material, price, unit, change_pct, year) VALUES
  ('Concrete', 95.50,  'm³',   3.2,  2025),
  ('Steel',    850.00, 'ton',  -1.5, 2025),
  ('Lumber',   0.65,   'bf',   8.4,  2025),
  ('Copper',   9.80,   'kg',   5.1,  2025),
  ('Asphalt',  75.00,  'ton',  2.8,  2025)
ON CONFLICT (material, year) DO NOTHING;
