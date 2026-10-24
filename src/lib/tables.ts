// src/lib/tables.ts
//
// Table status follows ONE rule (agreed 2026-10-25):
//   a table is "occupied" while it has an OPEN order on it, and "free" otherwise
//   (a "reserved" table without an open order stays reserved).
// Instead of setting the status by hand at each step (which left tables stuck as
// "occupied" after a delete, a table change, or old orders), the server re-checks the
// tables concerned after every action on an order: create, update / move, delete, pay.
// current_order_id = the latest open order on the table (null when free).

import { sql } from 'drizzle-orm';

export async function syncTables(exec: { execute: (q: any) => Promise<any> }, restaurantId: number, tableIds: Array<number | null | undefined>) {
  const ids = [...new Set(tableIds.map((t) => Number(t)).filter((t) => Number.isInteger(t) && t > 0))];
  if (!ids.length) return;
  await exec.execute(sql`
    UPDATE restaurant_tables t
    SET current_order_id = o.open_id,
        status = (CASE
                    WHEN o.open_id IS NOT NULL THEN 'occupied'
                    WHEN t.status::text = 'reserved' THEN 'reserved'
                    ELSE 'free'
                  END)::table_status,
        updated_at = now()
    FROM (
      SELECT x.id,
             (SELECT MAX(ord.id) FROM orders ord
               WHERE ord.table_id = x.id AND ord.restaurant_id = ${restaurantId}
                 AND UPPER(COALESCE(ord.status, '')) NOT IN ('CLOSED', 'CANCELLED')) AS open_id
      FROM restaurant_tables x
      WHERE x.restaurant_id = ${restaurantId} AND x.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    ) o
    WHERE t.id = o.id
  `);
}
