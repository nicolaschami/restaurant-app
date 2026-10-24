// src/routes/payments.ts
//
// POST /api/orders/:id/pay — take the payment of a POS order and close it.
//
// Rules (agreed 2026-10-20):
//   - The restaurant's currency (Settings → Restaurant Info; USD until 2026-10-25).
//   - One method per order: CASH, or one card (VISA, MASTERCARD, DEBIT). No mixed payments yet.
//   - Cash: the customer may give the exact amount or more; the server computes the change.
//     Giving less than the total is refused.
//   - Card: the card machine is not connected yet — the cashier confirms it was approved,
//     and we record the method. Amount received = amount due, no change.
//   - The amount due is the order total saved in the database, never a number sent by
//     the screen.
//   - Everything happens in ONE database transaction: payment saved + order closed +
//     table freed + ingredients taken out of stock. An order can never be paid twice.

import { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { orders, orderPayments, restaurantTables } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';
import { roomManager } from '../lib/roomManager.js';
import { formatMoney, restaurantCurrency } from '../lib/money.js';
import { syncTables } from '../lib/tables.js';

const METHODS = ['CASH', 'VISA', 'MASTERCARD', 'DEBIT'] as const;
type PaymentMethod = (typeof METHODS)[number];

// An error with the HTTP status to answer with.
class PaymentError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// Money is handled in whole cents to avoid rounding errors (0.1 + 0.2 ≠ 0.3).
const toCents = (value: unknown) => Math.round(Number(value) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

// ---------------------------------------------------------------------------
// Sales reduce stock (agreed 2026-10-23)
//
// When an order is paid, each line of the order takes stock out, in one of two ways:
//   1. A dish with ingredients (menu_items.raw_materials, the recipe) takes out
//      quantity sold × quantity per dish of each ingredient. Always: no box to tick.
//   2. A "Countable" item (menu_items.is_inventory_tracked, e.g. a Pepsi can) has no
//      ingredients: it takes out 1 of its stock item (menu_items.stock_material_id)
//      per unit sold. A countable item with a stock item uses ONLY rule 2, so
//      nothing is counted twice.
// It is saved as ONE stock document per order, type SAL, number SALE-<ticket>,
// so it shows in the Stock Movement report next to purchases (GRN) and
// returns (RP). Stock may go below zero: a cashier is never blocked from selling.
// Runs inside the payment transaction: if anything fails, nothing is paid.
// ---------------------------------------------------------------------------
export async function takeSaleOutOfStock(tx: any, restaurantId: number, order: { id: number; ticketNo: number | null }) {
  // What this order takes out, added up per raw material.
  // Only menu items and raw materials of THIS restaurant are counted.
  const needs = (await tx.execute(sql`
    WITH lines AS (
      SELECT oi.quantity AS sold, m.*
      FROM order_items oi
      JOIN menu_items m ON m.id = oi.menu_item_id AND m.restaurant_id = ${restaurantId}
      WHERE oi.order_id = ${order.id}
    ),
    takes AS (
      -- 1. ingredients of the dishes (not the countable items that have a stock item)
      SELECT (e->>'materialId')::int AS rm_id,
             COALESCE(l.sold, 0) * COALESCE((e->>'quantity')::numeric, 0) AS qty
      FROM lines l
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(l.raw_materials) = 'array' THEN l.raw_materials ELSE '[]'::jsonb END
      ) AS e
      WHERE NOT (l.is_inventory_tracked AND l.stock_material_id IS NOT NULL)
        AND (e->>'materialId') ~ '^[0-9]+$'
      UNION ALL
      -- 2. countable items: 1 of the stock item per unit sold
      SELECT l.stock_material_id, COALESCE(l.sold, 0)::numeric
      FROM lines l
      WHERE l.is_inventory_tracked AND l.stock_material_id IS NOT NULL
    )
    SELECT
      rm.id                                                         AS "rawMaterialId",
      rm.name,
      rm.unit,
      COALESCE(rm.last_purchase_price, rm.cost_price, 0)::float     AS "unitCost",
      SUM(t.qty)::float                                             AS qty
    FROM takes t
    JOIN raw_materials rm ON rm.id = t.rm_id AND rm.restaurant_id = ${restaurantId}
    GROUP BY rm.id
    HAVING SUM(t.qty) > 0
  `)) as Array<{ rawMaterialId: number; name: string; unit: string; unitCost: number; qty: number }>;

  if (!needs.length) return; // no tracked dish with ingredients in this order

  const docNumber = `SALE-${order.ticketNo ?? order.id}`;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const total = needs.reduce((s, n) => s + round3(n.qty) * n.unitCost, 0);

  // Header: one stock document for the whole order.
  const [header] = (await tx.execute(sql`
    INSERT INTO stocktransactions
      ("RestaurantID", "TransactionNumber", "GRNNumber", "SupplierName", "TransactionDate",
       "Reference", "Comment", "Subtotal", "NetTotal", "Status", type)
    VALUES
      (${restaurantId}, ${docNumber}, ${docNumber}, ${'POS sale · ticket ' + (order.ticketNo ?? order.id)}, now(),
       ${'order:' + order.id}, ${'Ingredients of the dishes sold'}, ${total.toFixed(2)}, ${total.toFixed(2)}, 'POSTED', 'SAL')
    RETURNING "TransactionID" AS id
  `)) as Array<{ id: number }>;

  for (const n of needs) {
    const q = round3(n.qty);
    await tx.execute(sql`
      INSERT INTO stockdetails (transactionid, "RawMaterialID", itemname, unit, qty, unitcost, linetotal, type)
      VALUES (${header.id}, ${n.rawMaterialId}, ${n.name}, ${n.unit}, ${q}, ${n.unitCost.toFixed(2)},
              ${(q * n.unitCost).toFixed(2)}, 'SAL')
    `);
    await tx.execute(sql`
      UPDATE raw_materials
      SET current_stock = COALESCE(current_stock, 0) - ${q}
      WHERE id = ${n.rawMaterialId} AND restaurant_id = ${restaurantId}
    `);
  }
}

export default async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/api/orders/:id/pay', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const orderId = Number((request.params as { id: string }).id);
    const body = (request.body || {}) as { method?: string; amountReceived?: number | string };

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return reply.status(400).send({ error: 'Invalid order number.' });
    }
    const method = String(body.method || '').toUpperCase() as PaymentMethod;
    if (!METHODS.includes(method)) {
      return reply.status(400).send({ error: 'Choose a payment method: Cash, Visa, Mastercard or Debit.' });
    }

    // Messages show the restaurant's currency.
    const currency = await restaurantCurrency(restaurantId);
    const m = (cents: number) => formatMoney(cents / 100, currency);

    try {
      const result = await db.transaction(async (tx) => {
        // Lock the order row: two terminals paying the same order at the same moment
        // are handled one after the other, and the second one is refused below.
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
          .for('update');

        if (!order) throw new PaymentError(404, 'Order not found.');
        const status = String(order.status || '').toUpperCase();
        if (status === 'CLOSED') throw new PaymentError(409, 'This order is already paid.');
        if (status === 'CANCELLED') throw new PaymentError(409, 'This order was cancelled and cannot be paid.');

        const dueCents = toCents(order.totalAmount);

        // Cash: what the customer gave (must cover the total). Card: exactly the total.
        let receivedCents = dueCents;
        if (method === 'CASH') {
          receivedCents = toCents(body.amountReceived);
          if (!Number.isFinite(receivedCents)) {
            throw new PaymentError(400, 'Enter the amount the customer gave.');
          }
          if (receivedCents < dueCents) {
            throw new PaymentError(
              400,
              `The customer gave ${m(receivedCents)}, but the total is ${m(dueCents)}. Still to pay: ${m(dueCents - receivedCents)}.`
            );
          }
        }
        const changeCents = receivedCents - dueCents;

        const [payment] = await tx
          .insert(orderPayments)
          .values({
            restaurantId,
            orderId,
            method,
            amountDue: fromCents(dueCents),
            amountReceived: fromCents(receivedCents),
            changeGiven: fromCents(changeCents),
            currency,
            cashierId: request.user?.id ?? null,
          })
          .returning();

        // Close the order …
        const [closed] = await tx
          .update(orders)
          .set({ status: 'CLOSED', updatedAt: new Date() })
          .where(eq(orders.id, orderId))
          .returning();

        // … and free its table (dine-in): rule "occupied while it has an open order".
        await syncTables(tx, restaurantId, [order.tableId]);

        // … and take the ingredients of the sold dishes out of stock.
        await takeSaleOutOfStock(tx, restaurantId, order);

        return { payment, order: closed };
      });

      // Dashboard and kitchen screens of this restaurant refresh.
      roomManager.broadcastToRestaurant(String(restaurantId), 'ORDER_UPDATED', { orderId, paid: true });

      return reply.status(201).send({
        payment: result.payment,
        order: result.order,
        message:
          result.payment.method === 'CASH'
            ? Number(result.payment.changeGiven) > 0
              ? `Paid by cash. Give back ${formatMoney(result.payment.changeGiven ?? 0, currency)}.`
              : 'Paid by cash. Exact amount, no change.'
            : `Paid by ${result.payment.method.charAt(0) + result.payment.method.slice(1).toLowerCase()}.`,
      });
    } catch (err: any) {
      if (err instanceof PaymentError) return reply.status(err.statusCode).send({ error: err.message });
      // The unique index refuses a second payment of the same order.
      if (err?.code === '23505' || err?.cause?.code === '23505') {
        return reply.status(409).send({ error: 'This order is already paid.' });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'The payment could not be saved. Please try again.' });
    }
  });
}
