-- 2026-10-31: DELETE A RESTAURANT (asked by the user, super admin only — Settings → Platform).
-- delete_restaurant(rid) removes the restaurant and EVERYTHING in it, in ONE transaction
-- (all or nothing): orders and their lines, payments, Z reports, menu, modifiers, tables,
-- customers, suppliers, purchases and stock, the journal and the chart of accounts, users,
-- POS terminals, print helpers, offline sync records… Other restaurants are not touched.
-- It REFUSES a restaurant that holds a platform owner (super admin) account.
-- Returns what was deleted, e.g. {"restaurant": "testresto", "orders": 12, "users": 3}.
--
-- The order matters: some links refuse a delete ("no action" / "restrict"), so their rows
-- go first; most of the rest goes with the restaurant itself (ON DELETE CASCADE). Tables
-- that exist only in some databases (expense_types…) are handled only when present.
-- Safe to run again (CREATE OR REPLACE).

BEGIN;

CREATE OR REPLACE FUNCTION delete_restaurant(rid integer) RETURNS jsonb AS $$
DECLARE
  r_name  text;
  counts  jsonb := '{}'::jsonb;
  n       bigint;
BEGIN
  SELECT name INTO r_name FROM restaurants WHERE id = rid;
  IF r_name IS NULL THEN RAISE EXCEPTION 'Restaurant % not found.', rid; END IF;
  IF EXISTS (SELECT 1 FROM users WHERE restaurant_id = rid AND is_platform_admin) THEN
    RAISE EXCEPTION 'Restaurant "%" holds a platform owner account: it cannot be deleted.', r_name;
  END IF;
  -- one delete at a time for this restaurant (two clicks → the second waits, then finds nothing)
  PERFORM 1 FROM restaurants WHERE id = rid FOR UPDATE;

  -- counts for the answer (before deleting)
  SELECT COUNT(*) INTO n FROM orders WHERE restaurant_id = rid;          counts := counts || jsonb_build_object('orders', n);
  SELECT COUNT(*) INTO n FROM users WHERE restaurant_id = rid;           counts := counts || jsonb_build_object('users', n);
  SELECT COUNT(*) INTO n FROM menu_items WHERE restaurant_id = rid;      counts := counts || jsonb_build_object('menuItems', n);
  SELECT COUNT(*) INTO n FROM journal_entries WHERE restaurant_id = rid; counts := counts || jsonb_build_object('journalEntries', n);

  -- 1. rows whose links refuse a delete
  IF to_regclass('public.voided_order_items') IS NOT NULL THEN
    DELETE FROM voided_order_items WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = rid);
  END IF;
  DELETE FROM supplier_payments WHERE restaurant_id = rid;                       -- → journal, supplier
  UPDATE journal_entries SET reverses_entry_id = NULL WHERE restaurant_id = rid; -- entries pointing to each other
  DELETE FROM journal_entries WHERE restaurant_id = rid;                         -- + their lines (cascade)
  DELETE FROM stocktransactions WHERE "RestaurantID" = rid;                      -- + stockdetails (cascade)
  IF to_regclass('public.recipes') IS NOT NULL THEN
    DELETE FROM recipes WHERE ingredient_id IN (SELECT id FROM ingredients WHERE restaurant_id = rid);
  END IF;
  DELETE FROM orders WHERE restaurant_id = rid;                                  -- + lines, modifiers, payments (cascade)
  IF to_regclass('public.expense_types') IS NOT NULL THEN
    DELETE FROM expense_types WHERE restaurant_id = rid;
  END IF;

  -- 2. tables with a restaurant column but no link to restaurants
  DELETE FROM accounts WHERE restaurant_id = rid;                                -- the chart (before the suppliers)
  DELETE FROM supplier WHERE restaurant_id = rid::text;
  DELETE FROM raw_materials WHERE restaurant_id = rid;

  -- 3. the restaurant: everything else goes with it (ON DELETE CASCADE): users, menu,
  -- categories, modifiers, tables, customers, Z reports, terminals, helpers, counters…
  DELETE FROM restaurants WHERE id = rid;

  RETURN jsonb_build_object('restaurant', r_name) || counts;
END $$ LANGUAGE plpgsql;

COMMIT;
