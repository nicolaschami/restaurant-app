// src/routes/journalReports.ts
//
// Reports → Financial (asked 2026-10-27), managers and owners (roles.ts: /api/reports → manager):
//   - Journal (JV): every journal entry of a period with all its lines (classic journal book).
//     Filters: type (PURCHASE, RETURN, SUPPLIER_PAYMENT, VOID, OPENING, SALES), account,
//     supplier, search (JV no., document no., description). A filter keeps WHOLE entries:
//     an entry is shown with all its lines if one of its lines matches. A GROUP account
//     (401, 70…) matches every account under it.
//   - Account balances (trial balance): per account of the restaurant's chart (a tree,
//     2026-10-28), the balance before the period, the period's debits and credits, and
//     the balance at the end. A group shows the total of everything under it.
//     Σ debit = Σ credit always (on the non-group accounts).
//
// GET /api/reports/journal?from=YYYY-MM-DD&to=YYYY-MM-DD&type=&account=&supplierId=&q=
// GET /api/reports/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { docNumber } from '../lib/journal.js';

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const TYPES = ['PURCHASE', 'RETURN', 'SUPPLIER_PAYMENT', 'VOID', 'OPENING', 'SALES'];
const toCents = (v: unknown) => Math.round(Number(v || 0) * 100);

// An account and every account under it (its whole branch of the tree).
const branch = (restaurantId: number, code: string) => sql`(
  WITH RECURSIVE b AS (
    SELECT code FROM accounts WHERE restaurant_id = ${restaurantId} AND code = ${code}
    UNION ALL
    SELECT a.code FROM accounts a JOIN b ON a.parent_code = b.code WHERE a.restaurant_id = ${restaurantId}
  ) SELECT code FROM b)`;

export default async function journalReportRoutes(fastify: FastifyInstance) {
  fastify.get('/api/reports/journal', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string; type?: string; account?: string; supplierId?: string; q?: string };
    if (!isDate(q.from) || !isDate(q.to)) return reply.status(400).send({ error: 'Choose the period (from and to dates).' });
    if (q.from > q.to) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });

    const type = q.type && TYPES.includes(q.type) ? q.type : null;
    const account = q.account && /^\d{1,20}$/.test(q.account) ? q.account : null;
    const supplierId = q.supplierId && /^\d+$/.test(q.supplierId) ? Number(q.supplierId) : null;
    const search = (q.q ?? '').trim().slice(0, 100);
    // "JV-0012", "jv12" or "12" → entry number 12
    const searchNo = /^(jv-?)?0*(\d+)$/i.test(search) ? Number(search.replace(/\D/g, '')) : null;

    try {
      const entries = (await db.execute(sql`
        SELECT e.id AS "entryId", e.entry_no AS "entryNo", e.entry_date::text AS date, e.source_type AS "sourceType",
               e.source_id AS "sourceId", e.document_no AS "documentNo", e.description,
               COALESCE(u.full_name, u.email, '') AS "createdBy"
        FROM journal_entries e
        LEFT JOIN users u ON u.id = e.created_by
        WHERE e.restaurant_id = ${restaurantId}
          AND e.entry_date BETWEEN ${q.from}::date AND ${q.to}::date
          ${type ? sql`AND e.source_type = ${type}` : sql``}
          ${account || supplierId
            ? sql`AND EXISTS (SELECT 1 FROM journal_lines f WHERE f.entry_id = e.id
                    ${account ? sql`AND f.account_code IN ${branch(restaurantId, account)}` : sql``}
                    ${supplierId ? sql`AND f.supplier_id = ${supplierId}` : sql``})`
            : sql``}
          ${search
            ? sql`AND (e.document_no ILIKE ${'%' + search + '%'} OR e.description ILIKE ${'%' + search + '%'}
                       ${searchNo !== null ? sql`OR e.entry_no = ${searchNo}` : sql``})`
            : sql``}
        ORDER BY e.entry_date, e.entry_no
      `)) as any[];

      const ids = entries.map((e) => Number(e.entryId));
      const lines = ids.length
        ? ((await db.execute(sql`
            SELECT l.entry_id AS "entryId", l.line_no AS "lineNo", l.account_code AS account, a.name AS "accountName",
                   l.supplier_id AS "supplierId", s.supplier_name AS "supplierName",
                   l.debit::float AS debit, l.credit::float AS credit
            FROM journal_lines l
            JOIN accounts a ON a.restaurant_id = l.restaurant_id AND a.code = l.account_code
            LEFT JOIN supplier s ON s.supplier_id = l.supplier_id
            WHERE l.entry_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
            ORDER BY l.entry_id, l.line_no
          `)) as any[])
        : [];

      const byEntry = new Map<number, any[]>();
      for (const l of lines) {
        const k = Number(l.entryId);
        if (!byEntry.has(k)) byEntry.set(k, []);
        byEntry.get(k)!.push(l);
      }
      const debit = lines.reduce((s, l) => s + toCents(l.debit), 0);
      const credit = lines.reduce((s, l) => s + toCents(l.credit), 0);

      // the lists for the filters: the whole chart (groups too) and the suppliers
      const accounts = (await db.execute(sql`
        SELECT code, name, parent_code AS "parentCode", is_group AS "isGroup"
        FROM accounts WHERE restaurant_id = ${restaurantId} ORDER BY code
      `)) as any[];
      const suppliers = (await db.execute(sql`
        SELECT supplier_id AS id, supplier_name AS name FROM supplier
        WHERE restaurant_id = ${String(restaurantId)} ORDER BY supplier_name
      `)) as any[];

      return reply.send({
        entries: entries.map((e) => ({
          ...e,
          entryNo: docNumber('JV', e.entryNo),
          lines: byEntry.get(Number(e.entryId)) ?? [],
        })),
        totals: { entries: entries.length, debit: debit / 100, credit: credit / 100 },
        accounts,
        suppliers,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The journal could not be loaded.' });
    }
  });

  fastify.get('/api/reports/trial-balance', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string };
    if (!isDate(q.from) || !isDate(q.to)) return reply.status(400).send({ error: 'Choose the period (from and to dates).' });
    if (q.from > q.to) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });

    try {
      // balance = Σ debit − Σ credit (positive = debit balance, negative = credit balance).
      // "up" pairs every account with itself and each group above it, so a group adds up
      // the lines of its whole branch.
      const rows = (await db.execute(sql`
        WITH RECURSIVE chart AS (
          SELECT code, name, kind, parent_code, is_group, is_active, supplier_id
          FROM accounts WHERE restaurant_id = ${restaurantId}
        ), up AS (
          SELECT code AS leaf, code AS anc FROM chart
          UNION ALL
          SELECT up.leaf, c.parent_code FROM up JOIN chart c ON c.code = up.anc WHERE c.parent_code IS NOT NULL
        )
        SELECT c.code, c.name, c.kind, c.parent_code AS "parentCode", c.is_group AS "isGroup", c.is_active AS "isActive",
               c.supplier_id AS "supplierId",
               COALESCE(SUM(l.debit - l.credit) FILTER (WHERE e.entry_date < ${q.from}::date), 0)::float AS opening,
               COALESCE(SUM(l.debit)  FILTER (WHERE e.entry_date BETWEEN ${q.from}::date AND ${q.to}::date), 0)::float AS debit,
               COALESCE(SUM(l.credit) FILTER (WHERE e.entry_date BETWEEN ${q.from}::date AND ${q.to}::date), 0)::float AS credit,
               COALESCE(SUM(l.debit - l.credit) FILTER (WHERE e.entry_date <= ${q.to}::date), 0)::float AS closing,
               COUNT(DISTINCT e.id) FILTER (WHERE e.entry_date BETWEEN ${q.from}::date AND ${q.to}::date)::int AS entries,
               COUNT(DISTINCT e.id)::int AS "allEntries"
        FROM chart c
        JOIN up ON up.anc = c.code
        LEFT JOIN journal_lines l ON l.restaurant_id = ${restaurantId} AND l.account_code = up.leaf
        LEFT JOIN journal_entries e ON e.id = l.entry_id
        GROUP BY c.code, c.name, c.kind, c.parent_code, c.is_group, c.is_active, c.supplier_id
        ORDER BY c.code
      `)) as any[];
      return reply.send({ accounts: rows });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The account balances could not be loaded.' });
    }
  });
}
