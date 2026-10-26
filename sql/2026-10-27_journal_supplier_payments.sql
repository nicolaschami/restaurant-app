-- 2026-10-27: double-entry JOURNAL + SUPPLIER PAYMENTS (agreed with the user).
--
-- The idea: every document that moves money writes ONE journal entry made of lines
-- (account, optional supplier, debit, credit) whose debits equal its credits.
--   purchase (GRN)      Dr 370 Stocks (before tax) + Dr 4426 VAT recoverable / Cr 401 Supplier (total)
--   purchase return     Dr 401 Supplier (total) / Cr 370 Stocks + Cr 4426 VAT
--   supplier payment    Dr 401 Supplier / Cr 512 Bank, 530 Cash drawer or 531 Owner's cash
--   opening balance     Dr 890 Opening balances / Cr 401 Supplier
-- A supplier's statement = its lines on account 401; balance = Σ credit − Σ debit
-- (positive: we owe; negative: paid in advance). Payments are ON ACCOUNT.
-- Nothing is typed into the journal by hand: the server writes it with the document.
-- Safe to run again (IF NOT EXISTS / ON CONFLICT / only missing entries are added).

-- ---------------------------------------------------------------- 1. chart of accounts
-- The same small chart for every restaurant (Lebanese plan comptable codes).
CREATE TABLE IF NOT EXISTS accounts (
  code       varchar(10) PRIMARY KEY,
  name       varchar(100) NOT NULL,
  kind       varchar(10)  NOT NULL CHECK (kind IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  created_at timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO accounts (code, name, kind) VALUES
  ('370',  'Stocks (raw materials)', 'ASSET'),
  ('401',  'Suppliers',              'LIABILITY'),
  ('4426', 'VAT recoverable',        'ASSET'),
  ('512',  'Bank',                   'ASSET'),
  ('530',  'Cash drawer (POS)',      'ASSET'),
  ('531',  'Cash (owner)',           'ASSET'),
  ('890',  'Opening balances',       'EQUITY')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- 2. document numbers
-- JV-0001, PAY-0001… per restaurant, given by the server inside the saving transaction
-- (a locked counter row: no duplicates and no gaps, even when two people save at once).
CREATE TABLE IF NOT EXISTS document_counters (
  restaurant_id integer     NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  doc_type      varchar(10) NOT NULL,          -- 'JV', 'PAY'
  last_no       integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, doc_type)
);

-- ---------------------------------------------------------------- 3. journal
CREATE TABLE IF NOT EXISTS journal_entries (
  id                serial PRIMARY KEY,
  restaurant_id     integer     NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  entry_no          integer     NOT NULL,                    -- shown as JV-0001
  entry_date        date        NOT NULL,
  source_type       varchar(20) NOT NULL CHECK (source_type IN ('PURCHASE', 'RETURN', 'SUPPLIER_PAYMENT', 'OPENING', 'VOID')),
  source_id         integer,                                 -- the document's id (purchase, payment, supplier…)
  document_no       varchar(50),                             -- GRN-0001, PAY-0001… (for reading)
  description       text,
  reverses_entry_id integer REFERENCES journal_entries(id),  -- a VOID points to the entry it cancels
  created_by        integer REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, entry_no)
);
CREATE INDEX IF NOT EXISTS journal_entries_source ON journal_entries (restaurant_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id           serial PRIMARY KEY,
  entry_id     integer       NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no      smallint      NOT NULL,
  account_code varchar(10)   NOT NULL REFERENCES accounts(code),
  supplier_id  integer       REFERENCES supplier(supplier_id),
  debit        numeric(12,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit       numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0),                           -- a line is a debit OR a credit
  CHECK (debit > 0 OR credit > 0)                            -- never an empty line
);
CREATE INDEX IF NOT EXISTS journal_lines_entry    ON journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_supplier ON journal_lines (supplier_id, account_code);

-- The database itself refuses an unbalanced entry, checked when the transaction commits
-- (so the server can add the lines one by one inside the same transaction).
CREATE OR REPLACE FUNCTION journal_check_balanced() RETURNS trigger AS $$
DECLARE
  e integer := COALESCE(NEW.entry_id, OLD.entry_id);
  d numeric; c numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = e) THEN RETURN NULL; END IF; -- entry deleted
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO d, c FROM journal_lines WHERE entry_id = e;
  IF d <> c THEN
    RAISE EXCEPTION 'Journal entry % is not balanced (debit % <> credit %)', e, d, c;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_balanced ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_check_balanced();

-- ---------------------------------------------------------------- 4. supplier payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id               serial PRIMARY KEY,
  restaurant_id    integer       NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  payment_no       integer       NOT NULL,                       -- shown as PAY-0001
  supplier_id      integer       NOT NULL REFERENCES supplier(supplier_id),
  paid_at          date          NOT NULL,
  method           varchar(20)   NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD')),
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  reference        varchar(100),                                 -- transfer ref., cheque no.…
  description      text,
  from_cash_drawer boolean       NOT NULL DEFAULT false,         -- cash taken from the POS drawer (the Z subtracts it)
  status           varchar(10)   NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  journal_entry_id integer       REFERENCES journal_entries(id),
  created_by       integer       REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  voided_at        timestamptz,
  voided_by        integer       REFERENCES users(id) ON DELETE SET NULL,
  void_reason      text,
  UNIQUE (restaurant_id, payment_no),
  CHECK (from_cash_drawer = false OR method = 'CASH')            -- only cash comes from the drawer
);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier ON supplier_payments (restaurant_id, supplier_id, paid_at);

-- ---------------------------------------------------------------- 5. purchases ↔ supplier (by id)
-- Until now a purchase only stored the supplier's NAME ("SUP-102 - Ocean Catch Seafoods").
ALTER TABLE stocktransactions ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES supplier(supplier_id);

UPDATE stocktransactions st
SET supplier_id = s.supplier_id
FROM supplier s
WHERE st.supplier_id IS NULL
  AND st.type IN ('PUR', 'RP')
  AND s.restaurant_id::text = st."RestaurantID"::text
  AND (
        lower(trim(st."SupplierName")) = lower(trim(s.supplier_name))                               -- "Fresh Farms"
     OR lower(trim(split_part(st."SupplierName", ' - ', 1))) = lower(trim(s.supplier_code))         -- "SUP-102 - …"
     OR lower(trim(substring(st."SupplierName" from position(' - ' in st."SupplierName") + 3))) = lower(trim(s.supplier_name))
  );

-- ---------------------------------------------------------------- 6. journal for what already exists
-- Each posted purchase / return and each opening balance gets its entry (only if missing).
DO $$
DECLARE
  d record;
  e integer;
  n integer;
  before_tax numeric;
BEGIN
  -- documents in date order, so JV numbers follow the calendar
  FOR d IN
    SELECT * FROM (
      SELECT 'OPENING'::varchar AS kind, s.supplier_id AS src, s.restaurant_id::integer AS rid,
             COALESCE(s.created_date::date, DATE '2026-01-01') AS dt, s.supplier_code AS docno,
             'Opening balance · ' || s.supplier_name AS descr, s.supplier_id AS sup,
             s.opening_balance::numeric AS total, 0::numeric AS tax
      FROM supplier s
      WHERE COALESCE(s.opening_balance, 0) <> 0
      UNION ALL
      SELECT CASE WHEN st.type = 'PUR' THEN 'PURCHASE' ELSE 'RETURN' END, st."TransactionID", st."RestaurantID",
             st."TransactionDate"::date, COALESCE(st."GRNNumber", st."TransactionNumber"),
             CASE WHEN st.type = 'PUR' THEN 'Purchase' ELSE 'Purchase return' END
               || COALESCE(' · ' || NULLIF(st."Reference", ''), ''),
             st.supplier_id, COALESCE(st."NetTotal", 0), COALESCE(st."TaxAmount", 0)
      FROM stocktransactions st
      WHERE st.type IN ('PUR', 'RP') AND upper(COALESCE(st."Status", '')) = 'POSTED' AND COALESCE(st."NetTotal", 0) > 0
    ) docs
    WHERE NOT EXISTS (
      SELECT 1 FROM journal_entries j WHERE j.restaurant_id = docs.rid AND j.source_type = docs.kind AND j.source_id = docs.src
    )
    ORDER BY rid, dt, kind DESC, src
  LOOP
    INSERT INTO document_counters (restaurant_id, doc_type, last_no) VALUES (d.rid, 'JV', 1)
      ON CONFLICT (restaurant_id, doc_type) DO UPDATE SET last_no = document_counters.last_no + 1
      RETURNING last_no INTO n;
    INSERT INTO journal_entries (restaurant_id, entry_no, entry_date, source_type, source_id, document_no, description)
      VALUES (d.rid, n, d.dt, d.kind, d.src, d.docno, d.descr) RETURNING id INTO e;
    before_tax := d.total - d.tax;

    IF d.kind = 'OPENING' THEN
      IF d.total > 0 THEN   -- we owe the supplier
        INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES
          (e, 1, '890', NULL, d.total, 0), (e, 2, '401', d.sup, 0, d.total);
      ELSE                  -- the supplier owes us (advance)
        INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES
          (e, 1, '401', d.sup, -d.total, 0), (e, 2, '890', NULL, 0, -d.total);
      END IF;
    ELSIF d.kind = 'PURCHASE' THEN
      INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 1, '370', NULL, before_tax, 0);
      IF d.tax > 0 THEN
        INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 2, '4426', NULL, d.tax, 0);
      END IF;
      INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 3, '401', d.sup, 0, d.total);
    ELSE -- RETURN
      INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 1, '401', d.sup, d.total, 0);
      INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 2, '370', NULL, 0, before_tax);
      IF d.tax > 0 THEN
        INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit) VALUES (e, 3, '4426', NULL, 0, d.tax);
      END IF;
    END IF;
  END LOOP;
END $$;
