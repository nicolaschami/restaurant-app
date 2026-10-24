// src/routes/dashboard.ts
//
// GET /api/dashboard/summary — the real numbers behind the Dashboard screen,
// for the logged-in user's restaurant only.
//
// "Today" and "this week" follow the RESTAURANT's time zone (restaurants.timezone),
// so an order paid at 00:30 local time counts for the right day.
// A sale = an order with status CLOSED (that is what the POS "Pay" button saves).

import { FastifyInstance } from 'fastify';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';

// orders.created_at is stored WITHOUT a time zone, in the database server's own
// time zone. This turns it into the restaurant's local date.
const localDay = (tz: string) =>
  sql`((o.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE ${tz})::date`;
const localToday = (tz: string) => sql`(now() AT TIME ZONE ${tz})::date`;

// A time zone name we can trust in SQL ("Asia/Beirut", "UTC", …); anything else → UTC.
function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard/summary', async (request, reply) => {
    const restaurantId = getRestaurantId(request);

    try {
      const restaurant = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, restaurantId),
      });
      const tz = safeTimeZone(restaurant?.timezone);

      // 1. Today vs yesterday: sales and number of paid orders
      const [todayRow] = await db.execute(sql`
        SELECT
          COALESCE(SUM(o.total_amount) FILTER (WHERE ${localDay(tz)} = ${localToday(tz)}), 0)::float AS today_sales,
          COUNT(*) FILTER (WHERE ${localDay(tz)} = ${localToday(tz)})::int                         AS today_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE ${localDay(tz)} = ${localToday(tz)} - 1), 0)::float AS yesterday_sales
        FROM orders o
        WHERE o.restaurant_id = ${restaurantId}
          AND UPPER(o.status) = 'CLOSED'
          AND ${localDay(tz)} >= ${localToday(tz)} - 1
      `);

      // 2. Last 7 days (today included), one row per day even when there were no sales
      const week = await db.execute(sql`
        SELECT
          d.day::date::text                            AS date,
          TO_CHAR(d.day, 'Dy')                         AS label,
          COALESCE(SUM(o.total_amount), 0)::float      AS sales,
          COUNT(o.id)::int                             AS orders
        FROM generate_series(${localToday(tz)} - 6, ${localToday(tz)}, interval '1 day') AS d(day)
        LEFT JOIN orders o
          ON o.restaurant_id = ${restaurantId}
         AND UPPER(o.status) = 'CLOSED'
         AND ${localDay(tz)} = d.day::date
        GROUP BY d.day
        ORDER BY d.day
      `);

      // 3. Orders still open right now (held, sent to kitchen…), not paid or cancelled
      const [activeRow] = await db.execute(sql`
        SELECT COUNT(*)::int AS active_orders
        FROM orders o
        WHERE o.restaurant_id = ${restaurantId}
          AND UPPER(o.status) NOT IN ('CLOSED', 'CANCELLED')
      `);

      // 4. Best-selling dishes today (by quantity)
      const topItems = await db.execute(sql`
        SELECT
          COALESCE(mi.menu_name, 'Unknown item')       AS name,
          SUM(oi.quantity)::int                        AS quantity,
          COALESCE(SUM(oi.subtotal), 0)::float         AS sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND COALESCE(oi.kds_status::text, '') <> 'CANCELLED'
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.restaurant_id = ${restaurantId}
          AND UPPER(o.status) = 'CLOSED'
          AND ${localDay(tz)} = ${localToday(tz)}
        GROUP BY mi.menu_name
        ORDER BY quantity DESC, sales DESC
        LIMIT 5
      `);

      // 5. Menu size
      const [menuRow] = await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM menu_items  WHERE restaurant_id = ${restaurantId}) AS items,
          (SELECT COUNT(*)::int FROM categories  WHERE restaurant_id = ${restaurantId}) AS categories
      `);

      // 6. Low stock: raw materials at or below their minimum quantity (most urgent first)
      const lowStock = await db.execute(sql`
        SELECT
          id,
          name,
          unit,
          COALESCE(current_stock, 0)::float AS "currentStock",
          COALESCE(min_qty, 0)::float       AS "minQty"
        FROM raw_materials
        WHERE restaurant_id = ${restaurantId}
          AND COALESCE(min_qty, 0) > 0
          AND COALESCE(current_stock, 0) <= min_qty
        ORDER BY COALESCE(current_stock, 0) / min_qty ASC, name
      `);

      const today = todayRow as { today_sales: number; today_orders: number; yesterday_sales: number };
      return reply.send({
        currency: restaurant?.currency || 'USD',
        timezone: tz,
        today: {
          sales: today.today_sales,
          orders: today.today_orders,
          averageOrder:
            today.today_orders > 0 ? Math.round((today.today_sales / today.today_orders) * 100) / 100 : 0,
          yesterdaySales: today.yesterday_sales,
        },
        week,
        activeOrders: (activeRow as { active_orders: number }).active_orders,
        topItems,
        menu: menuRow,
        lowStock: {
          count: lowStock.length,
          items: lowStock.slice(0, 5), // the Dashboard shows the 5 most urgent
        },
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Could not load the dashboard summary.' });
    }
  });
}
