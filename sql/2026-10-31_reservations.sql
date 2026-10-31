-- 2026-10-31: RESERVATIONS, step 1 (agreed with the user, mockup approved 2026-10-31).
-- The staff book a table for a customer: name, phone, day and time, number of people,
-- a table (optional: it can also be chosen when the guest arrives) and a note.
--   - reservations: one row per booking. A booking HOLDS its table from starts_at to
--     ends_at (= start + the restaurant's hold time, 1 hour by default; stored on the
--     booking, so changing the setting later does not move existing bookings).
--   - status: booked → arrived (seated, order_id = the order opened on the table)
--             or no_show / cancelled (set by the staff, never automatic).
--   - restaurants.reservation_hold_minutes: how long a booking holds its table (60).
--   - restaurants.reservation_reserve_before_minutes: the table shows "Reserved" this
--     many minutes before the booking (15).
-- Double booking: the database itself refuses two active bookings (booked / arrived)
-- on the same table at overlapping times (needs the btree_gist extension; if it cannot
-- be installed, the server check alone protects, and a NOTICE says so).
-- Not part of offline mode (offline = POS sales only). Safe to run again.

BEGIN;

-- the 2 settings, per restaurant
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_hold_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_reserve_before_minutes integer NOT NULL DEFAULT 15;
DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT restaurants_reservation_hold_check
    CHECK (reservation_hold_minutes BETWEEN 15 AND 480);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT restaurants_reservation_before_check
    CHECK (reservation_reserve_before_minutes BETWEEN 0 AND 240);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reservations (
  id            serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_id   bigint REFERENCES customers(id) ON DELETE SET NULL,     -- known customer (found by phone)
  guest_name    varchar(120) NOT NULL,
  phone         varchar(50),
  party_size    integer NOT NULL CHECK (party_size BETWEEN 1 AND 200),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,                                    -- start + hold time
  table_id      bigint REFERENCES restaurant_tables(id) ON DELETE SET NULL, -- NULL = "no table yet"
  note_tags     text[] NOT NULL DEFAULT '{}',                            -- chips: birthday, window, terrace…
  note          text,                                                    -- free note
  status        varchar(12) NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked', 'arrived', 'no_show', 'cancelled')),
  order_id      integer REFERENCES orders(id) ON DELETE SET NULL,        -- the order opened at "Seat"
  created_by    integer REFERENCES users(id) ON DELETE SET NULL,
  status_at     timestamptz,                                             -- when arrived / no-show / cancelled
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
-- the screen reads one day of one restaurant; the phone search finds past bookings
CREATE INDEX IF NOT EXISTS reservations_restaurant_start ON reservations (restaurant_id, starts_at);
CREATE INDEX IF NOT EXISTS reservations_restaurant_phone ON reservations (restaurant_id, phone);

-- no two active bookings on the same table at the same time
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
    RAISE NOTICE 'btree_gist could not be installed: double bookings are checked by the server only.';
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (table_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
      WHERE (table_id IS NOT NULL AND status IN ('booked', 'arrived'));
  END IF;
END $$;

COMMIT;
