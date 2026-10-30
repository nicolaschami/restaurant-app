// src/routes/localCopy.ts
//
// OFFLINE POS, step 1 (agreed with the user 2026-10-28): "RES Local" = the print
// helper on the cashier PC, which also keeps a COPY of what the POS needs, in SQLite,
// so the restaurant keeps selling when the internet is down (sometimes for hours).
// This route gives that copy. The VPS stays the boss: RES Local only reads it.
//
//   GET /api/local/snapshot     header  x-helper-key: rph_…   (the print helper's key)
//                               header  if-none-match: <version>   (optional)
//   → 200 { version, generatedAt, data: { restaurant, categories, menuItems, … } }
//   → 304 when the copy RES Local already has is still the current one
//
// No user login here: the helper proves who it is with its key (only its hash is
// stored, like /agent). So this path is in PUBLIC_API_ROUTES (app.ts) and checked below.
//
// What is copied (one restaurant only — the helper's):
//   - restaurant settings (name, currency, tax, receipt texts, printers)
//   - categories, menu items (no cost price), modifier groups / options / links
//   - tables, kitchen stations
//   - active users: id, name, role and the PIN hash — offline login is PIN ONLY
//     (passwords never leave the VPS)
//   - the OPEN orders with their items, so a table opened online can be continued offline
// "version" = a fingerprint (sha256) of all that: it changes when anything changes.
//
// SYNC (step 4, 2026-10-29): when the internet is back, RES Local sends each action
// taken offline, one by one, in order:
//   POST /api/local/replay   header x-helper-key
//        { opId, method, path, body, userId, at, offlineNo? }
//   → { status, result, duplicate? }   (status/result = the normal route's answer)
// The action is run through the NORMAL route (fastify.inject) as the user who did it,
// so the real rules apply (kitchen lines, totals, table status, stock); the route skips
// the kitchen tickets (already printed offline, lib/offlineReplay.ts).
//   - only the POS sales actions: create an order, change it, pay it
//   - opId already done (offline_ops_applied) → the stored answer, nothing done again
//   - times: the order and the payment keep their OFFLINE time — unless a Z was closed
//     after it on the server meanwhile (then the sync time, so it counts in the next Z)
//   - offlineNo ("OFF-0007") is kept on the order, to match the paper receipt
// Tables: sql/2026-10-29_offline_sync.sql.

import { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { REPLAY_SECRET } from '../lib/offlineReplay.js';

// The offline actions that may be replayed (POS sales only, agreed 2026-10-28).
const REPLAYABLE: Array<[string, RegExp]> = [
  ['POST', /^\/api\/orders$/],
  ['PUT', /^\/api\/orders\/\d+$/],
  ['POST', /^\/api\/orders\/\d+\/pay$/],
];

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

// The answers the POS asks for when it opens (2026-10-30, the user's real test showed
// "Could not load menu" offline when the POS had not been opened online first): the
// copy carries them, made by the server's OWN routes, so they are exactly what the POS
// expects. The menu-items address is the one the POS uses (PosScreen.tsx).
const POS_ANSWERS = [
  '/api/categories',
  '/api/menu-items?restaurant_id=1&limit=2000',
  '/api/modifier-groups',
  '/api/tables',
  '/api/customers',
  '/api/restaurant/settings',
  '/api/orders/active',
];

// Everything RES Local keeps for one restaurant.
async function buildSnapshot(fastify: FastifyInstance, restaurantId: number) {
  const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as any[];

  const [restaurant] = await rows(sql`
    SELECT id, name, phone, email, address_line1, address_line2, city, country, currency, timezone,
           tax_rate, tax_name, prices_include_tax, tax_number, receipt_header, receipt_footer,
           receipt_printer, drawer_printer, kitchen_printer, logo_url, login_code
    FROM restaurants WHERE id = ${restaurantId}
  `);
  const categories = await rows(sql`
    SELECT id, name, position, printername FROM categories WHERE restaurant_id = ${restaurantId} ORDER BY position, id
  `);
  const menuItems = await rows(sql`
    SELECT id, category_id, station_id, menu_name, invoice_name, kitchen_name,
           price_dine_in, price_takeaway, price_delivery, price_waiter, description, images,
           is_available, position, country_tax, has_variants, variant_prices
    FROM menu_items WHERE restaurant_id = ${restaurantId} ORDER BY position, id
  `);
  const modifierGroups = await rows(sql`
    SELECT id, name, min_selection, max_selection, is_required FROM modifier_groups WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  const modifierOptions = await rows(sql`
    SELECT o.id, o.modifier_group_id, o.name, o.price_adjustment
    FROM modifier_options o JOIN modifier_groups g ON g.id = o.modifier_group_id
    WHERE g.restaurant_id = ${restaurantId} ORDER BY o.id
  `);
  const menuItemModifiers = await rows(sql`
    SELECT l.menu_item_id, l.modifier_group_id, l.sort_order
    FROM menu_item_modifiers l JOIN menu_items m ON m.id = l.menu_item_id
    WHERE m.restaurant_id = ${restaurantId} ORDER BY l.menu_item_id, l.sort_order
  `);
  const tables = await rows(sql`
    SELECT id, label, capacity, zone, status, current_order_id, notes
    FROM restaurant_tables WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  const kitchenStations = await rows(sql`
    SELECT id, name, description FROM kitchen_stations WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  // PIN ONLY offline: the PIN hash (bcrypt), never the password hash.
  const users = await rows(sql`
    SELECT id, full_name AS name, role, pin_hash FROM users
    WHERE restaurant_id = ${restaurantId} AND is_active = true AND pin_hash IS NOT NULL ORDER BY id
  `);
  const openOrders = await rows(sql`
    SELECT id, table_id, status, order_type, customer_name, customer_phone, delivery_address, ticket_no,
           notes, subtotal_amount, tax_amount, delivery_fee, total_amount, server_id, cashier_id, created_at, updated_at
    FROM orders WHERE restaurant_id = ${restaurantId} AND status <> 'CLOSED' ORDER BY id
  `);
  const openOrderItems = await rows(sql`
    SELECT i.id, i.order_id, i.menu_item_id, i.quantity, i.unit_price, i.subtotal, i.modifiers, i.variant_size,
           i.parent_item_id, i.kds_status, i.quantity_fired
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.restaurant_id = ${restaurantId} AND o.status <> 'CLOSED' ORDER BY i.id
  `);

  // The highest OFF number already on the server: RES Local always continues after it, so
  // a reinstalled or replaced PC never prints an OFF number used before (the user's rule:
  // one counter per restaurant, never reset). The column comes with the sync (step 4).
  const [off] = await rows(sql`
    SELECT COALESCE(MAX(substring(offline_no FROM 5)::int), 0) AS last
    FROM orders WHERE restaurant_id = ${restaurantId} AND offline_no ~ '^OFF-[0-9]+$'
  `);
  const lastOfflineNo = Number(off?.last ?? 0);

  // ---- the POS answers, asked to the server's own routes as the restaurant's owner
  const [owner] = await rows(sql`
    SELECT id, email, role FROM users WHERE restaurant_id = ${restaurantId} AND is_active = true
    ORDER BY (role = 'owner') DESC, id LIMIT 1
  `);
  const api: Record<string, unknown> = {};
  if (owner) {
    const ownerToken = fastify.jwt.sign({ id: owner.id, email: owner.email, role: owner.role, restaurantId } as any);
    for (const path of POS_ANSWERS) {
      const res = await fastify.inject({ method: 'GET', url: path, headers: { authorization: `Bearer ${ownerToken}` } });
      if (res.statusCode === 200) api[path] = res.json();
    }
  }

  // ---- PIN login offline FROM DAY ONE (2026-10-30): a ready login for each active user
  // with a PIN — the same answer as a PIN login (routes/aut.ts loginAnswer), signed by the
  // server, valid 7 days. Signed with TODAY's date, so it stays identical all day (the copy
  // does not look "new" every minute) and is renewed each day. RES Local gives it back
  // only after checking the PIN against the PIN hash (bcrypt). It stays on the cashier PC
  // like the helper key itself.
  const day = Math.floor(Date.now() / 86_400_000) * 86_400;
  const restaurantName = restaurant?.name || 'My Restaurant';
  const pinUsers = await rows(sql`
    SELECT id, full_name AS name, email, role, is_platform_admin AS "isPlatformAdmin" FROM users
    WHERE restaurant_id = ${restaurantId} AND is_active = true AND pin_hash IS NOT NULL ORDER BY id
  `);
  const logins = [];
  for (const u of pinUsers) {
    const token = fastify.jwt.sign({ id: u.id, email: u.email, role: u.role, restaurantId, restaurantName, iat: day } as any);
    const me = await fastify.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
    logins.push({
      userId: u.id,
      answer: {
        token,
        user: { id: u.id, name: u.name, email: u.email, role: u.role, isPlatformAdmin: Boolean(u.isPlatformAdmin), restaurantId, restaurantName },
      },
      me: me.statusCode === 200 ? me.json() : null,
    });
  }

  const data = {
    restaurant, categories, menuItems, modifierGroups, modifierOptions, menuItemModifiers,
    tables, kitchenStations, users, openOrders, openOrderItems, lastOfflineNo, api, logins,
  };
  const version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
  return { version, data };
}

// The helper (RES Local) that calls, from its key; null = refused.
async function helperOf(headers: Record<string, unknown>) {
  const key = String(headers['x-helper-key'] || '');
  if (!key.startsWith('rph_')) return null;
  const [agent] = (await db.execute(sql`
    SELECT id, restaurant_id AS "restaurantId" FROM print_agents WHERE key_hash = ${hashKey(key)}
  `)) as any[];
  return agent ?? null;
}

export default async function localCopyRoutes(fastify: FastifyInstance) {
  fastify.get('/api/local/snapshot', async (request, reply) => {
    const agent = await helperOf(request.headers);
    if (!agent) return reply.status(401).send({ error: 'Unknown or missing helper key.' });

    try {
      const snap = await buildSnapshot(fastify, Number(agent.restaurantId));
      // same version as RES Local already has → nothing to send
      if (request.headers['if-none-match'] === snap.version) return reply.status(304).send();
      return reply.header('etag', snap.version).send({ version: snap.version, generatedAt: new Date().toISOString(), data: snap.data });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The copy could not be prepared.' });
    }
  });

  // ---- sync: replay ONE action taken offline
  fastify.post('/api/local/replay', async (request, reply) => {
    const agent = await helperOf(request.headers);
    if (!agent) return reply.status(401).send({ error: 'Unknown or missing helper key.' });
    const restaurantId = Number(agent.restaurantId);
    const b = (request.body || {}) as { opId?: unknown; method?: unknown; path?: unknown; body?: unknown; userId?: unknown; at?: unknown; offlineNo?: unknown };
    const opId = String(b.opId || '');
    const method = String(b.method || '').toUpperCase();
    const path = String(b.path || '');
    if (!/^[\w-]{8,64}$/.test(opId)) return reply.status(400).send({ error: 'Invalid action id.' });
    if (!REPLAYABLE.some(([m, re]) => m === method && re.test(path))) return reply.status(400).send({ error: 'This action cannot be replayed.' });

    // already done → the same answer, nothing done again
    const [done] = (await db.execute(sql`
      SELECT status_code AS status, result FROM offline_ops_applied WHERE op_id = ${opId} AND restaurant_id = ${restaurantId}
    `)) as any[];
    if (done) return { status: done.status, result: done.result, duplicate: true };

    // the user who did it offline (still active, same restaurant); else the restaurant's owner
    const [user] = (await db.execute(sql`
      SELECT id, email, role FROM users
      WHERE restaurant_id = ${restaurantId} AND is_active = true AND (id = ${Number(b.userId) || 0} OR role = 'owner')
      ORDER BY (id = ${Number(b.userId) || 0}) DESC, id LIMIT 1
    `)) as any[];
    if (!user) return reply.status(409).send({ error: 'No active user in this restaurant to replay the action.' });
    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, restaurantId } as any);

    // run it through the normal route (as that user, marked as a replay)
    const res = await fastify.inject({
      method: method as any,
      url: path,
      payload: (b.body ?? {}) as any,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-offline-replay': REPLAY_SECRET },
    });
    let result: any = null;
    try {
      result = res.json();
    } catch {
      result = { raw: res.body?.slice(0, 500) };
    }

    if (res.statusCode < 300) {
      // keep the OFFLINE time — unless a Z was closed after it meanwhile (then: now)
      const at = typeof b.at === 'string' && !Number.isNaN(Date.parse(b.at)) ? b.at : null;
      const [z] = (await db.execute(sql`SELECT MAX(closed_at) AS last FROM z_reports WHERE restaurant_id = ${restaurantId}`)) as any[];
      const keepTime = at && (!z?.last || new Date(at) > new Date(z.last));
      if (method === 'POST' && path === '/api/orders' && result?.order?.id) {
        const offlineNo = typeof b.offlineNo === 'string' ? b.offlineNo.slice(0, 20) : null;
        // orders.created_at has no time zone: it holds the database's local time
        await db.execute(sql`
          UPDATE orders SET offline_no = ${offlineNo},
                 created_at = CASE WHEN ${keepTime} THEN (${at}::timestamptz AT TIME ZONE current_setting('TimeZone')) ELSE created_at END
          WHERE id = ${result.order.id} AND restaurant_id = ${restaurantId}
        `);
      }
      const pay = path.match(/^\/api\/orders\/(\d+)\/pay$/);
      if (pay && keepTime) {
        await db.execute(sql`UPDATE order_payments SET created_at = ${at}::timestamptz WHERE order_id = ${Number(pay[1])} AND restaurant_id = ${restaurantId}`);
      }
    }
    // a done (2xx) or refused (4xx) action is final: remembered, so a resend changes nothing.
    // A server error (5xx) is not remembered: RES Local tries again later.
    if (res.statusCode < 500) {
      await db.execute(sql`
        INSERT INTO offline_ops_applied (op_id, restaurant_id, method, path, status_code, result)
        VALUES (${opId}, ${restaurantId}, ${method}, ${path}, ${res.statusCode}, ${JSON.stringify(result)}::jsonb)
        ON CONFLICT (op_id) DO NOTHING
      `);
    }
    return { status: res.statusCode, result };
  });
}
