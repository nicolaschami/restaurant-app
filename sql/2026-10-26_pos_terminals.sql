-- 2026-10-26: POS terminals (agreed with the user): a PC registered ONCE by the owner or
-- a manager; afterwards cashiers log in on it with their 4-digit PIN only.
-- The PC keeps a long secret key (like the print helper's); the server finds the
-- restaurant from that key, then the user with that PIN inside that restaurant.
-- Only the key's hash is stored. 5 wrong PINs → the terminal waits 1 minute.
CREATE TABLE IF NOT EXISTS pos_terminals (
  id              serial PRIMARY KEY,
  restaurant_id   integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            varchar(60) NOT NULL DEFAULT 'POS terminal',
  key_hash        varchar(64) NOT NULL UNIQUE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_used_at    timestamptz,
  created_by      integer REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_terminals_restaurant ON pos_terminals (restaurant_id);
