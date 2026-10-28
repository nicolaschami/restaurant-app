// src/routes/supplierPayments.ts
//
// Supplier payments and the supplier's account (agreed 2026-10-26, mockup:
// https://claude.ai/artifact/VnRMtuuuhYzHemRom4ToBn). Managers and owners only
// (roles.ts: every /api/supplier… path needs a manager).
//   - A payment is ON ACCOUNT (not tied to an invoice); paying more than the balance
//     is allowed and becomes an advance (negative balance).
//   - Journal: Dr the supplier's account (40110001…, under 401) / Cr 512 Bank (transfer, cheque, card),
//     53100001 Cash sales (taken from the POS drawer → the Z subtracts it) or 53100002 Owner's cash.
//   - Date: today or earlier. A payment is never deleted: VOID (reason required)
//     adds a reversing entry and keeps both.
//
// GET  /api/supplier-payments/next-number      → { paymentNo: 'PAY-0005', today: 'YYYY-MM-DD' } (for the form)
// POST /api/supplier-payments                  → { supplierId, paidAt?, method, amount, reference?, description?, fromCashDrawer? }
// POST /api/supplier-payments/:paymentId/void  → { reason }
// GET  /api/suppliers/:supplierId/account?from=YYYY-MM-DD&to=YYYY-MM-DD
//        → statement (running balance), documents, payments, journal
// GET  /api/supplier-balances                  → every supplier with its balance

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { restaurantTimeZone } from '../lib/salesSnapshot.js';
import { ACCOUNT, JournalError, docNumber, nextNumber, peekNumber, postEntry } from '../lib/journal.js';

const METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD'] as const;
type Method = (typeof METHODS)[number];
const METHOD_LABEL: Record<Method, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
};

const toCents = (v: unknown) => Math.round(Number(v) * 100);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// The account the money leaves from.
const creditAccount = (method: Method, fromDrawer: boolean) =>
  method === 'CASH' ? (fromDrawer ? ACCOUNT.CASH_DRAWER : ACCOUNT.CASH_OWNER) : ACCOUNT.BANK;

// Today in the restaurant's time zone ('YYYY-MM-DD').
async function today(exec: any, tz: string): Promise<string> {
  const [row] = (await exec.execute(sql`SELECT (now() AT TIME ZONE ${tz})::date::text AS d`)) as any[];
  return row.d;
}

export default async function supplierPaymentRoutes(fastify: FastifyInstance) {
  // The number the next payment will get (another user may still take it first;
  // the real number is given when the payment is saved).
  fastify.get('/api/supplier-payments/next-number', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      // + the restaurant's today: the form's default date and its latest allowed date
      const tz = await restaurantTimeZone(restaurantId);
      return reply.send({ paymentNo: docNumber('PAY', await peekNumber(db, restaurantId, 'PAY')), today: await today(db, tz) });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The next payment number could not be loaded.' });
    }
  });

  // Record a payment to a supplier.
  fastify.post('/api/supplier-payments', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as Record<string, unknown>;

    const supplierId = Number(body.supplierId);
    const method = String(body.method || '').toUpperCase() as Method;
    const cents = toCents(body.amount);
    const fromDrawer = method === 'CASH' && body.fromCashDrawer === true;
    const reference = body.reference ? String(body.reference).trim().slice(0, 100) || null : null;
    const description = body.description ? String(body.description).trim().slice(0, 1000) || null : null;

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return reply.status(400).send({ error: 'Choose the supplier.' });
    }
    if (!METHODS.includes(method)) {
      return reply.status(400).send({ error: 'Choose how the supplier was paid (cash, bank transfer, cheque or card).' });
    }
    if (body.amount === undefined || body.amount === '' || !Number.isFinite(cents) || cents <= 0) {
      return reply.status(400).send({ error: 'Enter the amount paid (more than 0).' });
    }
    if (cents >= 1e12) {
      return reply.status(400).send({ error: 'The amount is too large.' });
    }
    if (body.paidAt !== undefined && body.paidAt !== '' && !isDate(body.paidAt)) {
      return reply.status(400).send({ error: 'The payment date is not valid.' });
    }

    try {
      const tz = await restaurantTimeZone(restaurantId);
      const result = await db.transaction(async (tx) => {
        const [supplier] = (await tx.execute(sql`
          SELECT supplier_id AS id, supplier_name AS name FROM supplier
          WHERE supplier_id = ${supplierId} AND restaurant_id = ${String(restaurantId)}
        `)) as any[];
        if (!supplier) throw new JournalError(404, 'Supplier not found.');

        const day = await today(tx, tz);
        const paidAt = isDate(body.paidAt) ? body.paidAt : day;
        if (paidAt > day) throw new JournalError(400, 'The payment date cannot be in the future.');

        // PAY number (locked counter: no duplicate, no gap)
        const paymentNo = await nextNumber(tx, restaurantId, 'PAY');
        const payNo = docNumber('PAY', paymentNo);

        const [payment] = (await tx.execute(sql`
          INSERT INTO supplier_payments
            (restaurant_id, payment_no, supplier_id, paid_at, method, amount, reference, description,
             from_cash_drawer, created_by)
          VALUES
            (${restaurantId}, ${paymentNo}, ${supplierId}, ${paidAt}::date, ${method}, ${(cents / 100).toFixed(2)},
             ${reference}, ${description}, ${fromDrawer}, (SELECT id FROM users WHERE id = ${request.user?.id ?? null}))
          RETURNING id
        `)) as any[];

        const label = METHOD_LABEL[method] + (method === 'CASH' ? (fromDrawer ? ' (drawer)' : ' (owner)') : '');
        const entry = await postEntry(tx, {
          restaurantId,
          date: paidAt,
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: Number(payment.id),
          documentNo: payNo,
          description: `Payment · ${label}` + (reference ? ` · ${reference}` : '') + (description ? ` · ${description}` : ''),
          createdBy: request.user?.id,
          lines: [
            { account: ACCOUNT.SUPPLIERS, supplierId, debit: cents / 100 },
            { account: creditAccount(method, fromDrawer), credit: cents / 100 },
          ],
        });
        await tx.execute(sql`UPDATE supplier_payments SET journal_entry_id = ${entry.id} WHERE id = ${payment.id}`);

        return { id: Number(payment.id), paymentNo: payNo, entryNo: docNumber('JV', entry.entryNo) };
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err instanceof JournalError) return reply.status(err.statusCode).send({ error: err.message });
      request.log.error(err);
      return reply.status(500).send({ error: 'The payment could not be saved. Please try again.' });
    }
  });

  // Void a payment: a reversing entry (debits ↔ credits) dated today; the payment stays, marked VOIDED.
  fastify.post('/api/supplier-payments/:paymentId/void', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const paymentId = Number((request.params as { paymentId: string }).paymentId);
    const reason = String(((request.body || {}) as { reason?: unknown }).reason ?? '').trim().slice(0, 500);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return reply.status(400).send({ error: 'Invalid payment id.' });
    }
    if (!reason) {
      return reply.status(400).send({ error: 'Write why this payment is voided.' });
    }

    try {
      const tz = await restaurantTimeZone(restaurantId);
      const result = await db.transaction(async (tx) => {
        // FOR UPDATE: two people voiding at the same moment → the second one waits, then sees VOIDED.
        const [p] = (await tx.execute(sql`
          SELECT id, payment_no AS "paymentNo", status, journal_entry_id AS "entryId"
          FROM supplier_payments
          WHERE id = ${paymentId} AND restaurant_id = ${restaurantId}
          FOR UPDATE
        `)) as any[];
        if (!p) throw new JournalError(404, 'Payment not found.');
        if (p.status === 'VOIDED') throw new JournalError(409, 'This payment is already voided.');

        const lines = (await tx.execute(sql`
          SELECT account_code AS account, supplier_id AS "supplierId", debit::float AS debit, credit::float AS credit
          FROM journal_lines WHERE entry_id = ${p.entryId} ORDER BY line_no
        `)) as any[];
        const payNo = docNumber('PAY', Number(p.paymentNo));
        const entry = await postEntry(tx, {
          restaurantId,
          date: await today(tx, tz),
          sourceType: 'VOID',
          sourceId: Number(p.id),
          documentNo: payNo,
          description: `Void ${payNo} · ${reason}`,
          reversesEntryId: p.entryId,
          createdBy: request.user?.id,
          lines: lines.map((l) => ({ account: l.account, supplierId: l.supplierId, debit: l.credit, credit: l.debit })),
        });
        await tx.execute(sql`
          UPDATE supplier_payments
          SET status = 'VOIDED', voided_at = now(), void_reason = ${reason},
              voided_by = (SELECT id FROM users WHERE id = ${request.user?.id ?? null})
          WHERE id = ${p.id}
        `);
        return { id: Number(p.id), paymentNo: payNo, entryNo: docNumber('JV', entry.entryNo) };
      });
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof JournalError) return reply.status(err.statusCode).send({ error: err.message });
      request.log.error(err);
      return reply.status(500).send({ error: 'The payment could not be voided. Please try again.' });
    }
  });

  // A supplier's account for a period: the 4 tabs of the screen.
  fastify.get('/api/suppliers/:supplierId/account', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const supplierId = Number((request.params as { supplierId: string }).supplierId);
    const q = request.query as { from?: string; to?: string };
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return reply.status(400).send({ error: 'Invalid supplier id.' });
    }
    if ((q.from && !isDate(q.from)) || (q.to && !isDate(q.to))) {
      return reply.status(400).send({ error: 'The dates must be YYYY-MM-DD.' });
    }

    try {
      const from = q.from || null; // no start → from the very beginning
      const to = q.to || null;     // no end → up to the latest movement

      const [supplier] = (await db.execute(sql`
        SELECT supplier_id AS id, supplier_code AS code, supplier_name AS name, contact_person AS "contactPerson",
               phone, email, payment_terms AS "paymentTerms", currency_code AS currency,
               opening_balance::float AS "openingBalance", credit_limit::float AS "creditLimit", is_active AS "isActive",
               ensure_supplier_account(supplier_id) AS "accountCode"
        FROM supplier WHERE supplier_id = ${supplierId} AND restaurant_id = ${String(restaurantId)}
      `)) as any[];
      if (!supplier) return reply.status(404).send({ error: 'Supplier not found.' });

      // This supplier's lines on its own account (40110001…), with the entry they belong to.
      const onAccount = sql`
        journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE e.restaurant_id = ${restaurantId} AND l.supplier_id = ${supplierId}
          AND l.account_code = ${supplier.accountCode}`;

      const [{ balance, before }] = (await db.execute(sql`
        SELECT COALESCE(SUM(l.credit - l.debit), 0)::float AS balance,
               COALESCE(SUM(l.credit - l.debit) FILTER (WHERE ${from}::date IS NOT NULL AND e.entry_date < ${from}::date), 0)::float AS before
        FROM ${onAccount}
      `)) as any[];

      const moves = (await db.execute(sql`
        SELECT e.id AS "entryId", e.entry_no AS "entryNo", e.entry_date::text AS date, e.source_type AS "sourceType",
               e.source_id AS "sourceId", e.document_no AS "documentNo", e.description,
               SUM(l.debit)::float AS debit, SUM(l.credit)::float AS credit
        FROM ${onAccount}
          AND (${from}::date IS NULL OR e.entry_date >= ${from}::date) AND (${to}::date IS NULL OR e.entry_date <= ${to}::date)
        GROUP BY e.id
        ORDER BY e.entry_date, e.entry_no
      `)) as any[];

      // running balance in cents (no rounding drift)
      let run = toCents(before);
      const statement = moves.map((m) => {
        run += toCents(m.credit) - toCents(m.debit);
        return { ...m, entryNo: docNumber('JV', m.entryNo), balance: run / 100 };
      });
      const sum = (type: string, side: 'debit' | 'credit') =>
        moves.filter((m) => m.sourceType === type).reduce((s, m) => s + toCents(m[side]), 0) / 100;

      const documents = (await db.execute(sql`
        SELECT "TransactionID" AS id, COALESCE("GRNNumber", "TransactionNumber") AS number, type,
               "TransactionDate"::date::text AS date, "Reference" AS reference,
               COALESCE("NetTotal", 0)::float AS total, COALESCE("TaxAmount", 0)::float AS tax, "Status" AS status
        FROM stocktransactions
        WHERE "RestaurantID" = ${restaurantId} AND supplier_id = ${supplierId} AND type IN ('PUR', 'RP')
          AND (${from}::date IS NULL OR "TransactionDate"::date >= ${from}::date) AND (${to}::date IS NULL OR "TransactionDate"::date <= ${to}::date)
        ORDER BY "TransactionDate", "TransactionID"
      `)) as any[];

      const payments = (await db.execute(sql`
        SELECT p.id, p.payment_no AS "paymentNo", p.paid_at::text AS "paidAt", p.method, p.amount::float AS amount,
               p.reference, p.description, p.from_cash_drawer AS "fromCashDrawer", p.status,
               p.void_reason AS "voidReason", e.entry_no AS "entryNo",
               COALESCE(u.full_name, u.email, '') AS "createdBy"
        FROM supplier_payments p
        LEFT JOIN journal_entries e ON e.id = p.journal_entry_id
        LEFT JOIN users u ON u.id = p.created_by
        WHERE p.restaurant_id = ${restaurantId} AND p.supplier_id = ${supplierId}
          AND (${from}::date IS NULL OR p.paid_at >= ${from}::date) AND (${to}::date IS NULL OR p.paid_at <= ${to}::date)
        ORDER BY p.paid_at, p.payment_no
      `)) as any[];

      // The full entries (every account, both sides) of the statement's movements.
      const entryIds = moves.map((m) => Number(m.entryId));
      const lines = entryIds.length
        ? ((await db.execute(sql`
            SELECT l.entry_id AS "entryId", l.line_no AS "lineNo", l.account_code AS account, a.name AS "accountName",
                   l.debit::float AS debit, l.credit::float AS credit
            FROM journal_lines l JOIN accounts a ON a.restaurant_id = l.restaurant_id AND a.code = l.account_code
            WHERE l.entry_id IN (${sql.join(entryIds.map((id) => sql`${id}`), sql`, `)})
            ORDER BY l.entry_id, l.line_no
          `)) as any[])
        : [];
      const journal = statement.map((m) => ({
        entryId: m.entryId,
        entryNo: m.entryNo,
        date: m.date,
        sourceType: m.sourceType,
        documentNo: m.documentNo,
        description: m.description,
        lines: lines.filter((l) => Number(l.entryId) === Number(m.entryId)),
      }));

      return reply.send({
        supplier,
        period: { from, to },
        balance,                       // today, all movements (positive: we owe)
        openingBalance: before,        // at the start of the period
        closingBalance: run / 100,     // at the end of the period
        totals: {
          purchases: sum('PURCHASE', 'credit'),
          returns: sum('RETURN', 'debit'),
          payments: sum('SUPPLIER_PAYMENT', 'debit') - sum('VOID', 'credit'),
        },
        statement,
        documents,
        payments: payments.map((p) => ({
          ...p,
          paymentNo: docNumber('PAY', p.paymentNo),
          entryNo: p.entryNo ? docNumber('JV', p.entryNo) : null,
        })),
        journal,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: "The supplier's account could not be loaded." });
    }
  });

  // Every supplier of the restaurant with its balance today.
  fastify.get('/api/supplier-balances', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const rows = (await db.execute(sql`
        SELECT s.supplier_id AS id, s.supplier_code AS code, s.supplier_name AS name, s.is_active AS "isActive",
               a.code AS "accountCode",
               COALESCE(SUM(l.credit - l.debit), 0)::float AS balance,
               MAX(e.entry_date)::text AS "lastMovement"
        FROM supplier s
        LEFT JOIN accounts a ON a.supplier_id = s.supplier_id
        LEFT JOIN journal_lines l ON l.supplier_id = s.supplier_id AND l.account_code = a.code AND l.restaurant_id = a.restaurant_id
        LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.restaurant_id = ${restaurantId}
        WHERE s.restaurant_id = ${String(restaurantId)}
        GROUP BY s.supplier_id, a.code
        ORDER BY s.supplier_name
      `)) as any[];
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The supplier balances could not be loaded.' });
    }
  });
}
