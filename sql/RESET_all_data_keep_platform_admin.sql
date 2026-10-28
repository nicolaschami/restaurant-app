-- !!! DANGER: DELETES ALL THE DATA OF EVERY RESTAURANT !!!  (asked by the user 2026-10-28,
-- to start from scratch before the first customers)
--
-- Deleted: every restaurant and everything in it — categories, menu items, modifiers,
-- raw materials, recipes, tables, customers, suppliers, purchases, stock, orders,
-- payments, Z reports, the journal (JV), kitchen tickets, printers, POS terminals,
-- users, expense types…
-- Kept:
--   - the PLATFORM OWNER account (users.is_platform_admin, e.g. admin@restaurant.com)
--     with its password, and ONE empty restaurant for it, renamed "RES Platform"
--     (every account must belong to a restaurant). It is used only for
--     Settings → Platform, to create the real restaurants.
--   - the database structure (tables, rules, functions): only the DATA goes.
--   - roles (fixed list) and the old unused Supabase tables (auth.*, todos).
-- Numbering restarts: the next restaurant is no. 2, invoices / JV start again at 1.
-- Uploaded pictures (uploads/ folder) are not touched: just unused files.
--
-- SAFETY LOCK: it refuses to run unless the confirmation is set in the same session.
-- BACK UP THE DATABASE FIRST (pg_dump), then:
--   psql ... -c "SET res.confirm_reset = 'DELETE ALL DATA'" -f sql/RESET_all_data_keep_platform_admin.sql

BEGIN;

DO $$
DECLARE
  admin_id integer;
  rid      integer;
  keep     text[] := ARRAY['users', 'restaurants', 'roles', 'todos'];
  tables   text;
BEGIN
  IF current_setting('res.confirm_reset', true) IS DISTINCT FROM 'DELETE ALL DATA' THEN
    RAISE EXCEPTION 'Not confirmed. Back up first, then run with: -c "SET res.confirm_reset = ''DELETE ALL DATA''"';
  END IF;

  -- exactly ONE platform owner, with a restaurant (otherwise stop: nothing is deleted)
  IF (SELECT COUNT(*) FROM users WHERE is_platform_admin) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one platform owner (users.is_platform_admin): found %.',
      (SELECT COUNT(*) FROM users WHERE is_platform_admin);
  END IF;
  SELECT id, restaurant_id INTO admin_id, rid FROM users WHERE is_platform_admin;
  IF rid IS NULL THEN RAISE EXCEPTION 'The platform owner has no restaurant.'; END IF;

  -- 1. empty every other table of the app (numbering restarts at 1)
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (keep);
  EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';

  -- 2. only the platform owner and its restaurant remain
  DELETE FROM users WHERE id <> admin_id;
  DELETE FROM restaurants WHERE id <> rid;

  -- 3. its restaurant: renamed and emptied of its settings
  UPDATE restaurants SET
    name = 'RES Platform', email = NULL, address_line1 = NULL, address_line2 = NULL, city = NULL,
    state_province = NULL, postal_code = NULL, logo_url = NULL, receipt_header = NULL,
    receipt_footer = NULL, tax_number = NULL, tax_rate = 0, receipt_printer = NULL,
    drawer_printer = NULL, kitchen_printer = NULL, login_code = NULL, updated_at = now()
  WHERE id = rid;
  UPDATE users SET pin_hash = NULL WHERE id = admin_id;

  -- 4. numbering: the next restaurant / user follow the ones kept
  PERFORM setval(pg_get_serial_sequence('restaurants', 'id'), (SELECT MAX(id) FROM restaurants));
  PERFORM setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));

  -- 5. its standard chart of accounts again (emptied with the rest)
  PERFORM seed_chart_of_accounts(rid);

  RAISE NOTICE 'Done: kept user % (restaurant % "RES Platform"), everything else deleted.', admin_id, rid;
END $$;

COMMIT;
