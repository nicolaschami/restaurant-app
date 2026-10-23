// src/routes/reports.ts
//
// Reports for the logged-in user's restaurant only (restaurantId comes from the
// login token, never from the screen).
//
// GET /api/reports/current-stock — every raw material with its stock today.
//
// Rules (agreed 2026-10-21):
//   - Stock value = quantity in stock × LAST PURCHASE PRICE (from the latest GRN).
//     An item never purchased uses the cost price typed on its card.
//   - Status: OUT when the stock is zero or less, LOW when it is at or under the
//     minimum quantity (only if a minimum is set), otherwise OK.

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { openOrders, restaurantTimeZone, salesSnapshot } from '../lib/salesSnapshot.js';

// The period of a report from ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Missing / invalid dates → the 1st of this month … today. null when from > to.
function reportPeriod(q: { from?: string; to?: string }): { from: string; to: string } | null {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = isDate(q.from) ? q.from! : iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = isDate(q.to) ? q.to! : iso(today);
  return from > to ? null : { from, to };
}

// Purchase documents of a restaurant, as the purchase reports need them.
//   kind: PUR = purchase, RP = purchase return. Old purchases may have another or
//   empty type: everything that is not RP is a purchase, except SAL (POS sales).
//   beforeTax = subtotal − discount, net = net total (tax included).
//   Only POSTED documents count (drafts never became real purchases).
//   The supplier is the text saved on the purchase ("SUP-102 - Ocean Catch Seafoods").
const purchaseDocs = (restaurantId: number, from: string, to: string) => sql`
  SELECT
    t."TransactionID"                                                    AS id,
    COALESCE(NULLIF(TRIM(t."SupplierName"), ''), '(no supplier)')         AS supplier,
    CASE WHEN t.type = 'RP' THEN 'RP' ELSE 'PUR' END                       AS kind,
    t."TransactionDate"::date                                             AS day,
    COALESCE(t."GRNNumber", t."TransactionNumber", '')                    AS doc,
    COALESCE(t."Reference", '')                                           AS reference,
    (COALESCE(t."Subtotal", 0) - COALESCE(t."DiscountAmount", 0))         AS before_tax,
    COALESCE(t."DiscountAmount", 0)                                       AS discount,
    COALESCE(t."TaxAmount", 0)                                            AS tax,
    COALESCE(t."NetTotal", 0)                                             AS net
  FROM stocktransactions t
  WHERE t."RestaurantID" = ${restaurantId}
    AND UPPER(COALESCE(t."Status", '')) = 'POSTED'
    AND COALESCE(t.type, '') <> 'SAL'
    AND t."TransactionDate"::date BETWEEN ${from}::date AND ${to}::date
`;

export default async function reportRoutes(fastify: FastifyInstance) {
  fastify.get('/api/reports/current-stock', async (request, reply) => {
    const restaurantId = getRestaurantId(request);

    try {
      const rows = await db.execute(sql`
        SELECT
          rm.id,
          rm.code,
          rm.name,
          rm.unit,
          COALESCE(rm.warehouse, '')                                       AS warehouse,
          COALESCE(rm.current_stock, 0)::float                             AS "inStock",
          COALESCE(rm.min_qty, 0)::float                                   AS "minQty",
          COALESCE(rm.max_qty, 0)::float                                   AS "maxQty",
          COALESCE(rm.last_purchase_price, rm.cost_price, 0)::float        AS price,
          -- true when the price is the card's cost price (never purchased yet)
          (rm.last_purchase_price IS NULL)                                 AS "priceFromCard",
          ROUND(COALESCE(rm.current_stock, 0)
                * COALESCE(rm.last_purchase_price, rm.cost_price, 0), 2)::float AS value,
          CASE
            WHEN COALESCE(rm.current_stock, 0) <= 0 THEN 'OUT'
            WHEN COALESCE(rm.min_qty, 0) > 0
             AND rm.current_stock <= rm.min_qty     THEN 'LOW'
            ELSE 'OK'
          END                                                              AS status
        FROM raw_materials rm
        WHERE rm.restaurant_id = ${restaurantId}
        ORDER BY rm.name
      `);

      return reply.send({ items: rows, generatedAt: new Date().toISOString() });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The stock report could not be loaded.' });
    }
  });

  // GET /api/reports/stock-movement?from=YYYY-MM-DD&to=YYYY-MM-DD[&rawMaterialId=N]
  //
  // Without rawMaterialId: one line per raw material for the period —
  //   opening stock, quantity in, quantity out, closing stock.
  // With rawMaterialId: the same totals for that item + every movement line
  //   (date, document, supplier, in/out, running balance).
  //
  // How the numbers are found:
  //   - A movement = a line of a POSTED purchase (PUR → stock in), purchase
  //     return (RP → stock out) or POS sale (SAL → stock out: the ingredients of the
  //     inventory-tracked dishes of a paid order). Drafts never moved stock, so they are ignored.
  //   - Opening stock = today's stock − everything that moved from the "from" date
  //     until now. Starting from today's real stock means this report always
  //     agrees with the Current Stock report, even for stock typed by hand on the
  //     item card before purchases existed.
  //   - Closing stock = opening + in − out of the period.
  fastify.get('/api/reports/stock-movement', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string; rawMaterialId?: string };

    const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const from = isDate(q.from) ? q.from! : iso(new Date(today.getFullYear(), today.getMonth(), 1));
    const to = isDate(q.to) ? q.to! : iso(today);
    if (from > to) {
      return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    }

    const itemId = q.rawMaterialId ? Number(q.rawMaterialId) : null;
    if (itemId !== null && (!Number.isInteger(itemId) || itemId <= 0)) {
      return reply.status(400).send({ error: 'Invalid item.' });
    }

    // Every stock movement of this restaurant, + for in and − for out.
    const movements = sql`
      SELECT
        d."RawMaterialID"                                   AS rm_id,
        t."TransactionID"                                   AS tx_id,
        t."TransactionDate"::date                           AS day,
        COALESCE(t."GRNNumber", t."TransactionNumber", '')  AS doc,
        COALESCE(t.type, 'PUR')                             AS kind,
        COALESCE(t."SupplierName", '')                      AS supplier,
        COALESCE(d.unitcost, 0)::float                      AS unit_cost,
        (COALESCE(d.qty, 0) * CASE WHEN t.type IN ('RP', 'SAL') THEN -1 ELSE 1 END)::float AS signed_qty
      FROM stockdetails d
      JOIN stocktransactions t ON t."TransactionID" = d.transactionid
      WHERE t."RestaurantID" = ${restaurantId}
        AND UPPER(COALESCE(t."Status", '')) = 'POSTED'
    `;

    try {
      // Totals per raw material (one item only when rawMaterialId is given).
      const items = (await db.execute(sql`
        WITH mv AS (${movements})
        SELECT
          rm.id,
          rm.code,
          rm.name,
          rm.unit,
          COALESCE(rm.warehouse, '')                                                     AS warehouse,
          COALESCE(rm.current_stock, 0)::float                                           AS "currentStock",
          COALESCE(SUM(mv.signed_qty) FILTER (WHERE mv.day >= ${from}::date), 0)::float  AS "sinceFrom",
          COALESCE(SUM(mv.signed_qty)  FILTER (WHERE mv.day BETWEEN ${from}::date AND ${to}::date AND mv.signed_qty > 0), 0)::float AS "qtyIn",
          COALESCE(-SUM(mv.signed_qty) FILTER (WHERE mv.day BETWEEN ${from}::date AND ${to}::date AND mv.signed_qty < 0), 0)::float AS "qtyOut",
          COUNT(mv.tx_id) FILTER (WHERE mv.day BETWEEN ${from}::date AND ${to}::date)::int AS moves
        FROM raw_materials rm
        LEFT JOIN mv ON mv.rm_id = rm.id
        WHERE rm.restaurant_id = ${restaurantId}
          ${itemId !== null ? sql`AND rm.id = ${itemId}` : sql``}
        GROUP BY rm.id
        ORDER BY rm.name
      `)) as any[];

      // Opening / closing, rounded to 3 decimals (stock is stored with 3 decimals).
      const r3 = (n: number) => Math.round(n * 1000) / 1000;
      const summary = items.map((it) => {
        const opening = r3(it.currentStock - it.sinceFrom);
        const { sinceFrom, currentStock, ...rest } = it;
        return { ...rest, opening, closing: r3(opening + it.qtyIn - it.qtyOut) };
      });

      if (itemId === null) {
        return reply.send({ from, to, items: summary });
      }

      // One item: it must belong to this restaurant.
      if (!summary.length) return reply.status(404).send({ error: 'Item not found.' });
      const item = summary[0];

      const lines = (await db.execute(sql`
        WITH mv AS (${movements})
        SELECT tx_id AS "transactionId", day::text AS date, doc, kind, supplier,
               unit_cost AS "unitCost", signed_qty AS qty
        FROM mv
        WHERE rm_id = ${itemId} AND day BETWEEN ${from}::date AND ${to}::date
        ORDER BY day, tx_id
      `)) as any[];

      // Running balance: start from the opening stock and add each movement.
      let balance = item.opening;
      const movesWithBalance = lines.map((l) => {
        balance = r3(balance + l.qty);
        return { ...l, qtyIn: l.qty > 0 ? l.qty : 0, qtyOut: l.qty < 0 ? -l.qty : 0, balance };
      });

      // Menu items that use this item: dishes whose recipe lists it (the ingredients
      // typed on the menu item: menu_items.raw_materials = [{ materialId, quantity, … }]),
      // and "Countable" items sold from it (1 per unit sold).
      // A dish that lists the same ingredient twice gets its quantities added up.
      // costPerDish uses the item's price today (last purchase price, else cost price).
      const usedIn = (await db.execute(sql`
        WITH uses AS (
          -- dishes whose recipe lists this item (not the countable items with a stock item:
          -- those are sold from their stock item only, the same rule as at payment)
          SELECT m.id, m.menu_name, COALESCE((e->>'quantity')::numeric, 0) AS qty, false AS countable
          FROM menu_items m
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(m.raw_materials) = 'array' THEN m.raw_materials ELSE '[]'::jsonb END
          ) AS e
          WHERE m.restaurant_id = ${restaurantId}
            AND NOT (m.is_inventory_tracked AND m.stock_material_id IS NOT NULL)
            AND (e->>'materialId') ~ '^[0-9]+$'
            AND (e->>'materialId')::int = ${itemId}
          UNION ALL
          -- Countable items sold from this item: 1 per unit sold
          SELECT m.id, m.menu_name, 1, true
          FROM menu_items m
          WHERE m.restaurant_id = ${restaurantId}
            AND m.is_inventory_tracked AND m.stock_material_id = ${itemId}
        )
        SELECT
          u.id,
          COALESCE(u.menu_name, '')                                         AS name,
          SUM(u.qty)::float                                                 AS "qtyPerDish",
          ROUND(SUM(u.qty) * COALESCE(rm.last_purchase_price, rm.cost_price, 0), 3)::float AS "costPerDish",
          bool_or(u.countable)                                              AS countable
        FROM uses u
        JOIN raw_materials rm ON rm.id = ${itemId}
        GROUP BY u.id, u.menu_name, rm.last_purchase_price, rm.cost_price
        ORDER BY u.menu_name
      `)) as any[];

      return reply.send({ from, to, item, lines: movesWithBalance, usedIn });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The stock movement report could not be loaded.' });
    }
  });

  // GET /api/reports/purchases?from=&to=
  // One line per supplier for the period: purchases, returns and net, each
  // before tax and with tax (agreed 2026-10-24: show both). Biggest supplier first.
  fastify.get('/api/reports/purchases', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const period = reportPeriod(request.query as any);
    if (!period) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    const { from, to } = period;

    try {
      const suppliers = await db.execute(sql`
        WITH d AS (${purchaseDocs(restaurantId, from, to)})
        SELECT
          supplier,
          COUNT(*) FILTER (WHERE kind = 'PUR')::int                               AS "nbPurchases",
          COUNT(*) FILTER (WHERE kind = 'RP')::int                                AS "nbReturns",
          COALESCE(SUM(before_tax) FILTER (WHERE kind = 'PUR'), 0)::float         AS "purchasesBeforeTax",
          COALESCE(SUM(net)        FILTER (WHERE kind = 'PUR'), 0)::float         AS "purchasesNet",
          COALESCE(SUM(before_tax) FILTER (WHERE kind = 'RP'), 0)::float          AS "returnsBeforeTax",
          COALESCE(SUM(net)        FILTER (WHERE kind = 'RP'), 0)::float          AS "returnsNet",
          SUM(CASE WHEN kind = 'RP' THEN -before_tax ELSE before_tax END)::float  AS "netBeforeTax",
          SUM(CASE WHEN kind = 'RP' THEN -net ELSE net END)::float                AS "netWithTax",
          MAX(day) FILTER (WHERE kind = 'PUR')::text                              AS "lastPurchase"
        FROM d
        GROUP BY supplier
        ORDER BY "netWithTax" DESC, supplier
      `);
      return reply.send({ from, to, suppliers });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The purchases report could not be loaded.' });
    }
  });

  // GET /api/reports/purchases/supplier?from=&to=&supplier=<text>
  // The pop-up of one supplier: its documents, and the items bought from it.
  fastify.get('/api/reports/purchases/supplier', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string; supplier?: string };
    const period = reportPeriod(q);
    if (!period) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    const supplier = String(q.supplier ?? '').trim();
    if (!supplier) return reply.status(400).send({ error: 'Choose a supplier.' });
    const { from, to } = period;

    try {
      // Documents (GRN / RP), oldest first, with their number of lines.
      const documents = await db.execute(sql`
        WITH d AS (${purchaseDocs(restaurantId, from, to)})
        SELECT d.id, d.day::text AS date, d.doc, d.kind, d.reference,
               (SELECT COUNT(*) FROM stockdetails x WHERE x.transactionid = d.id)::int AS "nbItems",
               d.before_tax::float AS "beforeTax", d.discount::float AS discount, d.tax::float AS tax, d.net::float AS net
        FROM d
        WHERE d.supplier = ${supplier}
        ORDER BY d.day, d.id
      `);

      // Items bought from this supplier in the period (returns subtracted).
      // Amounts are the line totals, before tax.
      const items = await db.execute(sql`
        WITH d AS (${purchaseDocs(restaurantId, from, to)})
        SELECT
          x."RawMaterialID"                                                    AS id,
          MAX(x.itemname)                                                      AS name,
          MAX(COALESCE(x.unit, ''))                                            AS unit,
          COALESCE(SUM(x.qty) FILTER (WHERE d.kind = 'PUR'), 0)::float         AS "qtyBought",
          COALESCE(SUM(x.qty) FILTER (WHERE d.kind = 'RP'), 0)::float          AS "qtyReturned",
          COALESCE(SUM(x.linetotal) FILTER (WHERE d.kind = 'PUR'), 0)::float   AS "amountBought",
          COALESCE(SUM(x.linetotal) FILTER (WHERE d.kind = 'RP'), 0)::float    AS "amountReturned"
        FROM d
        JOIN stockdetails x ON x.transactionid = d.id
        WHERE d.supplier = ${supplier}
        GROUP BY x."RawMaterialID"
        ORDER BY MAX(x.itemname)
      `);

      return reply.send({ from, to, supplier, documents, items });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The supplier purchases could not be loaded.' });
    }
  });

  // GET /api/reports/daily-sales?from=YYYY-MM-DD&to=YYYY-MM-DD   (default: today … today)
  //
  // Daily Sales (agreed 2026-10-24, step A before the real Z closing):
  //   - A sale = a PAID order (one row in order_payments). The day is the day of the
  //     PAYMENT, in the restaurant's time zone.
  //   - Total paid = amount due of the payment. Items = sum of the order lines
  //     (before tax). "Tax & fees" = total − items: today the POS adds 10% tax and the
  //     delivery fee into the total without saving them apart.
  //   - Open orders (not paid yet) are not sales: shown apart, as they are now.
  fastify.get('/api/reports/daily-sales', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string };
    const tz = await restaurantTimeZone(restaurantId);
    const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
    const period = reportPeriod({ from: q.from ?? todayLocal, to: q.to ?? todayLocal });
    if (!period) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    const { from, to } = period;

    try {
      // Payments made on these calendar days (restaurant time zone).
      const snapshot = await salesSnapshot(
        restaurantId,
        tz,
        sql`(p.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`
      );
      const open = await openOrders(restaurantId);
      return reply.send({ from, to, timeZone: tz, ...snapshot, open });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The daily sales report could not be loaded.' });
    }
  });

  // GET /api/reports/daily-sales/ticket/:orderId — the lines of one paid ticket.
  fastify.get('/api/reports/daily-sales/ticket/:orderId', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const orderId = Number((request.params as { orderId: string }).orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return reply.status(400).send({ error: 'Invalid ticket.' });

    try {
      const [order] = (await db.execute(sql`
        SELECT o.id, o.ticket_no AS "ticketNo", o.order_type AS type, COALESCE(o.customer_name, '') AS customer,
               COALESCE(o.notes, '') AS notes, o.total_amount::float AS total,
               p.method, p.amount_received::float AS received, p.change_given::float AS change
        FROM orders o
        LEFT JOIN order_payments p ON p.order_id = o.id
        WHERE o.id = ${orderId} AND o.restaurant_id = ${restaurantId}
      `)) as any[];
      if (!order) return reply.status(404).send({ error: 'Ticket not found.' });

      const lines = await db.execute(sql`
        SELECT i.id, COALESCE(m.menu_name, 'Item #' || i.menu_item_id) AS name, COALESCE(i.variant_size, '') AS size,
               i.quantity::float AS qty, i.unit_price::float AS "unitPrice", i.subtotal::float AS subtotal,
               COALESCE(i.modifiers, '[]'::jsonb) AS modifiers
        FROM order_items i
        LEFT JOIN menu_items m ON m.id = i.menu_item_id
        WHERE i.order_id = ${orderId}
        ORDER BY i.id
      `);
      return reply.send({ order, lines });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The ticket could not be loaded.' });
    }
  });
}
