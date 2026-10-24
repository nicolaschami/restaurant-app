-- 2026-10-25: tables were stuck as "occupied" (deleted orders, moved orders, old
-- orders closed before the payment screen). From now on the server applies the rule
-- "occupied while it has an open order" after every action (src/lib/tables.ts).
-- One-time clean-up with the same rule:
UPDATE restaurant_tables t
SET current_order_id = o.open_id,
    status = (CASE WHEN o.open_id IS NOT NULL THEN 'occupied'
                   WHEN t.status::text = 'reserved' THEN 'reserved'
                   ELSE 'free' END)::table_status,
    updated_at = now()
FROM (
  SELECT x.id,
         (SELECT MAX(ord.id) FROM orders ord
           WHERE ord.table_id = x.id AND ord.restaurant_id = x.restaurant_id
             AND UPPER(COALESCE(ord.status, '')) NOT IN ('CLOSED', 'CANCELLED')) AS open_id
  FROM restaurant_tables x
) o
WHERE t.id = o.id;
