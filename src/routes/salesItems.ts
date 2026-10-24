// src/routes/salesItems.ts
//
// GET /api/reports/sales-items?from=&to=                (default: today … today)
// GET /api/reports/sales-items/:menuItemId?from=&to=    (one item: by size + options)
//
// Sales by Item & Category (agreed 2026-10-25):
//   - Same rules as Daily Sales: only PAID orders, on the day of the payment
//     (restaurant time zone); amounts are the order lines, before tax.
//   - Two columns asked by the user: Sales and Cost (also on categories and total).
//   - Cost of one unit sold, the same way stock is taken out at payment:
//       Countable item with a stock item → price of 1 stock item;
//       dish with ingredients            → Σ ingredient qty × its price;
//       otherwise                        → the cost price typed on the menu item.
//     Prices = last purchase price (else the raw material's cost price), TODAY.

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { restaurantTimeZone } from '../lib/salesSnapshot.js';

// ?from=YYYY-MM-DD&to=YYYY-MM-DD in the restaurant's time zone; default today … today.
async function salesPeriod(restaurantId: number, q: { from?: string; to?: string }) {
  const tz = await restaurantTimeZone(restaurantId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
  const from = isDate(q.from) ? q.from! : today;
  const to = isDate(q.to) ? q.to! : today;
  return { tz, from, to, valid: from <= to };
}

// Order lines of the orders PAID in the period.
const paidLines = (restaurantId: number, tz: string, from: string, to: string) => sql`
  SELECT i.*
  FROM order_payments p
  JOIN orders o ON o.id = p.order_id AND o.restaurant_id = ${restaurantId}
  JOIN order_items i ON i.order_id = o.id
  WHERE p.restaurant_id = ${restaurantId}
    AND (p.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
`;

// Cost of one unit of the menu item "m" (see the rules above).
const unitCost = (restaurantId: number) => sql`
  CASE
    WHEN m.is_inventory_tracked AND m.stock_material_id IS NOT NULL THEN
      (SELECT COALESCE(rm.last_purchase_price, rm.cost_price, 0) FROM raw_materials rm
        WHERE rm.id = m.stock_material_id AND rm.restaurant_id = ${restaurantId})
    WHEN jsonb_typeof(m.raw_materials) = 'array' AND jsonb_array_length(m.raw_materials) > 0 THEN
      (SELECT COALESCE(SUM(COALESCE((e->>'quantity')::numeric, 0) * COALESCE(rm.last_purchase_price, rm.cost_price, 0)), 0)
         FROM jsonb_array_elements(m.raw_materials) e
         JOIN raw_materials rm ON (e->>'materialId') ~ '^[0-9]+$'
                              AND rm.id = (e->>'materialId')::int
                              AND rm.restaurant_id = ${restaurantId})
    ELSE COALESCE(m.cost_price, 0)
  END
`;

export default async function salesItemRoutes(fastify: FastifyInstance) {
  fastify.get('/api/reports/sales-items', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const { tz, from, to, valid } = await salesPeriod(restaurantId, request.query as any);
    if (!valid) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    try {
      const items = await db.execute(sql`
        WITH l AS (${paidLines(restaurantId, tz, from, to)}),
        per_item AS (
          SELECT l.menu_item_id, SUM(l.quantity) AS qty, SUM(l.subtotal) AS sales
          FROM l GROUP BY l.menu_item_id
        )
        SELECT
          x.menu_item_id                                         AS id,
          COALESCE(m.menu_name, 'Item #' || x.menu_item_id)      AS name,
          COALESCE(c.id, 0)                                      AS "categoryId",
          COALESCE(c.name, 'No category')                        AS category,
          x.qty::float                                           AS qty,
          x.sales::float                                         AS sales,
          COALESCE(${unitCost(restaurantId)}, 0)::float          AS "unitCost",
          ROUND(x.qty * COALESCE(${unitCost(restaurantId)}, 0), 2)::float AS cost
        FROM per_item x
        LEFT JOIN menu_items m ON m.id = x.menu_item_id AND m.restaurant_id = ${restaurantId}
        LEFT JOIN categories c ON c.id = m.category_id
        ORDER BY x.sales DESC
      `);
      return reply.send({ from, to, items });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The sales by item report could not be loaded.' });
    }
  });

  fastify.get('/api/reports/sales-items/:menuItemId', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const menuItemId = Number((request.params as { menuItemId: string }).menuItemId);
    if (!Number.isInteger(menuItemId) || menuItemId <= 0) return reply.status(400).send({ error: 'Invalid item.' });
    const { tz, from, to, valid } = await salesPeriod(restaurantId, request.query as any);
    if (!valid) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    try {
      // By size (an item without sizes has one line with an empty size).
      const bySize = await db.execute(sql`
        WITH l AS (${paidLines(restaurantId, tz, from, to)})
        SELECT COALESCE(l.variant_size, '') AS size,
               SUM(l.quantity)::float AS qty, SUM(l.subtotal)::float AS sales
        FROM l WHERE l.menu_item_id = ${menuItemId}
        GROUP BY 1 ORDER BY SUM(l.quantity) DESC
      `);
      // Options added (modifiers): units sold with each option, and its extra price.
      const options = await db.execute(sql`
        WITH l AS (${paidLines(restaurantId, tz, from, to)})
        SELECT COALESCE(e->>'optionName', '?')                                   AS name,
               COALESCE(e->>'groupName', '')                                     AS "group",
               SUM(l.quantity)::float                                            AS qty,
               SUM(l.quantity * COALESCE((e->>'price')::numeric, 0))::float      AS amount
        FROM l
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(l.modifiers) = 'array' THEN l.modifiers ELSE '[]'::jsonb END
        ) AS e
        WHERE l.menu_item_id = ${menuItemId}
        GROUP BY 1, 2 ORDER BY SUM(l.quantity) DESC
      `);
      return reply.send({ from, to, bySize, options });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The item sales could not be loaded.' });
    }
  });
}
