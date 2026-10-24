// src/routes/printing.ts
//
// Printing through the PRINT HELPER (agreed 2026-10-25): a small Windows program in
// the restaurant connects to the server (WebSocket /agent) and prints directly on the
// Windows printers — no browser, nothing on screen. Printing goes through the helper
// only: if it is offline, the request fails with a clear message.
//
// Screen  (Settings → Printers)
//   GET    /api/printing                 helpers (online?), their printers, the choices
//   PUT    /api/printing                 { receiptPrinter, drawerPrinter, kitchenPrinter }
//   POST   /api/printing/agents          { name } → adds a helper, returns its KEY once
//   DELETE /api/printing/agents/:id
//   POST   /api/printing/test            { printer? }  test page
//   POST   /api/printing/drawer          opens the cash drawer
// POS
//   POST   /api/printing/receipt         { orderId, copy? }  receipt built from the SAVED
//                                        order; a paid cash order also opens the drawer
// Helper
//   GET    /agent?key=…  (WebSocket)     the helper's live connection

import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { WebSocket } from 'ws';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';
import { EscPos, LINE_WIDTH } from '../lib/escpos.js';
import { addAgent, isOnline, jobResult, removeAgent, sendPrintJob, setAgentPrinters } from '../lib/printAgents.js';
import { formatMoney } from '../lib/money.js';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const cleanPrinterName = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 120) : null;
};

async function restaurantRow(restaurantId: number) {
  return db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
}

// ---------------------------------------------------------------- receipt

async function buildReceipt(restaurantId: number, orderId: number, copy: boolean) {
  const r = await restaurantRow(restaurantId);
  if (!r) throw new Error('Restaurant not found.');
  const tz = r.timezone || 'UTC';
  const currency = (r.currency || 'USD').toUpperCase();
  const m = (v: unknown) => formatMoney(Number(v) || 0, currency);

  const [order] = (await db.execute(sql`
    SELECT o.id, o.ticket_no AS "ticketNo", o.order_type AS type, o.customer_name AS customer,
           COALESCE(rt.label, '') AS "table",
           o.subtotal_amount AS subtotal, o.tax_amount AS tax, o.delivery_fee AS fee, o.total_amount AS total,
           p.method, p.amount_received AS received, p.change_given AS change,
           to_char(COALESCE(p.created_at, now()) AT TIME ZONE ${tz}, 'DD/MM/YYYY HH24:MI') AS "when"
    FROM orders o
    LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
    LEFT JOIN order_payments p ON p.order_id = o.id
    WHERE o.id = ${orderId} AND o.restaurant_id = ${restaurantId}
  `)) as any[];
  if (!order) throw new Error('Order not found.');

  const lines = (await db.execute(sql`
    SELECT COALESCE(mi.invoice_name, mi.menu_name, 'Item') AS name, COALESCE(i.variant_size, '') AS size,
           i.quantity::float AS qty, i.subtotal::float AS amount, COALESCE(i.modifiers, '[]'::jsonb) AS modifiers
    FROM order_items i
    LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
    WHERE i.order_id = ${orderId} AND COALESCE(i.kds_status::text, '') <> 'CANCELLED'
    ORDER BY i.id
  `)) as any[];

  const itemsTotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const subtotal = order.subtotal != null ? Number(order.subtotal) : itemsTotal;
  const fee = Number(order.fee || 0);
  const total = Number(order.total || 0);
  const tax = order.tax != null ? Number(order.tax) : Math.max(0, total - subtotal - fee);
  const rate = Number(r.tax_rate || 0);
  const taxLabel = `${r.tax_name || 'VAT'} ${Number.isInteger(rate) ? rate : rate.toFixed(2)}%${r.prices_include_tax ? ' incl.' : ''}`;
  const paid = !copy && !!order.method;

  const p = new EscPos();
  p.align('center').bold(true).big(true).line(r.name || 'Restaurant').big(false).bold(false);
  const address = [r.address_line1, r.address_line2, r.city].filter(Boolean).join(', ');
  if (address) p.wrap(address);
  if (r.phone) p.line(`Tel ${r.phone}`);
  if (r.tax_number) p.line(`${r.tax_name || 'VAT'} No. ${r.tax_number}`);
  if (r.receipt_header) p.wrap(r.receipt_header);
  if (!paid) p.bold(true).line('*** COPY - NOT PAID ***').bold(false);
  p.align('left').divider();
  p.bold(true).row(`Ticket #${order.ticketNo ?? order.id}`, order.when).bold(false);
  p.row(String(order.type || ''), order.table ? `Table ${order.table}` : String(order.customer || ''));
  p.divider();
  for (const l of lines) {
    const label = `${Number(l.qty)} x ${l.name}${l.size ? ` (${l.size})` : ''}`;
    p.row(label, Number(l.amount) === 0 ? 'COMP' : m(l.amount));
    const mods = Array.isArray(l.modifiers) ? l.modifiers : [];
    for (const mod of mods) p.row(`   + ${mod?.optionName ?? ''}`, Number(mod?.price) > 0 ? m(mod.price) : '');
  }
  p.divider();
  p.row('Subtotal', m(subtotal));
  if (fee > 0) p.row('Delivery fee', m(fee));
  p.row(taxLabel, m(tax));
  p.bold(true).big(true).row('TOTAL', m(total), LINE_WIDTH / 2).big(false).bold(false);
  if (paid) {
    p.divider();
    const method = String(order.method);
    p.row('Paid by', method.charAt(0) + method.slice(1).toLowerCase());
    if (method === 'CASH') {
      p.row('Received', m(order.received));
      p.row('Change', m(order.change));
    }
  }
  p.divider().align('center');
  p.wrap(r.receipt_footer || 'Thank you!');
  p.align('left');
  return { escpos: p, paidCash: paid && order.method === 'CASH', receiptPrinter: r.receipt_printer, drawerPrinter: r.drawer_printer };
}

// ---------------------------------------------------------------- routes

export default async function printingRoutes(fastify: FastifyInstance) {
  // ---- the helper's live connection
  fastify.register(async (inst) => {
    inst.get(
      '/agent',
      {
        websocket: true,
        // The helper proves who it is with its key (/agent?key=…); only its hash is stored.
        preValidation: async (request, reply) => {
          const { key } = request.query as { key?: string };
          if (!key || key.length < 20) return reply.status(401).send({ error: 'Missing helper key.' });
          const [row] = (await db.execute(sql`
            SELECT a.id, a.restaurant_id AS "restaurantId", a.name FROM print_agents a WHERE a.key_hash = ${hashKey(key)}
          `)) as any[];
          if (!row) return reply.status(401).send({ error: 'Unknown helper key.' });
          (request as any).printAgent = row;
        },
      },
      (connection, req) => {
        const socket = ((connection as any).socket ?? connection) as WebSocket;
        const agent = (req as any).printAgent as { id: number; restaurantId: number; name: string };
        addAgent({ agentId: agent.id, restaurantId: agent.restaurantId, name: agent.name, socket, printers: [] });
        db.execute(sql`UPDATE print_agents SET last_seen_at = now() WHERE id = ${agent.id}`).catch(() => {});
        fastify.log.info({ agent: agent.id, restaurant: agent.restaurantId }, 'Print helper connected');
        socket.send(JSON.stringify({ type: 'welcome', name: agent.name }));

        socket.on('message', (raw: Buffer) => {
          let msg: any;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (msg.type === 'hello' && Array.isArray(msg.printers)) {
            const printers = msg.printers.map((p: unknown) => String(p).slice(0, 120)).slice(0, 50);
            setAgentPrinters(agent.id, printers);
            db.execute(sql`UPDATE print_agents SET printers = ${JSON.stringify(printers)}::jsonb, last_seen_at = now() WHERE id = ${agent.id}`).catch(() => {});
          } else if (msg.type === 'result' && msg.jobId) {
            jobResult(String(msg.jobId), Boolean(msg.ok), msg.error ? String(msg.error).slice(0, 300) : undefined);
          } else if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
        });
        socket.on('close', () => {
          removeAgent(agent.id, socket);
          db.execute(sql`UPDATE print_agents SET last_seen_at = now() WHERE id = ${agent.id}`).catch(() => {});
          fastify.log.info({ agent: agent.id }, 'Print helper disconnected');
        });
      }
    );
  });

  // ---- Settings → Printers
  fastify.get('/api/printing', async (request) => {
    const restaurantId = getRestaurantId(request);
    const r = await restaurantRow(restaurantId);
    const rows = (await db.execute(sql`
      SELECT id, name, printers, last_seen_at AS "lastSeenAt", created_at AS "createdAt"
      FROM print_agents WHERE restaurant_id = ${restaurantId} ORDER BY id
    `)) as any[];
    return {
      receiptPrinter: r?.receipt_printer ?? null,
      drawerPrinter: r?.drawer_printer ?? null,
      kitchenPrinter: r?.kitchen_printer ?? null, // kitchen tickets of categories without a printer
      agents: rows.map((a) => ({ ...a, online: isOnline(a.id) })),
    };
  });

  fastify.put('/api/printing', async (request) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as {
      receiptPrinter?: unknown;
      drawerPrinter?: unknown;
      kitchenPrinter?: unknown;
    };
    await db
      .update(restaurants)
      .set({
        receipt_printer: cleanPrinterName(body.receiptPrinter),
        drawer_printer: cleanPrinterName(body.drawerPrinter),
        kitchen_printer: cleanPrinterName(body.kitchenPrinter),
      } as any)
      .where(eq(restaurants.id, restaurantId));
    return { ok: true };
  });

  fastify.post('/api/printing/agents', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const name = String((request.body as any)?.name || 'Cashier PC').trim().slice(0, 60) || 'Cashier PC';
    const key = `rph_${randomBytes(24).toString('hex')}`; // shown ONCE, never stored
    const [row] = (await db.execute(sql`
      INSERT INTO print_agents (restaurant_id, name, key_hash) VALUES (${restaurantId}, ${name}, ${hashKey(key)}) RETURNING id
    `)) as any[];
    return reply.status(201).send({ id: row.id, name, key });
  });

  fastify.delete('/api/printing/agents/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const rows = (await db.execute(sql`DELETE FROM print_agents WHERE id = ${id} AND restaurant_id = ${restaurantId} RETURNING id`)) as any[];
    if (!rows.length) return reply.status(404).send({ error: 'Helper not found.' });
    return { ok: true };
  });

  // ---- test page
  fastify.post('/api/printing/test', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const r = await restaurantRow(restaurantId);
    const printer = cleanPrinterName((request.body as any)?.printer) ?? r?.receipt_printer;
    if (!printer) return reply.status(400).send({ error: 'Choose the receipt printer first.' });
    const p = new EscPos();
    p.align('center').bold(true).big(true).line('TEST PAGE').big(false).bold(false);
    p.line(r?.name || '').line(printer).line(new Date().toLocaleString('en-GB'));
    p.divider().align('left');
    p.row('Left text', 'right text');
    p.row('12 x Very long item name that is cut at the end of the line', '$999.99');
    p.divider().align('center').line('If you can read this, printing works.').cut();
    const res = await sendPrintJob(restaurantId, printer, p.toBase64());
    return res.ok ? { ok: true, printer, agent: res.agent } : reply.status(502).send({ error: res.error });
  });

  // ---- open the cash drawer
  fastify.post('/api/printing/drawer', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const r = await restaurantRow(restaurantId);
    const printer = r?.drawer_printer || r?.receipt_printer;
    if (!printer) return reply.status(400).send({ error: 'Choose the drawer printer in Settings → Printers.' });
    const res = await sendPrintJob(restaurantId, printer, new EscPos().openDrawer().toBase64());
    return res.ok ? { ok: true } : reply.status(502).send({ error: res.error });
  });

  // ---- on-screen preview of a receipt (no printer needed): { ticketNo? } → the last
  // paid order when no ticket is given. Same builder as the real receipt.
  fastify.post('/api/printing/preview', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as { ticketNo?: unknown; orderId?: unknown; copy?: unknown };
    const ticketNo = Number(body.ticketNo);
    const orderId = Number(body.orderId);
    const [o] = (await db.execute(
      Number.isInteger(orderId) && orderId > 0
        ? sql`SELECT id, ticket_no AS "ticketNo" FROM orders WHERE restaurant_id = ${restaurantId} AND id = ${orderId}`
        : Number.isInteger(ticketNo) && ticketNo > 0
        ? sql`SELECT id, ticket_no AS "ticketNo" FROM orders WHERE restaurant_id = ${restaurantId} AND ticket_no = ${ticketNo} ORDER BY id DESC LIMIT 1`
        : sql`SELECT o.id, o.ticket_no AS "ticketNo" FROM orders o JOIN order_payments p ON p.order_id = o.id
              WHERE o.restaurant_id = ${restaurantId} ORDER BY p.created_at DESC LIMIT 1`
    )) as any[];
    if (!o) return reply.status(404).send({ error: ticketNo ? `Ticket #${ticketNo} not found.` : 'No paid order yet.' });
    try {
      const rec = await buildReceipt(restaurantId, o.id, Boolean(body.copy));
      if (rec.paidCash && (!rec.drawerPrinter || rec.drawerPrinter === rec.receiptPrinter)) rec.escpos.openDrawer();
      rec.escpos.cut();
      return { orderId: o.id, ticketNo: o.ticketNo, printer: rec.receiptPrinter, width: LINE_WIDTH, lines: rec.escpos.preview() };
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The preview could not be built.' });
    }
  });

  // ---- the receipt of an order (POS)
  fastify.post('/api/printing/receipt', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as { orderId?: unknown; copy?: unknown };
    const orderId = Number(body.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return reply.status(400).send({ error: 'Invalid order.' });
    try {
      const rec = await buildReceipt(restaurantId, orderId, Boolean(body.copy));
      if (!rec.receiptPrinter) return reply.status(400).send({ error: 'Choose the receipt printer in Settings → Printers.' });
      // A paid cash order opens the drawer: in the same job if it is on the receipt printer.
      const drawerOnReceipt = rec.paidCash && (!rec.drawerPrinter || rec.drawerPrinter === rec.receiptPrinter);
      if (drawerOnReceipt) rec.escpos.openDrawer();
      rec.escpos.cut();
      const res = await sendPrintJob(restaurantId, rec.receiptPrinter, rec.escpos.toBase64());
      if (!res.ok) return reply.status(502).send({ error: res.error });
      let drawer: { ok: boolean; error?: string } | null = drawerOnReceipt ? { ok: true } : null;
      if (rec.paidCash && !drawerOnReceipt && rec.drawerPrinter) {
        drawer = await sendPrintJob(restaurantId, rec.drawerPrinter, new EscPos().openDrawer().toBase64());
      }
      return { ok: true, drawer };
    } catch (err: any) {
      if (/not found/i.test(err?.message)) return reply.status(404).send({ error: err.message });
      request.log.error(err);
      return reply.status(500).send({ error: 'The receipt could not be printed.' });
    }
  });
}

void and; // (kept for future filters)
