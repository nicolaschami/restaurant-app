// src/routes/publicChat.ts
//
// Chat orders (v2, 2026-11-01) — the PUBLIC part: the customer's chat page calls these
// without a login (they are under /api/public/, which the login guard lets through).
//   GET  /api/public/chat/:code          → restaurant name + is the chat on
//   POST /api/public/chat/:code/message  → one turn: { history, lastCard } → reply + order card
//
// Step 1 is "stateless": the page keeps the conversation and sends it each time.
// That is safe because RES re-checks and re-prices the order on every turn — a
// changed draft coming from the page can never change a price.

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roomManager } from '../lib/roomManager.js';
import { chatRef, digitsOf, findCustomerByPhone } from '../lib/chatOrders.js';
import { ChatMenu, ChatOrderType, DraftLine, findChatRestaurant, loadChatMenu, priceDraft } from '../lib/chatMenu.js';
import { BookingDraft, bookingContext, checkBooking } from '../lib/chatBooking.js';
import { chatAiReady, ChatMessage, chatTurn } from '../lib/chatBrain.js';

// The draft as the page sends it back (from the last turn): read carefully, never trusted.
type PageDraft = {
  intent?: string;
  orderType?: string | null;
  lines?: DraftLine[];
  booking?: { date?: unknown; time?: unknown; people?: unknown; note?: unknown } | null;
};
const orderTypeOf = (d: PageDraft | null | undefined): ChatOrderType | null =>
  d?.orderType === 'delivery' || d?.orderType === 'pickup' ? d.orderType : null;
const bookingOf = (d: PageDraft | null | undefined): BookingDraft => ({
  date: typeof d?.booking?.date === 'string' ? d.booking.date : null,
  time: typeof d?.booking?.time === 'string' ? d.booking.time : null,
  people: Number.isInteger(d?.booking?.people) ? Number(d!.booking!.people) : null,
  note: typeof d?.booking?.note === 'string' ? d.booking.note : null,
});

// The menu changes rarely: keep it one minute per restaurant.
const menuCache = new Map<number, { at: number; menu: ChatMenu }>();
async function menuFor(r: { id: number; name: string; currency: string }) {
  const hit = menuCache.get(r.id);
  if (hit && Date.now() - hit.at < 60_000) return hit.menu;
  const menu = await loadChatMenu(r.id, r.name, r.currency);
  menuCache.set(r.id, { at: Date.now(), menu });
  return menu;
}

// Anyone can reach this page, and each AI answer costs money: at most 20 messages a
// minute from one internet address.
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // never grows without end
  return recent.length > 20;
}

export default async function publicChatRoutes(fastify: FastifyInstance) {
  fastify.get('/api/public/chat/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const r = await findChatRestaurant(code);
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });
    return { restaurant: r.name, currency: r.currency, ready: chatAiReady() };
  });

  fastify.post('/api/public/chat/:code/message', async (request, reply) => {
    const { code } = request.params as { code: string };
    // draft = the order numbers / booking of the last turn (as this route returned them)
    const body = (request.body || {}) as { history?: ChatMessage[]; draft?: PageDraft | null };

    if (tooMany(request.ip)) return reply.status(429).send({ error: 'Too many messages, please wait a minute.' });
    if (!chatAiReady()) return reply.status(503).send({ error: 'The chat is not set up yet.' });

    const r = await findChatRestaurant(code);
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });

    const history = Array.isArray(body.history)
      ? body.history.filter((m) => m && (m.role === 'customer' || m.role === 'bot') && typeof m.text === 'string')
      : [];
    if (!history.length || history[history.length - 1].role !== 'customer') {
      return reply.status(400).send({ error: 'The last message must be the customer\'s.' });
    }

    try {
      const menu = await menuFor(r);
      const ctx = await bookingContext(r.id);
      // the card / booking of the last turn is re-checked here: never taken from the page
      const d = body.draft;
      const isBooking = d?.intent === 'booking';
      const lastCard = d && !isBooking && Array.isArray(d.lines) ? await priceDraft(menu, orderTypeOf(d), d.lines.slice(0, 40)) : null;
      const lastBooking = d && isBooking ? await checkBooking(r.id, ctx, bookingOf(d)) : null;
      // the AI cost of the turn stays on the server (it will be recorded per restaurant)
      const { usage: _usage, ...turn } = await chatTurn(menu, ctx, history, lastCard, lastBooking);
      return turn;
    } catch (err: any) {
      request.log.error({ err: err?.message }, 'chat turn failed');
      return reply.status(502).send({ error: 'Sorry, the chat is not answering right now. Please call the restaurant.' });
    }
  });

  // ── Step 3: Confirm → a chat order waiting for the cashier (the POS rings) ──
  fastify.post('/api/public/chat/:code/confirm', async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = (request.body || {}) as {
      history?: ChatMessage[];
      draft?: PageDraft | null;
      customer?: { name?: string | null; phone?: string | null; address?: string | null };
    };
    if (tooMany(request.ip)) return reply.status(429).send({ error: 'Too many messages, please wait a minute.' });

    const r = await findChatRestaurant(code);
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });

    // everything is checked again here: the card / booking is RES's, never the page's
    const name = String(body.customer?.name ?? '').trim().slice(0, 120);
    const phone = String(body.customer?.phone ?? '').trim().slice(0, 50);
    const address = String(body.customer?.address ?? '').trim() || null;
    if (!name || digitsOf(phone).length < 6) return reply.status(400).send({ error: 'Your name and phone number are needed.' });

    const token = crypto.randomBytes(18).toString('hex');
    const known = await findCustomerByPhone(null, r.id, phone);
    const conversation = (Array.isArray(body.history) ? body.history : [])
      .filter((m) => m && typeof m.text === 'string')
      .slice(-60)
      .map((m) => ({ role: m.role === 'customer' ? 'customer' : 'bot', text: String(m.text).slice(0, 800) }));

    // a TABLE BOOKING: a free table must still exist (RES picks the best one)
    if (body.draft?.intent === 'booking') {
      const b = await checkBooking(r.id, await bookingContext(r.id), bookingOf(body.draft));
      if (!b.ok) return reply.status(400).send({ error: 'The booking is not complete or that time is no longer free. Please continue in the chat.' });
      const [row] = (await db.execute(sql`
        INSERT INTO chat_orders (restaurant_id, public_token, kind, customer_id, customer_name, customer_phone,
                                 booking_date, booking_time, party_size, booking_note, conversation)
        VALUES (${r.id}, ${token}, 'booking', ${known?.id ?? null}, ${name}, ${phone},
                ${b.date}::date, ${b.time}, ${b.people}, ${b.note}, ${JSON.stringify(conversation)}::jsonb)
        RETURNING id
      `)) as any[];
      roomManager.broadcastToRestaurant(String(r.id), 'CHAT_ORDERS_UPDATED', { id: Number(row.id) });
      return { ref: chatRef(row.id), token, kind: 'booking' };
    }

    // a FOOD ORDER
    const type = orderTypeOf(body.draft);
    if (!type) return reply.status(400).send({ error: 'Delivery or pickup?' });
    if (type === 'delivery' && !address) return reply.status(400).send({ error: 'Your delivery address is needed.' });

    const menu = await menuFor(r);
    const card = await priceDraft(menu, type, (body.draft?.lines ?? []).slice(0, 40));
    if (!card.lines.length || card.problems.length) {
      return reply.status(400).send({ error: 'The order is not complete yet. Please continue in the chat.' });
    }

    const [row] = (await db.execute(sql`
      INSERT INTO chat_orders (restaurant_id, public_token, order_type, customer_id, customer_name, customer_phone,
                               customer_address, lines, subtotal, tax, total, conversation)
      VALUES (${r.id}, ${token}, ${type}, ${known?.id ?? null}, ${name}, ${phone}, ${address},
              ${JSON.stringify(card.lines)}::jsonb, ${card.subtotal}, ${card.tax}, ${card.total},
              ${JSON.stringify(conversation)}::jsonb)
      RETURNING id
    `)) as any[];

    roomManager.broadcastToRestaurant(String(r.id), 'CHAT_ORDERS_UPDATED', { id: Number(row.id) });
    return { ref: chatRef(row.id), token, kind: 'order', total: card.total };
  });

  // The customer's page asks every few seconds: still waiting, accepted (#ticket), rejected?
  fastify.get('/api/public/chat/:code/status/:token', async (request, reply) => {
    const { code, token } = request.params as { code: string; token: string };
    const r = await findChatRestaurant(code);
    if (!r || !/^[a-f0-9]{36}$/.test(token)) return reply.status(404).send({ error: 'Order not found.' });
    const [o] = (await db.execute(sql`
      SELECT c.id, c.status, c.ticket_no, c.reject_reason, c.kind, c.party_size,
             to_char(c.booking_date, 'YYYY-MM-DD') AS booking_date, c.booking_time,
             EXTRACT(EPOCH FROM (now() - c.created_at))::int AS waiting, res.phone
      FROM chat_orders c JOIN restaurants res ON res.id = c.restaurant_id
      WHERE c.public_token = ${token} AND c.restaurant_id = ${r.id}
    `)) as any[];
    if (!o) return reply.status(404).send({ error: 'Order not found.' });
    return {
      ref: chatRef(o.id),
      kind: o.kind,
      booking: o.kind === 'booking' ? { date: o.booking_date, time: o.booking_time, people: o.party_size } : null,
      status: o.status === 'accepting' ? 'pending' : o.status,
      ticketNo: o.ticket_no ?? null,
      rejectReason: o.reject_reason ?? null,
      waitingSeconds: Number(o.waiting),
      restaurantPhone: o.phone ?? null,
    };
  });
}
