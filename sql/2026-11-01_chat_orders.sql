-- Chat orders (v2, step 3 — 2026-11-01)
-- An order the customer confirmed in the chat page, waiting for a cashier.
--   pending  → the POS rings (Accept / Reject)
--   accepted → a normal RES order was created (order_id, ticket_no)
--   rejected → the customer sees reject_reason in the chat
-- The customer number shown in the chat is W-<1000 + id> (e.g. W-1042).
-- Run as the app user:  psql -U res_app -d res_pos -f sql/2026-11-01_chat_orders.sql

CREATE TABLE IF NOT EXISTS chat_orders (
  id               serial PRIMARY KEY,
  restaurant_id    integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  public_token     varchar(40) NOT NULL UNIQUE,          -- the customer's page asks the status with it
  status           varchar(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepting', 'accepted', 'rejected')),
  order_type       varchar(20) NOT NULL CHECK (order_type IN ('delivery', 'pickup')),
  customer_id      integer REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    varchar(120) NOT NULL,
  customer_phone   varchar(50) NOT NULL,
  customer_address text,
  lines            jsonb NOT NULL,                       -- the order card, priced by RES
  subtotal         numeric(10, 2) NOT NULL,
  tax              numeric(10, 2) NOT NULL DEFAULT 0,
  total            numeric(10, 2) NOT NULL,
  conversation     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- the chat, for "Open the chat"
  reject_reason    varchar(200),
  order_id         integer REFERENCES orders(id) ON DELETE SET NULL,
  ticket_no        integer,
  answered_by      integer REFERENCES users(id) ON DELETE SET NULL,
  answered_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_orders_restaurant_status ON chat_orders (restaurant_id, status, created_at);
