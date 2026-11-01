// src/routes/chatOrders.ts
//
// Chat orders (v2, step 3 — 2026-11-01): the CASHIER's side (login needed).
//   GET  /api/chat-orders/pending      → the orders waiting for an answer (the POS rings)
//   GET  /api/chat-orders/:id          → one order with its conversation ("Open the chat")
//   POST /api/chat-orders/:id/accept   → becomes a normal RES order (ticket no, kitchen, KDS),
//                                        or, for a table booking, a booking in Reservations
//   POST /api/chat-orders/:id/reject   → { reason } — the customer sees it in the chat
//
// Accept creates the order through POST /api/orders itself (same ticket numbers,
// totals, kitchen tickets and live updates as an order typed on the POS), with the
// cashier's own login.

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { roomManager } from '../lib/roomManager.js';
import { chatRef, linkChatCustomer, previousOrders } from '../lib/chatOrders.js';
import { bookingContext, checkBooking } from '../lib/chatBooking.js';

const REJECT_REASONS = ['Too busy right now', 'Item not available', 'Out of delivery area', 'Closed'];

function shape(o: any) {
  return {
    id: Number(o.id),
    ref: chatRef(o.id),
    kind: (o.kind ?? 'order') as 'order' | 'booking',
    booking:
      o.kind === 'booking'
        ? { date: o.booking_day, time: o.booking_time, people: Number(o.party_size), note: o.booking_note ?? null }
        : null,
    status: o.status,
    orderType: o.order_type as 'delivery' | 'pickup',
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    customerAddress: o.customer_address,
    knownCustomer: o.customer_id != null,
    lines: o.lines ?? [],
    subtotal: Number(o.subtotal),
    tax: Number(o.tax),
    total: Number(o.total),
    waitingSeconds: Number(o.waiting ?? 0),
    createdAt: o.created_at,
  };
}

export default async function chatOrderRoutes(fastify: FastifyInstance) {
  fastify.get('/api/chat-orders/pending', async (request) => {
    const restaurantId = getRestaurantId(request);
    const rows = (await db.execute(sql`
      SELECT *, EXTRACT(EPOCH FROM (now() - created_at))::int AS waiting, to_char(booking_date, 'YYYY-MM-DD') AS booking_day
      FROM chat_orders
      WHERE restaurant_id = ${restaurantId} AND status IN ('pending', 'accepting')
      ORDER BY created_at
    `)) as any[];
    const list = [];
    for (const o of rows) list.push({ ...shape(o), previousOrders: await previousOrders(restaurantId, o.customer_phone) });
    return { orders: list, rejectReasons: REJECT_REASONS };
  });

  fastify.get('/api/chat-orders/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const [o] = (await db.execute(sql`
      SELECT *, EXTRACT(EPOCH FROM (now() - created_at))::int AS waiting, to_char(booking_date, 'YYYY-MM-DD') AS booking_day
      FROM chat_orders WHERE id = ${id} AND restaurant_id = ${restaurantId}
    `)) as any[];
    if (!o) return reply.status(404).send({ error: 'Chat order not found.' });
    return { ...shape(o), conversation: o.conversation ?? [], rejectReason: o.reject_reason, ticketNo: o.ticket_no };
  });

  fastify.post('/api/chat-orders/:id/accept', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);

    // 1. take it (two cashiers clicking at the same time: only one wins)
    const [o] = (await db.execute(sql`
      UPDATE chat_orders SET status = 'accepting'
      WHERE id = ${id} AND restaurant_id = ${restaurantId} AND status = 'pending'
      RETURNING *, to_char(booking_date, 'YYYY-MM-DD') AS booking_day
    `)) as any[];
    if (!o) return reply.status(409).send({ error: 'This chat order was already answered.' });

    try {
      // A TABLE BOOKING → a normal booking in Reservations, through the same route as the
      // booking window (it links the customer by phone and refuses a double booking).
      // The best table is looked up again now: it may have been taken in the meantime.
      if (o.kind === 'booking') {
        const ctx = await bookingContext(restaurantId);
        const b = await checkBooking(restaurantId, ctx, { date: o.booking_day, time: o.booking_time, people: Number(o.party_size), note: o.booking_note });
        if (!b.ok) throw new Error(`No free table any more for ${o.party_size} at ${o.booking_time} — reject it or call the customer.`);
        const res = await fastify.inject({
          method: 'POST',
          url: '/api/reservations',
          headers: { authorization: String(request.headers.authorization || ''), 'content-type': 'application/json' },
          payload: {
            guestName: o.customer_name,
            phone: o.customer_phone,
            partySize: Number(o.party_size),
            date: o.booking_day,
            time: o.booking_time,
            tableId: b.tableId,
            noteTags: ['💬 Chat'],
            note: o.booking_note || null,
          },
        });
        const created = res.json() as any;
        if (res.statusCode !== 201 || !created?.reservation?.id) throw new Error(created?.error || 'The booking could not be saved.');
        await db.execute(sql`
          UPDATE chat_orders
          SET status = 'accepted', reservation_id = ${created.reservation.id}, answered_by = ${request.user?.id ?? null}, answered_at = now()
          WHERE id = ${id}
        `);
        roomManager.broadcastToRestaurant(String(restaurantId), 'CHAT_ORDERS_UPDATED', { id });
        return { ok: true, kind: 'booking', reservationId: created.reservation.id, table: b.tableLabel };
      }

      // 2. the customer: found by phone, or added on a first order
      const customerId = await linkChatCustomer(db, restaurantId, o.customer_name, o.customer_phone, o.customer_address);

      // 3. a normal RES order, through the same route as the POS. Line notes ("no garlic")
      //    travel as an extra option named "Note", so they print on the kitchen ticket.
      const lines: any[] = o.lines ?? [];
      const payload = {
        orderStatus: 'open',
        orderType: o.order_type === 'delivery' ? 'Delivery' : 'Takeaway',
        customerId,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        customerAddress: o.order_type === 'delivery' ? o.customer_address : null,
        deliveryFee: 0,
        notes: `💬 Chat ${chatRef(o.id)}`,
        items: lines.map((l) => ({
          menuItemId: l.itemId,
          name: l.name,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          variantSize: l.size ?? null,
          modifiers: [
            ...(l.options ?? []).map((op: any) => ({ optionId: op.id, optionName: op.name, price: op.price })),
            ...(l.note ? [{ groupName: 'Note', optionId: null, optionName: l.note, price: 0 }] : []),
          ],
          lineTotal: l.lineTotal,
        })),
      };
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/orders',
        headers: { authorization: String(request.headers.authorization || ''), 'content-type': 'application/json' },
        payload,
      });
      const created = res.json() as any;
      if (res.statusCode !== 201 || !created?.order?.id) throw new Error(created?.error || 'The order could not be created.');

      // 4. done: the customer's page shows "Accepted · #ticket"
      await db.execute(sql`
        UPDATE chat_orders
        SET status = 'accepted', order_id = ${created.order.id}, ticket_no = ${created.order.ticketNo},
            customer_id = ${customerId}, answered_by = ${request.user?.id ?? null}, answered_at = now()
        WHERE id = ${id}
      `);
      roomManager.broadcastToRestaurant(String(restaurantId), 'CHAT_ORDERS_UPDATED', { id });
      return { ok: true, orderId: created.order.id, ticketNo: created.order.ticketNo, kitchen: created.kitchen ?? [] };
    } catch (err: any) {
      // nothing was created: back to the waiting list
      await db.execute(sql`UPDATE chat_orders SET status = 'pending' WHERE id = ${id} AND status = 'accepting'`);
      request.log.error({ err: err?.message }, 'chat order accept failed');
      return reply.status(500).send({ error: err?.message || 'The order could not be accepted.' });
    }
  });

  fastify.post('/api/chat-orders/:id/reject', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const reason = String((request.body as any)?.reason ?? '').trim().slice(0, 200) || 'The restaurant cannot take this order now.';
    const [o] = (await db.execute(sql`
      UPDATE chat_orders
      SET status = 'rejected', reject_reason = ${reason}, answered_by = ${request.user?.id ?? null}, answered_at = now()
      WHERE id = ${id} AND restaurant_id = ${restaurantId} AND status = 'pending'
      RETURNING id
    `)) as any[];
    if (!o) return reply.status(409).send({ error: 'This chat order was already answered.' });
    roomManager.broadcastToRestaurant(String(restaurantId), 'CHAT_ORDERS_UPDATED', { id });
    return { ok: true };
  });
}
