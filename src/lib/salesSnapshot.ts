// src/lib/salesSnapshot.ts
//
// The sales numbers of a set of PAYMENTS, shared by:
//   - Reports → Daily Sales (payments of some calendar days), and
//   - the Z closing (payments since the previous Z): the "current day" (X) and the
//     frozen copy saved in each Z.
// Using one calculation means the two reports always agree.
//
// Rules (agreed 2026-10-24):
//   - A sale = a PAID order (one row in order_payments).
//   - Total paid = amount due of the payment. Items = sum of the order lines (before tax).
//     "Tax & fees" = total − items: today the POS adds 10% tax and the delivery fee
//     into the total without saving them apart.
//   - Times are shown in the restaurant's time zone.

import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';

// The restaurant's time zone ("Asia/Beirut", "UTC"…). Unknown / missing → UTC.
export async function restaurantTimeZone(restaurantId: number): Promise<string> {
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
  const tz = r?.timezone;
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export interface SalesSnapshot {
  summary: {
    tickets: number; totalPaid: number; itemsTotal: number; taxAndFees: number; cashTotal: number;
    tax: number; deliveryFees: number; // apart (orders saved since 2026-10-25; older: all in tax)
  };
  byMethod: Array<{ method: string; count: number; amount: number }>;
  byType: Array<{ type: string; count: number; amount: number }>;
  byCategory: Array<{ category: string; qty: number; amount: number }>;
  tickets: Array<{
    orderId: number; ticketNo: number | null; date: string; time: string; type: string;
    table: string; method: string; nbItems: number; itemsTotal: number; total: number;
  }>;
}

// paymentFilter: a condition on the payment row "p", e.g.
//   sql`(p.created_at AT TIME ZONE ${tz})::date BETWEEN ...`   (calendar days)
//   sql`p.created_at > ${openedAt} AND p.created_at <= ${closedAt}` (a Z day)
// `exec` lets the Z closing run it inside its own transaction.
export async function salesSnapshot(
  restaurantId: number,
  tz: string,
  paymentFilter: SQL,
  exec: { execute: (q: SQL) => Promise<any> } = db
): Promise<SalesSnapshot> {
  // Paid orders (one line per ticket).
  const paid = sql`
    SELECT
      o.id,
      o.ticket_no,
      COALESCE(NULLIF(o.order_type, ''), 'Other')                     AS order_type,
      o.table_id,
      p.method,
      p.amount_due                                                     AS total,
      (p.created_at AT TIME ZONE ${tz})                               AS paid_local,
      COALESCE((SELECT SUM(i.subtotal) FROM order_items i WHERE i.order_id = o.id), 0) AS items_total,
      o.tax_amount,
      COALESCE(o.delivery_fee, 0)                                      AS delivery_fee
    FROM order_payments p
    JOIN orders o ON o.id = p.order_id AND o.restaurant_id = ${restaurantId}
    WHERE p.restaurant_id = ${restaurantId}
      AND ${paymentFilter}
  `;

  const [summary] = (await exec.execute(sql`
    WITH t AS (${paid})
    SELECT
      COUNT(*)::int                                                   AS tickets,
      COALESCE(SUM(total), 0)::float                                  AS "totalPaid",
      COALESCE(SUM(items_total), 0)::float                            AS "itemsTotal",
      COALESCE(SUM(total - items_total), 0)::float                    AS "taxAndFees",
      COALESCE(SUM(total) FILTER (WHERE method = 'CASH'), 0)::float   AS "cashTotal",
      COALESCE(SUM(COALESCE(tax_amount, total - items_total - delivery_fee)), 0)::float AS tax,
      COALESCE(SUM(delivery_fee), 0)::float                           AS "deliveryFees"
    FROM t
  `)) as any[];

  const byMethod = (await exec.execute(sql`
    WITH t AS (${paid})
    SELECT method, COUNT(*)::int AS count, SUM(total)::float AS amount
    FROM t GROUP BY method ORDER BY SUM(total) DESC
  `)) as any[];

  const byType = (await exec.execute(sql`
    WITH t AS (${paid})
    SELECT order_type AS type, COUNT(*)::int AS count, SUM(total)::float AS amount
    FROM t GROUP BY order_type ORDER BY SUM(total) DESC
  `)) as any[];

  // Categories: from the order lines (amounts before tax).
  const byCategory = (await exec.execute(sql`
    WITH t AS (${paid})
    SELECT
      COALESCE(c.name, 'No category')               AS category,
      SUM(i.quantity)::float                        AS qty,
      SUM(i.subtotal)::float                        AS amount
    FROM t
    JOIN order_items i ON i.order_id = t.id
    LEFT JOIN menu_items m ON m.id = i.menu_item_id
    LEFT JOIN categories c ON c.id = m.category_id
    GROUP BY COALESCE(c.name, 'No category')
    ORDER BY SUM(i.subtotal) DESC
  `)) as any[];

  const tickets = (await exec.execute(sql`
    WITH t AS (${paid})
    SELECT
      t.id                                                   AS "orderId",
      t.ticket_no                                            AS "ticketNo",
      to_char(t.paid_local, 'YYYY-MM-DD')                    AS date,
      to_char(t.paid_local, 'HH24:MI')                       AS time,
      t.order_type                                           AS type,
      COALESCE(rt.label, '')                                 AS "table",
      t.method,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = t.id)::float AS "nbItems",
      t.items_total::float                                   AS "itemsTotal",
      t.total::float                                         AS total
    FROM t
    LEFT JOIN restaurant_tables rt ON rt.id = t.table_id
    ORDER BY t.paid_local DESC
  `)) as any[];

  return { summary, byMethod, byType, byCategory, tickets };
}

// Orders not paid yet (right now): not sales.
export async function openOrders(
  restaurantId: number,
  exec: { execute: (q: SQL) => Promise<any> } = db
): Promise<{ count: number; amount: number }> {
  const [open] = (await exec.execute(sql`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::float AS amount
    FROM orders
    WHERE restaurant_id = ${restaurantId}
      AND UPPER(COALESCE(status, '')) NOT IN ('CLOSED', 'CANCELLED')
  `)) as any[];
  return open;
}
