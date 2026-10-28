-- 2026-10-28: CHART OF ACCOUNTS per restaurant, as a TREE (asked by the user, like their
-- tblaccount): 4 Third parties → 40 Suppliers → 401 Suppliers → 4011 Local suppliers →
-- 40110001 "Fresh Farms", 40110002 … one account PER SUPPLIER, created automatically.
--
--   - Every restaurant has its own chart (restaurant_id + code). A new restaurant gets the
--     standard chart automatically (trigger on restaurants).
--   - Group accounts (is_group = the user's "grouped = Y") only add up their children;
--     the journal posts ONLY to non-group accounts (checked by the database).
--   - New supplier → its account under 4011 (next number). Renaming the supplier renames
--     the account.
--   - The journal lines of a supplier now use ITS account (40110001), not 401.
--   - Currency: always the currency of the restaurant's country (no LBP/USD per account).
--   - Cash: 53 → 531 → 53100001 Cash sales (the POS drawer) and 53100002 Cash (owner).
--     The old 530 / 531 lines move there.
--   - Sales are booked at the END OF THE DAY, when the Z is closed (one entry per Z):
--       Dr 53100001 Cash sales (cash)  Dr 515 Cards to collect (Visa, Mastercard, debit)
--       Cr 70110001 Sales (ONE sales account, before tax)  Cr 4427 VAT collected
--       Cr 706 Delivery fees  Dr/Cr 709 Discounts & rounding (what is left)
--       + cash over (Cr 758) / short (Dr 658). The cash taken out at the Z stays in
--       53100001 (the user's choice: no transfer line).
--     The same SQL function books new Zs (called by the server) and the old ones (below).
-- Safe to run again.

BEGIN;
-- check each entry's balance at once (not at COMMIT): the table is changed below.
SET CONSTRAINTS ALL IMMEDIATE;

-- ---------------------------------------------------------------- 1. accounts: per restaurant, a tree
ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_lines_account_code_fkey;

ALTER TABLE accounts ALTER COLUMN code TYPE varchar(20);
ALTER TABLE accounts ALTER COLUMN name TYPE varchar(200);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS restaurant_id integer REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_code varchar(20);                 -- the user's "refo"
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_group    boolean NOT NULL DEFAULT false; -- "grouped" Y/N
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_system   boolean NOT NULL DEFAULT false; -- standard: cannot be deleted
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES supplier(supplier_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_supplier ON accounts (supplier_id) WHERE supplier_id IS NOT NULL;

-- The old chart was ONE list for all restaurants (code only): it is replaced below by
-- one chart per restaurant, so the old shared rows go.
DELETE FROM accounts WHERE restaurant_id IS NULL;
ALTER TABLE accounts ALTER COLUMN restaurant_id SET NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_pkey'
             AND pg_get_constraintdef(oid) = 'PRIMARY KEY (code)') THEN
    ALTER TABLE accounts DROP CONSTRAINT accounts_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_pkey') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (restaurant_id, code);
  END IF;
  -- a parent must exist in the same chart (and cannot be deleted while it has children)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_parent_fkey') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_parent_fkey
      FOREIGN KEY (restaurant_id, parent_code) REFERENCES accounts (restaurant_id, code);
  END IF;
END $$;

-- ---------------------------------------------------------------- 2. the standard chart
-- Lebanese plan comptable, kept short for a restaurant. The owner can add accounts
-- (e.g. more expenses) under any group from the Chart of Accounts screen.
CREATE OR REPLACE FUNCTION seed_chart_of_accounts(rid integer) RETURNS void AS $$
  INSERT INTO accounts (restaurant_id, code, name, kind, parent_code, is_group, is_system)
  SELECT rid, t.code, t.name, t.kind, t.parent, t.grp, true
  FROM (VALUES
    ('1',    'Capital & reserves',               'EQUITY',    NULL,  true),
    ('10',   'Capital',                          'EQUITY',    '1',   true),
    ('101',  'Capital',                          'EQUITY',    '10',  false),
    ('12',   'Result of the year',               'EQUITY',    '1',   true),
    ('121',  'Profit or loss',                   'EQUITY',    '12',  false),
    ('2',    'Fixed assets',                     'ASSET',     NULL,  true),
    ('21',   'Equipment & furniture',            'ASSET',     '2',   true),
    ('215',  'Kitchen equipment',                'ASSET',     '21',  false),
    ('218',  'Furniture & IT equipment',         'ASSET',     '21',  false),
    ('3',    'Stocks',                           'ASSET',     NULL,  true),
    ('37',   'Stocks of goods',                  'ASSET',     '3',   true),
    ('370',  'Stocks (raw materials)',           'ASSET',     '37',  false),
    ('4',    'Third parties',                    'LIABILITY', NULL,  true),
    ('40',   'Suppliers',                        'LIABILITY', '4',   true),
    ('401',  'Suppliers',                        'LIABILITY', '40',  true),
    ('4011', 'Local suppliers',                  'LIABILITY', '401', true),
    ('41',   'Customers',                        'ASSET',     '4',   true),
    ('411',  'Customers',                        'ASSET',     '41',  false),
    ('42',   'Staff',                            'LIABILITY', '4',   true),
    ('421',  'Salaries payable',                 'LIABILITY', '42',  false),
    ('44',   'State & taxes',                    'LIABILITY', '4',   true),
    ('442',  'VAT',                              'LIABILITY', '44',  true),
    ('4426', 'VAT recoverable (purchases)',      'ASSET',     '442', false),
    ('4427', 'VAT collected (sales)',            'LIABILITY', '442', false),
    ('5',    'Financial accounts',               'ASSET',     NULL,  true),
    ('51',   'Banks',                            'ASSET',     '5',   true),
    ('512',  'Bank',                             'ASSET',     '51',  false),
    ('515',  'Card payments to collect',         'ASSET',     '51',  false),
    ('53',   'Cash',                             'ASSET',     '5',   true),
    ('531',  'Cash',                             'ASSET',     '53',  true),
    ('53100001', 'Cash sales (POS drawer)',      'ASSET',     '531', false),
    ('53100002', 'Cash (owner)',                 'ASSET',     '531', false),
    ('6',    'Expenses',                         'EXPENSE',   NULL,  true),
    ('60',   'Cost of sales',                    'EXPENSE',   '6',   true),
    ('601',  'Food & drinks used',               'EXPENSE',   '60',  false),
    ('61',   'Rent & utilities',                 'EXPENSE',   '6',   true),
    ('612',  'Rent',                             'EXPENSE',   '61',  false),
    ('613',  'Electricity & generator',          'EXPENSE',   '61',  false),
    ('614',  'Gas',                              'EXPENSE',   '61',  false),
    ('615',  'Maintenance & repairs',            'EXPENSE',   '61',  false),
    ('62',   'Other services',                   'EXPENSE',   '6',   true),
    ('623',  'Advertising',                      'EXPENSE',   '62',  false),
    ('626',  'Internet & phone',                 'EXPENSE',   '62',  false),
    ('627',  'Bank & card fees',                 'EXPENSE',   '62',  false),
    ('64',   'Staff costs',                      'EXPENSE',   '6',   true),
    ('641',  'Salaries & wages',                 'EXPENSE',   '64',  false),
    ('65',   'Other expenses',                   'EXPENSE',   '6',   true),
    ('658',  'Cash short (Z)',                   'EXPENSE',   '65',  false),
    ('7',    'Income',                           'INCOME',    NULL,  true),
    ('70',   'Sales',                            'INCOME',    '7',   true),
    ('701',  'Sales of food & drinks',           'INCOME',    '70',  true),
    ('70110001', 'Sales',                        'INCOME',    '701', false),
    ('706',  'Delivery fees',                    'INCOME',    '70',  false),
    ('709',  'Discounts & rounding',             'INCOME',    '70',  false),
    ('75',   'Other income',                     'INCOME',    '7',   true),
    ('758',  'Cash over (Z)',                    'INCOME',    '75',  false),
    ('8',    'Special accounts',                 'EQUITY',    NULL,  true),
    ('89',   'Opening balances',                 'EQUITY',    '8',   true),
    ('890',  'Opening balances',                 'EQUITY',    '89',  false)
  ) AS t(code, name, kind, parent, grp)
  ON CONFLICT (restaurant_id, code) DO NOTHING;
$$ LANGUAGE sql;

-- A new restaurant gets the chart at once.
CREATE OR REPLACE FUNCTION restaurants_seed_chart() RETURNS trigger AS $$
BEGIN
  PERFORM seed_chart_of_accounts(NEW.id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS restaurants_seed_chart ON restaurants;
CREATE TRIGGER restaurants_seed_chart AFTER INSERT ON restaurants
  FOR EACH ROW EXECUTE FUNCTION restaurants_seed_chart();

SELECT seed_chart_of_accounts(id) FROM restaurants;

-- ---------------------------------------------------------------- 3. supplier sub-accounts
-- The next code under a group: 4011 → 40110001, 40110002… (4 more digits).
CREATE OR REPLACE FUNCTION next_sub_account(rid integer, parent varchar) RETURNS varchar AS $$
  SELECT parent || lpad((COALESCE(MAX(substr(code, length(parent) + 1)::integer), 0) + 1)::text, 4, '0')
  FROM accounts
  WHERE restaurant_id = rid AND parent_code = parent AND code ~ ('^' || parent || '[0-9]{4}$');
$$ LANGUAGE sql;

-- The account of a supplier (created if missing). Returns its code.
CREATE OR REPLACE FUNCTION ensure_supplier_account(sid integer) RETURNS varchar AS $$
DECLARE
  s record;
  c varchar;
BEGIN
  SELECT code INTO c FROM accounts WHERE supplier_id = sid;
  IF c IS NOT NULL THEN RETURN c; END IF;
  SELECT supplier_id, restaurant_id, supplier_name INTO s FROM supplier WHERE supplier_id = sid;
  IF s IS NULL OR s.restaurant_id !~ '^[0-9]+$' THEN RETURN NULL; END IF;
  PERFORM seed_chart_of_accounts(s.restaurant_id::integer);
  -- two suppliers saved at the same moment wait here: never the same number
  PERFORM pg_advisory_xact_lock(hashtext('account-no'), s.restaurant_id::integer);
  c := next_sub_account(s.restaurant_id::integer, '4011');
  INSERT INTO accounts (restaurant_id, code, name, kind, parent_code, is_group, supplier_id)
  VALUES (s.restaurant_id::integer, c, s.supplier_name, 'LIABILITY', '4011', false, sid);
  RETURN c;
END $$ LANGUAGE plpgsql;

-- New supplier → its account; renamed → the account is renamed.
CREATE OR REPLACE FUNCTION supplier_account_sync() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE accounts SET name = NEW.supplier_name WHERE supplier_id = NEW.supplier_id;
  END IF;
  PERFORM ensure_supplier_account(NEW.supplier_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS supplier_account_sync ON supplier;
CREATE TRIGGER supplier_account_sync AFTER INSERT OR UPDATE OF supplier_name ON supplier
  FOR EACH ROW EXECUTE FUNCTION supplier_account_sync();


-- ---------------------------------------------------------------- 4. journal lines → the restaurant's chart
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS restaurant_id integer;
ALTER TABLE journal_lines ALTER COLUMN account_code TYPE varchar(20);
UPDATE journal_lines l SET restaurant_id = e.restaurant_id
FROM journal_entries e WHERE e.id = l.entry_id AND l.restaurant_id IS NULL;
ALTER TABLE journal_lines ALTER COLUMN restaurant_id SET NOT NULL;

-- The existing suppliers get their accounts (in order: the first supplier is 40110001),
-- then the supplier lines move from 401 to the supplier's account, and the old cash
-- accounts 530 / 531 move to 53100001 / 53100002.
SELECT ensure_supplier_account(supplier_id) FROM (SELECT supplier_id FROM supplier ORDER BY supplier_id) s;
UPDATE journal_lines l SET account_code = a.code
FROM accounts a
WHERE l.account_code = '401' AND l.supplier_id IS NOT NULL AND a.supplier_id = l.supplier_id;
UPDATE journal_lines SET account_code = '53100001' WHERE account_code = '530';
UPDATE journal_lines SET account_code = '53100002' WHERE account_code = '531';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_lines WHERE account_code = '401') THEN
    RAISE EXCEPTION 'Some lines on 401 have no supplier: they cannot be moved to a supplier account.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_account_fkey') THEN
    ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_fkey
      FOREIGN KEY (restaurant_id, account_code) REFERENCES accounts (restaurant_id, code);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS journal_lines_account ON journal_lines (restaurant_id, account_code);

-- Each line takes its restaurant from its entry, and may only use a NON-group account.
CREATE OR REPLACE FUNCTION journal_line_check() RETURNS trigger AS $$
BEGIN
  SELECT restaurant_id INTO NEW.restaurant_id FROM journal_entries WHERE id = NEW.entry_id;
  IF EXISTS (SELECT 1 FROM accounts WHERE restaurant_id = NEW.restaurant_id AND code = NEW.account_code AND is_group) THEN
    RAISE EXCEPTION 'Account % is a group: post to one of its sub-accounts.', NEW.account_code;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_line_check ON journal_lines;
CREATE TRIGGER journal_line_check BEFORE INSERT OR UPDATE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_line_check();

-- ---------------------------------------------------------------- 5. sales at the end of the day (Z)
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('PURCHASE', 'RETURN', 'SUPPLIER_PAYMENT', 'OPENING', 'VOID', 'SALES'));

-- Books the entry of one Z (nothing if it already has one or nothing moved). Returns the entry id.
CREATE OR REPLACE FUNCTION post_z_entry(zid integer) RETURNS integer AS $$
DECLARE
  z    record;
  prev timestamptz;
  tz   text;
  n    integer;
  e    integer;
BEGIN
  SELECT * INTO z FROM z_reports WHERE id = zid;
  IF z IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE restaurant_id = z.restaurant_id AND source_type = 'SALES' AND source_id = zid) THEN
    RETURN NULL;
  END IF;
  -- the day = the payments after the previous Z, up to this one (same rule as the Z itself)
  SELECT closed_at INTO prev FROM z_reports
  WHERE restaurant_id = z.restaurant_id AND z_number < z.z_number ORDER BY z_number DESC LIMIT 1;
  SELECT r.timezone INTO tz FROM restaurants r WHERE r.id = z.restaurant_id;
  IF tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN tz := 'UTC'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS z_lines (grp int, account varchar(20), amount numeric) ON COMMIT DROP;
  DELETE FROM z_lines;
  -- amount > 0 = debit, < 0 = credit
  INSERT INTO z_lines
  WITH pay AS (
    SELECT o.id AS order_id, p.method, p.amount_due AS total,
           COALESCE((SELECT SUM(i.subtotal) FROM order_items i
                     WHERE i.order_id = o.id AND COALESCE(i.kds_status::text, '') <> 'CANCELLED'), 0) AS items,
           o.tax_amount, COALESCE(o.delivery_fee, 0) AS fee
    FROM order_payments p
    JOIN orders o ON o.id = p.order_id AND o.restaurant_id = z.restaurant_id
    WHERE p.restaurant_id = z.restaurant_id
      AND (prev IS NULL OR p.created_at > prev) AND p.created_at <= z.closed_at
  ), t AS (
    SELECT *, COALESCE(tax_amount, total - items - fee) AS tax FROM pay
  )
  SELECT 1, CASE WHEN method = 'CASH' THEN '53100001' ELSE '515' END, SUM(total) FROM t GROUP BY 2
  UNION ALL SELECT 2, '70110001', -SUM(items) FROM t                         -- one sales account
  UNION ALL SELECT 3, '4427', -SUM(tax) FROM t
  UNION ALL SELECT 4, '706',  -SUM(fee) FROM t
  UNION ALL SELECT 5, '709',  -SUM(total - items - tax - fee) FROM t       -- discounts, rounding
  UNION ALL SELECT 6, '53100001', COALESCE(z.difference, 0)                 -- counted − expected
  UNION ALL SELECT 6, CASE WHEN COALESCE(z.difference, 0) > 0 THEN '758' ELSE '658' END, -COALESCE(z.difference, 0);

  DELETE FROM z_lines WHERE round(COALESCE(amount, 0), 2) = 0;
  IF NOT EXISTS (SELECT 1 FROM z_lines) THEN RETURN NULL; END IF;

  INSERT INTO document_counters (restaurant_id, doc_type, last_no) VALUES (z.restaurant_id, 'JV', 1)
    ON CONFLICT (restaurant_id, doc_type) DO UPDATE SET last_no = document_counters.last_no + 1
    RETURNING last_no INTO n;
  INSERT INTO journal_entries (restaurant_id, entry_no, entry_date, source_type, source_id, document_no, description, created_by)
  VALUES (z.restaurant_id, n, (z.closed_at AT TIME ZONE tz)::date, 'SALES', zid,
          'Z-' || lpad(z.z_number::text, 4, '0'), 'Day closing · sales of the day', z.closed_by)
  RETURNING id INTO e;
  INSERT INTO journal_lines (entry_id, restaurant_id, line_no, account_code, debit, credit)
  SELECT e, z.restaurant_id, row_number() OVER (ORDER BY grp, CASE WHEN amount > 0 THEN 0 ELSE 1 END, account),
         account, round(GREATEST(amount, 0), 2), round(GREATEST(-amount, 0), 2)
  FROM (SELECT grp, account, SUM(amount) AS amount FROM z_lines GROUP BY grp, account) x
  WHERE round(amount, 2) <> 0;
  RETURN e;
END $$ LANGUAGE plpgsql;

-- The Zs already closed get their entry (in order).
SELECT post_z_entry(id) FROM (SELECT id FROM z_reports ORDER BY restaurant_id, z_number) z;

COMMIT;
