-- Payments of POS orders (one row per payment).
-- An order is paid EITHER by cash OR by one card (no mixed payments yet).
-- A separate table (instead of columns on orders) so split bills or mixed
-- payments can be added later without changing the orders table.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS order_payments (
  id              serial PRIMARY KEY,
  restaurant_id   integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id        integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method          varchar(20) NOT NULL
                  CHECK (method IN ('CASH', 'VISA', 'MASTERCARD', 'DEBIT')),
  amount_due      numeric(10,2) NOT NULL,   -- the order total at payment time
  amount_received numeric(10,2) NOT NULL,   -- cash given by the customer (= due for cards)
  change_given    numeric(10,2) NOT NULL DEFAULT 0,
  currency        varchar(3)  NOT NULL DEFAULT 'USD',
  cashier_id      integer REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One payment per order (an order cannot be paid twice).
CREATE UNIQUE INDEX IF NOT EXISTS order_payments_order_unique ON order_payments(order_id);
-- For end-of-day / Z reports.
CREATE INDEX IF NOT EXISTS order_payments_restaurant_date ON order_payments(restaurant_id, created_at);
