-- 2026-10-25: cash in the drawer at the start and the end of a day (asked by the user).
--   - drawer_openings: the cash the owner puts in the drawer before selling.
--     The opening cash of the current day = the last row after the previous Z;
--     if none, the cash LEFT in the drawer at the previous Z.
--   - z_reports.cash_taken: cash taken out of the drawer at closing (owner / bank).
--   - z_reports.cash_left:  cash left in the drawer = counted − taken
--     (becomes the next day's opening cash).
CREATE TABLE IF NOT EXISTS drawer_openings (
  id            serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  amount        numeric(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    integer REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS drawer_openings_restaurant_created ON drawer_openings (restaurant_id, created_at);

ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_taken numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_left  numeric(10,2) NOT NULL DEFAULT 0;
