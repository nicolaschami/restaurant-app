-- Chat orders (v2) — table bookings in the chat + opening hours (2026-11-01)
-- Decided with the owner: the cashier Accepts each chat booking (like chat orders),
-- RES picks the best free table, and the bot only offers times inside the opening hours.
-- Run AFTER sql/2026-11-01_chat_orders.sql, as the app user:
--   psql -U res_app -d res_pos -f sql/2026-11-01_chat_bookings.sql

-- Opening hours, one range per weekday; null = closed that day; the whole value
-- null = not set yet (the bot then accepts any time). A closing time smaller than the
-- opening time means after midnight (e.g. 18:00 → 02:00).
--   {"mon": ["12:00", "23:00"], "tue": null, "wed": ["12:00", "23:00"], ...}
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opening_hours jsonb;

-- The chat "waiting room" holds orders AND table bookings.
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'order';
ALTER TABLE chat_orders DROP CONSTRAINT IF EXISTS chat_orders_kind_check;
ALTER TABLE chat_orders ADD CONSTRAINT chat_orders_kind_check CHECK (kind IN ('order', 'booking'));

-- a booking has no delivery / pickup and no order lines
ALTER TABLE chat_orders ALTER COLUMN order_type DROP NOT NULL;
ALTER TABLE chat_orders DROP CONSTRAINT IF EXISTS chat_orders_order_type_check;
ALTER TABLE chat_orders ADD CONSTRAINT chat_orders_order_type_check CHECK (order_type IS NULL OR order_type IN ('delivery', 'pickup'));
ALTER TABLE chat_orders ALTER COLUMN lines SET DEFAULT '[]'::jsonb;
ALTER TABLE chat_orders ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE chat_orders ALTER COLUMN total SET DEFAULT 0;

-- the booking itself (restaurant time) and, once accepted, the reservation it became
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS booking_date date;
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS booking_time varchar(5);
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS party_size integer;
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS booking_note text;
ALTER TABLE chat_orders ADD COLUMN IF NOT EXISTS reservation_id integer REFERENCES reservations(id) ON DELETE SET NULL;
