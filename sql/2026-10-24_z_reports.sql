-- 2026-10-24: Z report = closing of a business day (agreed with the user):
--   - a day runs from one Z to the next (not the calendar date): every payment made
--     after the previous Z's closed_at and up to this Z's closed_at belongs to it;
--   - one cash drawer per restaurant;
--   - opening float = cash put in the drawer at the start of the day.
-- totals = frozen copy of the day's numbers at closing (never recomputed).
CREATE TABLE IF NOT EXISTS z_reports (
  id             serial PRIMARY KEY,
  restaurant_id  integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  z_number       integer NOT NULL,
  opened_at      timestamptz,                -- previous Z's closed_at (null for the first Z)
  closed_at      timestamptz NOT NULL DEFAULT now(),
  opening_float  numeric(10,2) NOT NULL DEFAULT 0,
  cash_sales     numeric(10,2) NOT NULL DEFAULT 0,
  expected_cash  numeric(10,2) NOT NULL DEFAULT 0,  -- opening float + cash sales
  counted_cash   numeric(10,2) NOT NULL DEFAULT 0,
  difference     numeric(10,2) NOT NULL DEFAULT 0,  -- counted − expected (+ over, − short)
  net_sales      numeric(10,2) NOT NULL DEFAULT 0,
  tickets        integer NOT NULL DEFAULT 0,
  totals         jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes          text,
  closed_by      integer REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS z_reports_restaurant_number ON z_reports (restaurant_id, z_number);
CREATE INDEX IF NOT EXISTS z_reports_restaurant_closed ON z_reports (restaurant_id, closed_at);
