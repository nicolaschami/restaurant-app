// src/lib/journal.ts
//
// The double-entry JOURNAL (agreed 2026-10-26, tables in sql/2026-10-27_journal_supplier_payments.sql).
//
// Every document that moves money writes ONE journal entry (JV-0001…) made of lines
// (account, optional supplier, debit OR credit). Debits always equal credits: this file
// checks it, and the database checks it again when the transaction commits.
//   purchase (GRN)    Dr 370 Stocks (before tax) + Dr 4426 VAT / Cr 401 Supplier (total)
//   purchase return   Dr 401 Supplier (total)    / Cr 370 Stocks + Cr 4426 VAT
//   supplier payment  Dr 401 Supplier            / Cr 512 Bank, 53100001 Cash sales (drawer) or 53100002 Owner's cash
//   opening balance   Dr 890 Opening balances    / Cr 401 Supplier (opposite if negative)
//   day closing (Z)   booked by the SQL function post_z_entry (sql/2026-10-28_chart_of_accounts.sql)
// Chart of accounts (2026-10-28): one TREE per restaurant. 401 is a GROUP: each supplier
// has its OWN account under 4011 (40110001, 40110002…), so a line given as
// { account: ACCOUNT.SUPPLIERS, supplierId } is booked on that supplier's account.
// A supplier's balance = Σ credit − Σ debit of its lines (positive: we owe).
//
// Nobody types in the journal: the routes call these helpers INSIDE the same database
// transaction as the document, so the document and its entry are saved together or not at all.

import { sql } from 'drizzle-orm';

export const ACCOUNT = {
  STOCKS: '370',
  SUPPLIERS: '401',
  VAT: '4426',
  BANK: '512',
  CASH_DRAWER: '53100001',
  CASH_OWNER: '53100002',
  OPENING: '890',
} as const;

export type SourceType = 'PURCHASE' | 'RETURN' | 'SUPPLIER_PAYMENT' | 'OPENING' | 'VOID' | 'SALES';

// One line of an entry. Amounts in money (12.50); give a debit OR a credit.
export interface JournalLine {
  account: string;
  supplierId?: number | null;
  debit?: number;
  credit?: number;
}

// An error with an HTTP status, for the routes to send as is (400, 404, 409…).
export class JournalError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'JournalError';
  }
}

const toCents = (v: unknown) => Math.round(Number(v || 0) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

// "JV-0007", "PAY-0012"…
export const docNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`;

// The next number of a document type for a restaurant (JV, PAY…).
// The counter row stays locked until the transaction ends, so two saves at the same
// moment wait for each other: no duplicate and no gap.
export async function nextNumber(tx: any, restaurantId: number, docType: string): Promise<number> {
  const [row] = await tx.execute(sql`
    INSERT INTO document_counters (restaurant_id, doc_type, last_no)
    VALUES (${restaurantId}, ${docType}, 1)
    ON CONFLICT (restaurant_id, doc_type) DO UPDATE SET last_no = document_counters.last_no + 1
    RETURNING last_no
  `);
  return Number(row.last_no);
}

// The number the NEXT document will probably get (only to show it on the screen).
export async function peekNumber(tx: any, restaurantId: number, docType: string): Promise<number> {
  const [row] = await tx.execute(sql`
    SELECT COALESCE(MAX(last_no), 0) + 1 AS next
    FROM document_counters WHERE restaurant_id = ${restaurantId} AND doc_type = ${docType}
  `);
  return Number(row.next);
}

// Rounds every line to cents, drops empty lines and refuses an unbalanced entry.
function cleanLines(lines: JournalLine[]) {
  const clean = lines
    .map((l) => ({ account: l.account, supplierId: l.supplierId ?? null, debit: toCents(l.debit), credit: toCents(l.credit) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  for (const l of clean) {
    if (l.debit < 0 || l.credit < 0 || (l.debit > 0 && l.credit > 0)) {
      throw new JournalError(400, 'A journal line must be a positive debit or a positive credit.');
    }
  }
  const debit = clean.reduce((s, l) => s + l.debit, 0);
  const credit = clean.reduce((s, l) => s + l.credit, 0);
  if (clean.length < 2 || debit !== credit) {
    throw new JournalError(400, `The journal entry is not balanced (debit ${fromCents(debit)} ≠ credit ${fromCents(credit)}).`);
  }
  return clean;
}

async function insertLines(tx: any, entryId: number, lines: ReturnType<typeof cleanLines>) {
  let n = 0;
  for (const l of lines) {
    n += 1;
    // a supplier line goes to the supplier's own account (created if missing);
    // the database fills in the line's restaurant from its entry
    const account =
      l.supplierId && l.account === ACCOUNT.SUPPLIERS ? sql`ensure_supplier_account(${l.supplierId})` : sql`${l.account}`;
    await tx.execute(sql`
      INSERT INTO journal_lines (entry_id, line_no, account_code, supplier_id, debit, credit)
      VALUES (${entryId}, ${n}, ${account}, ${l.supplierId}, ${fromCents(l.debit)}, ${fromCents(l.credit)})
    `);
  }
}

export interface EntryInput {
  restaurantId: number;
  date: string;                 // 'YYYY-MM-DD'
  sourceType: SourceType;
  sourceId: number | null;
  documentNo?: string | null;   // GRN-0001, PAY-0001…
  description?: string | null;
  reversesEntryId?: number | null;
  createdBy?: number | null;
  lines: JournalLine[];
}

// Writes a NEW entry with its own JV number. Returns { id, entryNo }.
export async function postEntry(tx: any, e: EntryInput): Promise<{ id: number; entryNo: number }> {
  const lines = cleanLines(e.lines);
  const entryNo = await nextNumber(tx, e.restaurantId, 'JV');
  const [row] = await tx.execute(sql`
    INSERT INTO journal_entries
      (restaurant_id, entry_no, entry_date, source_type, source_id, document_no, description, reverses_entry_id, created_by)
    VALUES
      (${e.restaurantId}, ${entryNo}, ${e.date}::date, ${e.sourceType}, ${e.sourceId}, ${e.documentNo ?? null},
       ${e.description ?? null}, ${e.reversesEntryId ?? null},
       (SELECT id FROM users WHERE id = ${e.createdBy ?? null}))
    RETURNING id
  `);
  await insertLines(tx, Number(row.id), lines);
  return { id: Number(row.id), entryNo };
}

// Replaces the lines (and date / text) of an EXISTING entry — used when a purchase is
// edited (the user's choice: the purchase keeps its same JV number).
export async function rewriteEntry(
  tx: any,
  entryId: number,
  e: Pick<EntryInput, 'date' | 'documentNo' | 'description' | 'lines'>
) {
  const lines = cleanLines(e.lines);
  await tx.execute(sql`
    UPDATE journal_entries
    SET entry_date = ${e.date}::date, document_no = ${e.documentNo ?? null}, description = ${e.description ?? null}
    WHERE id = ${entryId}
  `);
  await tx.execute(sql`DELETE FROM journal_lines WHERE entry_id = ${entryId}`);
  await insertLines(tx, entryId, lines);
}

// The entry written for a document (null if none yet).
export async function findEntry(tx: any, restaurantId: number, sourceType: SourceType, sourceId: number) {
  const [row] = await tx.execute(sql`
    SELECT id, entry_no AS "entryNo" FROM journal_entries
    WHERE restaurant_id = ${restaurantId} AND source_type = ${sourceType} AND source_id = ${sourceId}
    ORDER BY id LIMIT 1
  `);
  return row ? { id: Number(row.id), entryNo: Number(row.entryNo) } : null;
}

// The lines of a purchase (PUR) or a purchase return (RP).
// net = the document's total WITH tax; tax = its VAT (copied from the purchase as it is).
export function purchaseLines(kind: 'PUR' | 'RP', net: number, tax: number, supplierId: number): JournalLine[] {
  const total = toCents(net);
  const vat = toCents(tax);
  const beforeTax = total - vat;
  if (kind === 'PUR') {
    return [
      { account: ACCOUNT.STOCKS, debit: beforeTax / 100 },
      { account: ACCOUNT.VAT, debit: vat / 100 },
      { account: ACCOUNT.SUPPLIERS, supplierId, credit: total / 100 },
    ];
  }
  return [
    { account: ACCOUNT.SUPPLIERS, supplierId, debit: total / 100 },
    { account: ACCOUNT.STOCKS, credit: beforeTax / 100 },
    { account: ACCOUNT.VAT, credit: vat / 100 },
  ];
}

// Writes (new purchase) or rewrites (edited purchase) the entry of a purchase / return,
// reading the saved row so the entry always matches what is in the database.
export async function syncPurchaseEntry(tx: any, restaurantId: number, transactionId: number, createdBy?: number | null) {
  const [doc] = await tx.execute(sql`
    SELECT type, supplier_id AS "supplierId", "TransactionDate"::date::text AS date,
           COALESCE("GRNNumber", "TransactionNumber") AS no, "Reference" AS ref,
           COALESCE("NetTotal", 0)::float AS net, COALESCE("TaxAmount", 0)::float AS tax
    FROM stocktransactions
    WHERE "TransactionID" = ${transactionId} AND "RestaurantID" = ${restaurantId}
  `);
  if (!doc) return;
  const kind = String(doc.type).toUpperCase() === 'RP' ? 'RP' : 'PUR';
  const sourceType: SourceType = kind === 'RP' ? 'RETURN' : 'PURCHASE';
  const existing = await findEntry(tx, restaurantId, sourceType, transactionId);

  if (toCents(doc.net) <= 0) {
    // nothing to book (a 0 total): remove an old entry if there was one
    if (existing) await tx.execute(sql`DELETE FROM journal_entries WHERE id = ${existing.id}`);
    return;
  }
  if (toCents(doc.tax) < 0 || toCents(doc.tax) > toCents(doc.net)) {
    throw new JournalError(400, 'The tax amount must be between 0 and the total.');
  }

  const entry = {
    date: doc.date,
    documentNo: doc.no,
    description: (kind === 'RP' ? 'Purchase return' : 'Purchase') + (doc.ref ? ` · ${doc.ref}` : ''),
    lines: purchaseLines(kind, doc.net, doc.tax, Number(doc.supplierId)),
  };
  if (existing) await rewriteEntry(tx, existing.id, entry);
  else await postEntry(tx, { ...entry, restaurantId, sourceType, sourceId: transactionId, createdBy });
}

// Finds the supplier of a purchase. The screen sends an id and a name like
// "SUP-102 - Fresh Farms": the id is used if it is a supplier of this restaurant whose
// name matches; otherwise the supplier is found by its name or code. Unknown → refused.
export async function resolveSupplier(tx: any, restaurantId: number, supplierId: unknown, supplierName: unknown) {
  const name = String(supplierName ?? '').trim().toLowerCase();
  const code = name.includes(' - ') ? name.split(' - ')[0].trim() : name;
  const after = name.includes(' - ') ? name.slice(name.indexOf(' - ') + 3).trim() : name;
  const id = Number(supplierId);

  const rows = await tx.execute(sql`
    SELECT supplier_id AS id, supplier_name AS name,
           (supplier_id = ${Number.isInteger(id) ? id : -1}) AS "sameId",
           (lower(trim(COALESCE(supplier_code, ''))) = ${code}) AS "sameCode"
    FROM supplier
    WHERE restaurant_id = ${String(restaurantId)}
      AND (lower(trim(supplier_name)) IN (${name}, ${after})
           OR lower(trim(COALESCE(supplier_code, ''))) = ${code}
           OR ${!name} AND supplier_id = ${Number.isInteger(id) ? id : -1})
    ORDER BY "sameId" DESC, "sameCode" DESC, supplier_id
    LIMIT 1
  `);
  const s = rows[0];
  if (!s) throw new JournalError(400, 'Choose a supplier from the list (this supplier is unknown).');
  return { id: Number(s.id), name: String(s.name) };
}

// Opening balance of a supplier (positive: we owe them; negative: they owe us).
// It may be set or changed only while the supplier has no purchase / payment yet
// ("locked once used"); later corrections will be adjustment entries.
export async function syncOpeningEntry(
  tx: any,
  restaurantId: number,
  supplier: { id: number; name: string; code?: string | null; openingBalance: unknown },
  createdBy?: number | null
) {
  const amount = toCents(supplier.openingBalance);
  const existing = await findEntry(tx, restaurantId, 'OPENING', supplier.id);

  let current = 0;
  if (existing) {
    const [row] = await tx.execute(sql`
      SELECT COALESCE(SUM(credit - debit), 0)::float AS bal
      FROM journal_lines WHERE entry_id = ${existing.id} AND supplier_id IS NOT NULL
    `);
    current = toCents(row.bal);
  }
  if (current === amount) return; // unchanged

  const [used] = await tx.execute(sql`
    SELECT 1 AS x FROM journal_lines
    WHERE supplier_id = ${supplier.id} AND entry_id <> ${existing?.id ?? -1}
    LIMIT 1
  `);
  if (used) {
    throw new JournalError(
      409,
      'The opening balance cannot be changed any more: this supplier already has purchases or payments.'
    );
  }

  if (amount === 0) {
    if (existing) await tx.execute(sql`DELETE FROM journal_entries WHERE id = ${existing.id}`);
    return;
  }
  const value = Math.abs(amount) / 100;
  const lines: JournalLine[] =
    amount > 0
      ? [{ account: ACCOUNT.OPENING, debit: value }, { account: ACCOUNT.SUPPLIERS, supplierId: supplier.id, credit: value }]
      : [{ account: ACCOUNT.SUPPLIERS, supplierId: supplier.id, debit: value }, { account: ACCOUNT.OPENING, credit: value }];
  const entry = {
    date: ((await tx.execute(sql`SELECT current_date::text AS d`)) as any[])[0].d,
    documentNo: supplier.code || null,
    description: `Opening balance · ${supplier.name}`,
    lines,
  };
  if (existing) await rewriteEntry(tx, existing.id, entry);
  else await postEntry(tx, { ...entry, restaurantId, sourceType: 'OPENING', sourceId: supplier.id, createdBy });
}
