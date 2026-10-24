-- 2026-10-25: print helper (agreed with the user): a small Windows program in each
-- restaurant connects to the server and prints DIRECTLY on the Windows printers
-- (no browser). Printing goes through the helper only.
--   - print_agents: one row per helper; it proves who it is with a secret key
--     (only its hash is stored; the key is shown once when the helper is added).
--   - printers: the printer names the helper reported (to choose them on the screen).
--   - restaurants.receipt_printer / drawer_printer: which printer is used for what.
CREATE TABLE IF NOT EXISTS print_agents (
  id            serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          varchar(60) NOT NULL DEFAULT 'Cashier PC',
  key_hash      varchar(64) NOT NULL UNIQUE,
  printers      jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_agents_restaurant ON print_agents (restaurant_id);

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS receipt_printer varchar(120);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS drawer_printer varchar(120);
