-- 2026-10-29: OFFLINE POS SYNC (step 4, agreed with the user). When the internet is
-- back, RES Local (the print helper on the cashier PC) sends the actions taken offline
-- to the server, one by one, in order (POST /api/local/replay).
--   - offline_ops_applied: every action already done, by its unique id. An action sent
--     twice (connection lost in the middle) is answered from here and NOT done again.
--   - orders.offline_no: the number printed offline on the paper ("OFF-0007"), to match
--     the receipt with the order (the order gets its real ticket number at sync).
-- Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS offline_ops_applied (
  op_id         varchar(64) PRIMARY KEY,          -- RES Local's unique id of the action
  restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  method        varchar(10) NOT NULL,
  path          varchar(200) NOT NULL,             -- as replayed (real order ids)
  status_code   integer NOT NULL,                  -- the server's answer (2xx done, 4xx refused)
  result        jsonb,
  applied_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offline_ops_applied_restaurant ON offline_ops_applied (restaurant_id, applied_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS offline_no varchar(20);

COMMIT;
